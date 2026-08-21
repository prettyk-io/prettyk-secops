# -*- coding: utf-8 -*-
"""Контракт маркеров листа >? (failsafe) и >@ { recover } + retry self×1."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.controller import Controller
from core.data_stream import DataStream
from core.errors import WiredError
from core.language_engine import LanguageEngine
from core.method_id import resolve_line


def _bare_controller(execute):
    ctrl = Controller.__new__(Controller)
    ctrl.language_engine = LanguageEngine()
    ctrl.action_factory = type("F", (), {"execute": staticmethod(execute)})()
    ctrl.adapters = {"data": None}
    ctrl._manifest_problems = []
    ctrl.last_zap_report = None

    def parse(raw: str):
        parts = raw.split("|")
        return parts[0], parts[1], {}

    ctrl._parse_constructor = parse
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_manifest_error = lambda e, **k: e
    ctrl._diary_high_alerts = lambda: None
    return ctrl


def _step(constructor: str):
    return SimpleNamespace(
        constructor=constructor,
        retry=0,
        retry_delay=1,
        failsafe=False,
        continue_on_failure=False,
        save_as="",
        id="s1",
        description=None,
    )


def test_pretty_roundtrip_failsafe_and_recover():
    """Pretty → wire с маркерами; parse_leaf снимает суффиксы."""
    soft = resolve_line("Нажать css .banner-close >?")
    assert soft == "webdriver|click|css|.banner-close >?"
    leaf_soft = LanguageEngine.parse_leaf(soft)
    assert leaf_soft.failsafe is True
    assert leaf_soft.constructor == "webdriver|click|css|.banner-close"
    assert leaf_soft.recover_constructors == []

    recover = resolve_line(
        "Нажать css .payment-form-submit >@ { Нажать css .confirm-submit }"
    )
    assert recover == (
        "webdriver|click|css|.payment-form-submit >@ { "
        "webdriver|click|css|.confirm-submit }"
    )
    leaf_r = LanguageEngine.parse_leaf(recover)
    assert leaf_r.retry_self == 1
    assert leaf_r.constructor == "webdriver|click|css|.payment-form-submit"
    assert leaf_r.recover_constructors == ["webdriver|click|css|.confirm-submit"]


def test_failsafe_soft_skip_keeps_scenario_alive():
    """>? : primary падает → False, без raise; сценарий может идти дальше."""
    calls = []

    def execute(component, action, params, stream):
        calls.append(action)
        raise RuntimeError("optional banner")

    ctrl = _bare_controller(execute)
    assert ctrl._run_step(
        _step("webdriver|click|css|.banner >?"),
        DataStream(),
        SimpleNamespace(id="sc"),
        "banner",
    ) is False
    assert calls == ["click"]


def test_recover_then_retry_self_once():
    """>@ : fail → recover ×1 → primary ещё раз → ok."""
    state = {"primary": 0, "recover": 0}

    def execute(component, action, params, stream):
        if action == "primary":
            state["primary"] += 1
            if state["primary"] == 1:
                raise RuntimeError("need confirm")
            return "ok"
        if action == "recover":
            state["recover"] += 1
            return "r"
        raise AssertionError(action)

    ctrl = _bare_controller(execute)
    assert ctrl._run_step(
        _step("core|primary >@ { core|recover }"),
        DataStream(),
        SimpleNamespace(id="sc"),
        "pay",
    ) is True
    assert state == {"primary": 2, "recover": 1}


def test_recover_fails_bubbles():
    """Recover упал → шаг failed (raise), без второго primary."""
    state = {"primary": 0, "recover": 0}

    def execute(component, action, params, stream):
        if action == "primary":
            state["primary"] += 1
            raise RuntimeError("primary")
        if action == "recover":
            state["recover"] += 1
            raise RuntimeError("recover also dead")
        raise AssertionError(action)

    ctrl = _bare_controller(execute)
    with pytest.raises(RuntimeError, match="Recover после ошибки"):
        ctrl._run_step(
            _step("core|primary >@ { core|recover }"),
            DataStream(),
            SimpleNamespace(id="sc"),
            "pay",
        )
    assert state == {"primary": 1, "recover": 1}


def test_retry_after_recover_fails_bubbles():
    """Recover ok, но retry primary снова падает → raise."""
    state = {"primary": 0, "recover": 0}

    def execute(component, action, params, stream):
        if action == "primary":
            state["primary"] += 1
            raise RuntimeError("always")
        if action == "recover":
            state["recover"] += 1
            return "r"
        raise AssertionError(action)

    ctrl = _bare_controller(execute)
    with pytest.raises(RuntimeError, match="Primary снова упал"):
        ctrl._run_step(
            _step("core|primary >@ { core|recover }"),
            DataStream(),
            SimpleNamespace(id="sc"),
            "pay",
        )
    assert state == {"primary": 2, "recover": 1}


def test_primary_ok_skips_recover():
    """Primary с первого раза → recover не зовётся."""
    state = {"primary": 0, "recover": 0}

    def execute(component, action, params, stream):
        if action == "primary":
            state["primary"] += 1
            return "ok"
        if action == "recover":
            state["recover"] += 1
            return "r"
        raise AssertionError(action)

    ctrl = _bare_controller(execute)
    assert ctrl._run_step(
        _step("core|primary >@ { core|recover }"),
        DataStream(),
        SimpleNamespace(id="sc"),
        "pay",
    ) is True
    assert state == {"primary": 1, "recover": 0}


def test_combo_failsafe_and_recover_forbidden():
    with pytest.raises(WiredError, match="совмещать"):
        LanguageEngine.parse_leaf(
            "webdriver|click|css|.x >? >@ { webdriver|click|css|.y }"
        )


def test_recover_rejects_page_action():
    with pytest.raises(WiredError, match="page action пока не поддерживается"):
        LanguageEngine.parse_leaf("webdriver|click|css|.x >@ { login.Войти }")
