# -*- coding: utf-8 -*-
"""QG-AF mocked integration: nested Dojo import → ACTIVE counts → fail_gate."""
from __future__ import annotations

from adapters.defectdojo_client import (
    _parse_import_payload,
    resolve_dojo_gate_counts,
    trigger_defectdojo_import_detailed,
)
from core.controller import Controller
from core.gate_policy import AdmissionPolicy, evaluate_admission_gate


NESTED_HIGH = {
    "product_id": 1,
    "engagement_id": 12,
    "test_id": 44,
    "statistics": {
        "after": {
            "critical": {"active": 0, "total": 0},
            "high": {"active": 2, "total": 6, "false_p": 3, "is_mitigated": 1},
            "medium": {"active": 1, "total": 1},
            "low": {"active": 0, "total": 0},
            "info": {"active": 0, "total": 0},
        }
    },
}


def test_nested_import_payload_to_fail_gate(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.list_findings_for_gate",
        lambda **kwargs: {"ok": False, "findings": [], "error": "skip"},
    )
    parsed = _parse_import_payload(NESTED_HIGH)
    counts, src, err, audit, _collapsed = resolve_dojo_gate_counts(parsed)
    assert err is None
    assert src == "dojo_stats"
    assert counts["high"] == 2
    assert counts["medium"] == 1
    assert audit and audit["kept"] == 3
    result = evaluate_admission_gate(
        counts,
        AdmissionPolicy(max_critical=0, max_high=0, enabled=True),
        source=src,
    )
    assert result.failed is True
    assert result.gate_label == "fail"


def test_import_detailed_wires_nested_stats(monkeypatch, tmp_path):
    xml = tmp_path / "zap.xml"
    xml.write_text("<xml/>", encoding="utf-8")
    monkeypatch.setenv("KDT_DEFECTDOJO_URL", "http://dojo.test")
    monkeypatch.setenv("KDT_DEFECTDOJO_TOKEN", "tok")
    monkeypatch.setenv("KDT_DEFECTDOJO_ENGAGEMENT", "12")
    monkeypatch.setenv("KDT_DEFECTDOJO_ENGAGEMENT_MODE", "fixed")

    class FakeResp:
        status_code = 201
        text = "{}"

        def json(self):
            return NESTED_HIGH

    monkeypatch.setattr(
        "adapters.defectdojo_client.requests.post",
        lambda *a, **k: FakeResp(),
    )
    result = trigger_defectdojo_import_detailed(xml)
    assert result["ok"] is True
    assert result["dojo"]["stats"]["high"] == 2
    monkeypatch.setattr(
        "adapters.defectdojo_client.list_findings_for_gate",
        lambda **kwargs: {"ok": False, "findings": [], "error": "skip"},
    )
    counts, src, err, _audit, _collapsed = resolve_dojo_gate_counts(result["dojo"])
    assert err is None and src == "dojo_stats"
    ctrl = object.__new__(Controller)
    ctrl.adapters = {}
    ctrl.quality_gate_failed = False
    ctrl.quality_gate_summary = None
    ctrl.admission_risk_hints = {}
    ctrl.admission_recommendations = []
    assert ctrl.evaluate_quality_gate(counts, source=src) is True
    assert ctrl.admission_risk_hints.get("source") == "dojo_stats"


def test_findings_path_excludes_false_positive(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.list_findings_for_gate",
        lambda **kwargs: {
            "ok": True,
            "findings": [
                {
                    "severity": "Critical",
                    "active": True,
                    "false_p": False,
                    "duplicate": False,
                },
                {
                    "severity": "Critical",
                    "active": True,
                    "false_p": True,
                },
            ],
        },
    )
    counts, src, err, audit, collapsed = resolve_dojo_gate_counts({"test_id": 1})
    assert err is None
    assert src == "dojo_findings"
    assert counts["critical"] == 1
    assert audit and audit["dropped_fp"] == 1
    assert collapsed and collapsed["cluster_count"] == 1
    result = evaluate_admission_gate(
        counts,
        AdmissionPolicy(max_critical=0, max_high=0, enabled=True),
        source=src,
    )
    assert result.failed is True
    assert result.risk_hints.get("source") == "dojo_findings"
