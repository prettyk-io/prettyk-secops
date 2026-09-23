# -*- coding: utf-8 -*-
"""WAVE-3: тесты на browser_service (back/forward + screenshot format + observe).

VP-L1-FIX: переписано под class-based _BrowserWorker + _cmd_*() handlers.
Юнит-тесты вызывают worker._cmd_*() напрямую (минуя thread), не dispatch().
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


# ── helpers ──────────────────────────────────────────────────────────────────

def _mock_page():
    """Mock Playwright Page with evaluate + navigation + locator methods."""
    page = MagicMock()
    page.goto = MagicMock()
    page.go_back = MagicMock()
    page.go_forward = MagicMock()
    page.screenshot = MagicMock()
    page.evaluate = MagicMock()
    page.expose_binding = MagicMock()
    page.click = MagicMock()
    page.fill = MagicMock()
    page.locator = MagicMock()
    page.mouse = MagicMock()
    page.mouse.click = MagicMock()
    page.get_by_role = MagicMock()
    page.get_by_text = MagicMock()
    page.get_by_label = MagicMock()
    page.get_by_test_id = MagicMock()
    page.close = MagicMock()
    page.accessibility = MagicMock()
    return page


def _new_worker(page=None) -> "object":
    """Создать свежий _BrowserWorker с готовой страницей (без глобального синглтона)."""
    import browser.browser_service as bs
    worker = bs._BrowserWorker()
    worker._page = page
    return worker


# ── B-3a: back / forward ─────────────────────────────────────────────────────


def test_browser_back_ok():
    """_cmd_back вызывает page.go_back и возвращает url/title."""
    import browser.browser_service as bs

    page = _mock_page()
    page.evaluate.side_effect = lambda expr: {
        "window.location.href": "https://example.com/prev",
        "document.title": "Previous Page",
    }.get(expr, "")
    worker = _new_worker(page)

    result = worker._cmd_back()
    assert result["ok"] is True
    assert result["url"] == "https://example.com/prev"
    assert result["title"] == "Previous Page"


def test_browser_forward_ok():
    """_cmd_forward вызывает page.go_forward и возвращает url/title."""
    import browser.browser_service as bs

    page = _mock_page()
    page.evaluate.side_effect = lambda expr: {
        "window.location.href": "https://example.com/next",
        "document.title": "Next Page",
    }.get(expr, "")
    worker = _new_worker(page)

    result = worker._cmd_forward()
    assert result["ok"] is True
    assert result["url"] == "https://example.com/next"
    assert result["title"] == "Next Page"


def test_browser_back_no_browser():
    """_cmd_back возвращает ошибку без браузера."""
    worker = _new_worker(None)
    result = worker._cmd_back()
    assert result["ok"] is False
    assert "browser not available" in result.get("error", "")


def test_browser_forward_no_browser():
    """_cmd_forward возвращает ошибку без браузера."""
    worker = _new_worker(None)
    result = worker._cmd_forward()
    assert result["ok"] is False
    assert "browser not available" in result.get("error", "")


# ── B-3b: screenshot base64 without data URI prefix ─────────────────────────


def test_browser_screenshot_pure_base64():
    """_cmd_screenshot возвращает чистый base64 без data: префикса."""
    page = _mock_page()
    # 1×1 PNG pixel
    png_data = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
    )
    page.screenshot.return_value = png_data
    worker = _new_worker(page)

    result = worker._cmd_screenshot()
    assert result["ok"] is True
    assert result["format"] == "png"
    screenshot = result.get("screenshot", "")
    assert screenshot  # not empty
    assert not screenshot.startswith("data:")
    assert not screenshot.startswith("http")
    # Must be valid base64
    decoded = base64.b64decode(screenshot)
    assert decoded == png_data


def test_browser_screenshot_no_browser():
    """_cmd_screenshot возвращает ошибку без браузера."""
    worker = _new_worker(None)
    result = worker._cmd_screenshot()
    assert result["ok"] is False


# ── B-3c: data_playground routes ────────────────────────────────────────────


def test_data_playground_browser_routes():
    """Проверяем что маршруты back/forward зарегистрированы."""
    from tools.data_playground import Handler as _  # noqa: F401
    from browser.browser_service import browser_back, browser_forward, browser_click, browser_type_text  # noqa: F401
    from browser.browser_service import browser_viewport, browser_keyboard_press, browser_mouse_wheel, browser_mouse_drag  # noqa: F401
    from browser.browser_service import browser_step_execute, browser_scenario_replay, browser_scenario_abort  # noqa: F401
    from browser.browser_service import browser_replay_timeline, browser_elements_snapshot  # noqa: F401

    assert callable(browser_back)
    assert callable(browser_forward)
    assert callable(browser_click)
    assert callable(browser_type_text)
    # BBA-2/3: новые input-действия
    assert callable(browser_viewport)
    assert callable(browser_keyboard_press)
    assert callable(browser_mouse_wheel)
    assert callable(browser_mouse_drag)
    # BBA-EXEC-1/2/3: step execute / scenario replay / abort / timeline
    assert callable(browser_step_execute)
    assert callable(browser_scenario_replay)
    assert callable(browser_scenario_abort)
    assert callable(browser_replay_timeline)
    # BBA-7: элементы страницы (CandidateElement snapshot)
    assert callable(browser_elements_snapshot)


# ── B-6: click / type_text ──────────────────────────────────────────────────


def test_browser_click_css():
    """_cmd_click с css-стратегией вызывает page.locator().click()."""
    page = _mock_page()
    css_locator = MagicMock()
    page.locator = MagicMock(return_value=css_locator)
    worker = _new_worker(page)

    result = worker._cmd_click("#submit", strategy="css")
    assert result["ok"] is True
    assert result["strategy"] == "css"
    page.locator.assert_called_once_with("#submit")
    css_locator.click.assert_called_once_with(timeout=5000)


def test_browser_click_text():
    """_cmd_click text → page.get_by_text(selector, exact=True).click()."""
    page = _mock_page()
    text_locator = MagicMock()
    page.get_by_text = MagicMock(return_value=text_locator)
    worker = _new_worker(page)

    result = worker._cmd_click("Submit", strategy="text")
    assert result["ok"] is True
    page.get_by_text.assert_called_once_with("Submit", exact=True)
    text_locator.click.assert_called_once_with(timeout=5000)


def test_browser_type_text_css():
    """_cmd_type_text с css-стратегией вызывает page.locator().fill()."""
    page = _mock_page()
    css_locator = MagicMock()
    page.locator = MagicMock(return_value=css_locator)
    worker = _new_worker(page)

    result = worker._cmd_type_text("input[type='email']", "admin@test.com", strategy="css")
    assert result["ok"] is True
    assert result["selector"] == "input[type='email']"
    page.locator.assert_called_once_with("input[type='email']")
    css_locator.fill.assert_called_once_with("admin@test.com", timeout=5000)


def test_browser_click_no_browser():
    """_cmd_click возвращает ошибку без браузера."""
    worker = _new_worker(None)
    result = worker._cmd_click(".btn")
    assert result["ok"] is False
    assert "browser not available" in result.get("error", "")


def test_browser_type_no_browser():
    """_cmd_type_text возвращает ошибку без браузера."""
    worker = _new_worker(None)
    result = worker._cmd_type_text("input", "text")
    assert result["ok"] is False
    assert "browser not available" in result.get("error", "")


# ── B-6: _find_ax_node_for_element ──────────────────────────────────────────


def test_find_ax_node_for_element_no_page():
    """_find_ax_node без страницы (None page) — возвращает None."""
    from browser.browser_service import _find_ax_node_for_element

    info = {"tag": "button", "rect": {"x": 100, "y": 200, "w": 80, "h": 32}}
    result = _find_ax_node_for_element(None, info)
    assert result is None


def test_find_ax_node_for_element_no_ax():
    """_find_ax_node с недоступным AX — возвращает None."""
    from browser.browser_service import _find_ax_node_for_element

    page = _mock_page()
    page.accessibility.snapshot = MagicMock(return_value=None)
    info = {"tag": "button", "rect": {"x": 0, "y": 0, "w": 10, "h": 10}}
    result = _find_ax_node_for_element(page, info)
    assert result is None


def test_find_ax_node_for_element_role_match():
    """_find_ax_node находит узел с matching role."""
    from browser.browser_service import _find_ax_node_for_element

    page = _mock_page()
    ax_tree = {
        "role": "WebArea",
        "name": "Root",
        "children": [
            {"role": "button", "name": "Login", "nodeId": 42},
            {"role": "link", "name": "Register", "nodeId": 7},
        ],
    }
    page.accessibility.snapshot = MagicMock(return_value=ax_tree)
    page.evaluate = MagicMock(return_value='{"ok":false}')  # fallback — не отсеиваем
    info = {"tag": "button", "rect": {"x": 100, "y": 200, "w": 80, "h": 32}}
    result = _find_ax_node_for_element(page, info)
    assert result is not None
    assert result["role"] == "button"
    assert result["name"] == "Login"


# ── B-9: candidate quality ──────────────────────────────────────────────────


def test_fallback_candidates_with_id():
    """_build_fallback_candidates с id — T1 css #id."""
    from browser.browser_service import _build_fallback_candidates

    info = {"tag": "button", "text": "Submit", "id": "submit-btn"}
    candidates = _build_fallback_candidates(info)
    assert len(candidates) >= 2
    assert candidates[0]["kind"] == "css"
    assert candidates[0]["value"] == "#submit-btn"
    assert candidates[0]["score"] >= 0.5


