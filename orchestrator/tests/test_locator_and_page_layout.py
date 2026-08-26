# -*- coding: utf-8 -*-
"""LocatorDesc RHS + page layout → PageResolver."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.data_adapter import DataAdapter
from core.data_stream import DataStream
from core.errors import WiredError
from core.expr import LocatorDesc, parse_value
from core.page_layout import materialize_page, parse_page_layout
from core.page_resolver import PageResolver


def test_parse_element_locator_rhs():
    loc = parse_value("Элемент css #email", lambda p: None)
    assert isinstance(loc, LocatorDesc)
    assert loc.by == "css"
    assert loc.value == "#email"
    assert loc.as_wire() == "css|#email"
    assert loc.collection is False

    wire = parse_value("Локатор css|#x", lambda p: None)
    assert wire == LocatorDesc("css", "#x")

    coll = parse_value("КоллекцияЭлементов css .row", lambda p: None)
    assert coll.collection is True
    assert coll.as_wire() == "css|.row"


def test_let_stores_locator_in_stream():
    stream = DataStream()
    data = DataAdapter()
    data.bind(stream)
    data.let("host", "Элемент css #email")
    val = stream.get("host")
    assert isinstance(val, LocatorDesc)
    assert val.as_wire() == "css|#email"


def test_expand_locator_ref_in_controller():
    from core.controller import Controller

    stream = DataStream()
    stream.set("host", LocatorDesc("css", "#email"))
    ctrl = Controller.__new__(Controller)
    ctrl.page_resolver = None
    out = ctrl._expand_page_refs("webdriver|click|${host}", stream)
    assert out == "webdriver|click|css|#email"


def test_parse_page_layout_elements_and_action():
    els, acts = parse_page_layout(
        'Элемент email = css #email\n'
        'Локатор password = css|#password slot 2\n'
        'КоллекцияЭлементов rows = css .item\n'
        'Операция Войти {\n'
        '  Нажать ${email}\n'
        '}'
    )
    assert [e["id"] for e in els] == ["email", "password", "rows"]
    assert els[0]["constructor"] == "css|#email"
    assert els[1]["slot"] == 2
    assert els[1]["constructor"] == "css|#password"
    assert els[2].get("collection") is True
    assert acts[0]["id"] == "Войти"
    assert "Нажать ${email}" in acts[0]["constructor"]


def test_page_operation_rejects_leaf_markers_after_closing_brace():
    text = "Операция Длинный { Пауза 1 } >@ { Регистрация } >?"

    with pytest.raises(WiredError, match=r"Маркеры >\? / >@ применяются к листу"):
        parse_page_layout(text)

    from core.constructor_validate import validate_constructor

    diagnostics = validate_constructor(text)
    assert len(diagnostics) == 1
    assert "недопустим хвост" in diagnostics[0]["message"]


def test_page_operation_validates_marker_conflict_inside_body():
    from core.constructor_validate import validate_constructor

    diagnostics = validate_constructor("Операция X { Пауза 1 >? >@ { Пауза 2 } }")

    assert len(diagnostics) == 1
    assert "Нельзя совмещать" in diagnostics[0]["message"]


def test_page_action_rejects_leaf_markers_on_call():
    from core.constructor_validate import validate_constructor

    diagnostics = validate_constructor("login.Войти >@ { login.Регистрация }")

    assert len(diagnostics) == 1
    assert "нельзя ставить на page action" in diagnostics[0]["message"]


def test_page_operation_bare_element_sugar():
    """В Операции голое email/submit → $email/$submit (канон $… тоже ок)."""
    els, acts = parse_page_layout(
        "Элемент email = css #email\n"
        "Элемент submit = css #loginButton\n"
        "Операция Войти {\n"
        "  ВставитьЗначение email $username\n"
        "  Нажать submit\n"
        "}\n"
    )
    assert {e["id"] for e in els} == {"email", "submit"}
    body = acts[0]["constructor"]
    assert "ВставитьЗначение $email $username" in body
    assert "Нажать $submit" in body
    # стратегии не сахаррим
    _, acts2 = parse_page_layout(
        "Элемент email = id emailControl\n"
        "Операция Заполнить {\n"
        "  ВставитьЗначение id emailControl $username\n"
        "}\n"
    )
    assert "ВставитьЗначение id emailControl $username" in acts2[0]["constructor"]


def test_page_resolver_materializes_constructor():
    pages = {
        "login": {
            "title": "Login",
            "constructor": (
                "Элемент email = css #email\n"
                "Операция Войти {\n"
                '  Пусть ${seen} = ${email}\n'
                "}"
            ),
            "elements": [{"id": "legacy", "constructor": "css|#legacy"}],
        }
    }
    pr = PageResolver(pages)
    assert pr.resolve_constructor("login.email") == "css|#email"
    assert pr.resolve_constructor("login.legacy") == "css|#legacy"
    act = pr.get_action("login", "Войти")
    assert "seen" in act["constructor"]


def test_materialize_merges_layout_over_legacy_same_id():
    page = materialize_page(
        {
            "constructor": "Элемент email = css #new",
            "elements": [{"id": "email", "constructor": "css|#old"}],
        }
    )
    assert page["elements"][0]["constructor"] == "css|#new"


def test_page_layout_bad_line():
    with pytest.raises(WiredError, match=r"строка 1:.*непонятная"):
        parse_page_layout("foo bar")


def test_validate_page_layout_constructor_clean():
    from core.constructor_validate import validate_constructor

    text = (
        "Элемент email = css #email\n"
        "Элемент submit = css button[type=submit]\n"
        "Операция Войти {\n"
        "  Нажать ${submit}\n"
        "}"
    )
    diags = validate_constructor(text)
    errors = [d for d in diags if d.get("severity") == "error"]
    assert errors == [], errors


def test_validate_page_layout_bad_line_location():
    from core.constructor_validate import validate_constructor

    text = (
        "Элемент email = css #email\n"
        "Элемент password = css #password\n"
        "Элемент submit = css #submit\n"
        "\n"
        "Операция Войти {\n"
        "  ВставитьЗначение $email $username\n"
        "  ВставитьЗначение $password $password\n"
        "  Нажать $submit\n"
        "}\n"
        "\n"
        "вфц\n"
    )
    diags = [d for d in validate_constructor(text) if d.get("severity") == "error"]
    assert diags
    assert diags[0].get("line") == 11
    assert diags[0].get("column") == 1
    assert text[diags[0]["start"] : diags[0]["end"]].strip() == "вфц"
