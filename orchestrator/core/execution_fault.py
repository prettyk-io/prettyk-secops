# -*- coding: utf-8 -*-
"""Ось исполнения: classify fatal fault + admission VOID при exit 1."""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

ExecutionFaultKind = str  # webdriver | reports | evidence | other

_WEBDRIVER_MARKERS = (
    "selenium",
    "webdriver",
    "sessionnotcreated",
    "chromedriver",
    "geckodriver",
    "invalidsessionid",
    "no such window",
    "chrome not reachable",
    "wd/hub",
    "selenium grid",
    "grid/",
    "remoteend",
    "devtools",
)


def _truncate(text: str, limit: int = 500) -> str:
    raw = (text or "").strip()
    if len(raw) <= limit:
        return raw
    return raw[: limit - 1] + "…"


def classify_execution_fault(
    exc: Optional[BaseException] = None,
    *,
    reason: str = "",
    kind_hint: str = "",
) -> Tuple[ExecutionFaultKind, str]:
    """
    Вернуть (kind, reason).
    kind_hint — принудительный класс (reports/evidence), если уже известен на месте.
    """
    msg = _truncate(reason or (str(exc) if exc is not None else ""))
    hint = (kind_hint or "").strip().lower()
    if hint in {"webdriver", "reports", "evidence", "other"}:
        return hint, msg

    type_name = type(exc).__name__ if exc is not None else ""
    blob = f"{type_name} {exc or ''} {reason}".lower()
    if any(marker in blob for marker in _WEBDRIVER_MARKERS):
        return "webdriver", msg
    return "other", msg


def apply_admission_void(
    hints: Optional[Dict[str, Any]],
    *,
    kind: str = "other",
    reason: str = "",
) -> Dict[str, Any]:
    """Пометить допуск недействительным; counts в hints не трогаем."""
    out: Dict[str, Any] = dict(hints) if isinstance(hints, dict) else {}
    out["admission_void"] = True
    fault_kind = (kind or "other").strip().lower() or "other"
    if fault_kind not in {"webdriver", "reports", "evidence", "other"}:
        fault_kind = "other"
    out["execution_fault_kind"] = fault_kind
    trimmed = _truncate(reason)
    if trimmed:
        out["execution_fault_reason"] = trimmed
    return out
