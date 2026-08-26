# -*- coding: utf-8 -*-
"""HEAL-F carcass: _locate_with_heal miss → heal → re-locate (без живого Grid/Juice)."""
from __future__ import annotations

import logging

from adapters.webdriver_adapter import WebDriverAdapter
from utils.locator_heal import fingerprint_from_attrs
from utils.locator_heal_runtime import (
    clear_fingerprint_store,
    heal_scope,
    remember_fingerprint,
)


class _FakeDriver:
    def __init__(self, rows):
        self._rows = rows

    def execute_script(self, _js):
        return self._rows


class _FakeEl:
    def __init__(self, **attrs):
        self.tag_name = attrs.get("tag", "button")
        self.text = attrs.get("text", "")
        self._attrs = attrs

    def get_attribute(self, name):
        if name == "class":
            return self._attrs.get("classes", "")
        return self._attrs.get(name, "")

    def find_element(self, *_a, **_k):
        raise RuntimeError("no parent")


def test_locate_with_heal_renames_id(monkeypatch, caplog):
    monkeypatch.delenv("PK_LOCATOR_HEAL", raising=False)
    clear_fingerprint_store()
    remember_fingerprint(
        fingerprint_from_attrs(
            locator_type="id",
            locator_value="login-btn",
            tag="button",
            id="login-btn",
            text="Войти",
            classes=("btn", "primary"),
            parent_tag="form",
        )
    )
    adapter = WebDriverAdapter.__new__(WebDriverAdapter)
    adapter.driver = _FakeDriver(
        [
            {
                "key": "0",
                "tag": "button",
                "id": "login-button-new",
                "name": "",
                "text": "Войти",
                "role": "",
                "aria_label": "",
                "classes": "btn primary",
                "parent_tag": "form",
            }
        ]
    )
    adapter._ensure_driver = lambda: True  # type: ignore[method-assign]

    class _Miss:
        def locate(self):
            raise TimeoutError("no such element")

    class _Hit:
        def __init__(self, el):
            self._el = el

        def locate(self):
            return self._el

    healed_el = _FakeEl(
        tag="button",
        id="login-button-new",
        text="Войти",
        classes="btn primary",
    )

    def _el(selector_type, selector_value, timeout=None):
        if selector_value == "login-btn":
            return _Miss()
        return _Hit(healed_el)

    adapter._el = _el  # type: ignore[method-assign]

    with heal_scope(allowed=True), caplog.at_level(logging.INFO, logger="orchestrator"):
        el, st, sv = adapter._locate_with_heal("id", "login-btn")
    assert el is healed_el
    assert st == "id"
    assert sv == "login-button-new"
    assert any("heal OK" in r.message for r in caplog.records)


def test_locate_with_heal_miss_escalates(monkeypatch, caplog):
    monkeypatch.delenv("PK_LOCATOR_HEAL", raising=False)
    clear_fingerprint_store()
    remember_fingerprint(
        fingerprint_from_attrs(
            locator_type="id",
            locator_value="gone",
            tag="button",
            id="gone",
            text="X",
        )
    )
    adapter = WebDriverAdapter.__new__(WebDriverAdapter)
    adapter.driver = _FakeDriver(
        [
            {
                "key": "0",
                "tag": "div",
                "id": "other",
                "name": "",
                "text": "nope",
                "role": "",
                "aria_label": "",
                "classes": "",
                "parent_tag": "body",
            }
        ]
    )
    adapter._ensure_driver = lambda: True  # type: ignore[method-assign]

    class _Miss:
        def locate(self):
            raise TimeoutError("primary miss")

    adapter._el = lambda *a, **k: _Miss()  # type: ignore[method-assign]

    with heal_scope(allowed=True), caplog.at_level(logging.WARNING, logger="orchestrator"):
        try:
            adapter._locate_with_heal("id", "gone", timeout=0.1)
            raised = False
        except TimeoutError:
            raised = True
    assert raised
    assert any("heal MISS" in r.message for r in caplog.records)
