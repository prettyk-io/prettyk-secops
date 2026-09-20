# -*- coding: utf-8 -*-
"""BBA-EXEC-1: тесты движка пошагового исполнения и replay сценариев.

Вызываем worker._cmd_step_execute()/_cmd_scenario_replay() напрямую (минуя
thread), как и в test_browser_service.py. Проверяем: валидацию входных данных,
диспатч каждого действия/стратегии, fail-closed поведение, агрегацию replay.
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


def _mock_page():
    """Mock Playwright Page с locator-фабриками + действиями BBA-EXEC-1."""
    page = MagicMock()
    page.evaluate = MagicMock(return_value=1)  # liveness-проверка _ensure_browser
    page.goto = MagicMock()
    page.wait_for_selector = MagicMock()
    page.wait_for_timeout = MagicMock()
    page.screenshot = MagicMock(return_value=b"\x89PNG\r\n\x1a\nfake")
    page.keyboard = MagicMock()
    page.keyboard.press = MagicMock()
    page.mouse = MagicMock()
    page.mouse.wheel = MagicMock()

    locator = MagicMock()
    locator.click = MagicMock()
    locator.fill = MagicMock()
    locator.select_option = MagicMock()
    locator.hover = MagicMock()
    locator.scroll_into_view_if_needed = MagicMock()

    page.locator = MagicMock(return_value=locator)
    page.get_by_role = MagicMock(return_value=locator)
    page.get_by_text = MagicMock(return_value=locator)
    return page, locator


def _new_worker(page=None) -> "object":
    import browser.browser_service as bs
    worker = bs._BrowserWorker()
    worker._page = page
    return worker


# ── валидация входных данных ────────────────────────────────────────────────


def test_step_execute_unsupported_action_fails():
    worker = _new_worker(_mock_page()[0])
    r = worker._cmd_step_execute({"action": "teleport", "target": "#x"})
    assert r["status"] == "failed"
    assert "unsupported action" in r["error"]


def test_step_execute_missing_action_fails():
    worker = _new_worker(_mock_page()[0])
    r = worker._cmd_step_execute({"target": "#x"})
    assert r["status"] == "failed"
    assert "unsupported action" in r["error"]


def test_step_execute_no_browser_fails_closed():
    worker = _new_worker(None)
    r = worker._cmd_step_execute({"action": "click", "target": "#x"})
    assert r["status"] == "failed"
    assert r["error"] == "browser not available"


def test_step_execute_preserves_step_id():
    worker = _new_worker(_mock_page()[0])
    r = worker._cmd_step_execute({"action": "click", "target": "#x", "step_id": "my-step"})
    assert r["step_id"] == "my-step"


# ── диспатч действий ────────────────────────────────────────────────────────


def test_step_execute_click_css():
    page, locator = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "click", "target": "#submit", "strategy": "css", "timeout_ms": 3000})
    assert r["status"] == "passed"
    page.locator.assert_called_once_with("#submit")
    locator.click.assert_called_once_with(timeout=3000)


def test_step_execute_fill():
    page, locator = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "fill", "target": "input", "value": "hello", "strategy": "css"})
    assert r["status"] == "passed"
    locator.fill.assert_called_once_with("hello", timeout=5000)


def test_step_execute_type_alias_maps_to_fill():
    page, locator = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "type", "target": "input", "value": "x"})
    assert r["status"] == "passed"
    locator.fill.assert_called_once_with("x", timeout=5000)


def test_step_execute_goto():
    page, _ = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "goto", "target": "https://example.com"})
    assert r["status"] == "passed"
    page.goto.assert_called_once_with("https://example.com", timeout=5000, wait_until="domcontentloaded")


def test_step_execute_navigate_alias():
    page, _ = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "navigate", "target": "https://example.com"})
    assert r["status"] == "passed"
    page.goto.assert_called_once()


def test_step_execute_goto_requires_target():
    worker = _new_worker(_mock_page()[0])
    r = worker._cmd_step_execute({"action": "goto"})
    assert r["status"] == "failed"
    assert "target" in r["error"]


def test_step_execute_wait_for_timeout_number():
    page, _ = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "wait_for", "target": "250"})
    assert r["status"] == "passed"
    page.wait_for_timeout.assert_called_once_with(250)


def test_step_execute_wait_for_selector():
    page, _ = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "wait_for", "target": ".loaded", "timeout_ms": 8000})
    assert r["status"] == "passed"
    page.wait_for_selector.assert_called_once_with(".loaded", timeout=8000)


def test_step_execute_press_key():
    page, _ = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "press_key", "target": "Enter"})
    assert r["status"] == "passed"
    page.keyboard.press.assert_called_once_with("Enter")


def test_step_execute_scroll_wheel():
    page, _ = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "scroll", "value": "0,-600"})
    assert r["status"] == "passed"
    page.mouse.wheel.assert_called_once_with(0.0, -600.0)


def test_step_execute_scroll_into_view():
    page, locator = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "scroll", "target": "#footer", "strategy": "css"})
    assert r["status"] == "passed"
    locator.scroll_into_view_if_needed.assert_called_once_with(timeout=5000)


def test_step_execute_scroll_bad_value_fails():
    worker = _new_worker(_mock_page()[0])
    r = worker._cmd_step_execute({"action": "scroll", "value": "not-numbers"})
    assert r["status"] == "failed"
    assert "dx,dy" in r["error"]


def test_step_execute_select_option():
    page, locator = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "select_option", "target": "select", "value": "eu"})
    assert r["status"] == "passed"
    locator.select_option.assert_called_once_with("eu", timeout=5000)


def test_step_execute_select_option_requires_value():
    worker = _new_worker(_mock_page()[0])
    r = worker._cmd_step_execute({"action": "select_option", "target": "select"})
    assert r["status"] == "failed"
    assert "value" in r["error"]


def test_step_execute_hover():
    page, locator = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "hover", "target": ".menu"})
    assert r["status"] == "passed"
    locator.hover.assert_called_once_with(timeout=5000)


# ── стратегии локаторов ─────────────────────────────────────────────────────


def test_step_execute_strategy_role():
    page, _ = _mock_page()
    worker = _new_worker(page)
    worker._cmd_step_execute({"action": "click", "target": "Войти", "strategy": "role"})
    page.get_by_role.assert_called_once_with("Войти")


def test_step_execute_strategy_text():
    page, _ = _mock_page()
    worker = _new_worker(page)
    worker._cmd_step_execute({"action": "click", "target": "Submit", "strategy": "text"})
    page.get_by_text.assert_called_once_with("Submit", exact=True)


def test_step_execute_strategy_xpath():
    page, _ = _mock_page()
    worker = _new_worker(page)
    worker._cmd_step_execute({"action": "click", "target": "//button", "strategy": "xpath"})
    page.locator.assert_called_once_with("xpath=//button")


def test_step_execute_strategy_id():
    page, _ = _mock_page()
    worker = _new_worker(page)
    worker._cmd_step_execute({"action": "click", "target": "submit", "strategy": "id"})
    page.locator.assert_called_once_with("#submit")


# ── fail-closed ─────────────────────────────────────────────────────────────


def test_step_execute_locator_raises_returns_failed():
    page, locator = _mock_page()
    locator.click = MagicMock(side_effect=RuntimeError("element not found"))
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "click", "target": "#missing"})
    assert r["status"] == "failed"
    assert "RuntimeError" in r["error"]
    assert "element not found" in r["error"]
    # fail-closed: скриншот для диагностики.
    assert isinstance(r["screenshot_b64"], str)


def test_step_execute_click_requires_target():
    worker = _new_worker(_mock_page()[0])
    r = worker._cmd_step_execute({"action": "click"})
    assert r["status"] == "failed"
    assert "target required" in r["error"]


# ── scenario replay ─────────────────────────────────────────────────────────


def test_scenario_replay_all_passed():
    page, _ = _mock_page()
    worker = _new_worker(page)
    steps = [
        {"action": "goto", "target": "https://example.com"},
        {"action": "fill", "target": "input", "value": "x"},
        {"action": "click", "target": "#submit"},
    ]
    r = worker._cmd_scenario_replay(steps)
    assert r["ok"] is True
    assert r["total"] == 3
    assert r["executed"] == 3
    assert r["passed"] == 3
    assert r["failed"] == 0
    assert r["verdict"] == "passed"


def test_scenario_replay_stop_on_failure():
    page, locator = _mock_page()
    locator.click = MagicMock(side_effect=RuntimeError("boom"))
    worker = _new_worker(page)
    steps = [
        {"action": "fill", "target": "input", "value": "x"},
        {"action": "click", "target": "#broken"},  # fails
        {"action": "hover", "target": ".after"},   # не должен выполниться
    ]
    r = worker._cmd_scenario_replay(steps, stop_on_failure=True)
    assert r["executed"] == 2
    assert r["passed"] == 1
    assert r["failed"] == 1
    assert r["verdict"] == "failed"
    assert r["steps"][1]["status"] == "failed"


def test_scenario_replay_continue_on_failure():
    page, locator = _mock_page()
    locator.click = MagicMock(side_effect=RuntimeError("boom"))
    worker = _new_worker(page)
    steps = [
        {"action": "fill", "target": "input", "value": "x"},
        {"action": "click", "target": "#broken"},
        {"action": "hover", "target": ".after"},
    ]
    r = worker._cmd_scenario_replay(steps, stop_on_failure=False)
    assert r["executed"] == 3
    assert r["passed"] == 2
    assert r["failed"] == 1
    assert r["verdict"] == "failed"