def test_fallback_candidates_no_id():
    """_build_fallback_candidates без id — T2 text, T3 tag."""
    from browser.browser_service import _build_fallback_candidates

    info = {"tag": "button", "text": "Click Me", "id": ""}
    candidates = _build_fallback_candidates(info)
    assert len(candidates) >= 1
    assert any(c["kind"] == "text" for c in candidates)
    assert any(c["kind"] == "css" for c in candidates)


def test_fallback_candidates_empty_element():
    """_build_fallback_candidates с совсем пустым элементом."""
    from browser.browser_service import _build_fallback_candidates

    info = {"tag": "", "text": "", "id": ""}
    candidates = _build_fallback_candidates(info)
    assert isinstance(candidates, list)


# ── B-10/B-11: _on_click (module-level, пишет в глобальный _worker) ──────────


def test_on_click_is_pure_collector():
    """B-10: _on_click — чистый коллектор (никаких page.evaluate/candidates)."""
    import browser.browser_service as bs

    bs._worker._observe_last_event_id = 0
    bs._worker._observed_events.clear()

    info = {
        "tag": "button", "text": "Submit", "id": "submit",
        "rect": {"x": 0, "y": 0, "w": 80, "h": 32},
        "dataTestId": "submit-btn",
    }
    bs._on_click(info)

    assert len(bs._worker._observed_events) == 1
    evt = bs._worker._observed_events[0]
    assert evt["action"] == "click"
    assert evt["element"]["tag"] == "button"
    assert evt["element"]["dataTestId"] == "submit-btn"
    # B-10: обогащение НЕ происходит в _on_click
    assert "candidates" not in evt
    assert "role" not in evt["element"]
    bs._worker._observed_events.clear()


