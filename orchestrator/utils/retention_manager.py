# -*- coding: utf-8 -*-
"""
RET-API: Менеджер хранилища и очистки артефактов SecOps Lab / Monitor / Runs.

Функции:
  - scan_storage_status(): статус диска по категориям артефактов (Allure, Video, Live exports, Runs, Temporary)
  - cleanup_artifacts(days_older_than, keep_pinned=True, dry_run=False): очистка прогонов и артефактов
  - cleanup_temp_dumps(dry_run=False): быстрая очистка временных дампов

Защита данных:
  - runs_index.ndjson, meta.json, current.json, policies — никогда не удаляются.
  - Активные/закреплённые прогоны (legal_hold) защищены от удаления.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from utils.paths import (
    ALLURE_RESULTS_DIR,
    LIVE_DIR,
    LIVE_EXPORTS_DIR,
    REPORTS_DIR,
    RUNS_DIR,
    VIDEO_DIR,
)

logger = logging.getLogger(__name__)

# Мета-файлы, которые запрещено трогать при любых очистках
PROTECTED_META_FILES: Set[str] = {
    "runs_index.ndjson",
    "meta.json",
    "current.json",
    "hooks.json",
    "results_hooks.json",
    "retention_policy.json",
    "gate_policy.json",
    "artifact_index.ndjson",
    "artifact_cleanup_audit.ndjson",
}


def _dir_size(path: Path) -> int:
    """Рекурсивный подсчет размера директории в байтах."""
    if not path.is_dir():
        return 0
    total = 0
    try:
        for p in path.rglob("*"):
            if p.is_file():
                try:
                    total += p.stat().st_size
                except OSError:
                    pass
    except OSError:
        pass
    return total


def _count_files(path: Path, pattern: str = "*") -> int:
    """Подсчет файлов по шаблону."""
    if not path.is_dir():
        return 0
    try:
        return sum(1 for p in path.glob(pattern) if p.is_file() and p.name not in PROTECTED_META_FILES)
    except OSError:
        return 0


def scan_storage_status() -> Dict[str, Any]:
    """Сводка состояния хранилища по категориям артефактов."""
    video_dir = Path(VIDEO_DIR)
    live_exports = Path(LIVE_EXPORTS_DIR)
    allure_results = Path(ALLURE_RESULTS_DIR)
    runs_dir = Path(RUNS_DIR)
    live_dir = Path(LIVE_DIR)

    video_bytes = _dir_size(video_dir)
    video_count = _count_files(video_dir, "*.mp4")

    exports_bytes = _dir_size(live_exports)
    exports_count = _count_files(live_exports, "*.ndjson") + _count_files(live_exports, "*.json")

    allure_bytes = _dir_size(allure_results)
    allure_count = _count_files(allure_results, "*")

    runs_bytes = _dir_size(runs_dir)
    runs_dirs_count = sum(1 for p in runs_dir.iterdir() if p.is_dir()) if runs_dir.is_dir() else 0

    # Подсчет количества уникальных прогонов в runs_index
    total_runs_indexed = 0
    runs_index_path = live_dir / "runs_index.ndjson"
    if runs_index_path.is_file():
        try:
            with runs_index_path.open("r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        total_runs_indexed += 1
        except OSError:
            pass

    total_bytes = video_bytes + exports_bytes + allure_bytes + runs_bytes

    return {
        "ok": True,
        "total_bytes": total_bytes,
        "total_mb": round(total_bytes / (1024 * 1024), 2),
        "total_runs_indexed": total_runs_indexed,
        "categories": {
            "recordings": {
                "name": "Видеозаписи (MP4)",
                "bytes": video_bytes,
                "mb": round(video_bytes / (1024 * 1024), 2),
                "count": video_count,
            },
            "journal_exports": {
                "name": "Журналы и дампы SSE",
                "bytes": exports_bytes,
                "mb": round(exports_bytes / (1024 * 1024), 2),
                "count": exports_count,
            },
            "allure_results": {
                "name": "Результаты Allure",
                "bytes": allure_bytes,
                "mb": round(allure_bytes / (1024 * 1024), 2),
                "count": allure_count,
            },
            "runs_data": {
                "name": "Данные прогонов",
                "bytes": runs_bytes,
                "mb": round(runs_bytes / (1024 * 1024), 2),
                "count": runs_dirs_count,
            },
        },
    }


def _is_legal_held(check_id: Optional[str]) -> bool:
    """Проверка legal hold для инстанса/проверки."""
    if not check_id:
        return False
    try:
        from utils.artifact_index import check_legal_hold
        return bool(check_legal_hold(check_id))
    except Exception:
        return False


def cleanup_artifacts(
    *,
    days_older_than: int = 7,
    keep_pinned: bool = True,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Очистка артефактов (видео, экспорты, старые прогоны) старше указанного количества дней.
    
    Не удаляет:
      - runs_index.ndjson и служебные файлы
      - проверки с активным legal_hold (если keep_pinned=True)
    """
    days = max(0, int(days_older_than))
    cutoff_ts = time.time() - (days * 86400.0)

    deleted_files: List[str] = []
    freed_bytes = 0
    skipped_held = 0

    # 1. Очистка видео (reports/video)
    video_dir = Path(VIDEO_DIR)
    if video_dir.is_dir():
        for f in video_dir.iterdir():
            if not f.is_file() or f.name in PROTECTED_META_FILES:
                continue
            try:
                mtime = f.stat().st_mtime
                if mtime < cutoff_ts:
                    size = f.stat().st_size
                    if not dry_run:
                        f.unlink(missing_ok=True)
                    freed_bytes += size
                    deleted_files.append(f"video:{f.name}")
            except OSError:
                pass

    # 2. Очистка live exports (reports/live/exports)
    live_exports = Path(LIVE_EXPORTS_DIR)
    if live_exports.is_dir():
        for f in live_exports.iterdir():
            if not f.is_file() or f.name in PROTECTED_META_FILES:
                continue
            try:
                mtime = f.stat().st_mtime
                if mtime < cutoff_ts:
                    size = f.stat().st_size
                    if not dry_run:
                        f.unlink(missing_ok=True)
                    freed_bytes += size
                    deleted_files.append(f"export:{f.name}")
            except OSError:
                pass

    # 3. Очистка reports/runs/{run_id}
    runs_dir = Path(RUNS_DIR)
    if runs_dir.is_dir():
        for rdir in runs_dir.iterdir():
            if not rdir.is_dir() or rdir.name.startswith("."):
                continue
            try:
                mtime = rdir.stat().st_mtime
                if mtime < cutoff_ts:
                    # Проверяем legal_hold, если есть привязка
                    if keep_pinned and _is_legal_held(rdir.name):
                        skipped_held += 1
                        continue
                    r_size = _dir_size(rdir)
                    if not dry_run:
                        shutil.rmtree(rdir, ignore_errors=True)
                    freed_bytes += r_size
                    deleted_files.append(f"run_dir:{rdir.name}")
            except OSError:
                pass

    # Лог аудита очистки
    try:
        from utils.artifact_cleanup import _append_audit
        _append_audit({
            "action": "retention_cleanup",
            "days_older_than": days,
            "dry_run": dry_run,
            "freed_bytes": freed_bytes,
            "deleted_count": len(deleted_files),
        })
    except Exception:
        pass

    return {
        "ok": True,
        "dry_run": dry_run,
        "days_older_than": days,
        "freed_bytes": freed_bytes,
        "freed_mb": round(freed_bytes / (1024 * 1024), 2),
        "deleted_count": len(deleted_files),
        "skipped_held": skipped_held,
        "deleted_files": deleted_files[:100],  # срез для компактности ответа
    }


def cleanup_temp_dumps(*, dry_run: bool = False) -> Dict[str, Any]:
    """Быстрая очистка временных json/ndjson дампов без удаления видео и Allure."""
    deleted_files: List[str] = []
    freed_bytes = 0

    live_exports = Path(LIVE_EXPORTS_DIR)
    if live_exports.is_dir():
        for f in live_exports.iterdir():
            if not f.is_file() or f.name in PROTECTED_META_FILES:
                continue
            try:
                size = f.stat().st_size
                if not dry_run:
                    f.unlink(missing_ok=True)
                freed_bytes += size
                deleted_files.append(f"temp:{f.name}")
            except OSError:
                pass

    return {
        "ok": True,
        "dry_run": dry_run,
        "freed_bytes": freed_bytes,
        "freed_mb": round(freed_bytes / (1024 * 1024), 2),
        "deleted_count": len(deleted_files),
    }
