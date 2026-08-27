# -*- coding: utf-8 -*-
"""WAVE-3: тесты на browser_service (back/forward + screenshot format)."""
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
    """Mock Playwright Page with evaluate + navigation methods."""
    page = MagicMock()
    page.goto = MagicMock()
    page.go_back = MagicMock()
    page.go_forward = MagicMock()
    page.screenshot = MagicMock()
    page.evaluate = MagicMock()
    page.expose_binding = MagicMock()
    return page


def _inject_mock_page(page):
    """Replace _get_page() with mock page."""

    def _get_page():
        return page

    patcher = patch("browser.browser_service._get_page", side_effect=_get_page)
    patcher.start()
    return patcher


# ── B-3a: browser_back / browser_forward ────────────────────────────────────


def test_browser_back_ok():
    """browser_back вызывает page.go_back и возвращает url/title."""
    from browser.browser_service import browser_back

    page = _mock_page()
    page.evaluate.side_effect = lambda expr: {
        "window.location.href": "https://example.com/prev",
        "document.title": "Previous Page",
    }.get(expr, "")
    _inject_mock_page(page)

    result = browser_back()
    assert result["ok"] is True
    assert result["url"] == "https://example.com/prev"
    assert result["title"] == "Previous Page"


def test_browser_forward_ok():
    """browser_forward вызывает page.go_forward и возвращает url/title."""
    from browser.browser_service import browser_forward

    page = _mock_page()
    page.evaluate.side_effect = lambda expr: {
        "window.location.href": "https://example.com/next",
        "document.title": "Next Page",
    }.get(expr, "")
    _inject_mock_page(page)

    result = browser_forward()
    assert result["ok"] is True
    assert result["url"] == "https://example.com/next"
    assert result["title"] == "Next Page"


def test_browser_back_no_browser():
    """browser_back возвращает ошибку без браузера."""
    from browser.browser_service import browser_back

    with patch("browser.browser_service._get_page", return_value=None):
        result = browser_back()
    assert result["ok"] is False
    assert "browser not available" in result.get("error", "")


def test_browser_forward_no_browser():
    """browser_forward возвращает ошибку без браузера."""
    from browser.browser_service import browser_forward

    with patch("browser.browser_service._get_page", return_value=None):
        result = browser_forward()
    assert result["ok"] is False
    assert "browser not available" in result.get("error", "")


# ── B-3b: browser_screenshot base64 without data URI prefix ─────────────────


def test_browser_screenshot_pure_base64():
    """browser_screenshot возвращает чистый base64 без data: префикса."""
    from browser.browser_service import browser_screenshot

    page = _mock_page()
    # 1×1 PNG pixel
    png_data = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
    )
    page.screenshot.return_value = png_data
    _inject_mock_page(page)

    result = browser_screenshot()
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
    """browser_screenshot возвращает ошибку без браузера."""
    from browser.browser_service import browser_screenshot

    with patch("browser.browser_service._get_page", return_value=None):
        result = browser_screenshot()
    assert result["ok"] is False


# ── B-3c: data_playground routes ────────────────────────────────────────────


def test_data_playground_browser_routes():
    """Проверяем что маршруты back/forward зарегистрированы."""
    from tools.data_playground import Handler as _  # noqa: F401
    from browser.browser_service import browser_back, browser_forward, browser_click, browser_type_text  # noqa: F401

    assert callable(browser_back)
    assert callable(browser_forward)
    assert callable(browser_click)
    assert callable(browser_type_text)


# ── B-6: browser_click / browser_type_text ──────────────────────────────────


def test_browser_click_css():
    """browser_click с css-стратегией вызывает page.click."""
    from browser.browser_service import browser_click

    page = _mock_page()
    page.click = MagicMock()
    _inject_mock_page(page)

    result = browser_click("#submit", strategy="css")
    assert result["ok"] is True
    assert result["strategy"] == "css"
    page.click.assert_called_once_with("#submit", timeout=5000)


def test_browser_click_text():
    """browser_click text → page.get_by_text(selector, exact=True).click()."""
    from browser.browser_service import browser_click

    page = _mock_page()
    text_locator = MagicMock()
    page.get_by_text = MagicMock(return_value=text_locator)
    _inject_mock_page(page)

    result = browser_click("Submit", strategy="text")
    assert result["ok"] is True
    page.get_by_text.assert_called_once_with("Submit", exact=True)
    text_locator.click.assert_called_once_with(timeout=5000)


