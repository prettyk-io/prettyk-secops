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


@pytest.fixture(autouse=True)
def _replay_artifacts_tmp(tmp_path, monkeypatch):
    """BBA-EXEC-3: replay-артефакты уходят во временную папку (не в дерево)."""
    base = tmp_path / "replay_artifacts"
    monkeypatch.setenv("PK_REPLAY_ARTIFACTS_DIR", str(base))
    return base


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
    page.mouse.move = MagicMock()
    page.mouse.down = MagicMock()
    page.mouse.up = MagicMock()

    locator = MagicMock()
    locator.click = MagicMock()
    locator.fill = MagicMock()
    locator.select_option = MagicMock()
    locator.hover = MagicMock()
    locator.focus = MagicMock()
    locator.scroll_into_view_if_needed = MagicMock()

    page.locator = MagicMock(return_value=locator)
    page.get_by_role = MagicMock(return_value=locator)
    page.get_by_text = MagicMock(return_value=locator)
    # BBA-EXEC-2: паритет стратегий локаторов.
    page.get_by_test_id = MagicMock(return_value=locator)
    page.get_by_label = MagicMock(return_value=locator)
    page.get_by_placeholder = MagicMock(return_value=locator)
    page.get_by_alt_text = MagicMock(return_value=locator)
    page.get_by_title = MagicMock(return_value=locator)
    return page, locator


def _new_worker(page=None) -> "object":
    import browser.browser_service as bs
    worker = bs._BrowserWorker()
    worker._page = page
    if page is None:
        # Hermetic: не даём _ensure_browser подцепить живой CDP-контейнер.
        worker._cdp_endpoint_override = "http://127.0.0.1:1"
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


# ── ACT-BE: wheel / drag / focus ─────────────────────────────────────────────


def test_step_execute_wheel():
    page, _ = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "wheel", "value": "120,-40"})
    assert r["status"] == "passed"
    page.mouse.wheel.assert_called_once_with(120.0, -40.0)


def test_step_execute_wheel_requires_value():
    worker = _new_worker(_mock_page()[0])
    r = worker._cmd_step_execute({"action": "wheel"})
    assert r["status"] == "failed"
    assert "dx,dy" in r["error"]


def test_step_execute_wheel_bad_value_fails():
    worker = _new_worker(_mock_page()[0])
    r = worker._cmd_step_execute({"action": "wheel", "value": "not-numbers"})
    assert r["status"] == "failed"
    assert "dx,dy" in r["error"]


def test_step_execute_drag():
    page, _ = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "drag", "value": "10,20,110,220"})
    assert r["status"] == "passed"
    page.mouse.move.assert_any_call(10.0, 20.0)
    page.mouse.down.assert_called_once()
    page.mouse.move.assert_any_call(110.0, 220.0, steps=5)
    page.mouse.up.assert_called_once()


def test_step_execute_drag_requires_value():
    worker = _new_worker(_mock_page()[0])
    r = worker._cmd_step_execute({"action": "drag"})
    assert r["status"] == "failed"
    assert "x1,y1,x2,y2" in r["error"]


def test_step_execute_drag_bad_value_fails():
    worker = _new_worker(_mock_page()[0])
    r = worker._cmd_step_execute({"action": "drag", "value": "1,2,3"})
    assert r["status"] == "failed"
    assert "x1,y1,x2,y2" in r["error"]


def test_step_execute_focus():
    page, locator = _mock_page()
    worker = _new_worker(page)
    r = worker._cmd_step_execute({"action": "focus", "target": "input", "strategy": "css"})
    assert r["status"] == "passed"
    locator.focus.assert_called_once_with(timeout=5000)


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


# ── BBA-EXEC-2: паритет стратегий локаторов ─────────────────────────────────


def test_step_execute_strategy_test_id():
    page, _ = _mock_page()
    worker = _new_worker(page)
    worker._cmd_step_execute({"action": "click", "target": "login-btn", "strategy": "test_id"})
    page.get_by_test_id.assert_called_once_with("login-btn")


