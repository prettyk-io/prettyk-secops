# -*- coding: utf-8 -*-
"""
MON-14: retention артефактов Monitor — on demand purge и ленивый 7-дневный TTL.

Что чистим (по run_id):
  - NDJSON журнала + sidecar.json (LIVE_EXPORTS_DIR)
  - MP4 видео (VIDEO_DIR)

Что НЕ трогаем:
  - runs_index.ndjson (meta-ledger — бессрочно)
  - diary_bus meta / live meta

Purge политика:
  - on demand: POST /api/artifacts/purge { run_id: "..." }
  - lazy TTL: при первом обращении к любому endpoint'у — sweep файлов
    старше monitor_artifact_retention_days (default 7).
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import logging
import time
from pathlib import Path
from typing import Optional, Set

from utils.paths import LIVE_EXPORTS_DIR, VIDEO_DIR

logger = logging.getLogger(__name__)

DEFAULT_RETENTION_DAYS = 7

# Имена meta-файлов, которые НЕ удаляем (в отличие от артефактов).
_META_KEEP_NAMES: Set[str] = {
    "runs_index.ndjson",
    "meta.json",
    "current.json",
    "hooks.json",
    "retention_policy.json",
    "gate_policy.json",
}


def _live_exports_dir() -> Path:
    return Path(LIVE_EXPORTS_DIR)


def _monitor_retention_seconds() -> float:
    """TTL из env KDT_MONITOR_RETENTION_DAYS (default 7)."""
    import os

    val = pk_env("MONITOR_RETENTION_DAYS")
    try:
        days = max(1, int(str(val))) if val else DEFAULT_RETENTION_DAYS
    except (TypeError, ValueError):
        days = DEFAULT_RETENTION_DAYS
    return float(days) * 86400.0


def _is_meta_file(name: str) -> bool:
    return name in _META_KEEP_NAMES


def _sidecar_created_at(sidecar_path: Path) -> Optional[float]:
    """Прочитать created_at из sidecar.json."""
    try:
        data = json.loads(sidecar_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    created = data.get("created_at") if isinstance(data, dict) else None
    if isinstance(created, (int, float)):
        return float(created)
    return None


def find_artifacts_for_run(run_id: str) -> dict:
    """Найти все артефакты для конкретного run_id.

    Returns: {"ndjson": Path|None, "sidecar": Path|None, "video": Path|None}
    """
    rid = (run_id or "").strip()
    result: dict = {"ndjson": None, "sidecar": None, "video": None}
    if not rid:
        return result

    # NDJSON + sidecar
    export_dir = _live_exports_dir()
    if export_dir.is_dir():
        for f in export_dir.glob("*.ndjson"):
            if f.stem.startswith(rid):
                result["ndjson"] = f
                break
        # Sidecar: точное имя или stem + .json
        for f in export_dir.glob("*.json"):
            if _is_meta_file(f.name):
                continue
            if f.stem.startswith(rid):
                result["sidecar"] = f
                break

    # Video
    v = Path(VIDEO_DIR)
    if v.is_dir():
        prefix = f"{rid}_"
        candidates = [
            p for p in v.iterdir()
            if p.is_file() and p.name.startswith(prefix)
        ]
        if candidates:
            candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            result["video"] = candidates[0]

    return result


def purge_by_run_id(run_id: str, *, dry_run: bool = False) -> dict:
    """MON-14: удалить артефакты конкретного run_id. Meta-ledger не трогаем.

    Returns: {"ok": bool, "deleted": [str, ...], "skipped": [str, ...]}
    """
    rid = (run_id or "").strip()
    if not rid:
        return {"ok": False, "error": "run_id required"}

    artifacts = find_artifacts_for_run(rid)
    deleted: list[str] = []
    skipped: list[str] = []

    for key, path in artifacts.items():
        if path is None or not path.is_file():
            continue
        if dry_run:
            deleted.append(f"{key}:{path.name} (dry-run)")
        else:
            try:
                path.unlink(missing_ok=True)
                deleted.append(f"{key}:{path.name}")
                logger.info("monitor_retention: deleted %s", path)
            except OSError as exc:
                skipped.append(f"{key}:{path.name} ({exc})")

    return {"ok": True, "deleted": deleted, "skipped": skipped}


def _sweep_exports_dir(expiry: float) -> int:
    """Удалить NDJSON+sidecar старше expiry. Возвращает кол-во удалённых."""
    export_dir = _live_exports_dir()
    if not export_dir.is_dir():
        return 0
    deleted = 0
    now = time.time()

    remove: list[Path] = []
    for f in export_dir.glob("*.ndjson"):
        sid = _sidecar_created_at(export_dir / f"{f.stem}.json")
        age = sid if sid is not None else f.stat().st_mtime
        if (now - age) > expiry:
            remove.append(f)
            sidecar = export_dir / f"{f.stem}.json"
            if sidecar.is_file():
                remove.append(sidecar)
    # Сиротские sidecar (NDJSON уже снесён ранее).
    for f in export_dir.glob("*.json"):
        if _is_meta_file(f.name):
            continue
        sid = _sidecar_created_at(f)
        age = sid if sid is not None else f.stat().st_mtime
        if (now - age) > expiry and not (export_dir / f"{f.stem}.ndjson").is_file():
            remove.append(f)

    for p in remove:
        try:
            p.unlink(missing_ok=True)
            deleted += 1
        except OSError:
            pass
    return deleted


def _sweep_video_dir(expiry: float) -> int:
    """Удалить видео старше expiry. Возвращает кол-во удалённых."""
    vdir = Path(VIDEO_DIR)
    if not vdir.is_dir():
        return 0
    deleted = 0
    now = time.time()
    for f in vdir.iterdir():
        if not f.is_file():
            continue
        if (now - f.stat().st_mtime) > expiry:
            try:
                f.unlink(missing_ok=True)
                deleted += 1
            except OSError:
                pass
    return deleted


_last_sweep_ts = 0.0
_SWEEP_INTERVAL_SECONDS = 3600.0  # раз в час


def lazy_sweep_monitor_artifacts() -> dict:
    """Ленивая чистка: удалить артефакты старше retention_days.

    Вызывается при любом обращении к Live endpoint (первый за час).
    Возвращает сводку: {"deleted": N, "retention_days": D}
    """
    global _last_sweep_ts
    now = time.time()
    if (now - _last_sweep_ts) < _SWEEP_INTERVAL_SECONDS:
        return {"deleted": 0, "skipped": True}

    expiry = _monitor_retention_seconds()
    deleted = 0
    deleted += _sweep_exports_dir(expiry)
    deleted += _sweep_video_dir(expiry)
    _last_sweep_ts = now
    if deleted:
        logger.info("monitor_retention: lazy sweep deleted %d artifacts", deleted)
    return {"deleted": deleted, "retention_days": int(expiry / 86400)}
