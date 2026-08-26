# -*- coding: utf-8 -*-
from core.executive_conclusion import build_executive_conclusion


def test_critical_from_counts():
    got = build_executive_conclusion(counts={"critical": 1, "high": 0})
    assert got.executive_class == "Critical"
    assert got.execution_fault is False


def test_high_from_counts():
    got = build_executive_conclusion(counts={"high": 2})
    assert got.executive_class == "High"


def test_watch_from_soft():
    got = build_executive_conclusion(counts={"low": 3, "info": 1})
    assert got.executive_class == "Watch"


def test_pass_when_clean():
    got = build_executive_conclusion(counts={})
    assert got.executive_class == "Pass"


def test_fail_run_does_not_inflate_security_class():
    got = build_executive_conclusion(
        counts={},
        ci_verdict="fail_run",
        ci_exit_code=1,
    )
    assert got.executive_class == "Pass"
    assert got.execution_fault is True
    assert "Исполнение: сбой" in got.recommendations[0]


def test_fail_run_keeps_high_from_findings():
    got = build_executive_conclusion(
        counts={"high": 2},
        ci_verdict="fail_run",
        ci_exit_code=1,
    )
    assert got.executive_class == "High"
    assert got.execution_fault is True


def test_fail_gate_with_critical_counts():
    got = build_executive_conclusion(
        counts={"critical": 1},
        ci_verdict="fail_gate",
        ci_gate="fail",
        ci_exit_code=2,
    )
    assert got.executive_class == "Critical"
    assert got.execution_fault is False
