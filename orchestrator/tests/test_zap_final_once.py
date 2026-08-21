# -*- coding: utf-8 -*-
"""zap-final.html — один раз на прогон, не на каждый сценарий."""
from __future__ import annotations

import sys
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.data_adapter import DataAdapter
from core.action_factory import ActionFactory
from core.controller import Controller
from core.data_stream import DataStream
from core.language_engine import LanguageEngine
from models.wired import (
    ActionStep,
    Infrastructure,
    Wired,
    Meta,
    Scenario,
    SecurityConfiguration,
)
from models.wired import TestSuites as ManifestSuites


def _stub_controller(monkeypatch, *, scenarios):
    monkeypatch.setenv("KDT_AUTH_BOOTSTRAP", "0")
    monkeypatch.setenv("KDT_QUALITY_GATE", "0")
    monkeypatch.setenv("KDT_LIVE", "0")

    @contextmanager
    def _step(_title):
        yield

    monkeypatch.setattr("allure.step", _step)
    monkeypatch.setattr(
        "utils.allure_runtime.bind_allure",
        lambda _d: (MagicMock(), MagicMock(), MagicMock()),
    )
    monkeypatch.setattr("utils.allure_runtime.unbind_allure", lambda *_a, **_k: None)

    ctrl = Controller.__new__(Controller)
    ctrl.last_zap_report = None
    ctrl.wired = Manifest(
        meta=Meta(assessment_purpose="scheduled"),
        infrastructure=Infrastructure(zap_mode="demon", browser_type="chrome-headless"),
        security_configuration=SecurityConfiguration(
            base_url_override="http://example.test",
            allowed_extra_domains="",
            scan_policy="custom_policy",
            auth_type="Без авторизации",
        ),
        test_suites=ManifestSuites(scenarios=scenarios),
    )
    ctrl.global_stream = DataStream()
    ctrl.language_engine = LanguageEngine()
    ctrl.page_resolver = None
    ctrl._manifest_problems = []
    ctrl.quality_gate_failed = False
    ctrl.quality_gate_summary = None
    ctrl.auth_bootstrap_result = None
    ctrl._work_timer = None
    ctrl._idle_timer = None
    ctrl._idle_seconds = None
    ctrl._timeout_kill_reason = None
    ctrl.adapters = {"data": DataAdapter(), "zap": MagicMock()}
    ctrl.action_factory = ActionFactory()
    ctrl.reporter = MagicMock()
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_manifest_error = lambda e, **k: e
    ctrl._diary_high_alerts = lambda: None
    ctrl._export_data_modules = lambda stream: None
    ctrl._export_suite_imports = lambda stream: None
    ctrl._report_manifest_problems = lambda **k: None
    ctrl._seed_manifest_stream = lambda: None
    ctrl._log_declarative_gap = lambda: None
    ctrl._session_name = lambda: "unit"
    ctrl.collect_manifest_problems = lambda: []
    return ctrl


def test_zap_final_attached_once_for_two_scenarios(monkeypatch):
    scenarios = [
        Scenario(
            scenario_name="S1",
            steps=[ActionStep(constructor='Лог "a"', description="a")],
        ),
        Scenario(
            scenario_name="S2",
            steps=[ActionStep(constructor='Лог "b"', description="b")],
        ),
    ]
    ctrl = _stub_controller(monkeypatch, scenarios=scenarios)
    calls = {"n": 0}
    ctrl._attach_final_zap_report = lambda: calls.__setitem__("n", calls["n"] + 1)
    ctrl._run_scenario = lambda sc: None

    ctrl.run()
    assert calls["n"] == 1


def test_zap_final_still_once_when_scenario_fails(monkeypatch):
    scenarios = [
        Scenario(
            scenario_name="S1",
            steps=[ActionStep(constructor='Лог "a"', description="a")],
        ),
        Scenario(
            scenario_name="S2",
            steps=[ActionStep(constructor='Лог "b"', description="b")],
        ),
    ]
    ctrl = _stub_controller(monkeypatch, scenarios=scenarios)
    calls = {"n": 0}
    ctrl._attach_final_zap_report = lambda: calls.__setitem__("n", calls["n"] + 1)

    def _boom(sc):
        if sc.scenario_name == "S1":
            raise RuntimeError("boom")

    ctrl._run_scenario = _boom

    try:
        ctrl.run()
    except RuntimeError:
        pass

    assert calls["n"] == 1


def test_zap_final_reuses_manifest_html_report(tmp_path):
    report = tmp_path / "wired-zap.html"
    report.write_text("<html>report</html>", encoding="utf-8")
    zap = MagicMock()
    ctrl = Controller.__new__(Controller)
    ctrl.adapters = {"zap": zap}
    ctrl.last_zap_report = str(report)

    ctrl._attach_final_zap_report()

    zap.generate_report.assert_not_called()
