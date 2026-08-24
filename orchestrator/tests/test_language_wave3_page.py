# -*- coding: utf-8 -*-
"""Волна 3: PageResolver + page_call + slots."""
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.data_stream import DataStream
from core.errors import WiredError
from core.language_engine import LanguageEngine
from core.language_parse import parse_script
from core.lang_ast import PageCallNode
from core.page_resolver import PageResolver
from adapters.data_adapter import DataAdapter
from core.action_factory import ActionFactory


PAGES = {
    "login": {
        "title": "Login",
        "elements": [
            {
                "id": "email",
                "constructor": "css|#email",
                "slot": 1,
            },
            {
                "id": "password",
                "constructor": "css|#password",
                "slot": 2,
            },
            {
                "id": "submit",
                "constructor": "css|button[type=submit]",
            },
        ],
        "actions": [
            {
                "id": "Войти",
                "description": "Login",
                "constructor": 'Пусть ${seen} = ${email}',
            },
            {
                "id": "Заполнить",
                "constructor": (
                    'Пусть ${filled_email} = ${email}\n'
                    'Пусть ${filled_password} = ${password}'
                ),
            },
        ],
    }
}


def test_parse_page_call():
    nodes = parse_script("login.Войти")
    assert isinstance(nodes[0], PageCallNode)
    assert nodes[0].page == "login"
    assert nodes[0].action == "Войти"
    assert nodes[0].payload is None

    nodes = parse_script("login.Заполнить ${row}")
    assert nodes[0].payload == "${row}"


def test_resolve_element_constructor():
    pr = PageResolver(PAGES)
    assert pr.resolve_constructor("login.email") == "css|#email"
    assert pr.resolve("login.submit")["constructor"] == "css|button[type=submit]"
    assert pr.resolve_constructor("login.missing") is None
    assert pr.resolve_constructor("other.email") is None


def test_bind_payload_list_and_dict():
    pr = PageResolver(PAGES)
    assert pr.bind_payload("login", ["u", "p"]) == {"email": "u", "password": "p"}
    assert pr.bind_payload("login", {"1": "u", "2": "p"}) == {
        "email": "u",
        "password": "p",
    }
    assert pr.bind_payload("login", {"email": "u", "password": "p"}) == {
        "email": "u",
        "password": "p",
    }
    with pytest.raises(WiredError, match="лишний"):
        pr.bind_payload("login", {"email": "u", "password": "p", "x": 1})
    with pytest.raises(WiredError, match="длина"):
        pr.bind_payload("login", ["only"])


def test_controller_page_call_ambient_and_payload():
    from core.controller import Controller

    stream = DataStream({"email": "ambient@x"})
    data = DataAdapter()
    data.bind(stream)

    ctrl = Controller.__new__(Controller)
    ctrl.language_engine = LanguageEngine()
    ctrl.page_resolver = PageResolver(PAGES)
    ctrl.adapters = {"data": data}
    ctrl._wired_problems = []
    ctrl.last_zap_report = None
    factory = ActionFactory()
    factory.register("data", "let", data.let)
    ctrl.action_factory = factory

    def parse(raw):
        parts = raw.split("|")
        action, args = parts[1], parts[2:]
        import inspect

        names = [
            n
            for n, p in inspect.signature(getattr(data, action)).parameters.items()
            if n != "self"
        ]
        return "data", action, {n: a for n, a in zip(names, args)}

    ctrl._parse_constructor = parse
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_wired_error = lambda e, **k: e
    ctrl._diary_high_alerts = lambda: None

    step = SimpleNamespace(
        constructor="login.Войти",
        retry=0,
        retry_delay=1,
        failsafe=False,
        continue_on_failure=False,
        save_as="",
        id="s1",
        description=None,
    )
    assert ctrl._run_step(step, stream, SimpleNamespace(id="sc"), "pc") is True
    assert stream.get("seen") == "ambient@x"

    stream2 = DataStream({"row": ["u@x", "secret"]})
    data2 = DataAdapter()
    data2.bind(stream2)
    ctrl.adapters = {"data": data2}
    factory2 = ActionFactory()
    factory2.register("data", "let", data2.let)
    ctrl.action_factory = factory2
    ctrl._parse_constructor = lambda raw: (
        "data",
        raw.split("|")[1],
        {
            n: a
            for n, a in zip(
                [
                    n
                    for n, p in __import__("inspect")
                    .signature(data2.let)
                    .parameters.items()
                    if n != "self"
                ],
                raw.split("|")[2:],
            )
        },
    )

    step2 = SimpleNamespace(
        constructor="login.Заполнить ${row}",
        retry=0,
        retry_delay=1,
        failsafe=False,
        continue_on_failure=False,
        save_as="",
        id="s2",
        description=None,
    )
    assert ctrl._run_step(step2, stream2, SimpleNamespace(id="sc"), "fill") is True
    assert stream2.get("filled_email") == "u@x"
    assert stream2.get("filled_password") == "secret"
    # slot locals сняты
    assert stream2.get("email") is None
    assert stream2.get("password") is None


def test_expand_page_refs_in_leaf():
    from core.controller import Controller

    ctrl = Controller.__new__(Controller)
    ctrl.page_resolver = PageResolver(PAGES)
    assert ctrl._expand_page_refs("webdriver|click|${login.submit}") == (
        "webdriver|click|css|button[type=submit]"
    )


def test_bare_element_ref_inside_operation_body():
    """В теле Операции ${submit} — элемент своей страницы, снаружи — обычная переменная."""
    from core.controller import Controller

    ctrl = Controller.__new__(Controller)
    ctrl.page_resolver = PageResolver(PAGES)

    ctrl._page_scope = ["login"]
    assert ctrl._expand_page_refs("webdriver|click|${submit}", DataStream()) == (
        "webdriver|click|css|button[type=submit]"
    )

    # Данные сильнее: slot-бинд лежит под id элемента и хранит значение, не локатор.
    stream = DataStream({"email": "u@x"})
    assert ctrl._expand_page_refs("webdriver|send_keys|${email}|x", stream) == (
        "webdriver|send_keys|${email}|x"
    )

    ctrl._page_scope = []
    assert ctrl._expand_page_refs("webdriver|click|${submit}", DataStream()) == (
        "webdriver|click|${submit}"
    )