def test_on_click_increments_event_id_under_lock():
    """B-11A: _on_click инкрементирует eventId под _lock (без гонки)."""
    import browser.browser_service as bs

    bs._worker._observe_last_event_id = 0
    bs._worker._observed_events.clear()

    bs._on_click({"tag": "button", "rect": {"x": 0, "y": 0, "w": 1, "h": 1}})
    bs._on_click({"tag": "button", "rect": {"x": 0, "y": 0, "w": 1, "h": 1}})

    assert [e["eventId"] for e in bs._worker._observed_events] == ["cdp-1", "cdp-2"]
    bs._worker._observed_events.clear()


# ── B-9/HDO-B3: _enrich_event (метод воркера) ───────────────────────────────


def test_enrich_event_adds_candidates():
    """_enrich_event добавляет candidates + role (вне binding-колбэка)."""
    import browser.browser_service as bs
    from unittest.mock import patch

    worker = _new_worker(None)  # нет страницы → AX не трогается

    evt = {
        "eventId": "cdp-1",
        "timestamp": 0.0,
        "action": "click",
        "element": {"tag": "button", "id": "submit", "text": "Submit",
                    "rect": {"x": 0, "y": 0, "w": 80, "h": 32}},
    }
    with patch("utils.discovery_candidate_builder.build_candidates") as mock_build:
        mock_build.return_value = [{"candidates": [{"kind": "css", "value": "#submit", "score": 0.9, "tier": "T1", "unique": True}]}]
        worker._enrich_event(evt)

    assert len(evt.get("candidates", [])) > 0
    assert evt["candidates"][0]["score"] >= 0.5
    assert evt["isAmbiguous"] is False


def test_observe_event_enriches_and_pops():
    """_cmd_observe_event обогащает и достаёт событие из очереди."""
    import browser.browser_service as bs
    from unittest.mock import patch

    worker = _new_worker(None)
    worker._observe_active = True
    worker._observed_events.clear()

    # _on_click кладёт сырое событие в глобальную очередь — здесь кладём напрямую
    bs._worker._observe_last_event_id = 0
    bs._worker._observed_events.clear()
    bs._worker._page = None
    bs._worker._observe_active = True
    bs._on_click({"tag": "button", "text": "Submit", "id": "submit",
                  "rect": {"x": 0, "y": 0, "w": 80, "h": 32}})

    with patch("utils.discovery_candidate_builder.build_candidates") as mock_build:
        mock_build.return_value = [{"candidates": [{"kind": "css", "value": "#submit", "score": 0.9, "tier": "T1", "unique": True}]}]
        result = bs._worker._cmd_observe_event()

    assert result["ok"] is True
    assert result["observing"] is True
    assert result["event"]["action"] == "click"
    assert len(result["event"].get("candidates", [])) > 0
    assert result["event"]["eventId"].startswith("cdp-")
    bs._worker._observed_events.clear()
    bs._worker._observe_active = False