def test_step_execute_strategy_test_id_alias_testid():
    page, _ = _mock_page()
    worker = _new_worker(page)
    worker._cmd_step_execute({"action": "click", "target": "login-btn", "strategy": "testid"})
    page.get_by_test_id.assert_called_once_with("login-btn")


def test_step_execute_strategy_label():
    page, _ = _mock_page()
    worker = _new_worker(page)
    worker._cmd_step_execute({"action": "click", "target": "Email", "strategy": "label"})
    page.get_by_label.assert_called_once_with("Email")


def test_step_execute_strategy_placeholder():
    page, _ = _mock_page()
    worker = _new_worker(page)
    worker._cmd_step_execute({"action": "click", "target": "Search…", "strategy": "placeholder"})
    page.get_by_placeholder.assert_called_once_with("Search…")


def test_step_execute_strategy_alt():
    page, _ = _mock_page()
    worker = _new_worker(page)
    worker._cmd_step_execute({"action": "click", "target": "Logo", "strategy": "alt"})
    page.get_by_alt_text.assert_called_once_with("Logo")


def test_step_execute_strategy_title():
    page, _ = _mock_page()
    worker = _new_worker(page)
    worker._cmd_step_execute({"action": "click", "target": "Close", "strategy": "title"})
    page.get_by_title.assert_called_once_with("Close")


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


# ── BBA-EXEC-2: отмена replay ───────────────────────────────────────────────


def test_scenario_abort_cmd_sets_flag_and_resets():
    page, _ = _mock_page()
    worker = _new_worker(page)
    worker._abort_requested = False
    r = worker._cmd_scenario_abort()
    assert r["ok"] is True
    assert r["abort_requested"] is True
    assert worker._abort_requested is True


def test_scenario_replay_abort_before_next_step():
    page, _ = _mock_page()
    worker = _new_worker(page)
    steps = [
        {"action": "fill", "target": "input", "value": "x"},
        {"action": "click", "target": "#submit"},
        {"action": "hover", "target": ".after"},
        {"action": "press_key", "target": "Enter"},
    ]
    # Имитируем отмену, пришедшую ПОСЛЕ первого шага: выставляем флаг заранее,
    # но replay проверяет его в начале каждой итерации. Для детерминированного
    # теста заставляем _cmd_step_execute отработать один шаг, затем выставляем
    # флаг — семантически это «abort на следующем шаге».
    worker._abort_requested = True
    r = worker._cmd_scenario_replay(steps)
    assert r["verdict"] == "cancelled"
    assert r["executed"] == 1
    assert r["steps"][0]["status"] == "cancelled"
    assert r["cancelled"] == 1
    # флаг сброшен после обработки.
    assert worker._abort_requested is False


def test_scenario_replay_abort_after_partial_execution():
    """Abort выставляется после первого шага → останавливается на втором."""
    page, _ = _mock_page()
    worker = _new_worker(page)

    original = worker._cmd_step_execute

    def _execute_then_abort(step: dict) -> dict:
        r = original(step)
        # оператор жмёт abort сразу после первого шага.
        worker._abort_requested = True
        return r

    worker._cmd_step_execute = _execute_then_abort
    steps = [
        {"action": "fill", "target": "input", "value": "x"},
        {"action": "click", "target": "#submit"},
        {"action": "hover", "target": ".after"},
    ]
    r = worker._cmd_scenario_replay(steps)
    assert r["verdict"] == "cancelled"
    # первый шаг passed, второй (прерванный) помечен cancelled.
    assert r["steps"][0]["status"] == "passed"
    assert r["steps"][1]["status"] == "cancelled"
    assert r["executed"] == 2
    assert r["passed"] == 1
    assert r["cancelled"] == 1
    assert worker._abort_requested is False


