# -*- coding: utf-8 -*-
"""ОбойтиСтраницы → webdriver.crawl_urls."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.webdriver_adapter import WebDriverAdapter
from core.constructor_validate import validate_constructor
from core.controller import Controller
from core.data_stream import DataStream
from core.method_id import resolve_call
from models.wired import TestDataConstructorModule as DataModule


def test_resolve_obojti_stranicy():
    assert (
        resolve_call("ОбойтиСтраницы ${data_module}")
        == "webdriver|crawl_urls|${data_module}"
    )
    assert (
        resolve_call("ОбойтиСтраницы ${data_module} 1")
        == "webdriver|crawl_urls|${data_module}|1"
    )
    assert not [
        d for d in validate_constructor("ОбойтиСтраницы ${data_module}") if d["severity"] == "error"
    ]


def test_crawl_urls_opens_and_sleeps_in_order(monkeypatch):
    wd = WebDriverAdapter.__new__(WebDriverAdapter)
    wd.base_url = "http://juice-shop:3000"
    opened = []
    sleeps = []
    wd._navigate = lambda url, wait_for_load=True: opened.append(url)
    monkeypatch.setattr("adapters.webdriver_adapter.time.sleep", lambda s: sleeps.append(float(s)))

    n = WebDriverAdapter.crawl_urls(
        wd, ["http://a.example/x", "/#/register"], pause_seconds="1"
    )
    assert n == 2
    assert opened == ["http://a.example/x", "http://juice-shop:3000/#/register"]
    assert sleeps == [1.0, 1.0]


def test_crawl_urls_multiline_string():
    wd = WebDriverAdapter.__new__(WebDriverAdapter)
    wd.base_url = "http://base/"
    opened = []
    wd._navigate = lambda url, wait_for_load=True: opened.append(url)
    WebDriverAdapter.crawl_urls(wd, "/#/a\n# skip\n/#/b", pause_seconds=0)
    assert opened == ["http://base/#/a", "http://base/#/b"]


def test_crawl_urls_absolute_from_export_does_not_use_open():
    """Regression: G-65 stream = absolute; open() режет http(s)."""
    wd = WebDriverAdapter.__new__(WebDriverAdapter)
    wd.base_url = "http://juice-shop:3000"
    opened = []
    wd._navigate = lambda url, wait_for_load=True: opened.append(url)

    def boom_open(url=None, wait_for_load=True):
        raise AssertionError(f"open must not be used for crawl: {url!r}")

    wd.open = boom_open
    WebDriverAdapter.crawl_urls(
        wd,
        ["http://juice-shop:3000/#/login", "http://juice-shop:3000/#/register"],
        pause_seconds=0,
    )
    assert opened == [
        "http://juice-shop:3000/#/login",
        "http://juice-shop:3000/#/register",
    ]


def test_export_then_crawl_via_stream():
    """F-03 list → resolve_arg → crawl_urls."""
    from adapters.data_adapter import DataAdapter
    from core.action_factory import ActionFactory
    from core.language_engine import LanguageEngine

    mod = DataModule(
        id="data_module",
        module_type="Модуль работы с данными",
        data_storage_fields={
            "source_type": "Генерация из источника",
            "process_id": "additional_urls",
            "editor": "/#/login\n/#/register",
        },
    )
    ctrl = Controller.__new__(Controller)
    ctrl.language_engine = LanguageEngine()
    ctrl._wired_problems = []
    ctrl.wired = SimpleNamespace(
        test_suites=SimpleNamespace(test_data_constructor=[mod], imports=[]),
        security_configuration=SimpleNamespace(base_url_override="http://juice-shop:3000"),
    )
    stream = DataStream()
    data = DataAdapter()
    data.bind(stream)
    ctrl.adapters = {"data": data}
    ctrl.action_factory = ActionFactory()
    ctrl._export_data_modules(stream)
    urls = stream.resolve_arg("${data_module}")
    assert urls == [
        "http://juice-shop:3000/#/login",
        "http://juice-shop:3000/#/register",
    ]

    wd = WebDriverAdapter.__new__(WebDriverAdapter)
    wd.base_url = "http://juice-shop:3000"
    opened = []
    wd._navigate = lambda url, wait_for_load=True: opened.append(url)
    WebDriverAdapter.crawl_urls(wd, urls, pause_seconds=0)
    assert opened == urls
