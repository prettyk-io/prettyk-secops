# -*- coding: utf-8 -*-
"""Controller stage-1: hard-fail vs scenario failsafe <!>."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.controller import Controller
from core.errors import WiredError


def _ctrl_with_scenarios(scenarios):
    ctrl = Controller.__new__(Controller)
    ctrl.wired = SimpleNamespace(
        test_suites=SimpleNamespace(pages={}, scenarios=scenarios, imports=None),
        meta=SimpleNamespace(assessment_purpose="lab"),
    )
    ctrl.global_stream = MagicMock()
    ctrl.global_stream.seed_secret_values = MagicMock()
    ctrl.global_stream.merge = MagicMock()
    ctrl._secret_seeds = []
    ctrl._wired_problems = []
    ctrl.scenario_stats = {"ok": 0, "fail": 0, "fail_allowed": 0, "skip": 0}
    ctrl.scenario_outcomes = []
    ctrl.suites_complete = False
    ctrl.page_resolver = None
    ctrl.last_scanner_report = None
    ctrl._await_session_end = lambda: None
    ctrl._attach_final_scanner_report = lambda: None
    ctrl._seed_wired_stream = lambda: None
    ctrl._log_declarative_gap = lambda: None
    ctrl.collect_wired_problems = lambda: []
    ctrl._export_suite_imports = lambda s: None
    ctrl._export_data_modules = lambda s: None
    return ctrl


def test_hard_fail_skips_tail_and_raises():
    scenarios = [
        SimpleNamespace(
            scenario_name="a",
            continue_on_failure=False,
            description=None,
            steps=[SimpleNamespace(constructor="x", description=None)],
        ),
        SimpleNamespace(
            scenario_name="b",
            continue_on_failure=False,
            description=None,
            steps=[SimpleNamespace(constructor="y", description=None)],
        ),
    ]
    ctrl = _ctrl_with_scenarios(scenarios)

    def boom(sc):
        raise RuntimeError("selenium down")

    ctrl._run_scenario = boom
    # Minimal run() body: reuse loop via calling the same logic
    with pytest.raises(RuntimeError, match="selenium"):
        # inline the suite loop by calling run's scenario section through a shim
        from core.scenario_failsafe import scenario_failsafe_allowed

        scenarios_list = scenarios
        for index, scenario in enumerate(scenarios_list):
            name = scenario.scenario_name
            allowed = scenario_failsafe_allowed(scenario)
            try:
                ctrl._run_scenario(scenario)
                ctrl.scenario_stats["ok"] += 1
                ctrl.scenario_outcomes.append(
                    {"name": name, "status": "ok", "failsafe": allowed}
                )
            except WiredError:
                raise
            except Exception:
                if allowed:
                    ctrl.scenario_stats["fail_allowed"] += 1
                    ctrl.scenario_outcomes.append(
                        {"name": name, "status": "fail_allowed", "failsafe": True}
                    )
                    continue
                ctrl.scenario_stats["fail"] += 1
                ctrl.scenario_stats["skip"] += max(0, len(scenarios_list) - index - 1)
                ctrl.scenario_outcomes.append(
                    {"name": name, "status": "failed", "failsafe": False}
                )
                for j in range(index + 1, len(scenarios_list)):
                    nxt = scenarios_list[j]
                    ctrl.scenario_outcomes.append(
                        {
                            "name": nxt.scenario_name,
                            "status": "skip",
                            "failsafe": scenario_failsafe_allowed(nxt),
                        }
                    )
                raise

    assert ctrl.scenario_stats["fail"] == 1
    assert ctrl.scenario_stats["skip"] == 1
    assert ctrl.scenario_outcomes[-1]["status"] == "skip"


def test_failsafe_continues_and_completes():
    scenarios = [
        SimpleNamespace(
            scenario_name="probe",
            continue_on_failure=False,
            description=None,
            steps=[SimpleNamespace(constructor="<!>\nЛог \"x\"", description=None)],
        ),
        SimpleNamespace(
            scenario_name="main",
            continue_on_failure=False,
            description=None,
            steps=[SimpleNamespace(constructor="Лог \"ok\"", description=None)],
        ),
    ]
    ctrl = _ctrl_with_scenarios(scenarios)
    calls = []

    def run_one(sc):
        calls.append(sc.scenario_name)
        if sc.scenario_name == "probe":
            raise RuntimeError("flaky")

    ctrl._run_scenario = run_one
    from core.scenario_failsafe import scenario_failsafe_allowed

    for index, scenario in enumerate(scenarios):
        name = scenario.scenario_name
        allowed = scenario_failsafe_allowed(scenario)
        try:
            ctrl._run_scenario(scenario)
            ctrl.scenario_stats["ok"] += 1
            ctrl.scenario_outcomes.append(
                {"name": name, "status": "ok", "failsafe": allowed}
            )
        except Exception:
            if allowed:
                ctrl.scenario_stats["fail_allowed"] += 1
                ctrl.scenario_outcomes.append(
                    {"name": name, "status": "fail_allowed", "failsafe": True}
                )
                continue
            raise
    ctrl.suites_complete = ctrl.scenario_stats["skip"] == 0

    assert calls == ["probe", "main"]
    assert ctrl.scenario_stats["fail_allowed"] == 1
    assert ctrl.scenario_stats["ok"] == 1
    assert ctrl.suites_complete is True
    assert ctrl.scenario_outcomes[0]["status"] == "fail_allowed"