def test_observe_candidates_end_to_end_via_click_handler():
    """_on_click → _cmd_observe_event: event has candidates (no ImportError)."""
    import browser.browser_service as bs

    bs._worker._observe_last_event_id = 0
    bs._worker._observe_active = True
    bs._worker._observed_events.clear()
    bs._worker._page = None

    info = {"tag": "button", "text": "Submit", "id": "submit-btn", "rect": {"x": 100, "y": 200, "w": 80, "h": 32}}
    bs._on_click(info)

    result = bs._worker._cmd_observe_event()

    assert result["ok"] is True
    evt = result["event"]
    assert evt["action"] == "click"
    assert isinstance(evt.get("candidates"), list)
    bs._worker._observed_events.clear()
    bs._worker._observe_active = False


# ── B-12: role/label/test_id Play-исполнение ────────────────────────────────


def test_browser_click_role():
    """_cmd_click role → page.get_by_role().click()."""
    page = _mock_page()
    role_locator = MagicMock()
    page.get_by_role = MagicMock(return_value=role_locator)
    worker = _new_worker(page)

    result = worker._cmd_click("Войти", strategy="role")
    assert result["ok"] is True
    page.get_by_role.assert_called_once_with("Войти")
    role_locator.click.assert_called_once_with(timeout=5000)


def test_browser_click_test_id():
    """_cmd_click test_id → page.get_by_test_id().click()."""
    page = _mock_page()
    tid_locator = MagicMock()
    page.get_by_test_id = MagicMock(return_value=tid_locator)
    worker = _new_worker(page)

    result = worker._cmd_click("submit-btn", strategy="test_id")
    assert result["ok"] is True
    page.get_by_test_id.assert_called_once_with("submit-btn")
    tid_locator.click.assert_called_once_with(timeout=5000)


def test_browser_click_label():
    """_cmd_click label → page.get_by_label().click()."""
    page = _mock_page()
    label_locator = MagicMock()
    page.get_by_label = MagicMock(return_value=label_locator)
    worker = _new_worker(page)

    result = worker._cmd_click("Email", strategy="label")
    assert result["ok"] is True
    page.get_by_label.assert_called_once_with("Email")
    label_locator.click.assert_called_once_with(timeout=5000)


def test_browser_type_role():
    """_cmd_type_text role → page.get_by_role().fill()."""
    page = _mock_page()
    role_locator = MagicMock()
    page.get_by_role = MagicMock(return_value=role_locator)
    worker = _new_worker(page)

    result = worker._cmd_type_text("Поиск", "hello", strategy="role")
    assert result["ok"] is True
    page.get_by_role.assert_called_once_with("Поиск")
    role_locator.fill.assert_called_once_with("hello", timeout=5000)


# ── B-13/PW-A4: context ensure/destroy ──────────────────────────────────────


def test_browser_context_ensure_ok():
    """_cmd_context_ensure возвращает ok при живом браузере."""
    page = _mock_page()
    worker = _new_worker(page)
    worker._browser_id = "authoring-test123"
    result = worker._cmd_context_ensure()
    assert result["ok"] is True


def test_browser_context_destroy_closes_page():
    """_cmd_context_destroy закрывает страницу/браузер и возвращает ok."""
    page = _mock_page()
    worker = _new_worker(page)
    worker._browser = MagicMock()
    worker._pw = MagicMock()
    worker._browser_id = "authoring-test123"

    result = worker._cmd_context_destroy()
    assert result["ok"] is True
    page.close.assert_called_once()
    assert worker._page is None


def test_browser_status_passive_does_not_launch():
    """PW-A4: _cmd_status пассивен — НИКОГДА не запускает браузер.

    VP-L1: headless=False, runtime="container" (host headless выпилен).
    """
    worker = _new_worker(None)
    result = worker._cmd_status()
    assert result["ok"] is True
    assert result["connected"] is False
    assert result["browserId"] is None
    assert result["purpose"] == "authoring"
    assert result["transport"] == "playwright"
    assert result["runtime"] == "container"
    assert result["headless"] is False


