# -*- coding: utf-8 -*-
"""Инвариант: каждый ("webdriver", X) из _METHOD_ID обязан жить в PlaywrightAdapter.

gather_info — controller-level (регистрируется отдельно в controller.py), пропускаем.
"""
from core.method_id import _METHOD_ID
from adapters.playwright_adapter import PlaywrightAdapter


def test_webdriver_method_ids_exist_in_playwright_adapter():
    adapter_methods = set(dir(PlaywrightAdapter))
    dead = [
        (ru_name, py_method)
        for ru_name, (comp, py_method) in _METHOD_ID.items()
        if comp == "webdriver"
        and py_method != "gather_info"
        and py_method not in adapter_methods
    ]
    assert not dead, f"МЁРТВЫЕ МЕТОДЫ В РЕЕСТРЕ (выпили или доливай в адаптер): {dead}"
