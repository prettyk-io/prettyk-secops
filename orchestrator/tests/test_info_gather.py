# -*- coding: utf-8 -*-
"""СборИнформации MethodId wire (compat filename)."""
from __future__ import annotations

from core.method_id import lookup_method_id, resolve_call


def test_method_id_gather_info():
    assert lookup_method_id("СборИнформации") == ("webdriver", "gather_info")
    assert resolve_call("СборИнформации ${urls}") == (
        "webdriver|gather_info|${urls}"
    )
    assert resolve_call("СборИнформации ${urls} 15") == (
        "webdriver|gather_info|${urls}|15"
    )
