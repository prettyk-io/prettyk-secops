# -*- coding: utf-8 -*-
from core.expr import parse_path, strip_ref
from core.pretty_data import pretty_line_to_wire
from core.constructor_validate import validate_constructor


def test_strip_username():
    assert strip_ref("$username") == "username"
    assert parse_path("username") == ["username"]


def test_let_username():
    assert pretty_line_to_wire('Пусть $username = "x"') == (
        'data|let|username|"x"',
        None,
    )


def test_validate_include_and_passive():
    assert validate_constructor("ВключитьВКонтекст juice_ctx") == []
    assert validate_constructor("ПассивноеСканирование 1") == []
    assert validate_constructor('ЛогАтаки "run $run_id"') == []


def test_secret_placeholder_value_rejected():
    from core.errors import WiredError
    from core.pretty_data import pretty_line_to_wire

    # Сигнатура name|value как «значение» + склейка следующей строки.
    bad = 'Секрет $name = valueПусть $password_value = "kdt_password"'
    try:
        pretty_line_to_wire(bad)
        raise AssertionError("expected WiredError")
    except WiredError as e:
        assert "кавычках" in str(e) or "пустое" in str(e)
    assert any(
        d["severity"] == "error"
        for d in validate_constructor(bad)
    )


def test_secret_bare_value_placeholder_rejected():
    diags = [
        d
        for d in validate_constructor("data|secret|name|value")
        if d["severity"] == "error"
    ]
    assert diags


def test_secret_empty_wire_rejected():
    diags = [
        d
        for d in validate_constructor("data|secret|password_value|")
        if d["severity"] == "error"
    ]
    assert diags


def test_secret_quoted_ok():
    assert validate_constructor('Секрет $password_value = "kdt_password"') == []
