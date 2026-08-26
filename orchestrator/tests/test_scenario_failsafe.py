# -*- coding: utf-8 -*-
from __future__ import annotations

import pytest
from types import SimpleNamespace

from core.errors import WiredError
from core.scenario_failsafe import (
    parse_scenario_failsafe_prefix,
    scenario_failsafe_allowed,
    strip_scenario_failsafe_from_step0_constructor,
)


def test_exact_marker_strips_first_line():
    allowed, body = parse_scenario_failsafe_prefix("<!>\nОткрыть $base_url\n")
    assert allowed is True
    assert body == "Открыть $base_url\n"


def test_no_marker_returns_original():
    raw = "Открыть $base_url\n"
    allowed, body = parse_scenario_failsafe_prefix(raw)
    assert allowed is False
    assert body == raw


def test_almost_marker_no_match():
    allowed, body = parse_scenario_failsafe_prefix("<!!\nx")
    assert allowed is False
    assert body.startswith("<!!")


def test_leading_space_no_match():
    allowed, _ = parse_scenario_failsafe_prefix(" <!>\nОткрыть x")
    assert allowed is False


def test_junk_after_marker_raises():
    with pytest.raises(WiredError, match="После маркера"):
        parse_scenario_failsafe_prefix("<!> discovery\nОткрыть x")


def test_marker_only_line_empty_body():
    allowed, body = parse_scenario_failsafe_prefix("<!>")
    assert allowed is True
    assert body == ""


def test_whitespace_after_marker_ok():
    allowed, body = parse_scenario_failsafe_prefix("<!>   \nЛог \"ok\"")
    assert allowed is True
    assert body == 'Лог "ok"'


def test_scenario_failsafe_allowed_from_flag_or_marker():
    plain = SimpleNamespace(
        continue_on_failure=False,
        steps=[SimpleNamespace(constructor="Открыть x")],
    )
    assert scenario_failsafe_allowed(plain) is False

    flagged = SimpleNamespace(continue_on_failure=True, steps=[])
    assert scenario_failsafe_allowed(flagged) is True

    marked = SimpleNamespace(
        continue_on_failure=False,
        steps=[SimpleNamespace(constructor="<!>\nОткрыть x")],
    )
    assert scenario_failsafe_allowed(marked) is True


def test_strip_helper():
    assert strip_scenario_failsafe_from_step0_constructor("<!>\nA\nB") == "A\nB"
    assert strip_scenario_failsafe_from_step0_constructor("A\nB") == "A\nB"


def test_validate_language_script_accepts_scenario_failsafe_marker():
    from core.constructor_validate import validate_language_script

    script = "<!>\nПусть $username = СлучайныйEmail\nЛог $username\n"
    diags = validate_language_script(script)
    errors = [d for d in diags if d.get("severity") == "error"]
    assert errors == [], errors
    assert not any("<!>" in str(d.get("message")) for d in diags)