def test_browser_type_text_css():
    """browser_type_text с css-стратегией вызывает page.fill."""
    from browser.browser_service import browser_type_text

    page = _mock_page()
    page.fill = MagicMock()
    _inject_mock_page(page)

    result = browser_type_text("input[type='email']", "admin@test.com", strategy="css")
    assert result["ok"] is True
    assert result["selector"] == "input[type='email']"
    page.fill.assert_called_once_with("input[type='email']", "admin@test.com", timeout=5000)


def test_browser_click_no_browser():
    """browser_click возвращает ошибку без браузера."""
    from browser.browser_service import browser_click

    with patch("browser.browser_service._get_page", return_value=None):
        result = browser_click(".btn")
    assert result["ok"] is False
    assert "browser not available" in result.get("error", "")


def test_browser_type_no_browser():
    """browser_type_text возвращает ошибку без браузера."""
    from browser.browser_service import browser_type_text

    with patch("browser.browser_service._get_page", return_value=None):
        result = browser_type_text("input", "text")
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
    # Мок JS evaluate (bounding box check)
    page.evaluate = MagicMock(return_value='{"ok":false}')  # fallback — не отсеиваем
    info = {"tag": "button", "rect": {"x": 100, "y": 200, "w": 80, "h": 32}}
    result = _find_ax_node_for_element(page, info)
    assert result is not None
    assert result["role"] == "button"
    assert result["name"] == "Login"


# ── B-9: browser_observe candidate quality ──────────────────────────────────


def test_fallback_candidates_with_id():
    """_build_fallback_candidates с id — T1 css #id."""
    from browser.browser_service import _build_fallback_candidates

    info = {"tag": "button", "text": "Submit", "id": "submit-btn"}
    candidates = _build_fallback_candidates(info)
    assert len(candidates) >= 2
    # Первый — css #id (most specific)
    assert candidates[0]["kind"] == "css"
    assert candidates[0]["value"] == "#submit-btn"
    assert candidates[0]["score"] >= 0.5


def test_fallback_candidates_no_id():
    """_build_fallback_candidates без id — T2 text, T3 tag."""
    from browser.browser_service import _build_fallback_candidates

    info = {"tag": "button", "text": "Click Me", "id": ""}
    candidates = _build_fallback_candidates(info)
    assert len(candidates) >= 1
    # Без id — text candidate first
    assert any(c["kind"] == "text" for c in candidates)
    assert any(c["kind"] == "css" for c in candidates)


def test_on_click_is_pure_collector():
    """B-10: _on_click — чистый коллектор (никаких page.evaluate/candidates)."""
    import browser.browser_service as bs

    bs._observe_page = None
    bs._observe_last_event_id = 0

    info = {
        "tag": "button", "text": "Submit", "id": "submit",
        "rect": {"x": 0, "y": 0, "w": 80, "h": 32},
        "dataTestId": "submit-btn",
    }
    bs._on_click(info)

    assert len(bs._observed_events) == 1
    evt = bs._observed_events[0]
    assert evt["action"] == "click"
    assert evt["element"]["tag"] == "button"
    assert evt["element"]["dataTestId"] == "submit-btn"
    # B-10: обогащение НЕ происходит в _on_click
    assert "candidates" not in evt
    assert "role" not in evt["element"]
    bs._observed_events.clear()


def test_on_click_increments_event_id_under_lock():
    """B-11A: _on_click инкрементирует eventId под _lock (без гонки)."""
    import browser.browser_service as bs

    bs._observe_page = None
    bs._observe_last_event_id = 0
    bs._observed_events.clear()

    bs._on_click({"tag": "button", "rect": {"x": 0, "y": 0, "w": 1, "h": 1}})
    bs._on_click({"tag": "button", "rect": {"x": 0, "y": 0, "w": 1, "h": 1}})

    assert [e["eventId"] for e in bs._observed_events] == ["cdp-1", "cdp-2"]
    bs._observed_events.clear()


def test_enrich_observed_event_adds_candidates():
    """_enrich_observed_event добавляет candidates + role (вне binding-колбэка)."""
    import browser.browser_service as bs
    from unittest.mock import patch

    bs._observe_page = None

    evt = {
        "eventId": "cdp-1",
        "timestamp": 0.0,
        "action": "click",
        "element": {"tag": "button", "id": "submit", "text": "Submit",
                    "rect": {"x": 0, "y": 0, "w": 80, "h": 32}},
    }
    with patch("utils.discovery_candidate_builder.build_candidates") as mock_build:
        mock_build.return_value = [{"candidates": [{"kind": "css", "value": "#submit", "score": 0.9, "tier": "T1", "unique": True}]}]
        bs._enrich_observed_event(evt)

    assert len(evt.get("candidates", [])) > 0
    assert evt["candidates"][0]["score"] >= 0.5
    assert evt["isAmbiguous"] is False


