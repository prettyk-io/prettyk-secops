# -*- coding: utf-8 -*-
"""G-20: run_summary.json — сериализация и запись на диск."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.reporter import (
    build_run_summary,
    gate_label,
    write_run_summary,
    write_run_summary_from_controller,
    persist_live_run_summary,
    read_live_run_summary,
)


def test_build_run_summary_shape():
    payload = build_run_summary(
        exit_code=2,
        gate="fail",
        scenarios={"ok": 1, "fail": 0, "skip": 2},
        paths={"zap_html": "reports/zap-results/zap-final.html"},
        zap_mode="webswing",
        zap_api_port=8090,
        zap_proxy_port=8199,
        honest_contract_notes=["zap_mode=webswing (hold)"],
    )
    assert payload["exit_code"] == 2
    assert payload["gate"] == "fail"
    assert payload["scenarios"] == {"ok": 1, "fail": 0, "fail_allowed": 0, "skip": 2}
    assert payload["zap_mode"] == "webswing"
    assert payload["zap_api_port"] == 8090
    assert payload["zap_proxy_port"] == 8199
    assert payload["paths"]["zap_html"].endswith("zap-final.html")
    assert payload["honest_contract_notes"] == ["zap_mode=webswing (hold)"]


def test_gate_label():
    assert gate_label(False, None) == "pass"
    assert gate_label(True, {"total": 1}) == "fail"
    assert gate_label(True, {"error": "zap down", "fail_mode": "closed"}) == "error"
    assert gate_label(False, {"error": "zap down", "fail_mode": "open"}) == "error"
    assert gate_label(True, {"total": 1}, admission_void=True) == "void"


def test_write_run_summary_file(tmp_path, monkeypatch):
    monkeypatch.setenv("KDT_RUN_DIR", str(tmp_path))
    live = tmp_path / "live"
    live.mkdir()
    monkeypatch.setattr("utils.reporter.LIVE_DIR", live)
    monkeypatch.setattr("utils.reporter.LIVE_RUN_SUMMARY_PATH", live / "run_summary.json")
    monkeypatch.setattr("utils.reporter.ensure_live_dir", lambda: live.mkdir(parents=True, exist_ok=True))
    out = write_run_summary(
        build_run_summary(
            exit_code=0,
            gate="pass",
            scenarios={"ok": 2, "fail": 0, "skip": 0},
            zap_mode="demon",
        )
    )
    assert out == tmp_path / "run_summary.json"
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["exit_code"] == 0
    assert data["gate"] == "pass"
    assert data["scenarios"]["ok"] == 2
    from utils.reporter import read_live_run_summary

    mirrored = read_live_run_summary()
    assert mirrored is not None
    assert mirrored["exit_code"] == 0


def test_write_from_controller_fixture(tmp_path, monkeypatch):
    monkeypatch.setenv("KDT_RUN_DIR", str(tmp_path))
    monkeypatch.setenv("KDT_LIVE", "0")
    ctrl = SimpleNamespace(
        quality_gate_failed=False,
        quality_gate_summary=None,
        scenario_stats={"ok": 1, "fail": 1, "skip": 0},
        last_zap_report=str(tmp_path / "zap-final.html"),
        zap_mode="demon",
        zap_api_port=8080,
        zap_proxy_port=8099,
        honest_contract_notes=["scan_policy='x'"],
    )
    out = write_run_summary_from_controller(
        ctrl, exit_code=1, zap_xml_path=tmp_path / "zap.xml"
    )
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["exit_code"] == 1
    assert data["gate"] == "void"
    assert data["scenarios"] == {"ok": 1, "fail": 1, "fail_allowed": 0, "skip": 0}
    assert data["paths"]["zap_xml"].endswith("zap.xml")
    assert data["honest_contract_notes"] == ["scan_policy='x'"]


def test_write_from_controller_gate_fail(tmp_path, monkeypatch):
    monkeypatch.setenv("KDT_RUN_DIR", str(tmp_path))
    monkeypatch.setenv("KDT_LIVE", "0")
    ctrl = SimpleNamespace(
        quality_gate_failed=True,
        quality_gate_summary={"total": 3},
        scenario_stats={"ok": 1, "fail": 0, "skip": 0},
        last_zap_report=None,
        zap_mode="demon",
        zap_api_port=8080,
        zap_proxy_port=8099,
        honest_contract_notes=[],
    )
    out = write_run_summary_from_controller(ctrl, exit_code=2)
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["exit_code"] == 2
    assert data["gate"] == "fail"


def test_run_ui_summary_contains_run_id(tmp_path, monkeypatch):
    """build_run_ui_summary and read_run_ui_summary store/filter by run_id."""
    from utils.run_ui_summary import (
        build_run_ui_summary,
        persist_run_ui_summary,
        read_run_ui_summary,
    )

    live = tmp_path / "live"
    live.mkdir()
    summary_path = live / "run_ui_summary.json"
    monkeypatch.setattr("utils.run_ui_summary.RUN_UI_SUMMARY_PATH", summary_path)
    monkeypatch.setattr("utils.run_ui_summary.LIVE_DIR", live)
    monkeypatch.setattr("utils.run_ui_summary.ensure_live_dir", lambda: live.mkdir(parents=True, exist_ok=True))

    summary = build_run_ui_summary(
        allure={"report_url": "http://example.com/", "summary": {"total": 1}},
        run_id="my-run",
    )
    assert summary["run_id"] == "my-run"

    persist_run_ui_summary(summary)
    stored = read_run_ui_summary(run_id="my-run")
    assert stored is not None
    assert stored["run_id"] == "my-run"

    # Wrong run_id returns None
    assert read_run_ui_summary(run_id="other-run") is None

    # No filter returns the stored data
    assert read_run_ui_summary() is not None