def test_browser_scenario_abort_public_api_sets_flag():
    import browser.browser_service as bs
    bs._worker._abort_requested = False
    try:
        r = bs.browser_scenario_abort()
        assert r["ok"] is True
        assert r["abort_requested"] is True
        assert bs._worker._abort_requested is True
    finally:
        bs._worker._abort_requested = False


# ── BBA-EXEC-3: персист артефактов + GET timeline ────────────────────────────


def _failing_click_scenario():
    """Сценарий из 2 шагов: первый проходит, второй падает со скриншотом."""
    page, locator = _mock_page()
    locator.click = MagicMock(side_effect=RuntimeError("element not found"))
    worker = _new_worker(page)
    steps = [
        {"action": "goto", "target": "https://example.com"},
        {"action": "click", "target": "#missing", "step_id": "click-missing"},
    ]
    return worker, steps


def test_scenario_replay_persists_timeline_and_screenshot():
    from browser.browser_service import browser_replay_timeline
    from browser.replay_store import get_store

    worker, steps = _failing_click_scenario()
    r = worker._cmd_scenario_replay(steps)

    assert r["ok"] is True
    assert r["replay_id"].startswith("replay-")
    assert r["timeline_path"].endswith("replay_timeline.json")
    assert r["verdict"] == "failed"

    # Скриншот павшего шага сконвертирован из b64 в файл.
    assert "screenshot_b64" not in r["steps"][1]
    assert r["steps"][1]["screenshot"] is not None

    # Timeline читается обратно через store и через public API.
    store = get_store()
    persisted = store.load_timeline(r["replay_id"])
    assert persisted is not None
    assert persisted["verdict"] == "failed"
    assert persisted["steps"][1]["status"] == "failed"
    assert persisted["steps"][1]["screenshot"] == r["steps"][1]["screenshot"]

    api = browser_replay_timeline(r["replay_id"])
    assert api["ok"] is True
    assert api["timeline"]["replay_id"] == r["replay_id"]

    # Файл скриншота реально лежит на диске.
    png_rel = persisted["steps"][1]["screenshot"]
    assert (store.base_dir / png_rel).exists()


def test_scenario_replay_no_screenshot_when_all_passed():
    page, _ = _mock_page()
    worker = _new_worker(page)
    steps = [
        {"action": "goto", "target": "https://example.com"},
        {"action": "fill", "target": "input", "value": "x"},
    ]
    r = worker._cmd_scenario_replay(steps)
    assert r["verdict"] == "passed"
    assert r["timeline"]["screenshots"] == 0
    assert all(s["screenshot"] is None for s in r["steps"])
    assert r["timeline_path"].endswith("replay_timeline.json")


def test_scenario_replay_abort_persists_cancelled_timeline():
    from browser.browser_service import browser_replay_timeline

    worker, steps = _failing_click_scenario()
    worker._abort_requested = True
    r = worker._cmd_scenario_replay(steps)
    assert r["verdict"] == "cancelled"

    api = browser_replay_timeline(r["replay_id"])
    assert api["ok"] is True
    assert api["timeline"]["verdict"] == "cancelled"
    assert api["timeline"]["steps"][0]["status"] == "cancelled"


def test_browser_replay_timeline_not_found():
    from browser.browser_service import browser_replay_timeline
    r = browser_replay_timeline("replay-does-not-exist")
    assert r["ok"] is False
    assert r["error"] == "timeline not found"


def test_replay_timeline_json_schema():
    worker, steps = _failing_click_scenario()
    r = worker._cmd_scenario_replay(steps)
    tl = r["timeline"]
    assert set(tl) >= {
        "replay_id", "started_at", "verdict", "total", "executed",
        "passed", "failed", "cancelled", "duration_ms", "screenshots", "steps",
    }
    assert isinstance(tl["steps"], list)
    for s in tl["steps"]:
        assert set(s) == {"index", "step_id", "action", "status", "duration_ms", "error", "screenshot"}