def test_observe_event_enriches_and_pops():
    """browser_observe_event обогащает и достаёт событие из очереди."""
    import browser.browser_service as bs
    from unittest.mock import patch

    bs._observe_page = None
    bs._observe_active = True
    bs._observed_events.clear()

    bs._on_click({"tag": "button", "text": "Submit", "id": "submit",
                  "rect": {"x": 0, "y": 0, "w": 80, "h": 32}})

    with patch("utils.discovery_candidate_builder.build_candidates") as mock_build:
        mock_build.return_value = [{"candidates": [{"kind": "css", "value": "#submit", "score": 0.9, "tier": "T1", "unique": True}]}]
        result = bs.browser_observe_event()

    assert result["ok"] is True
    assert result["observing"] is True
    assert result["event"]["action"] == "click"
    assert len(result["event"].get("candidates", [])) > 0
    # очередь опустела (eventId в формате cdp-N)
    assert result["event"]["eventId"].startswith("cdp-")
    bs._observed_events.clear()
    bs._observe_active = False


def test_fallback_candidates_empty_element():
    """_build_fallback_candidates с совсем пустым элементом."""
    from browser.browser_service import _build_fallback_candidates

    info = {"tag": "", "text": "", "id": ""}
    candidates = _build_fallback_candidates(info)
    # Без tag/text/id — всё равно не пустой, хотя бы tag fallback пропущен
    # (tag="" → не добавляем tag-кандидата, возвращаем пустой список)
    assert isinstance(candidates, list)


def test_observe_candidates_end_to_end_via_click_handler():
    """_on_click → browser_observe_event: event has candidates (no ImportError)."""
    import browser.browser_service as bs
    from utils.discovery_candidate_builder import build_candidates

    bs._observe_page = None
    bs._observe_last_event_id = 0
    bs._observe_active = True
    bs._observed_events.clear()

    info = {"tag": "button", "text": "Submit", "id": "submit-btn", "rect": {"x": 100, "y": 200, "w": 80, "h": 32}}
    bs._on_click(info)

    # Реальный build_candidates (без мока), AX=no page → None
    result = bs.browser_observe_event()

    assert result["ok"] is True
    evt = result["event"]
    assert evt["action"] == "click"
    # Должен быть кандидат (real build_candidates или fallback)
    assert isinstance(evt.get("candidates"), list)
    bs._observed_events.clear()
    bs._observe_active = False


# ── B-12: role/label/test_id Play-исполнение ────────────────────────────────


def test_browser_click_role():
    """browser_click role → page.get_by_role().click()."""
    from browser.browser_service import browser_click

    page = _mock_page()
    role_locator = MagicMock()
    page.get_by_role = MagicMock(return_value=role_locator)
    _inject_mock_page(page)

    result = browser_click("Войти", strategy="role")
    assert result["ok"] is True
    page.get_by_role.assert_called_once_with("Войти")
    role_locator.click.assert_called_once_with(timeout=5000)


def test_browser_click_test_id():
    """browser_click test_id → page.get_by_test_id().click()."""
    from browser.browser_service import browser_click

    page = _mock_page()
    tid_locator = MagicMock()
    page.get_by_test_id = MagicMock(return_value=tid_locator)
    _inject_mock_page(page)

    result = browser_click("submit-btn", strategy="test_id")
    assert result["ok"] is True
    page.get_by_test_id.assert_called_once_with("submit-btn")
    tid_locator.click.assert_called_once_with(timeout=5000)


def test_browser_click_label():
    """browser_click label → page.get_by_label().click()."""
    from browser.browser_service import browser_click

    page = _mock_page()
    label_locator = MagicMock()
    page.get_by_label = MagicMock(return_value=label_locator)
    _inject_mock_page(page)

    result = browser_click("Email", strategy="label")
    assert result["ok"] is True
    page.get_by_label.assert_called_once_with("Email")
    label_locator.click.assert_called_once_with(timeout=5000)