def test_browser_status_returns_browser_id():
    """PW-A4: _cmd_status возвращает browserId при живой странице."""
    page = _mock_page()
    page.evaluate.side_effect = lambda expr: {
        "window.location.href": "https://example.com",
        "document.title": "Example",
    }.get(expr, "")
    worker = _new_worker(page)
    worker._browser_id = "authoring-test123"

    result = worker._cmd_status()

    assert result["connected"] is True
    assert result["browserId"] == "authoring-test123"
    assert result["url"] == "https://example.com"


def test_browser_context_ensure_returns_browser_id():
    """PW-A4: _cmd_context_ensure возвращает browserId + contextId."""
    page = _mock_page()
    page.url = "about:blank"
    worker = _new_worker(page)
    worker._browser_id = "authoring-test123"

    result = worker._cmd_context_ensure()

    assert result["ok"] is True
    assert result["browserId"] == "authoring-test123"
    assert result["contextId"] == "authoring-test123:operator"
    assert result["purpose"] == "authoring"


def test_browser_context_destroy_resets_browser_id():
    """PW-A4: _cmd_context_destroy сбрасывает _browser_id и полный teardown."""
    page = _mock_page()
    worker = _new_worker(page)
    worker._browser = MagicMock()
    worker._pw = MagicMock()
    worker._browser_id = "authoring-test123"

    result = worker._cmd_context_destroy()
    assert result["ok"] is True
    assert worker._page is None
    assert worker._browser is None
    assert worker._pw is None
    assert worker._browser_id is None


# ── VP-L1: container-only enforcement ───────────────────────────────────────


def test_ensure_browser_requires_cdp_endpoint():
    """VP-L1: без PK_BROWSER_CDP_ENDPOINT _ensure_browser возвращает None.

    host headless выпилен. _last_cdp_error содержит подсказку про env.
    """
    import browser.browser_service as bs

    worker = _new_worker(None)
    with patch.dict("os.environ", {}, clear=True):
        result = worker._ensure_browser()

    assert result is None
    assert "PK_BROWSER_CDP_ENDPOINT" in worker._last_cdp_error


# ── HDO-B2: observe/click → elementFromPoint + dispatchEvent ─────────────────


def test_observe_click_requires_observe_active():
    """_cmd_observe_click без observe/start → честный fail."""
    import browser.browser_service as bs

    worker = _new_worker(_mock_page())
    worker._observe_active = False

    result = worker._cmd_observe_click(10.0, 20.0)
    assert result["ok"] is False
    assert "observe not active" in result.get("error", "")


def test_observe_click_primary_is_page_mouse():
    """BBA-1: observe_click primary — page.mouse.click (CDP), не elementFromPoint.

    При уже пойманном observe-событии fallback (elementFromPoint) НЕ вызывается.
    """
    import browser.browser_service as bs

    worker = _new_worker(_mock_page())
    worker._observe_active = True
    page = worker._page
    page.evaluate = MagicMock(return_value=True)

    # Событие уже в очереди → первичный page.mouse сразу фиксируется, fallback нет.
    worker._observed_events.append({"eventId": "cdp-1", "action": "click"})

    result = worker._cmd_observe_click(640.0, 400.0)
    assert result["ok"] is True
    assert result["fallback"] is False

    page.mouse.click.assert_called_once_with(640.0, 400.0)
    # elementFromPoint-путь не вызывался (нет evaluate с JS-фолбэком).
    assert not page.evaluate.called


def test_observe_click_falls_back_to_element_from_point_when_not_observed():
    """BBA-1: если page.mouse клик не дал observe-события — elementFromPoint fallback."""
    import browser.browser_service as bs

    worker = _new_worker(_mock_page())
    worker._observe_active = True
    page = worker._page
    page.evaluate = MagicMock(return_value=True)
    # События нет → primary page.mouse, затем elementFromPoint fallback.
    worker._observed_events.clear()
    # Ограничиваем bounded-wait, чтобы тест не висел 2с × 2.
    with patch.object(_new_worker_type(), "_POINTER_CLICK_WAIT_TIMEOUT", 0.0):
        worker._POINTER_CLICK_WAIT_TIMEOUT = 0.0
        result = worker._cmd_observe_click(640.0, 400.0)

    assert result["ok"] is True
    assert result["fallback"] is True

    page.mouse.click.assert_called_once_with(640.0, 400.0)
    assert page.evaluate.called
    js_arg = page.evaluate.call_args[0][0]
    assert "elementFromPoint" in js_arg
    assert "dispatchEvent" in js_arg
    assert "mousedown" in js_arg
    assert "mouseup" in js_arg


