# -*- coding: utf-8 -*-
"""ADM-DOJO-FULL-1: thin findings envelope honesty."""
from __future__ import annotations

from utils.dojo_findings import (
    fetch_findings_for_project,
    thin_findings_from_rows,
    verified_false_p_counts,
)


def test_thin_findings_maps_fields():
    rows = [
        {
            "id": 1,
            "title": "XSS в форме",
            "severity": "High",
            "cwe": 79,
            "active": True,
            "verified": False,
            "false_p": False,
            "duplicate": False,
            "is_mitigated": False,
            "date": "2026-08-12T10:00:00Z",
            "url": "https://app/login",
            "test_engagement": 99,
        },
        {"id": 2, "title": "Info", "severity": "Informational", "active": True},
    ]
    out = thin_findings_from_rows(rows)
    assert len(out) == 2
    assert out[0]["severity"] == "high"
    assert out[0]["title"] == "XSS в форме"
    assert out[0]["test_engagement"] == 99
    assert out[0]["date"] == "2026-08-12"
    assert out[1]["severity"] == "info"


def test_thin_findings_unknown_severity_falls_back_high():
    """normalize_severity падает на High для неизвестных — конвенция gate_policy."""
    out = thin_findings_from_rows([{"id": 1, "title": "?", "severity": "???"}])
    assert len(out) == 1
    assert out[0]["severity"] == "high"


def test_verified_false_p_counts():
    rows = [
        {"severity": "High", "verified": True, "false_p": False},
        {"severity": "High", "verified": False, "false_p": True},
        {"severity": "Critical", "verified": True, "false_p": False},
        {"severity": "Low", "verified": False, "false_p": False},
    ]
    counts = verified_false_p_counts(rows)
    assert counts["verified"]["high"] == 1
    assert counts["verified"]["critical"] == 1
    assert counts["false_p"]["high"] == 1


def test_fetch_findings_bad_request(monkeypatch):
    row = fetch_findings_for_project("")
    assert row["ok"] is False
    assert row["status"] == "bad_request"
    assert row["findings"] is None


def test_fetch_findings_unconfigured(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.defectdojo_configured", lambda: False
    )
    monkeypatch.setattr("adapters.defectdojo_client._load_lab_env", lambda: None)
    row = fetch_findings_for_project("ib-web")
    assert row["ok"] is False
    assert row["status"] == "unconfigured"
    assert row["findings"] is None


def test_fetch_findings_product_missing(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.defectdojo_configured", lambda: True
    )
    monkeypatch.setattr("adapters.defectdojo_client._load_lab_env", lambda: None)
    monkeypatch.setattr(
        "utils.dojo_findings.lookup_product_by_project_id",
        lambda *_a, **_k: {
            "ok": False,
            "status": "product_missing",
            "error": "no_product",
        },
    )
    row = fetch_findings_for_project("no-such-app")
    assert row["ok"] is False
    assert row["status"] == "not_found"
    assert row["findings"] is None


def test_fetch_findings_ok(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.defectdojo_configured", lambda: True
    )
    monkeypatch.setattr("adapters.defectdojo_client._load_lab_env", lambda: None)
    monkeypatch.setattr(
        "adapters.defectdojo_client._env",
        lambda key, default="": {
            "KDT_DEFECTDOJO_URL": "http://dojo.test",
            "KDT_DEFECTDOJO_TOKEN": "t",
        }.get(key, default),
    )
    monkeypatch.setattr(
        "utils.dojo_findings.lookup_product_by_project_id",
        lambda *_a, **_k: {"ok": True, "status": "ok", "product_id": 7, "name": "ib-web"},
    )
    monkeypatch.setattr(
        "adapters.defectdojo_client.list_findings_for_gate",
        lambda **_k: {
            "ok": True,
            "pages": 1,
            "findings": [
                {
                    "severity": "Critical",
                    "title": "RCE",
                    "verified": True,
                    "test_engagement": 99,
                },
                {
                    "severity": "High",
                    "title": "XSS",
                    "verified": False,
                    "false_p": True,
                    "test_engagement": 99,
                },
            ],
        },
    )
    row = fetch_findings_for_project("ib-web")
    assert row["ok"] is True
    assert row["status"] == "ok"
    assert row["findings_n"] == 2
    assert row["findings"][0]["title"] == "RCE"
    assert row["verified"]["critical"] == 1
    assert row["false_p"]["high"] == 1
    assert "engagement/99" in (row["engagement_url"] or "")
