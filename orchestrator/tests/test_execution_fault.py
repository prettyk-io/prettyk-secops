# -*- coding: utf-8 -*-
"""execution_fault classify + admission_void."""
from __future__ import annotations

from core.execution_fault import apply_admission_void, classify_execution_fault
from utils.reporter import gate_label


def test_classify_webdriver_markers():
    class SessionNotCreatedException(RuntimeError):
        pass

    kind, reason = classify_execution_fault(
        SessionNotCreatedException("Could not start a new session")
    )
    assert kind == "webdriver"
    assert "session" in reason.lower() or "Could not" in reason


def test_classify_selenium_text():
    kind, _ = classify_execution_fault(RuntimeError("selenium grid timeout at wd/hub"))
    assert kind == "webdriver"


def test_classify_kind_hint_reports():
    kind, reason = classify_execution_fault(
        kind_hint="reports", reason="Allure generate required"
    )
    assert kind == "reports"
    assert "Allure" in reason


def test_classify_kind_hint_evidence():
    kind, _ = classify_execution_fault(
        kind_hint="evidence", reason="counts unavailable"
    )
    assert kind == "evidence"


def test_classify_other():
    kind, reason = classify_execution_fault(ValueError("boom"))
    assert kind == "other"
    assert reason == "boom"


def test_apply_admission_void_keeps_counts():
    hints = apply_admission_void(
        {"counts": {"high": 2}, "counts_source": "dojo_stats"},
        kind="webdriver",
        reason="SessionNotCreated",
    )
    assert hints["admission_void"] is True
    assert hints["execution_fault_kind"] == "webdriver"
    assert hints["execution_fault_reason"] == "SessionNotCreated"
    assert hints["counts"] == {"high": 2}
    assert hints["counts_source"] == "dojo_stats"


def test_gate_label_void_wins_over_fail_and_error():
    assert gate_label(True, {"total": 3}, admission_void=True) == "void"
    assert (
        gate_label(False, {"error": "zap", "admission_void": True}) == "void"
    )
    assert gate_label(False, None, admission_void=True) == "void"
