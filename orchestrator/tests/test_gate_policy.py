# -*- coding: utf-8 -*-
from core.controller import Controller
from core.gate_policy import (
    AdmissionPolicy,
    counts_from_zap_gate_summary,
    evaluate_admission_gate,
    gate_severity_floor,
    normalize_severity,
    normalize_severity_counts,
    report_requirement_failures,
    severities_at_or_above,
    zap_api_key_from_env,
)


def test_normalize_severity_aliases():
    assert normalize_severity("high") == "High"
    assert normalize_severity("med") == "Medium"
    assert normalize_severity("info") == "Informational"
    assert normalize_severity("bogus") == "High"


def test_severities_at_or_above_medium():
    assert severities_at_or_above("Medium") == ["Medium", "High"]
    assert severities_at_or_above("Low") == ["Low", "Medium", "High"]


def test_gate_severity_floor_env(monkeypatch):
    monkeypatch.setenv("KDT_GATE_SEVERITY", "medium")
    assert gate_severity_floor() == "Medium"
    monkeypatch.delenv("KDT_GATE_SEVERITY", raising=False)
    assert gate_severity_floor() == "High"


def test_report_requirements(monkeypatch):
    monkeypatch.delenv("KDT_REQUIRE_ALLURE", raising=False)
    monkeypatch.delenv("KDT_REQUIRE_DEFECTDOJO", raising=False)
    assert report_requirement_failures(allure_ok=False, dojo_ok=False) == []

    monkeypatch.setenv("KDT_REQUIRE_ALLURE", "1")
    fails = report_requirement_failures(allure_ok=False, dojo_ok=True)
    assert len(fails) == 1 and "ALLURE" in fails[0]

    monkeypatch.setenv("KDT_REQUIRE_DEFECTDOJO", "1")
    fails = report_requirement_failures(allure_ok=True, dojo_ok=None)
    assert any("DEFECTDOJO" in x for x in fails)


def test_zap_api_key_from_env(monkeypatch):
    monkeypatch.delenv("KDT_ZAP_API_KEY", raising=False)
    monkeypatch.delenv("ZAP_API_KEY", raising=False)
    assert zap_api_key_from_env() is None
    monkeypatch.setenv("ZAP_API_KEY", "secret")
    assert zap_api_key_from_env() == "secret"
    monkeypatch.setenv("KDT_ZAP_API_KEY", "prefer")
    assert zap_api_key_from_env() == "prefer"


def test_evaluate_admission_high_fails():
    result = evaluate_admission_gate(
        {"high": 1, "medium": 2},
        AdmissionPolicy(max_critical=0, max_high=0, enabled=True),
        source="dojo",
    )
    assert result.failed is True
    assert result.watch is False
    assert result.gate_label == "fail"
    assert result.risk_hints.get("elevated") is True
    assert result.risk_hints.get("counts", {}).get("high") == 1


def test_evaluate_admission_soft_watch():
    result = evaluate_admission_gate(
        {"medium": 2, "low": 1},
        AdmissionPolicy(max_critical=0, max_high=0, enabled=True),
        source="dojo",
    )
    assert result.failed is False
    assert result.watch is True
    assert result.gate_label == "pass"
    assert result.risk_hints.get("highest_severity") == "medium"
    assert result.risk_hints.get("elevated") is False


def test_evaluate_admission_critical_threshold():
    result = evaluate_admission_gate(
        {"critical": 1},
        AdmissionPolicy(max_critical=0, max_high=5, enabled=True),
        source="dojo",
    )
    assert result.failed is True


def test_evaluate_admission_disabled():
    result = evaluate_admission_gate(
        {"high": 9},
        AdmissionPolicy(max_critical=0, max_high=0, enabled=False),
        source="zap",
    )
    assert result.failed is False
    assert result.summary.get("disabled") is True


def test_counts_from_zap_gate_summary_buckets_total():
    counts = counts_from_zap_gate_summary(
        {"total": 3, "unique": 2, "risks": ["High"], "lines": []}
    )
    assert normalize_severity_counts(counts)["high"] == 3


def test_quality_gate_uses_admission_counts(monkeypatch):
    class Z:
        def summarize_alerts_for_live(self, risks=None, limit=None):
            return {
                "high_total": 2,
                "medium_total": 1,
                "low_total": 0,
                "info_total": 0,
            }

    ctrl = object.__new__(Controller)
    ctrl.adapters = {"zap": Z()}
    ctrl.quality_gate_failed = False
    ctrl.quality_gate_summary = None
    ctrl.admission_risk_hints = {}
    ctrl.admission_recommendations = []
    monkeypatch.delenv("KDT_QUALITY_GATE", raising=False)
    monkeypatch.delenv("KDT_GATE_MAX_CRITICAL", raising=False)
    monkeypatch.delenv("KDT_GATE_MAX_HIGH", raising=False)
    assert ctrl.evaluate_quality_gate() is True
    assert ctrl.quality_gate_failed is True
    assert ctrl.quality_gate_summary.get("counts", {}).get("high") == 2
    assert ctrl.admission_risk_hints.get("source") == "zap"


def test_quality_gate_explicit_dojo_counts(monkeypatch):
    ctrl = object.__new__(Controller)
    ctrl.adapters = {}
    ctrl.quality_gate_failed = False
    ctrl.quality_gate_summary = None
    ctrl.admission_risk_hints = {}
    ctrl.admission_recommendations = []
    monkeypatch.delenv("KDT_QUALITY_GATE", raising=False)
    assert (
        ctrl.evaluate_quality_gate({"medium": 3}, source="dojo") is False
    )
    assert ctrl.quality_gate_summary.get("watch") is True
    assert ctrl.admission_risk_hints.get("highest_severity") == "medium"
