# -*- coding: utf-8 -*-
from __future__ import annotations

from core.gate_policy import AdmissionPolicy
from utils.package_gate_recalc import (
    format_recalc_admission_line,
    recalculate_package_gate,
    resolve_hooks_counts,
    skip_recalc_reason,
)


def test_resolve_hooks_counts_prefers_dojo():
    counts, src = resolve_hooks_counts(
        {
            "dojo": {
                "stats": {"critical": 0, "high": 2, "medium": 1, "low": 0, "info": 0},
                "counts_source": "dojo_stats",
            },
            "zap": {"counts": {"high": 9}},
        }
    )
    assert counts["high"] == 2
    assert src == "dojo_stats"


def test_skip_void_and_fail_run():
    assert (
        skip_recalc_reason({"ci_risk_hints": {"admission_void": True}})
        == "admission_void"
    )
    assert skip_recalc_reason({"ci_exit_code": 1, "ci_verdict": "fail_run"}) == (
        "execution_fault"
    )


def test_recalc_fail_gate_from_hooks(monkeypatch):
    monkeypatch.setattr(
        "utils.package_gate_recalc._load_admission_policy",
        lambda: (AdmissionPolicy(max_critical=0, max_high=0, enabled=True), "test"),
    )
    out = recalculate_package_gate(
        {"ci_gate": "pass", "ci_verdict": "pass", "ci_exit_code": 0},
        {
            "dojo": {
                "stats": {"critical": 0, "high": 1, "medium": 0, "low": 0, "info": 0},
                "counts_source": "dojo_stats",
            }
        },
        enabled=True,
    )
    assert out["gate"] == "fail"
    assert out["verdict"] == "fail_gate"
    assert out["diverged"] is True
    assert "расхождение" in format_recalc_admission_line(out)


def test_recalc_watch_soft(monkeypatch):
    monkeypatch.setattr(
        "utils.package_gate_recalc._load_admission_policy",
        lambda: (AdmissionPolicy(max_critical=0, max_high=5, enabled=True), "test"),
    )
    out = recalculate_package_gate(
        {"ci_gate": "pass", "ci_verdict": "pass", "ci_exit_code": 0},
        {"dojo": {"stats": {"medium": 2, "high": 0, "critical": 0, "low": 0, "info": 0}}},
        enabled=True,
    )
    assert out["gate"] == "watch"
    assert out["verdict"] == "pass_watch"
    assert out["diverged"] is True


def test_recalc_disabled():
    out = recalculate_package_gate({}, {"dojo": {"stats": {"high": 1}}}, enabled=False)
    assert out["skipped"] == "disabled"
