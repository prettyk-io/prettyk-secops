# -*- coding: utf-8 -*-
"""Pipeline risk verdict (mirror of frontend/src/results/pipelineVerdict.ts)."""
from __future__ import annotations

from typing import Any, Dict, Optional


SOFT_SEVERITIES = frozenset({"medium", "low", "info", "informational"})


def _void_exec_fail(gate_n: str, exit_code: Optional[int], hints: Dict[str, Any]) -> bool:
    # gate=void + exit 0 + debug/admission_void → исполнение ок, допуск VOID (не fail_run).
    return gate_n == "void" and not (
        exit_code == 0
        and (hints.get("debug_mode") is True or hints.get("admission_void") is True)
    )


def _fail_verdict(
    conclusion_n: str, exit_code: Optional[int], gate_n: str, hints: Dict[str, Any]
) -> Optional[str]:
    if (
        conclusion_n in ("failure", "cancelled", "timed_out")
        or exit_code == 1
        or gate_n == "error"
        or _void_exec_fail(gate_n, exit_code, hints)
    ):
        return "fail_run"
    if exit_code == 2 or gate_n == "fail":
        return "fail_gate"
    return None


def _pass_verdict(hints: Dict[str, Any]) -> str:
    if hints.get("elevated") is True:
        return "pass_edge"
    highest = str(hints.get("highest_severity") or "").strip().lower()
    if highest in SOFT_SEVERITIES:
        return "pass_watch"
    counts = hints.get("counts") if isinstance(hints.get("counts"), dict) else {}
    soft = (
        int(counts.get("medium") or 0)
        + int(counts.get("low") or 0)
        + int(counts.get("info") or 0)
    )
    return "pass_watch" if soft > 0 else "pass"


def derive_pipeline_verdict(
    *,
    phase: str = "",
    conclusion: str = "",
    exit_code: Optional[int] = None,
    gate: str = "",
    risk_hints: Optional[Dict[str, Any]] = None,
) -> str:
    phase_n = (phase or "").strip().lower()
    conclusion_n = (conclusion or "").strip().lower()
    gate_n = (gate or "").strip().lower()
    hints = risk_hints if isinstance(risk_hints, dict) else {}

    if phase_n in ("queued", "in_progress"):
        return "running"

    failed = _fail_verdict(conclusion_n, exit_code, gate_n, hints)
    if failed is not None:
        return failed

    completed_ok = (
        phase_n == "completed"
        or conclusion_n == "success"
        or exit_code == 0
        or gate_n == "pass"
    )

    if not completed_ok and not phase_n and not conclusion_n and exit_code is None and not gate_n:
        return "idle"

    if completed_ok or exit_code == 0:
        return _pass_verdict(hints)

    return "idle"
