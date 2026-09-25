# -*- coding: utf-8 -*-
"""
NAV-API lab: file-backed CheckInstance registry (same JSON shape as FE pk.checks.v1).

Path: reports/live/checks_registry.json
Playground: GET/PUT /api/checks
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from utils.paths import LIVE_DIR as _DEFAULT_LIVE_DIR

# Patchable in tests (monkeypatch utils.checks_registry.LIVE_DIR).
LIVE_DIR = _DEFAULT_LIVE_DIR

CHECKS_REGISTRY_NAME = "checks_registry.json"
CHECKS_REGISTRY_VERSION = 1


def checks_registry_path() -> Path:
    return Path(LIVE_DIR) / CHECKS_REGISTRY_NAME


def _ensure_registry_dir() -> Path:
    path = checks_registry_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def empty_registry() -> Dict[str, Any]:
    return {"version": CHECKS_REGISTRY_VERSION, "items": [], "saved_at": None}


def _normalize_check_item(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    check_id = str(item.get("check_id") or "").strip()
    if not check_id:
        return None
    runs = item.get("runs")
    if not isinstance(runs, list):
        runs = []
    return {
        "check_id": check_id,
        "title": str(item.get("title") or check_id),
        "status": str(item.get("status") or "draft"),
        "created_at": str(item.get("created_at") or ""),
        "updated_at": str(item.get("updated_at") or ""),
        "last_opened_at": item.get("last_opened_at"),
        "wired": item.get("wired"),
        "resource_contents": item.get("resource_contents")
        if isinstance(item.get("resource_contents"), dict)
        else {},
        "view": item.get("view") or "form",
        "runs": runs,
    }


def _normalize_items(raw: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        norm = _normalize_check_item(item)
        if norm is not None:
            out.append(norm)
    return out


_LOCAL_RUN_RE = re.compile(r"^run-[0-9a-f]{12}$", re.IGNORECASE)


def _alive_run_ids() -> set:
    """Локальные run_id, которые считаются живыми (не мёртвые ссылки).

    Живой = есть run_dir на диске (активный/недавно завершённый прогон) ЛИБО
    в runs_index есть терминальный *реальный* итог (status=success|failed).
    Фантомы (validate-only/stub/пустой app_code) закрываются как ``expired`` —
    это терминально для ledger (нет «вечного running»), но НЕ является реальным
    итогом, поэтому registry-ссылки на них считаются мёртвыми и отсекаются.
    """
    alive: set = set()
    try:
        from utils.runs_index import read_runs_index

        latest: Dict[str, Dict[str, Any]] = {}
        for rec in read_runs_index():
            rid = rec.get("run_id")
            if rid:
                latest[str(rid)] = rec
        for rid, rec in latest.items():
            if str(rec.get("status") or "") in ("success", "failed"):
                alive.add(rid)
    except Exception:
        pass
    try:
        from utils.paths import RUNS_DIR

        runs_dir = Path(RUNS_DIR)
        if runs_dir.is_dir():
            alive.update(p.name for p in runs_dir.iterdir() if p.is_dir())
    except Exception:
        pass
    return alive


def _prune_dead_runs(items: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    """Отсечь мёртвые локальные ``run-*`` ссылки из runs[]. Возвращает (items, pruned)."""
    alive = _alive_run_ids()
    pruned = 0
    for item in items:
        runs = item.get("runs")
        if not isinstance(runs, list):
            continue
        keep = [
            r
            for r in runs
            if not (
                isinstance(r, dict)
                and isinstance(r.get("run_id"), str)
                and bool(_LOCAL_RUN_RE.match(r["run_id"]))
                and r["run_id"] not in alive
            )
        ]
        pruned += len(runs) - len(keep)
        if len(keep) != len(runs):
            item["runs"] = keep
    return items, pruned


def load_checks_registry() -> Dict[str, Any]:
    """Load registry snapshot. Missing file → empty."""
    path = _ensure_registry_dir()
    if not path.is_file():
        payload = empty_registry()
        payload["path"] = str(path)
        payload["ok"] = True
        return payload
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        payload = empty_registry()
        payload["path"] = str(path)
        payload["ok"] = True
        payload["warning"] = "corrupt registry ignored"
        return payload
    if not isinstance(data, dict):
        payload = empty_registry()
        payload["path"] = str(path)
        payload["ok"] = True
        return payload
    version = data.get("version")
    if version != CHECKS_REGISTRY_VERSION:
        payload = empty_registry()
        payload["path"] = str(path)
        payload["ok"] = True
        payload["warning"] = f"unsupported version {version!r}"
        return payload
    items = _normalize_items(data.get("items"))
    items, pruned = _prune_dead_runs(items)
    result = {
        "ok": True,
        "version": CHECKS_REGISTRY_VERSION,
        "items": items,
        "saved_at": data.get("saved_at"),
        "path": str(path),
    }
    if pruned:
        result["pruned_dead_runs"] = pruned
    return result


def save_checks_registry(body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """
    Merge registry by check_id (newer updated_at wins) + write atomically.
    Returns (http_status, payload).
    """
    if not isinstance(body, dict):
        return 400, {"ok": False, "error": "body must be an object"}
    version = body.get("version")
    if version != CHECKS_REGISTRY_VERSION:
        return 400, {
            "ok": False,
            "error": f"version must be {CHECKS_REGISTRY_VERSION}",
        }
    incoming = _normalize_items(body.get("items"))
    existing = _read_registry_items()
    merged = _merge_by_check_id(existing, incoming)
    path = _ensure_registry_dir()
    saved_at = _now_iso()
    payload = {
        "version": CHECKS_REGISTRY_VERSION,
        "items": merged,
        "saved_at": saved_at,
    }
    tmp = path.with_suffix(path.suffix + ".tmp")
    raw = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    try:
        tmp.write_text(raw, encoding="utf-8")
        os.replace(tmp, path)
    except OSError as exc:
        try:
            if tmp.is_file():
                tmp.unlink()
        except OSError:
            pass
        return 500, {"ok": False, "error": f"write failed: {exc}"}
    return 200, {
        "ok": True,
        "version": CHECKS_REGISTRY_VERSION,
        "items": merged,
        "saved_at": saved_at,
        "path": str(path),
        "count": len(merged),
    }


def _read_registry_items() -> List[Dict[str, Any]]:
    path = checks_registry_path()
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return []
    if not isinstance(data, dict) or data.get("version") != CHECKS_REGISTRY_VERSION:
        return []
    return _normalize_items(data.get("items"))


def _merge_by_check_id(
    existing: List[Dict[str, Any]],
    incoming: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}
    for item in existing:
        cid = str(item.get("check_id") or "")
        if cid:
            by_id[cid] = item
    for item in incoming:
        cid = str(item.get("check_id") or "")
        if not cid:
            continue
        prev = by_id.get(cid)
        if not prev or str(item.get("updated_at") or "") > str(prev.get("updated_at") or ""):
            by_id[cid] = item
    return sorted(by_id.values(), key=lambda it: str(it.get("updated_at") or ""), reverse=True)
