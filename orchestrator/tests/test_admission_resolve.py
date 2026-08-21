# -*- coding: utf-8 -*-
"""Dual-axis / QG-AF: resolve Dojo counts vs ZAP fallback."""
from __future__ import annotations

import main as kdt_main
from adapters.defectdojo_client import resolve_dojo_gate_counts
from core.controller import Controller
from core.gate_policy import AdmissionPolicy, evaluate_admission_gate


def test_resolve_prefers_finalize_admission_counts(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.defectdojo_configured", lambda: True
    )
    ctrl = object.__new__(Controller)
    ctrl.adapters = {}
    counts, source, err = kdt_main._resolve_admission_counts(
        ctrl,
        {
            "dojo_skipped": False,
            "dojo_ok": True,
            "admission_counts": {"high": 1, "medium": 2},
            "counts_source": "dojo_stats",
        },
    )
    assert err is None
    assert source == "dojo_stats"
    assert counts["high"] == 1
    assert counts["medium"] == 2


def test_resolve_zap_fallback_when_dojo_skipped(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.defectdojo_configured", lambda: False
    )

    class Z:
        def summarize_alerts_for_live(self, risks=None, limit=None):
            return {
                "high_total": 4,
                "medium_total": 0,
                "low_total": 0,
                "info_total": 0,
            }

    ctrl = object.__new__(Controller)
    ctrl.adapters = {"zap": Z()}
    counts, source, err = kdt_main._resolve_admission_counts(
        ctrl,
        {"dojo_skipped": True, "dojo_ok": True, "dojo_stats": None},
    )
    assert err is None
    assert source == "zap"
    assert counts["high"] == 4


def test_resolve_dojo_configured_import_fail(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.defectdojo_configured", lambda: True
    )
    ctrl = object.__new__(Controller)
    ctrl.adapters = {}
    counts, source, err = kdt_main._resolve_admission_counts(
        ctrl,
        {"dojo_skipped": False, "dojo_ok": False, "dojo_stats": None},
    )
    assert counts is None
    assert source == "dojo"
    assert err and "import failed" in err


def test_resolve_fail_closed_when_counts_missing(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.defectdojo_configured", lambda: True
    )
    ctrl = object.__new__(Controller)
    ctrl.adapters = {}
    counts, source, err = kdt_main._resolve_admission_counts(
        ctrl,
        {
            "dojo_skipped": False,
            "dojo_ok": True,
            "admission_evidence_error": "http_500",
            "counts_source": "dojo_findings",
        },
    )
    assert counts is None
    assert source == "dojo_findings"
    assert "http_500" in (err or "")


def test_resolve_dojo_gate_counts_from_nested_stats(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.list_findings_for_gate",
        lambda **kwargs: {"ok": False, "findings": [], "error": "skip"},
    )
    counts, src, err, audit, collapsed = resolve_dojo_gate_counts(
        {"stats": {"high": 2, "medium": 1}, "test_id": 1}
    )
    assert err is None
    assert src == "dojo_stats"
    assert counts["high"] == 2
    assert audit and audit["kept"] == 3
    assert collapsed is None


def test_resolve_dojo_gate_counts_findings_fallback(monkeypatch):
    def fake_list(**kwargs):
        return {
            "ok": True,
            "pages": 1,
            "findings": [
                {
                    "title": "SQLi",
                    "severity": "High",
                    "active": True,
                    "false_p": False,
                    "duplicate": False,
                    "url": "https://a/1",
                    "alertRef": "40018",
                },
                {
                    "title": "SQLi",
                    "severity": "High",
                    "active": True,
                    "false_p": True,
                    "url": "https://a/2",
                    "alertRef": "40018",
                },
            ],
        }

    monkeypatch.setattr(
        "adapters.defectdojo_client.list_findings_for_gate", fake_list
    )
    counts, src, err, audit, collapsed = resolve_dojo_gate_counts({"test_id": 99})
    assert err is None
    assert src == "dojo_findings"
    assert counts["high"] == 1
    assert audit and audit["dropped_fp"] == 1 and audit["kept"] == 1
    assert collapsed and collapsed["cluster_count"] == 1


def test_resolve_forces_findings_when_waiver(monkeypatch):
    from core.admission_filter import WaiverEntry

    def fake_list(**kwargs):
        return {
            "ok": True,
            "pages": 1,
            "findings": [
                {
                    "title": "SQLi",
                    "severity": "High",
                    "active": True,
                    "cwe": "89",
                }
            ],
        }

    monkeypatch.setattr(
        "adapters.defectdojo_client.list_findings_for_gate", fake_list
    )
    counts, src, err, audit, collapsed = resolve_dojo_gate_counts(
        {"stats": {"high": 9}, "test_id": 1},
        waivers=[
            WaiverEntry(
                title="SQLi", severity="high", cwe="89", expires_at="2099-01-01"
            )
        ],
    )
    assert err is None
    assert src == "dojo_findings"
    assert counts["high"] == 0
    assert audit and audit["dropped_waiver"] == 1
    assert collapsed and collapsed["cluster_count"] == 0


def test_max_high_boundary_one_allows_one():
    pol = AdmissionPolicy(max_critical=0, max_high=1, enabled=True)
    ok = evaluate_admission_gate({"high": 1}, pol, source="dojo_stats")
    assert ok.failed is False
    bad = evaluate_admission_gate({"high": 2}, pol, source="dojo_stats")
    assert bad.failed is True
