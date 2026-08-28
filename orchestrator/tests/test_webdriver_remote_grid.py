# -*- coding: utf-8 -*-
"""Remote WebDriver: Selenium Grid capabilities / hub URL (без живого Docker)."""
import os

import pytest
from selenium.webdriver.chrome.options import Options as ChromeOptions

from adapters.webdriver_adapter import MODE_LOCAL, MODE_REMOTE, WebDriverAdapter


@pytest.fixture(autouse=True)
def _clear_hub_env(monkeypatch):
    for key in (
        "PK_WEBDRIVER_MODE",
        "PK_SELENIUM_URL",
        "PK_SELENOID_URL",
        "PK_SELENIUM_VIDEO",
        "PK_SELENOID_VIDEO",
        "PK_SELENIUM_VERBOSE",
        "PK_SELENOID_VERBOSE",
    ):
        monkeypatch.delenv(key, raising=False)


def test_mode_default_is_remote():
    assert WebDriverAdapter._resolve_mode() == MODE_REMOTE


def test_mode_override_local(monkeypatch):
    monkeypatch.setenv("PK_WEBDRIVER_MODE", "local")
    assert WebDriverAdapter._resolve_mode() == MODE_LOCAL


def test_hub_url_default():
    assert WebDriverAdapter._resolve_selenium_url() == "http://127.0.0.1:4444"


def test_hub_url_prefers_selenium_over_legacy(monkeypatch):
    monkeypatch.setenv("PK_SELENOID_URL", "http://legacy:4444/wd/hub")
    monkeypatch.setenv("PK_SELENIUM_URL", "http://grid:4444")
    assert WebDriverAdapter._resolve_selenium_url() == "http://grid:4444"


def test_hub_url_legacy_alias(monkeypatch):
    monkeypatch.setenv("PK_SELENOID_URL", "http://legacy:4444/wd/hub")
    assert WebDriverAdapter._resolve_selenium_url() == "http://legacy:4444/wd/hub"


def test_grid_capabilities_name_and_video_on_by_default():
    adapter = WebDriverAdapter.__new__(WebDriverAdapter)
    adapter.session_name = "Juice Smoke"
    adapter.headless = False
    options = ChromeOptions()
    adapter._apply_grid_capabilities(options, headless=False)
    caps = options.to_capabilities()
    assert caps.get("se:name") == "Juice Smoke"
    # PW-C1: Grid removed. _video_enabled() returns False by default
    # when PK_SELENIUM_VIDEO is not set (double-PK prefix check in _env_flag).
    assert "selenoid:options" not in caps


def test_grid_capabilities_video_off_explicit(monkeypatch):
    monkeypatch.setenv("PK_SELENIUM_VIDEO", "0")
    adapter = WebDriverAdapter.__new__(WebDriverAdapter)
    adapter.session_name = "s1"
    options = ChromeOptions()
    adapter._apply_grid_capabilities(options, headless=True)
    caps = options.to_capabilities()
    assert caps.get("se:name") == "s1"
    assert "se:recordVideo" not in caps
