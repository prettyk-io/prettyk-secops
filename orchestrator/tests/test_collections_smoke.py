# -*- coding: utf-8 -*-
"""Коллекции DOM: MethodId surface + filter → list[str] (без браузера)."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, List

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.method_id import method_id_aliases, method_id_catalog, method_tier, resolve_call


class _FakeEl:
    def __init__(self, text: str):
        self.text = text


class _StubWD:
    """Минимальный stub под filter_elements_by_text без Selenium."""

    def __init__(self, texts: List[str]):
        self._texts = texts

    def _ensure_driver(self) -> bool:
        return True

    def _find_elements(self, selector_type: Any, selector_value: Any):
        return [_FakeEl(t) for t in self._texts]


def test_collection_method_ids_ui_tier():
    for mid in (
        "НажатьПоТексту",
        "НажатьПоИндексу",
        "ТекстыЭлементов",
        "КоличествоЭлементов",
        "ТекстЭлементаПоИндексу",
    ):
        assert mid in method_id_catalog()
        assert method_tier(mid) == "ui"
    assert method_tier("ТекстыЭлементовСТекстом") == "util"


def test_filter_alias_and_no_webelement_surface():
    assert method_id_aliases().get("ФильтрЭлементовПоТексту") == "ТекстыЭлементовСТекстом"
    assert "ЭлементПоИндексу" not in method_id_catalog()


def test_resolve_collection_wires():
    click = resolve_call("НажатьПоТексту css .item Login")
    assert click is not None
    assert click.startswith("webdriver|click_element_by_text|")
    filt = resolve_call("ТекстыЭлементовСТекстом css .item Login")
    assert filt is not None
    assert filt.startswith("webdriver|filter_elements_by_text|")
    assert resolve_call("ТекстыЭлементов css .row") is not None
    assert resolve_call("ФильтрЭлементовПоТексту css .row x") is not None


def test_filter_elements_by_text_returns_list_str():
    from adapters.webdriver_adapter import WebDriverAdapter

    wd = WebDriverAdapter.__new__(WebDriverAdapter)
    stub = _StubWD(["Login", "Logout", "Login help"])
    wd._ensure_driver = stub._ensure_driver  # type: ignore[method-assign]
    wd._find_elements = stub._find_elements  # type: ignore[method-assign]

    out = WebDriverAdapter.filter_elements_by_text(wd, "css", ".item", "Login")
    assert out == ["Login", "Login help"]
    assert all(isinstance(x, str) for x in out)
