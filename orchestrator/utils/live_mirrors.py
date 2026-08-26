# -*- coding: utf-8 -*-
"""
Сброс зеркал Results на Live (summary / trend / G-20 / evidence).

Используется при новом lab-run и demo clear — не трогает idle HTTP.
"""
from __future__ import annotations

from pathlib import Path
from typing import List

from utils.paths import LIVE_DIR, ensure_live_dir

_MIRROR_NAMES = (
    "run_ui_summary.json",
    "severity_trend.ndjson",
    "run_summary.json",
    "check_evidence_refs.json",
)


def clear_live_results_mirrors() -> List[str]:
    """Удалить файлы зеркал Results. Возвращает список удалённых имён."""
    ensure_live_dir()
    removed: List[str] = []
    for name in _MIRROR_NAMES:
        path = Path(LIVE_DIR) / name
        if path.is_file():
            try:
                path.unlink()
                removed.append(name)
            except OSError:
                pass
    return removed
