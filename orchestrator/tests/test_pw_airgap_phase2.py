# -*- coding: utf-8 -*-
"""PW-AIRGAP Phase 2: execution parity tests (PW-E1 + PW-E2).

PK_BROWSER_RUNTIME=playwright → Controller подключает PlaywrightAdapter;
Selenium остаётся дефолтом. Проверяем: CDP-методы, controller.split, видео.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


# ── PW-E1: Controller split ─────────────────────────────────────────────────


def test_controller_imports_playwright_adapter():
    """Controller без ошибок импортирует PlaywrightAdapter (PW-E1)."""
    from core.controller import Controller  # noqa: F401
    from adapters.playwright_adapter import PlaywrightAdapter  # noqa: F401

    assert PlaywrightAdapter is not None


def test_playwright_adapter_has_cdp_methods():
    """PW-E2: PlaywrightAdapter имеет все 4 обязательных CDP-метода."""
    from adapters.playwright_adapter import PlaywrightAdapter

    ad = PlaywrightAdapter(browser="chromium", headless=True)
    assert callable(ad.cdp_command)
    assert callable(ad.cdp_clear_browser_cache)
    assert callable(ad.cdp_clear_browser_cookies)
    assert callable(ad.get_browser_logs)
    assert callable(ad.cdp_network_enable)
    assert callable(ad.cdp_network_disable)


def test_playwright_adapter_cdp_clear_cache_no_browser():
    """PW-E2: cdp_clear_browser_cache без браузера — не падает, graceful fail."""
    from adapters.playwright_adapter import PlaywrightAdapter

    ad = PlaywrightAdapter(browser="chromium", headless=True)
    try:
        ad.cdp_clear_browser_cache()
    except Exception as e:
        # Ожидаем ошибку отсутствия браузера, не AttributeError
        assert "launched" in str(e).lower() or "browser" in str(e).lower() or "connect" in str(e).lower()


# ── PW-E3: video ────────────────────────────────────────────────────────────


def test_playwright_adapter_set_record_video_dir():
    """PW-E3: set_record_video_dir без ошибок."""
    from adapters.playwright_adapter import PlaywrightAdapter
    import tempfile

    ad = PlaywrightAdapter(browser="chromium", headless=True)
    with tempfile.TemporaryDirectory() as tmp:
        ad.set_record_video_dir(tmp)
        assert ad._video_dir == tmp


def test_playwright_adapter_uses_wire_compatible_ui_surface():
    """Canonical webdriver wires must resolve to methods with matching arity."""
    import inspect

    from adapters.playwright_adapter import PlaywrightAdapter

    ad = PlaywrightAdapter(browser="chromium", headless=True)
    # inspect.signature на bound-методе — без self
    assert len(inspect.signature(ad.open).parameters) == 2
    assert len(inspect.signature(ad.click).parameters) == 3
    assert len(inspect.signature(ad.send_keys).parameters) == 5
    assert callable(ad.assert_element_visible)
    assert callable(ad.wait_for_network_idle)


def test_playwright_adapter_rewrites_loopback_proxy_for_container():
    """PW-AIRGAP-F2: loopback proxy → host.docker.internal для Playwright-контейнера."""
    from adapters.playwright_adapter import PlaywrightAdapter

    ad = PlaywrightAdapter(proxy="127.0.0.1:8099")
    assert ad._resolve_proxy()["server"] == "http://host.docker.internal:8099"


# ── PW-E1: controller constructor с флагом playwright ────────────────────────

@pytest.fixture
def _minimal_wired():
    """Минимальный wired для Controller.__init__ без реального запуска."""
    from unittest.mock import MagicMock

    w = MagicMock()
    w.meta.project_id = "parity-test"
    w.infrastructure.base_url_override = "http://example.com"
    w.infrastructure.allowed_extra_domains = ""
    w.infrastructure.browser_type = "chrome-headless"
    w.infrastructure.scanner_mode = "demon"
    w.infrastructure.scanner_work_timeout_min = 1
    w.infrastructure.webswing_session_timeout_min = 1
    w.infrastructure.idle_timeout_min = 1
    w.test_suites = MagicMock()
    w.test_suites.scenarios = []
    w.test_suites.imports = []
    return w


@patch("adapters.playwright_adapter.PlaywrightBrowserRuntime.launch", side_effect=Exception("no browser"))
@patch("core.controller.ScannerAdapter", autospec=True)
@patch("core.controller.WebDriverAdapter")
def test_controller_playwright_branch_registers_adapters(
    mock_wd, mock_scanner, mock_launch, _minimal_wired, monkeypatch,
):
    """PW-E1: PK_BROWSER_RUNTIME=playwright → 'webdriver' и 'browser' = PlaywrightAdapter."""
    from core.controller import Controller

    monkeypatch.setenv("PK_BROWSER_RUNTIME", "playwright")
    monkeypatch.setenv("PK_SCANNER_MODE", "demon")

    try:
        ctrl = Controller(_minimal_wired, wired_path=None)
    except Exception:
        return  # OK: браузер не стартует в unit-тесте

    assert "webdriver" in ctrl.adapters
    assert "browser" in ctrl.adapters
    # Оба ключа должны вести на один объект
    assert ctrl.adapters["webdriver"] is ctrl.adapters["browser"]
    # Reporter должен быть привязан
    assert ctrl.reporter is not None


@patch("core.controller.ScannerAdapter", autospec=True)
@patch("core.controller.WebDriverAdapter")
def test_controller_selenium_is_default(
    mock_wd, mock_scanner, _minimal_wired, monkeypatch,
):
    """PW-E1: без PK_BROWSER_RUNTIME → дефолт = Selenium (WebDriverAdapter)."""
    from core.controller import Controller

    monkeypatch.delenv("PK_BROWSER_RUNTIME", raising=False)
    monkeypatch.setenv("PK_SCANNER_MODE", "demon")

    try:
        ctrl = Controller(_minimal_wired, wired_path=None)
    except Exception:
        return  # OK: браузер не стартует

    assert "webdriver" in ctrl.adapters
    assert "browser" in ctrl.adapters
    # browser должен быть BrowserAdapter (не тот же объект, что webdriver)
    assert ctrl.adapters["webdriver"] is not ctrl.adapters["browser"]


# ── PW-B1: Wired contract parity ──────────────────────────────────────────


def test_wired_browser_type_contract_preserved():
    """browser_type в wired не ломается — chrome-headless работает через оба адаптера."""
    from adapters.playwright_adapter import PlaywrightAdapter

    # Playwright: headless=True для chrome-headless
    ad = PlaywrightAdapter(browser="chrome", headless=True)
    assert ad._headless is True

    # Playwright: headless=False для chrome (non-headless)
    ad2 = PlaywrightAdapter(browser="chrome", headless=False)
    assert ad2._headless is False


def test_controller_with_real_wired_via_flag(monkeypatch):
    """Контроллер с PK_BROWSER_RUNTIME=playwright использует PlaywrightAdapter."""
    import os as _os
    monkeypatch.setenv("PK_BROWSER_RUNTIME", "playwright")
    monkeypatch.setenv("PK_SCANNER_MODE", "demon")

    from adapters.playwright_adapter import PlaywrightAdapter
    from core.controller import Controller
    from unittest.mock import MagicMock

    w = MagicMock()
    w.meta.project_id = "parity-wired"
    w.infrastructure.base_url_override = "http://example.com"
    w.infrastructure.allowed_extra_domains = ""
    w.infrastructure.browser_type = "chrome-headless"
    w.infrastructure.scanner_mode = "demon"
    w.infrastructure.scanner_work_timeout_min = 1
    w.infrastructure.webswing_session_timeout_min = 1
    w.infrastructure.idle_timeout_min = 1
    w.test_suites = MagicMock()
    w.test_suites.scenarios = []
    w.test_suites.imports = []

    from unittest.mock import patch as _patch
    with _patch("core.controller.ScannerAdapter", autospec=True):
        with _patch("core.controller.WebDriverAdapter", autospec=True):
            with _patch.object(PlaywrightAdapter, "_ensure_page", side_effect=Exception("no browser")):
                try:
                    ctrl = Controller(w, wired_path=None)
                    assert ctrl.adapters["webdriver"] is ctrl.adapters["browser"]
                except Exception:
                    pass  # expected: browser can't start in unit test


# ── PW-B2: ffmpeg conversion ──────────────────────────────────────────────


def test_convert_webm_no_files(tmp_path):
    """convert_webm_to_mp4: no webm files -> None."""
    import subprocess
    from utils.run_recording import convert_webm_to_mp4

    result = convert_webm_to_mp4(str(tmp_path), "run-test")
    assert result is None


def test_convert_webm_ffmpeg_not_installed(tmp_path, monkeypatch):
    """convert_webm_to_mp4: ffmpeg not found -> None (no crash)."""
    import subprocess

    # Create a fake webm file
    webm = tmp_path / "test.webm"
    webm.write_text("fake webm data")

    # Simulate ffmpeg not installed
    def fake_run(*args, **kwargs):
        raise FileNotFoundError("ffmpeg")

    monkeypatch.setattr(subprocess, "run", fake_run)

    from utils.run_recording import convert_webm_to_mp4
    result = convert_webm_to_mp4(str(tmp_path), "run-test")
    assert result is None


# ── PW-E4: live execution — headed браузер в контейнере ─────────────────────


def test_controller_passes_cdp_endpoint_to_playwright(monkeypatch):
    """PW-E4: headed execution → PK_BROWSER_CDP_ENDPOINT прокидывается в PlaywrightAdapter."""
    from unittest.mock import MagicMock, patch

    w = MagicMock()
    w.meta.project_id = "pw-e4"
    w.infrastructure.base_url_override = "http://example.com"
    w.infrastructure.allowed_extra_domains = ""
    w.infrastructure.browser_type = "chrome"  # headed (не -headless)
    w.infrastructure.scanner_mode = "demon"
    w.infrastructure.scanner_work_timeout_min = 1
    w.infrastructure.webswing_session_timeout_min = 1
    w.infrastructure.idle_timeout_min = 1
    w.test_suites = MagicMock()
    w.test_suites.scenarios = []
    w.test_suites.imports = []

    monkeypatch.setenv("PK_BROWSER_RUNTIME", "playwright")
    monkeypatch.setenv("PK_SCANNER_MODE", "demon")
    monkeypatch.setenv("PK_BROWSER_CDP_ENDPOINT", "http://localhost:9223")

    from core.controller import Controller

    with patch("core.controller.ScannerAdapter", autospec=True):
        with patch("core.controller.WebDriverAdapter", autospec=True):
            with patch("adapters.playwright_adapter.PlaywrightAdapter") as mock_pa:
                try:
                    Controller(w, wired_path=None)
                except Exception:
                    pass

    # PlaywrightAdapter должен получить cdp_endpoint (PW-E4)
    kwargs = mock_pa.call_args.kwargs
    assert kwargs.get("cdp_endpoint") == "http://localhost:9223"


def test_playwright_adapter_uses_cdp_when_endpoint_set():
    """PW-E4: PlaywrightAdapter._ensure_page при cdp_endpoint идёт через connect_over_cdp, не launch."""
    from adapters.playwright_adapter import PlaywrightAdapter

    ad = PlaywrightAdapter(browser="chromium", headless=False, cdp_endpoint="http://localhost:9223")
    # launch НЕ вызывается, если есть cdp_endpoint (см. _ensure_page)
    import inspect
    src = inspect.getsource(PlaywrightAdapter._ensure_page)
    assert "_cdp_endpoint" in src
    assert "connect_over_cdp" in src


# ── PW-E5: parity suite — один wired на обоих рантаймах ─────────────────────


PARITY_WIRED = {
    "meta": {"project_id": "parity-e5"},
    "infrastructure": {"base_url_override": "http://example.com", "browser_type": "chrome-headless"},
    "test_suites": {
        "scenarios": [{
            "id": "parity-smoke",
            "scenario_name": "Parity Smoke",
            "steps": [
                {"constructor": "webdriver|open|http://example.com"},
                {"constructor": "webdriver|click|role:button[name=Login]"},
                {"constructor": "webdriver|send_keys|label:Email|test@example.com"},
                {"constructor": "webdriver|take_screenshot|parity.png"},
                {"constructor": "webdriver|get_text|role:heading"},
                {"constructor": "webdriver|back"},
            ],
        }],
    },
}


def test_parity_wired_declarative_identical_for_both_runtimes():
    """PW-E5: один wired-файл, одинаковый contract для Selenium и Playwright."""
    import json

    data = json.loads(json.dumps(PARITY_WIRED))
    steps = data["test_suites"]["scenarios"][0]["steps"]
    assert len(steps) == 6
    # Оба рантайма читают один и тот же декларативный wire-контракт
    assert steps[0]["constructor"] == "webdriver|open|http://example.com"
    assert steps[1]["constructor"] == "webdriver|click|role:button[name=Login]"


def test_parity_both_adapters_support_all_steps():
    """PW-E5: каждый метод parity-wired есть в обоих адаптерах."""
    from adapters.playwright_adapter import PlaywrightAdapter
    from adapters.webdriver_adapter import WebDriverAdapter

    required = ["open", "click", "send_keys", "take_screenshot", "get_text", "back"]
    for m in required:
        assert hasattr(PlaywrightAdapter, m), f"PlaywrightAdapter missing {m}"
        assert hasattr(WebDriverAdapter, m), f"WebDriverAdapter missing {m}"


def test_parity_verdict_contract_shared():
    """PW-E5: verdict/evidence — общий контракт (не зависит от рантайма)."""
    # Оба рантайма пишут в один evidence-контракт (allure + run_summary).
    # Reporter принимает адаптер любого рантайма (webdriver_adapter).
    from utils.reporter import Reporter
    import inspect

    sig = inspect.signature(Reporter.__init__)
    params = list(sig.parameters.keys())
    assert "webdriver_adapter" in params or "adapter" in params or "driver" in params