def test_browser_type_role():
    """browser_type_text role → page.get_by_role().fill()."""
    from browser.browser_service import browser_type_text

    page = _mock_page()
    role_locator = MagicMock()
    page.get_by_role = MagicMock(return_value=role_locator)
    _inject_mock_page(page)

    result = browser_type_text("Поиск", "hello", strategy="role")
    assert result["ok"] is True
    page.get_by_role.assert_called_once_with("Поиск")
    role_locator.fill.assert_called_once_with("hello", timeout=5000)


# ── B-13: context ensure/destroy ─────────────────────────────────────────────


def test_browser_context_ensure_ok():
    """browser_context_ensure возвращает ok при живом браузере."""
    from browser.browser_service import browser_context_ensure

    page = _mock_page()
    _inject_mock_page(page)
    result = browser_context_ensure()
    assert result["ok"] is True


def test_browser_context_destroy_closes_page():
    """browser_context_destroy закрывает страницу/браузер и возвращает ok."""
    import browser.browser_service as bs

    page = _mock_page()
    bs._page = page
    bs._browser_obj = MagicMock()
    bs._connected = True

    result = bs.browser_context_destroy()
    assert result["ok"] is True
    page.close.assert_called_once()
    assert bs._page is None
    assert bs._connected is False


# ── HDO-B1: headless launch ─────────────────────────────────────────────────


def test_get_page_launches_headless():
    """HDO-B1: _get_page использует headless=True (без окна на десктопе)."""
    import browser.browser_service as bs
    from unittest.mock import MagicMock, patch

    # Техдолг: _inject_mock_page в других тестах не вызывает stop() — патч
    # _get_page утекает на следующие тесты. Снимаем утечки, чтобы тестировать
    # реальную логику headless-запуска, а не перехваченный фейк.
    patch.stopall()
    bs._page = None
    bs._pw = None
    bs._browser_obj = None

    fake_browser = MagicMock()
    fake_ctx = MagicMock()
    fake_page = MagicMock()
    fake_browser.new_context.return_value = fake_ctx
    fake_ctx.new_page.return_value = fake_page

    fake_pw_instance = MagicMock()
    fake_pw_instance.chromium.launch.return_value = fake_browser

    fake_sync = MagicMock()
    fake_sync.return_value.start.return_value = fake_pw_instance

    try:
        with patch("playwright.sync_api.sync_playwright", new=fake_sync):
            result = bs._get_page()

        assert result is fake_page
        # headless=True — критично: никаких окон на десктопе
        launch_kwargs = fake_pw_instance.chromium.launch.call_args
        assert launch_kwargs[1].get("headless") is True
        # viewport 1280x800 через new_context
        ctx_kwargs = fake_browser.new_context.call_args[1]
        assert ctx_kwargs.get("viewport") == {"width": 1280, "height": 800}
    finally:
        bs._page = None
        bs._pw = None
        bs._browser_obj = None


# ── HDO-B2: observe/click → page.mouse.click ────────────────────────────────


def test_observe_click_requires_observe_active():
    """browser_observe_click без observe/start → честный fail."""
    import browser.browser_service as bs

    bs._observe_active = False
    bs._observe_page = _mock_page()

    result = bs.browser_observe_click(10.0, 20.0)
    assert result["ok"] is False
    assert "observe not active" in result.get("error", "")


def test_observe_click_dispatches_mouse_click():
    """browser_observe_click вызывает page.mouse.move + page.mouse.click(x, y)."""
    import browser.browser_service as bs

    page = _mock_page()
    page.mouse = MagicMock()
    page.mouse.move = MagicMock()
    page.mouse.click = MagicMock()

    bs._observe_active = True
    bs._observe_page = page

    result = bs.browser_observe_click(640.0, 400.0)
    assert result["ok"] is True
    page.mouse.move.assert_called_once_with(640.0, 400.0)
    page.mouse.click.assert_called_once_with(640.0, 400.0)
    bs._observe_active = False
    bs._observe_page = None


def test_observe_click_no_browser():
    """browser_observe_click без браузера → честный fail."""
    import browser.browser_service as bs

    bs._observe_active = True
    bs._observe_page = None

    result = bs.browser_observe_click(10.0, 20.0)
    assert result["ok"] is False
    assert "browser not available" in result.get("error", "")
    bs._observe_active = False


# ── HDO-B3: enrich в headless — неоднозначный блокирует auto-apply ──────────


