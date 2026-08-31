# -*- coding: utf-8 -*-
"""CF-B3: In-memory fuzzer findings state for live_server.py.

Глобальное состояние (модуль-синглтон) — переживает перезагрузку handler'ов,
доступно для SSE /findings/sse без проксирования через diary_bus.
"""
from __future__ import annotations

from typing import Any, Dict, List

_LAST_FUZZ_RESULT: Dict[str, Any] = {"status": "idle", "findings": 0}
_LAST_FINDINGS: List[Dict[str, Any]] = []


def update_fuzz_result(result: Dict[str, Any]) -> None:
    """Обновить глобальное состояние фаззера."""
    global _LAST_FUZZ_RESULT
    _LAST_FUZZ_RESULT = dict(result)


def append_finding(finding: Dict[str, Any]) -> None:
    """Добавить finding в глобальный список."""
    global _LAST_FINDINGS
    _LAST_FINDINGS.append(finding)
    # Ограничиваем 500 последними
    if len(_LAST_FINDINGS) > 500:
        _LAST_FINDINGS = _LAST_FINDINGS[-500:]


def clear_findings() -> None:
    """Сбросить все находки (при новом прогоне)."""
    global _LAST_FINDINGS, _LAST_FUZZ_RESULT
    _LAST_FINDINGS = []
    _LAST_FUZZ_RESULT = {"status": "idle", "findings": 0}