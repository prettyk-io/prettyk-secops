# -*- coding: utf-8 -*-
"""ADM-DOJO-1: program aggregate honesty + counts."""
from __future__ import annotations

from utils.dojo_program import (
    aggregate_dojo_for_project,
    aggregate_dojo_program,
    counts_from_findings,
)


def test_counts_from_findings_maps_severity():
    findings = [
        {"severity": "Critical"},
        {"severity": "High"},
        {"severity": "high"},
        {"severity": "Informational"},
        {"severity": "Info"},
    ]
    stats = counts_from_findings(findings)
    assert stats["critical"] == 1
    assert stats["high"] == 2
    assert stats["info"] == 2
    assert stats["medium"] == 0


def test_aggregate_unconfigured(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.defectdojo_configured", lambda: False
    )
    monkeypatch.setattr("adapters.defectdojo_client._load_lab_env", lambda: None)
    row = aggregate_dojo_for_project("ib-web")
    assert row["ok"] is False
    assert row["status"] == "unconfigured"
    assert row["stats"] is None


def test_aggregate_product_missing(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.defectdojo_configured", lambda: True
    )
    monkeypatch.setattr("adapters.defectdojo_client._load_lab_env", lambda: None)
    monkeypatch.setattr(
        "utils.dojo_program.lookup_product_by_project_id",
        lambda *_a, **_k: {
            "ok": False,
            "status": "product_missing",
            "error": "no_product",
        },
    )
    row = aggregate_dojo_for_project("no-such-app")
    assert row["ok"] is False
    assert row["status"] == "product_missing"
    assert row["stats"] is None


def test_aggregate_ok_counts(monkeypatch):
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
        "utils.dojo_program.lookup_product_by_project_id",
        lambda *_a, **_k: {"ok": True, "status": "ok", "product_id": 7, "name": "ib-web"},
    )
    monkeypatch.setattr(
        "adapters.defectdojo_client.list_findings_for_gate",
        lambda **_k: {
            "ok": True,
            "pages": 1,
            "findings": [
                {"severity": "Critical", "test_engagement": 99},
                {"severity": "High"},
            ],
        },
    )
    row = aggregate_dojo_for_project("ib-web")
    assert row["ok"] is True
    assert row["status"] == "ok"
    assert row["stats"]["critical"] == 1
    assert row["stats"]["high"] == 1
    assert row["product_id"] == 7
    assert "engagement/99" in (row.get("engagement_url") or "")


def test_program_batch_unconfigured(monkeypatch):
    monkeypatch.setattr(
        "adapters.defectdojo_client.defectdojo_configured", lambda: False
    )
    monkeypatch.setattr("adapters.defectdojo_client._load_lab_env", lambda: None)
    payload = aggregate_dojo_program(["a", "b", "a"])
    assert payload["ok"] is False
    assert payload["status"] == "unconfigured"
    assert set(payload["items"]) == {"a", "b"}
