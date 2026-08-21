# -*- coding: utf-8 -*-
"""ADM-DOJO-1: /api/dojo/severity envelope honesty."""
from __future__ import annotations

from utils.dojo_severity import fetch_severity_for_project, series_from_findings


def test_series_from_findings_buckets():
    series = series_from_findings(
        [
            {"severity": "High", "date": "2026-08-10"},
            {"severity": "Critical", "date": "2026-08-11"},
            {"severity": "high", "date": "2026-08-11"},
        ]
    )
    assert len(series) == 2
    assert series[-1]["critical"] == 1
    assert series[-1]["high"] == 1


def test_unconfigured_no_green_zeros(monkeypatch):
    monkeypatch.setattr(
        "utils.dojo_severity.aggregate_dojo_for_project",
        lambda project_id: {
            "ok": False,
            "status": "unconfigured",
            "project_id": project_id,
            "stats": None,
            "error": "not_configured",
            "at": "2026-08-12T00:00:00Z",
        },
    )
    out = fetch_severity_for_project("ib-web")
    assert out["ok"] is False
    assert out["status"] == "unconfigured"
    assert out["stats"] is None
    assert out["series"] == []


def test_product_missing_maps_to_not_found(monkeypatch):
    monkeypatch.setattr(
        "utils.dojo_severity.aggregate_dojo_for_project",
        lambda project_id: {
            "ok": False,
            "status": "product_missing",
            "project_id": project_id,
            "stats": None,
            "at": "t",
        },
    )
    out = fetch_severity_for_project("missing")
    assert out["status"] == "not_found"
    assert out["stats"] is None


def test_ok_with_series(monkeypatch):
    monkeypatch.setattr(
        "utils.dojo_severity.aggregate_dojo_for_project",
        lambda project_id: {
            "ok": True,
            "status": "ok",
            "project_id": project_id,
            "product_id": 9,
            "stats": {"critical": 0, "high": 1, "medium": 0, "low": 0, "info": 0},
            "engagement_url": "http://dojo/engagement/3",
            "findings_n": 1,
            "at": "t",
        },
    )
    monkeypatch.setattr(
        "adapters.defectdojo_client.list_findings_for_gate",
        lambda **kwargs: {
            "ok": True,
            "findings": [
                {"severity": "High", "date": "2026-08-12"},
                {"severity": "Medium", "date": "2026-08-12"},
            ],
            "pages": 1,
        },
    )
    out = fetch_severity_for_project("ib-web")
    assert out["ok"] is True
    assert out["status"] == "ok"
    assert out["stats"]["high"] == 1
    assert out["stats"]["medium"] == 1
    assert out["series"]
    assert "engagement" in out["engagement_url"]
