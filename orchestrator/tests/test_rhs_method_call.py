# -*- coding: utf-8 -*-
"""MethodId / ворота / wire справа от Пусть: результат шага → переменная."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.constructor_validate import validate_constructor
from core.errors import WiredError
from core.lang_ast import ActionNode
from core.language_parse import parse_script
from core.pretty_data import pretty_line_to_wire


@pytest.mark.parametrize(
    "line,wire,save_as",
    [
        ("Пусть ${c} = Сессия КоличествоCookies", "browser|get_cookies_count", "c"),
        ("Пусть ${a} = ZAP ПолучитьАлерты", "zap|get_alerts", "a"),
        (
            "Пусть ${t} = ПолучитьТекст css #email",
            "webdriver|get_text|css|#email",
            "t",
        ),
        (
            "Пусть ${x} = webdriver|get_text|css|#email",
            "webdriver|get_text|css|#email",
            "x",
        ),
    ],
)
def test_method_call_rhs(line, wire, save_as):
    assert pretty_line_to_wire(line) == (wire, save_as)
    assert [d for d in validate_constructor(line) if d["severity"] == "error"] == []


@pytest.mark.parametrize(
    "line,wire",
    [
        ('Пусть ${role} = "admin"', 'data|let|role|"admin"'),
        ("Пусть ${copy} = ${role}", "data|let|copy|${role}"),
        ("Пусть ${i} = ${i} + 1", "data|let|i|${i} + 1"),
        ('Пусть ${items} = Список ["a", "b"]', 'data|let|items|Список ["a", "b"]'),
    ],
)
def test_plain_rhs_untouched_by_method_call(line, wire):
    assert pretty_line_to_wire(line) == (wire, None)


@pytest.mark.parametrize(
    "line",
    [
        "Пусть ${el} = Элемент css #email",
        "Пусть ${msg} = привет мир",
    ],
)
def test_plain_rhs_rejects_unquoted_multi_token_values(line):
    with pytest.raises(WiredError, match="одно значение"):
        pretty_line_to_wire(line)


def test_secret_with_step_result_is_error():
    with pytest.raises(WiredError, match="нельзя пометить секретом"):
        pretty_line_to_wire("Секрет ${c} = Сессия КоличествоCookies")


def test_method_call_rhs_becomes_action_node_with_save_as():
    node = parse_script("Пусть ${c} = Сессия КоличествоCookies")[0]
    assert isinstance(node, ActionNode)
    assert node.constructor == "browser|get_cookies_count"
    assert node.save_as == "c"


def test_page_call_rhs_is_explicit_error_not_silent_string():
    with pytest.raises(WiredError, match="операции страницы"):
        pretty_line_to_wire("Пусть ${x} = login.Войти")
    with pytest.raises(WiredError, match="операции страницы"):
        pretty_line_to_wire("Пусть ${x} = login.Войти ${email}")


def test_method_call_rhs_requires_simple_name():
    with pytest.raises(WiredError, match="простое имя"):
        pretty_line_to_wire("Пусть ${session.cookies} = Сессия КоличествоCookies")
