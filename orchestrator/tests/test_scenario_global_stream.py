# -*- coding: utf-8 -*-
"""Stream scope: seed/data-модуль public; Пусть сценария — private (не leak в соседа)."""
from __future__ import annotations

import sys
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.data_adapter import DataAdapter
from adapters.data_processor import DataProcessor
from core.action_factory import ActionFactory
from core.controller import Controller
from core.data_stream import DataStream
from core.errors import WiredError
from core.language_engine import LanguageEngine
from models.wired import (
    ActionStep,
    Infrastructure,
    Wired,
    Meta,
    Scenario,
    SecurityConfiguration,
)
from models.wired import TestDataConstructorModule as DataModule
from models.wired import TestSuites as TestSuites


def test_datastream_merge_is_explicit_api():
    """DataStream.merge — явный API; продукт больше не promote-ит сценарий в global."""
    global_stream = DataStream()
    s1 = DataStream()
    s1.merge(global_stream)
    data = DataAdapter()
    data.bind(s1)
    data.let("role", '"admin"')
    data.let("payload", 'Объект { "q": "x" }')
    global_stream.merge(s1)

    s2 = DataStream()
    s2.merge(global_stream)
    assert s2.get("role") == "admin"
    assert s2.get_path("payload.q") == "x"
    assert s2.resolve_arg("role=${role} q=${payload.q}") == "role=admin q=x"


def _stub_controller(monkeypatch) -> Controller:
    """Controller без scanner/WD; data + core для Пусть / Лог."""
    monkeypatch.setenv("PK_AUTH_BOOTSTRAP", "0")
    monkeypatch.setenv("PK_QUALITY_GATE", "0")

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
    ctrl.last_scanner_report = None
    ctrl.wired = Wired(
        meta=Meta(assessment_purpose="scheduled"),
        infrastructure=Infrastructure(scanner_mode="demon", browser_type="chrome-headless", base_url_override="http://example.test"),
        security_configuration=SecurityConfiguration(
            base_url_override="http://example.test",
            allowed_extra_domains="",
            scan_policy="custom_policy",
            auth_type="Без авторизации",
        ),
        test_suites=TestSuites(scenarios=[]),
    )
    ctrl.global_stream = DataStream()
    ctrl.language_engine = LanguageEngine()
    ctrl.page_resolver = None
    ctrl._wired_problems = []
    ctrl.quality_gate_failed = False
    ctrl.quality_gate_summary = None
    ctrl.auth_bootstrap_result = None
    ctrl._secret_seeds = []
    ctrl._work_timer = None
    ctrl._idle_timer = None
    ctrl._idle_seconds = None
    ctrl._timeout_kill_reason = None
    ctrl.adapters = {"data": DataAdapter()}
    ctrl.action_factory = ActionFactory()
    ctrl.action_factory.register("data", "let", ctrl.adapters["data"].let)
    ctrl.action_factory.register("data", "secret", ctrl.adapters["data"].secret)
    ctrl.action_factory.register("core", "log_message", DataProcessor.log_message)
    ctrl.reporter = MagicMock()
    ctrl._attach_final_scanner_report = lambda: None
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_wired_error = lambda e, **k: e
    ctrl._diary_high_alerts = lambda: None
    ctrl._export_data_modules = lambda stream: None
    ctrl._report_wired_problems = lambda **k: None
    return ctrl


def test_seed_base_url_into_global_stream(monkeypatch):
    """base_url_override → ${base_url} до сценариев; авто-Открыть нет."""
    ctrl = _stub_controller(monkeypatch)
    ctrl._export_suite_imports = lambda stream: None
    ctrl.wired.test_suites = TestSuites(
        scenarios=[
            Scenario(
                scenario_name="S1",
                steps=[
                    ActionStep(
                        constructor='Лог "${base_url}"',
                        description="read seed",
                        save_as="logged",
                    )
                ],
            )
        ]
    )
    ctrl.run()
    assert ctrl.global_stream.get("base_url") == "http://example.test"


def test_language_script_allure_uses_leaf_descriptions(monkeypatch):
    ctrl = _stub_controller(monkeypatch)
    ctrl._export_suite_imports = lambda stream: None
    titles = []

    @contextmanager
    def _step(title):
        titles.append(title)
        yield

    monkeypatch.setattr("allure.step", _step)
    scenario = Scenario(
        scenario_name="human-allure",
        steps=[
            ActionStep(
                constructor='Пусть $n = 1\nЛог "готово"',
            )
        ],
    )

    ctrl._run_scenario(scenario)

    assert titles == [
        "Данные: Пусть — имя: n, значение: 1",
        "Ядро: Лог — сообщение: готово",
    ]


def test_scenario_description_becomes_allure_suite_with_name_fallback(monkeypatch):
    ctrl = _stub_controller(monkeypatch)
    ctrl._export_suite_imports = lambda stream: None
    reporter = MagicMock()
    monkeypatch.setattr(
        "utils.allure_runtime.bind_allure",
        lambda _d: (reporter, MagicMock(), MagicMock()),
    )

    ctrl._run_scenario(
        Scenario(scenario_name="Вход", description="Регрессия", steps=[])
    )
    result = reporter.schedule_test.call_args.args[1]
    assert next(label.value for label in result.labels if label.name == "suite") == "Регрессия"

    reporter.reset_mock()
    ctrl._run_scenario(Scenario(scenario_name="Корень", steps=[]))
    result = reporter.schedule_test.call_args.args[1]
    assert next(label.value for label in result.labels if label.name == "suite") == "Корень"


