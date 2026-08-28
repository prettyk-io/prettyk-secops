# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

from utils import run_ui_summary as rus


def test_build_run_ui_summary_prefers_dojo(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(rus, "LIVE_DIR", tmp_path)
    monkeypatch.setattr(rus, "RUN_UI_SUMMARY_PATH", tmp_path / "run_ui_summary.json")
    monkeypatch.setattr(rus, "SEVERITY_TREND_PATH", tmp_path / "severity_trend.ndjson")
    monkeypatch.setattr(rus, "ensure_live_dir", lambda: tmp_path.mkdir(parents=True, exist_ok=True))

    summary = rus.build_run_ui_summary(
        allure={"summary": {"passed": 3, "failed": 1, "total": 4}, "status": "ok"},
        dojo={
            "stats": {"critical": 0, "high": 2, "medium": 0, "low": 0, "info": 0},
            "executive": {"executive_class": "High"},
        },
        scanner={"counts": {"critical": 0, "high": 9, "medium": 0, "low": 0, "info": 0}, "ok": True},
        run_id="lab-1",
    )
    assert summary["risks_source"] == "dojo"
    assert summary["risks"]["high"] == 2
    assert summary["executive_class"] == "High"
    assert summary["allure"]["failed"] == 1

    rus.persist_run_ui_summary(summary)
    rus.append_severity_trend(summary)
    rus.append_severity_trend({**summary, "run_id": "lab-2", "built_at": summary["built_at"] + 1})

    loaded = rus.read_run_ui_summary()
    assert loaded is not None
    assert loaded["run_id"] == "lab-1"
    trend = rus.read_severity_trend()
    assert len(trend) == 2
    assert trend[-1]["label"] == "lab-2"
    # MC-RES-2: Allure pass-rate в точке тренда (3/4 = 0.75)
    assert trend[0].get("allure_pass_rate") == 0.75


def test_build_run_ui_summary_falls_back_to_scanner():
    summary = rus.build_run_ui_summary(
        scanner={
            "ok": True,
            "counts": {"critical": 0, "high": 0, "medium": 1, "low": 2, "info": 0},
            "top_findings": [{"name": "CSP", "risk": "medium", "count": 3}],
        },
        run_id="z1",
    )
    assert summary["risks_source"] == "scanner"
    assert summary["risks"]["medium"] == 1
    assert summary["top_findings"][0]["name"] == "CSP"