def _new_worker_type():
    import browser.browser_service as bs
    return bs._BrowserWorker


def test_observe_click_no_browser():
    """_cmd_observe_click без браузера → честный fail."""
    worker = _new_worker(None)
    worker._observe_active = True

    result = worker._cmd_observe_click(10.0, 20.0)
    assert result["ok"] is False
    assert "browser not available" in result.get("error", "")


# ── HDO-B3: enrich — неоднозначный блокирует auto-apply ─────────────────────


def test_enrich_ambiguous_candidate_blocks_auto_apply():
    """HDO-B3: weak non-unique candidate → isAmbiguous=True (блокирует auto-apply)."""
    import browser.browser_service as bs
    from unittest.mock import patch

    worker = _new_worker(None)

    evt = {
        "eventId": "cdp-1",
        "timestamp": 0.0,
        "action": "click",
        "element": {"tag": "div", "id": "", "text": "Click",
                    "rect": {"x": 0, "y": 0, "w": 80, "h": 32}},
    }
    with patch("utils.discovery_candidate_builder.build_candidates") as mock_build:
        mock_build.return_value = [{"candidates": [
            {"kind": "css", "value": "div", "score": 0.4, "tier": "T3", "unique": False}
        ]}]
        worker._enrich_event(evt)

    assert evt["isAmbiguous"] is True


def test_enrich_unique_candidate_not_ambiguous():
    """HDO-B3: unique strong candidate → isAmbiguous=False."""
    import browser.browser_service as bs
    from unittest.mock import patch

    worker = _new_worker(None)

    evt = {
        "eventId": "cdp-1",
        "timestamp": 0.0,
        "action": "click",
        "element": {"tag": "button", "id": "submit", "text": "Submit",
                    "rect": {"x": 0, "y": 0, "w": 80, "h": 32}},
    }
    with patch("utils.discovery_candidate_builder.build_candidates") as mock_build:
        mock_build.return_value = [{"candidates": [
            {"kind": "css", "value": "#submit", "score": 0.9, "tier": "T1", "unique": True}
        ]}]
        worker._enrich_event(evt)

    assert evt["isAmbiguous"] is False


# ── HDO-B5: сквозной integration-тест — skip (VP-L1 container-only) ─────────


@pytest.mark.integration
@pytest.mark.skip(reason="VP-L1 container-only: host headless Chromium + module-level API выпилены. Живой observe→DSL покрыт VP-L2 контейнерным проходом.")
def test_headless_observe_click_end_to_end():
    """HDO-B5: см. VP-L2 контейнерный проход (host headless выпилен)."""
    pass


# ── BBA-2/3: viewport + расширенные input-действия ──────────────────────────


def test_cmd_viewport_returns_metrics():
    """BBA-2: _cmd_viewport возвращает CSS-pixel размеры + deviceScaleFactor."""
    page = _mock_page()
    page.viewport_size = {"width": 1920, "height": 1080}
    page.evaluate.side_effect = lambda expr: 2.0 if expr == "window.devicePixelRatio" else "1"
    worker = _new_worker(page)

    result = worker._cmd_viewport()
    assert result["ok"] is True
    assert result["viewportWidth"] == 1920
    assert result["viewportHeight"] == 1080
    assert result["deviceScaleFactor"] == 2.0


def test_cmd_viewport_no_browser():
    worker = _new_worker(None)
    result = worker._cmd_viewport()
    assert result["ok"] is False
    assert "browser not available" in result.get("error", "")


def test_cmd_keyboard_press():
    """BBA-3: _cmd_keyboard_press → page.keyboard.press."""
    page = _mock_page()
    page.keyboard = MagicMock()
    page.keyboard.press = MagicMock()
    worker = _new_worker(page)

    result = worker._cmd_keyboard_press("Enter")
    assert result["ok"] is True
    page.keyboard.press.assert_called_once_with("Enter")


def test_cmd_keyboard_press_requires_key():
    worker = _new_worker(_mock_page())
    result = worker._cmd_keyboard_press("")
    assert result["ok"] is False
    assert "key required" in result.get("error", "")


def test_cmd_mouse_wheel():
    """BBA-3: _cmd_mouse_wheel → page.mouse.wheel(dx, dy)."""
    page = _mock_page()
    page.mouse.wheel = MagicMock()
    worker = _new_worker(page)

    result = worker._cmd_mouse_wheel(dx=0, dy=-600)
    assert result["ok"] is True
    page.mouse.wheel.assert_called_once_with(0.0, -600.0)


