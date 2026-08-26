# -*- coding: utf-8 -*-
"""Открыть relative / ОткрытьПоURL allowlist — resolve без драйвера."""
from __future__ import annotations

import pytest

from adapters.webdriver_adapter import WebDriverAdapter
from core.errors import WiredError
from core.method_id import resolve_call
from utils.allowed_urls import ALLOWED_URL_DENY_MSG


def _wd(**kwargs) -> WebDriverAdapter:
    w = WebDriverAdapter.__new__(WebDriverAdapter)
    w.base_url = kwargs.get("base_url", "http://juice-shop:3000")
    w.allowed_extra_domains = kwargs.get("allowed_extra_domains", "")
    return w


def test_method_id_open_by_url():
    assert resolve_call("Открыть") == "webdriver|open"
    assert resolve_call("Открыть /#/a") == "webdriver|open|/#/a"
    assert resolve_call("ОткрытьПоURL https://x.test/") == (
        "webdriver|open_by_url|https://x.test/"
    )


def test_open_relative_and_empty():
    w = _wd()
    assert w._resolve_open_relative(None) == "http://juice-shop:3000"
    assert w._resolve_open_relative("/#/login").endswith("/#/login")


def test_open_rejects_absolute():
    w = _wd()
    with pytest.raises(WiredError, match="ОткрытьПоURL"):
        w._resolve_open_relative("https://evil.test/")


def test_open_by_url_allowlist():
    w = _wd(allowed_extra_domains="juice-shop:3000|https://rkn.gov.ru")
    assert w._resolve_open_by_url("http://juice-shop:3000/#/x").startswith("http")
    with pytest.raises(WiredError, match=ALLOWED_URL_DENY_MSG):
        w._resolve_open_by_url("https://evil.test/")
