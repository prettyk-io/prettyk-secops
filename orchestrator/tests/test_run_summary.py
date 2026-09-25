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
    purge_stale_run_artifacts,
)


def test_build_run_summary_shape():
    payload = build_run_summary(
        exit_code=2,
        gate="fail",
        scenarios={"ok": 1, "fail": 0, "skip": 2},
        paths={"scanner_html": "reports/scanner-results/scanner-final.html"},
        scanner_mode="webswing",
        scanner_api_port=8090,
        scanner_proxy_port=8199,
        honest_contract_notes=["scanner_mode=webswing (hold)"],
    )
    assert payload["exit_code"] == 2
    assert payload["gate"] == "fail"
    assert payload["scenarios"] == {"ok": 1, "fail": 0, "fail_allowed": 0, "skip": 2}
    assert payload["scanner_mode"] == "webswing"
    assert payload["scanner_api_port"] == 8090
    assert payload["scanner_proxy_port"] == 8199
    assert payload["paths"]["scanner_html"].endswith("scanner-final.html")
    assert payload["honest_contract_notes"] == ["scanner_mode=webswing (hold)"]


def test_gate_label():
    assert gate_label(False, None) == "pass"
    assert gate_label(True, {"total": 1}) == "fail"
    assert gate_label(True, {"error": "scanner down", "fail_mode": "closed"}) == "error"
    assert gate_label(False, {"error": "scanner down", "fail_mode": "open"}) == "error"
    assert gate_label(True, {"total": 1}, admission_void=True) == "void"


def test_write_run_summary_file(tmp_path, monkeypatch):
    monkeypatch.setenv("PK_RUN_DIR", str(tmp_path))
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
            scanner_mode="demon",
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
    monkeypatch.setenv("PK_RUN_DIR", str(tmp_path))
    monkeypatch.setenv("PK_LIVE", "0")
    ctrl = SimpleNamespace(
        quality_gate_failed=False,
        quality_gate_summary=None,
        scenario_stats={"ok": 1, "fail": 1, "skip": 0},
        last_scanner_report=str(tmp_path / "scanner-final.html"),
        scanner_mode="demon",
        scanner_api_port=8080,
        scanner_proxy_port=8099,
        honest_contract_notes=["scan_policy='x'"],
    )
    out = write_run_summary_from_controller(
        ctrl, exit_code=1, scanner_xml_path=tmp_path / "scanner.xml"
    )
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["exit_code"] == 1
    assert data["gate"] == "void"
    assert data["scenarios"] == {"ok": 1, "fail": 1, "fail_allowed": 0, "skip": 0}
    assert data["paths"]["scanner_xml"].endswith("scanner.xml")
    assert data["honest_contract_notes"] == ["scan_policy='x'"]


def test_write_from_controller_gate_fail(tmp_path, monkeypatch):
    monkeypatch.setenv("PK_RUN_DIR", str(tmp_path))
    monkeypatch.setenv("PK_LIVE", "0")
    ctrl = SimpleNamespace(
        quality_gate_failed=True,
        quality_gate_summary={"total": 3},
        scenario_stats={"ok": 1, "fail": 0, "skip": 0},
        last_scanner_report=None,
        scanner_mode="demon",
        scanner_api_port=8080,
        scanner_proxy_port=8099,
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


# ========== BOX-SAN-1: очистка stale-артефактов на старте прогона ==========


def test_purge_stale_run_artifacts_removes_summary_and_scanner(tmp_path, monkeypatch):
    # симулируем прошлый прогон: run_summary.json + live-зеркало + stale XML в scanner-results.
    run_summary = tmp_path / "run_summary.json"
    run_summary.write_text('{"exit_code": 0, "gate": "pass"}', encoding="utf-8")
    live_dir = tmp_path / "live"
    live_dir.mkdir()
    live_summary = live_dir / "run_summary.json"
    live_summary.write_text('{"exit_code": 0, "gate": "pass"}', encoding="utf-8")
    scanner_dir = tmp_path / "scanner-results"
    scanner_dir.mkdir()
    stale_xml = scanner_dir / "juice_dojo.xml"
    stale_xml.write_text("<OWASPZAPReport>old</OWASPZAPReport>", encoding="utf-8")
    stale_html = scanner_dir / "report.html"
    stale_html.write_text("<html>old</html>", encoding="utf-8")

    monkeypatch.setattr("utils.reporter._run_dir", lambda: tmp_path)
    monkeypatch.setattr("utils.reporter.LIVE_RUN_SUMMARY_PATH", live_summary)
    monkeypatch.setattr("utils.reporter.scanner_RESULTS_DIR", scanner_dir)

    result = purge_stale_run_artifacts()
    assert run_summary.exists() is False
    assert live_summary.exists() is False
    assert stale_xml.exists() is False
    assert stale_html.exists() is False
    assert len(result["removed"]) == 4
    assert result["skipped"] == []


def test_purge_stale_run_artifacts_noop_when_nothing_present(tmp_path, monkeypatch):
    scanner_dir = tmp_path / "scanner-results"
    scanner_dir.mkdir()
    monkeypatch.setattr("utils.reporter._run_dir", lambda: tmp_path)
    monkeypatch.setattr("utils.reporter.LIVE_RUN_SUMMARY_PATH", tmp_path / "live" / "run_summary.json")
    monkeypatch.setattr("utils.reporter.scanner_RESULTS_DIR", scanner_dir)

    result = purge_stale_run_artifacts()
    assert result["removed"] == []
    assert result["skipped"] == []


def test_purge_stale_run_artifacts_never_raises(tmp_path, monkeypatch):
    # Сбойная live-директория не должна бросать исключение (best-effort честный gate).
    monkeypatch.setattr("utils.reporter._run_dir", lambda: tmp_path / "missing")
    monkeypatch.setattr("utils.reporter.LIVE_RUN_SUMMARY_PATH", tmp_path / "missing" / "nope.json")
    monkeypatch.setattr("utils.reporter.scanner_RESULTS_DIR", tmp_path / "missing")
    result = purge_stale_run_artifacts()
    assert result["removed"] == []