def test_cmd_mouse_drag():
    """BBA-3: _cmd_mouse_drag → down/move/up."""
    page = _mock_page()
    page.mouse.down = MagicMock()
    page.mouse.up = MagicMock()
    page.mouse.move = MagicMock()
    worker = _new_worker(page)

    result = worker._cmd_mouse_drag(10, 10, 200, 200)
    assert result["ok"] is True
    page.mouse.down.assert_called_once()
    page.mouse.up.assert_called_once()
    assert page.mouse.move.call_count == 2


def test_cmd_mouse_click():
    """BBA-FE-1: _cmd_mouse_click → page.mouse.click (author-режим, без observe)."""
    page = _mock_page()
    worker = _new_worker(page)

    result = worker._cmd_mouse_click(640.0, 400.0)
    assert result["ok"] is True
    page.mouse.click.assert_called_once_with(640.0, 400.0)


def test_cmd_mouse_click_no_browser():
    """BBA-FE-1: _cmd_mouse_click без браузера → честный fail."""
    worker = _new_worker(None)
    result = worker._cmd_mouse_click(10.0, 20.0)
    assert result["ok"] is False
    assert "browser not available" in result.get("error", "")


def test_observe_start_registers_worker_bound_bindings():
    """BBA-2/5: observe_start регистрирует click + input binding на ЭТОМ worker'е."""
    page = _mock_page()
    worker = _new_worker(page)

    result = worker._cmd_observe_start()
    assert result["ok"] is True

    assert page.expose_binding.called
    names = [c.args[0] for c in page.expose_binding.call_args_list]
    assert "__pk_cdp_click__" in names
    assert "__pk_cdp_input__" in names


def test_on_input_pushes_type_event_to_given_worker():
    """BBA-3: _on_input кладёт action=type в очередь конкретного worker'а."""
    import browser.browser_service as bs

    worker = _new_worker(None)
    worker._observe_last_event_id = 0
    worker._observed_events.clear()

    bs._on_input(
        {"tag": "input", "type": "password", "name": "pwd", "rect": {"x": 0, "y": 0, "w": 100, "h": 30}},
        worker,
    )

    assert len(worker._observed_events) == 1
    evt = worker._observed_events[0]
    assert evt["action"] == "type"
    assert evt["element"]["text"] == ""  # значение НЕ утекает
    assert evt["valueClass"] == "secret"
    assert evt["valueRef"] == "$secret"


def test_on_input_redacts_plaintext_value_as_value_ref():
    """TYPE-BE: сырое значение не попадает в событие — только $value placeholder."""
    import browser.browser_service as bs

    worker = _new_worker(None)
    worker._observe_last_event_id = 0
    worker._observed_events.clear()

    bs._on_input(
        {"tag": "input", "type": "text", "name": "q", "value": "plaintext-lease",
         "rect": {"x": 0, "y": 0, "w": 100, "h": 30}},
        worker,
    )

    evt = worker._observed_events[0]
    assert evt["action"] == "type"
    assert "value" not in evt["element"]
    assert "plaintext" not in evt["element"].get("text", "")
    assert evt["valueClass"] == "unknown"
    assert evt["valueRef"] == "$value"


def test_on_input_secret_value_ref_for_password():
    """TYPE-BE: password-ввод → valueRef=$secret, сырое значение выброшено."""
    import browser.browser_service as bs

    worker = _new_worker(None)
    worker._observe_last_event_id = 0
    worker._observed_events.clear()

    bs._on_input(
        {"tag": "input", "type": "password", "name": "passwd", "value": "hunter2",
         "ariaLabel": "Пароль", "rect": {"x": 0, "y": 0, "w": 100, "h": 30}},
        worker,
    )

    evt = worker._observed_events[0]
    assert evt["valueClass"] == "secret"
    assert evt["valueRef"] == "$secret"
    assert "hunter2" not in str(evt)


def test_on_input_empty_value_gives_empty_ref():
    """TYPE-BE: пустое значение → valueRef пустой (не $value)."""
    import browser.browser_service as bs

    worker = _new_worker(None)
    worker._observe_last_event_id = 0
    worker._observed_events.clear()

    bs._on_input(
        {"tag": "input", "type": "text", "name": "q", "value": "",
         "rect": {"x": 0, "y": 0, "w": 100, "h": 30}},
        worker,
    )

    evt = worker._observed_events[0]
    assert evt["valueRef"] == ""


def test_enrich_classifies_password_as_secret():
    """BBA-3: type=password → valueClass='secret' (не 'unknown')."""
    worker = _new_worker(None)
    evt = {
        "eventId": "cdp-1", "timestamp": 0.0, "action": "type",
        "element": {"tag": "input", "type": "password", "name": "pwd",
                    "rect": {"x": 0, "y": 0, "w": 100, "h": 30}},
    }
    worker._enrich_event(evt)
    assert evt["valueClass"] == "secret"