def test_scenario_let_does_not_leak_to_next_scenario(monkeypatch):
    """S1 Пусть private: S2 не видит $role (нет promote в global)."""
    ctrl = _stub_controller(monkeypatch)
    ctrl._export_suite_imports = lambda stream: None
    s1 = Scenario(
        scenario_name="S1 фарш",
        steps=[
            ActionStep(
                constructor=(
                    'Пусть ${role} = "admin"\n'
                    'Пусть ${payload} = Объект { "q": "x" }'
                ),
                description="объявить vars",
            )
        ],
    )
    s2 = Scenario(
        scenario_name="S2 читает",
        steps=[
            ActionStep(
                # Лог soft-interpolate; Пусть RHS — strict → «не объявлена».
                constructor="Пусть $check = $role",
                description="не должно видеть S1",
            )
        ],
    )
    ctrl.wired.test_suites = TestSuites(scenarios=[s1, s2])
    with pytest.raises(WiredError, match=r"не объявлена"):
        ctrl.run()
    assert ctrl.global_stream.get("role") is None
    assert ctrl.global_stream.get("payload") is None


def test_data_module_vars_visible_in_scenario(monkeypatch):
    """Data-модуль public: export в каждый scenario_stream."""
    ctrl = _stub_controller(monkeypatch)
    ctrl._export_suite_imports = lambda stream: None
    # Реальный export модулей (stub в _stub_controller отключал).
    ctrl._export_data_modules = Controller._export_data_modules.__get__(ctrl, Controller)
    ctrl._url_list_keys = set()
    ctrl._note_url_list_key = Controller._note_url_list_key.__get__(ctrl, Controller)
    ctrl._looks_like_url_line_list = Controller._looks_like_url_line_list
    ctrl._apply_context_item = Controller._apply_context_item.__get__(ctrl, Controller)
    ctrl._exec_data_script = Controller._exec_data_script.__get__(ctrl, Controller)
    ctrl._parse_constructor = Controller._parse_constructor.__get__(ctrl, Controller)
    ctrl._base_url_override = lambda: "http://example.test"

    mod = DataModule(
        id="shared",
        module_type="Модуль работы с данными",
        data_storage_fields={
            "editor": (
                'Пусть $role = "admin"\n'
                'Пусть $payload = Объект { "q": "x" }\n'
                "Пусть $shared = true"
            )
        },
    )
    ctrl.wired.test_suites = TestSuites(
        test_data_constructor=[mod],
        scenarios=[
            Scenario(
                scenario_name="S1",
                steps=[
                    ActionStep(
                        constructor='Лог "role=${role} q=${payload.q}"',
                        description="read module",
                        save_as="logged",
                    )
                ],
            ),
            Scenario(
                scenario_name="S2",
                steps=[
                    ActionStep(
                        constructor='Лог "again=${role}"',
                        description="read module again",
                        save_as="logged2",
                    )
                ],
            ),
        ],
    )
    ctrl.run()
    # В global только seed — не role из модуля/сценария.
    assert ctrl.global_stream.get("base_url") == "http://example.test"
    assert ctrl.global_stream.get("role") is None


def test_failed_scenario_does_not_pollute_global(monkeypatch):
    ctrl = _stub_controller(monkeypatch)
    ctrl._export_suite_imports = lambda stream: None

    def boom_leaf(*_a, **_k):
        raise RuntimeError("boom")

    ctrl._run_leaf_attempts = boom_leaf
    s1 = Scenario(
        scenario_name="S1 fail",
        steps=[ActionStep(constructor="core|log_message|x", description="fail")],
    )
    ctrl.wired.test_suites = TestSuites(scenarios=[s1])
    with pytest.raises(RuntimeError, match="boom"):
        ctrl.run()
    assert "x" not in list(ctrl.global_stream.names())
    assert ctrl.global_stream.get("role") is None
    assert ctrl.global_stream.get("base_url") == "http://example.test"


def test_fixture_Wired_shared_via_data_module():
    """JSON-фикстура: shared vars в data-модуле, сценарии только читают."""
    path = Path(__file__).parent / "fixtures" / "constructor_vars_two_scenarios.json"
    raw = path.read_text(encoding="utf-8")
    import json

    data = json.loads(raw)
    suites = data["test_suites"]
    mods = suites.get("test_data_constructor") or []
    assert mods, "ожидался data-модуль со shared vars"
    assert "Пусть" in (mods[0].get("data_storage_fields") or {}).get("editor", "")
    scenarios = suites["scenarios"]
    assert len(scenarios) == 2
    assert "role=" in scenarios[0]["steps"][0]["constructor"]
    assert "payload.q" in scenarios[1]["steps"][0]["constructor"]
    Wired.model_validate(data)