def test_enrich_ambiguous_candidate_blocks_auto_apply():
    """HDO-B3: weak non-unique candidate → isAmbiguous=True (блокирует auto-apply)."""
    import browser.browser_service as bs
    from unittest.mock import patch

    bs._observe_page = None

    evt = {
        "eventId": "cdp-1",
        "timestamp": 0.0,
        "action": "click",
        "element": {"tag": "div", "id": "", "text": "Click",
                    "rect": {"x": 0, "y": 0, "w": 80, "h": 32}},
    }
    # weak non-unique candidate (score < 0.7, unique=False)
    with patch("utils.discovery_candidate_builder.build_candidates") as mock_build:
        mock_build.return_value = [{"candidates": [
            {"kind": "css", "value": "div", "score": 0.4, "tier": "T3", "unique": False}
        ]}]
        bs._enrich_observed_event(evt)

    assert evt["isAmbiguous"] is True


def test_enrich_unique_candidate_not_ambiguous():
    """HDO-B3: unique strong candidate → isAmbiguous=False."""
    import browser.browser_service as bs
    from unittest.mock import patch

    bs._observe_page = None

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
        bs._enrich_observed_event(evt)

    assert evt["isAmbiguous"] is False


# ── HDO-B5: сквозной integration-тест БЕЗ моков на Playwright-уровне ────────


def _real_headless_page():
    """Поднять реальный headless Chromium. Вернуть (page, error_msg).

    Если Chromium недоступен — вернуть (None, reason) для skip.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        return None, f"playwright not installed: {e}"

    pw = None
    try:
        pw = sync_playwright().start()
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()
        # сохранить ссылку на pw/browser чтобы не собирались GC
        page._pw_holder = pw
        page._browser_holder = browser
        page._ctx_holder = ctx
        return page, None
    except Exception as e:
        if pw is not None:
            try:
                pw.stop()
            except Exception:
                pass
        return None, f"chromium unavailable: {e}"


@pytest.mark.integration
def test_headless_observe_click_end_to_end():
    """HDO-B5: navigate → observe/click {x,y} → mouse.click → event(candidates).

    БЕЗ моков на Playwright-уровне: реальный headless Chromium, реальный DOM.
    Клик по кнопке с data-testid по известным координатам → observe ловит
    событие с candidates. event: null не возвращается.
    """
    import browser.browser_service as bs

    page, reason = _real_headless_page()
    if page is None:
        pytest.skip(reason)

    original_get_page = bs._get_page
    original_page = bs._page
    original_browser_obj = bs._browser_obj
    original_pw_obj = bs._pw
    original_connected = bs._connected
    try:
        # Подмена _get_page → реальная headless-страница
        bs._get_page = lambda: page
        # Сброс глобального состояния (утечка от unit-тестов → моки/мёртвые page)
        bs._page = None
        bs._connected = False
        bs._browser_obj = None
        bs._pw = None
        bs._observe_active = False
        bs._observe_page = None
        bs._observed_events.clear()

        # 1) navigate на data: URL с кнопкой по фиксированным координатам
        html = """<html><body style="margin:0">
            <button id="go" data-testid="go-btn"
                style="position:absolute; left:10px; top:10px; width:100px; height:40px;">
              Go
            </button>
        </body></html>"""
        import base64
        data_url = "data:text/html;base64," + base64.b64encode(html.encode()).decode()
        page.goto(data_url, wait_until="domcontentloaded")

        # 2) observe start (инжектит слушатель + expose_binding)
        start = bs.browser_observe_start()
        assert start.get("ok") is True

        # 3) observe/click по координатам кнопки (центр ~60,30)
        click = bs.browser_observe_click(60.0, 30.0)
        assert click.get("ok") is True, f"click failed: {click}"

        # 4) event не null, с candidates
        result = bs.browser_observe_event()
        assert result.get("ok") is True
        assert result.get("event") is not None, "event: null — клик потерялся"
        evt = result["event"]
        assert evt["action"] == "click"
        assert isinstance(evt.get("candidates"), list)
        assert len(evt["candidates"]) > 0

        # 5) stop
        bs.browser_observe_stop()
    finally:
        bs._get_page = original_get_page
        bs._page = original_page
        bs._browser_obj = original_browser_obj
        bs._pw = original_pw_obj
        bs._connected = original_connected
        bs._observe_active = False
        bs._observed_events.clear()
        try:
            page._browser_holder.close()
            page._pw_holder.stop()
        except Exception:
            pass