def test_enrich_classifies_email():
    """BBA-3: type=email → valueClass='email'."""
    worker = _new_worker(None)
    evt = {
        "eventId": "cdp-1", "timestamp": 0.0, "action": "type",
        "element": {"tag": "input", "type": "email", "name": "mail",
                    "rect": {"x": 0, "y": 0, "w": 100, "h": 30}},
    }
    worker._enrich_event(evt)
    assert evt["valueClass"] == "email"


def test_enrich_type_event_preserves_value_ref():
    """TYPE-BE: _enrich_event не перетирает уже выставленный valueRef/valueClass."""
    worker = _new_worker(None)
    evt = {
        "eventId": "cdp-1", "timestamp": 0.0, "action": "type",
        "valueClass": "secret", "valueRef": "$secret",
        "element": {"tag": "input", "type": "password", "name": "pwd",
                    "rect": {"x": 0, "y": 0, "w": 100, "h": 30}},
    }
    worker._enrich_event(evt)
    assert evt["valueClass"] == "secret"
    assert evt["valueRef"] == "$secret"


def test_enrich_click_event_has_empty_value_ref():
    """TYPE-BE: click-событие → valueClass=unknown, valueRef пустой (не секрет)."""
    worker = _new_worker(None)
    evt = {
        "eventId": "cdp-1", "timestamp": 0.0, "action": "click",
        "element": {"tag": "button", "text": "Submit", "id": "submit",
                    "rect": {"x": 0, "y": 0, "w": 80, "h": 32}},
    }
    worker._enrich_event(evt)
    assert evt["valueClass"] == "unknown"
    assert evt["valueRef"] == ""


# ── BBA-5: negative / reconnect — честный disconnected, без fake steps ───────


def test_observe_event_not_active_returns_not_observing():
    """BBA-5: observe выключен → connected=False, observing=False, event=None."""
    worker = _new_worker(None)
    worker._observe_active = False

    result = worker._cmd_observe_event()
    assert result["ok"] is True
    assert result["connected"] is False
    assert result["observing"] is False
    assert result.get("event") is None


def test_observe_event_page_none_connected_false():
    """BBA-5: страница пропала → честный connected=False, никакого события."""
    worker = _new_worker(None)
    worker._observe_active = True
    worker._observed_events.clear()

    result = worker._cmd_observe_event()
    assert result["ok"] is True
    assert result["connected"] is False
    assert result["observing"] is True
    assert result.get("event") is None


def test_observe_event_cdp_dropped_reports_disconnected():
    """BBA-5: page.evaluate кидает (CDP отвалился) → connected=False, _page сброшен.

    Никаких синтезированных/фейковых шагов: event=None, а worker честно
    переходит в disconnected и сбрасывает page для будущего reconnect.
    """
    page = _mock_page()
    page.evaluate = MagicMock(side_effect=RuntimeError("CDP socket closed"))
    worker = _new_worker(page)
    worker._observe_active = True
    worker._observed_events.clear()

    result = worker._cmd_observe_event()

    assert result["ok"] is True
    assert result["connected"] is False
    assert result["observing"] is True
    assert result.get("event") is None
    assert worker._page is None  # сброшен → следующий ensure_browser переподключится


def test_observe_event_no_fake_step_on_disconnect():
    """BBA-5: при отвале CDP очередь не обогащается и не «дорисовывает» шаг."""
    page = _mock_page()
    page.evaluate = MagicMock(side_effect=RuntimeError("CDP socket closed"))
    worker = _new_worker(page)
    worker._observe_active = True
    worker._observed_events.clear()

    result = worker._cmd_observe_event()

    assert result.get("event") is None
    assert worker._observed_events == []  # ничего не синтезировано


def test_observe_event_pops_real_event_when_connected():
    """BBA-5 (positive guard): при живой странице очередь отдаёт реальное событие."""
    page = _mock_page()
    page.evaluate = MagicMock(return_value=1)  # живой CDP
    worker = _new_worker(page)
    worker._observe_active = True
    worker._observed_events.clear()
    worker._observed_events.append({"eventId": "cdp-1", "timestamp": 0.0, "action": "click", "element": {"tag": "button", "rect": {"x": 0, "y": 0, "w": 1, "h": 1}}})

    result = worker._cmd_observe_event()

    assert result["ok"] is True
    assert result["connected"] is True
    assert result["event"]["eventId"] == "cdp-1"
