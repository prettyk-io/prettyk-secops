# -*- coding: utf-8 -*-
"""Lightweight authoring browser service for Studio Browser Panel.

Manages a Playwright headless Chromium (headless=True) — браузер живёт ВНУТРИ
Playground, рендер скриншотами, клики оператора по картинке → координаты →
page.mouse.click. Никаких окон на десктопе.
Used by the /api/browser/* endpoints in data_playground.py.
"""
from __future__ import annotations

import base64
import io
import logging
import threading
import time
import uuid
from typing import Optional

logger = logging.getLogger("orchestrator.browser")

_lock = threading.Lock()
_page: Optional[object] = None
_pw: Optional[object] = None
_browser_obj: Optional[object] = None
_connected = False

_browser_id: str | None = None


def _get_page():
    """Lazy-launch authoring browser (Playwright headless).

    Это браузер АВТОРИНГА в Editor: headless-процесс внутри Playground,
    рендер скриншотами, клик оператора по картинке → координаты →
    page.mouse.click → реальный DOM click → observe → DSL. НЕ execution
    (то живёт в Studio через Grid/noVNC) и НЕ агентский browser-hands-pure.
    """
    global _page, _pw, _browser_obj, _connected, _browser_id

    # Return cached page if browser is still alive
    if _page is not None:
        try:
            _page.evaluate("1")
            return _page
        except Exception:
            _page = None
            _connected = False

    try:
        import playwright.sync_api as pw

        _pw = pw.sync_playwright().start()
        # HDO-B1: headless — никаких окон на десктопе оператора.
        _browser_obj = _pw.chromium.launch(
            headless=True,
            args=["--no-sandbox"],
        )
        ctx = _browser_obj.new_context(
            viewport={"width": 1280, "height": 800},
            ignore_https_errors=True,
        )
        _page = ctx.new_page()
        _connected = True
        _browser_id = f"authoring-{uuid.uuid4().hex[:12]}"
        logger.info("browser_service: launched authoring Chromium (headless 1280x800)")
        return _page
    except Exception as e:
        logger.warning("browser_service: Chromium launch failed: %s", e)
        _page = None
        _connected = False
        return None


def browser_status() -> dict:
    """GET /api/browser/status — check browser connection and get current page info."""
    with _lock:
        page = _get_page()
        if page is None:
            return {
                "ok": True,
                "connected": False,
                "url": None,
                "title": None,
                "browserId": None,
                "purpose": "authoring",
                "transport": "playwright",
                "headless": True,
            }

        try:
            url = page.evaluate("window.location.href")
            title = page.evaluate("document.title")
            return {
                "ok": True,
                "connected": True,
                "url": url,
                "title": title,
                "browserId": _browser_id,
                "purpose": "authoring",
                "transport": "playwright",
                "headless": True,
            }
        except Exception as e:
            return {
                "ok": True,
                "connected": False,
                "url": None,
                "title": None,
                "browserId": _browser_id,
                "purpose": "authoring",
                "transport": "playwright",
                "headless": True,
                "error": str(e),
            }


def browser_navigate(url: str) -> dict:
    """POST /api/browser/navigate — go to URL."""
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "browser not available"}

        try:
            # Quick-reject obviously malformed URLs (commas, missing protocol, etc.)
            if not url.startswith(("http://", "https://")):
                return {"ok": False, "error": f"invalid url: {url}"}
            page.goto(url, timeout=8000, wait_until="domcontentloaded")
            title = page.evaluate("document.title")
            return {"ok": True, "url": page.evaluate("window.location.href"), "title": title}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def browser_screenshot() -> dict:
    """POST /api/browser/screenshot — take viewport screenshot, return base64 PNG."""
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "browser not available"}

        try:
            data = page.screenshot(type="png", full_page=False)
            b64 = base64.b64encode(data).decode("utf-8")
            return {"ok": True, "screenshot": b64, "format": "png"}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def browser_back() -> dict:
    """POST /api/browser/back — go back in history."""
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            page.go_back(timeout=10000, wait_until="domcontentloaded")
            url = page.evaluate("window.location.href")
            title = page.evaluate("document.title")
            return {"ok": True, "url": url, "title": title}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def browser_forward() -> dict:
    """POST /api/browser/forward — go forward in history."""
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            page.go_forward(timeout=10000, wait_until="domcontentloaded")
            url = page.evaluate("window.location.href")
            title = page.evaluate("document.title")
            return {"ok": True, "url": url, "title": title}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def browser_click(selector: str, strategy: str = "css") -> dict:
    """POST /api/browser/click — click element by locator."""
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            if strategy == "role":
                page.get_by_role(selector).click(timeout=5000)
            elif strategy == "text":
                page.get_by_text(selector, exact=True).click(timeout=5000)
            elif strategy == "label":
                page.get_by_label(selector).click(timeout=5000)
            elif strategy == "test_id":
                page.get_by_test_id(selector).click(timeout=5000)
            elif strategy == "xpath":
                page.click(f"xpath={selector}", timeout=5000)
            elif strategy == "css":
                page.click(selector, timeout=5000)
            else:
                page.click(selector, timeout=5000)
            return {"ok": True, "selector": selector, "strategy": strategy}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def browser_type_text(selector: str, text: str, strategy: str = "css") -> dict:
    """POST /api/browser/type — type text into element."""
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        try:
            if strategy == "role":
                page.get_by_role(selector).fill(text, timeout=5000)
            elif strategy == "text":
                page.get_by_text(selector, exact=True).fill(text, timeout=5000)
            elif strategy == "label":
                page.get_by_label(selector).fill(text, timeout=5000)
            elif strategy == "test_id":
                page.get_by_test_id(selector).fill(text, timeout=5000)
            elif strategy == "xpath":
                page.fill(f"xpath={selector}", text, timeout=5000)
            elif strategy == "css":
                page.fill(selector, text, timeout=5000)
            else:
                page.fill(selector, text, timeout=5000)
            return {"ok": True, "selector": selector, "text": text}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def browser_highlight(selector: str, strategy: str = "css") -> dict:
    """POST /api/browser/highlight — highlight an element by selector.

    Uses a temporary overlay to draw a colored border around the element.
    """
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "browser not available"}

        try:
            # Remove any previous highlight
            page.evaluate("""
                const old = document.getElementById('__pk_highlight__');
                if (old) old.remove();
            """)

            # Try to locate and highlight
            js = f"""
                (function() {{
                    let el = null;
                    try {{
                        if ('{strategy}' === 'role') {{
                            el = document.querySelector('[role="{selector}"]');
                        }} else if ('{strategy}' === 'label') {{
                            const labels = document.querySelectorAll('label');
                            for (const l of labels) {{
                                if (l.textContent && l.textContent.trim() === '{selector}') {{
                                    el = l;
                                    break;
                                }}
                            }}
                        }} else if ('{strategy}' === 'text') {{
                            const all = document.querySelectorAll('button, a, span, div');
                            for (const elm of all) {{
                                if (elm.textContent && elm.textContent.trim() === '{selector}') {{
                                    el = elm;
                                    break;
                                }}
                            }}
                        }} else if ('{strategy}' === 'test_id') {{
                            el = document.querySelector('[data-testid="{selector}"]');
                        }} else if ('{strategy}' === 'xpath') {{
                            el = document.evaluate('{selector}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        }} else {{
                            el = document.querySelector('{selector}');
                        }}
                    }} catch(e) {{}}

                    if (!el) return JSON.stringify({{found: false}});

                    const overlay = document.createElement('div');
                    overlay.id = '__pk_highlight__';
                    const rect = el.getBoundingClientRect();
                    overlay.style.cssText = `
                        position: fixed;
                        left: ${{rect.left}}px;
                        top: ${{rect.top + window.scrollY}}px;
                        width: ${{rect.width}}px;
                        height: ${{rect.height}}px;
                        border: 2px solid #38bdf8;
                        background: rgba(56,189,248,0.08);
                        z-index: 2147483647;
                        pointer-events: none;
                        border-radius: 4px;
                        box-shadow: 0 0 12px rgba(56,189,248,0.3);
                    `;
                    document.body.appendChild(overlay);

                    return JSON.stringify({{
                        found: true,
                        tag: el.tagName.toLowerCase(),
                        text: (el.textContent || '').slice(0, 80).trim(),
                        rect: {{
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            w: Math.round(rect.width),
                            h: Math.round(rect.height),
                        }}
                    }});
                }})()
            """

            result_raw = page.evaluate(js)
            import json
            result = json.loads(result_raw)
            return {"ok": True, **result}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def browser_eval(expression: str) -> dict:
    """POST /api/browser/eval — run read-only JS, return result."""
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "browser not available"}

        try:
            result = page.evaluate(expression)
            return {"ok": True, "result": result}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


# ---------------------------------------------------------------------------
# Browser observe — live click capture for authoring observe → DSL
# ---------------------------------------------------------------------------

_observe_active = False
_observed_events: list[dict] = []
_observe_last_event_id = 0
_observe_page = None  # page, на которой установлен expose_binding


def _find_ax_node_for_element(page, element_info: dict) -> dict | None:
    """Walk page.accessibility.snapshot() to find AX node matching clicked element.

    B-5: проверка bounding box — candidate должен пересекаться с координатами клика.
    """
    try:
        ax = page.accessibility.snapshot()
    except Exception:
        return None
    if ax is None:
        return None

    click_rect = element_info.get("rect", {})
    cx = click_rect.get("x", 0) + click_rect.get("w", 0) / 2
    cy = click_rect.get("y", 0) + click_rect.get("h", 0) / 2

    target_role = (element_info.get("tag") or "").lower()
    best: dict | None = None
    best_score = -1.0

    def _rect_overlaps(ax_node: dict) -> bool:
        """Проверить, что bounding box AX-узла пересекается с точкой клика."""
        if page is None:
            return True  # без страницы — пропускаем проверку
        node_id = ax_node.get("nodeId")
        if node_id is None:
            return False
        try:
            js = f"""
            (function() {{
                try {{
                    const node = accessibility.getAXNodeById({node_id});
                    if (!node) return JSON.stringify({{ok: false}});
                    const rect = node.boundingBox();
                    if (!rect) return JSON.stringify({{ok: false}});
                    return JSON.stringify({{
                        ok: true,
                        x: rect.x, y: rect.y, w: rect.width, h: rect.height
                    }});
                }} catch(e) {{ return JSON.stringify({{ok: false}}); }}
            }})()
            """
            raw = page.evaluate(f"new Function('accessibility', {js!r})(window.accessibility || {{}})")
            data = __import__("json").loads(raw)
            if not data.get("ok"):
                return False
            bx, by, bw, bh = data["x"], data["y"], data["w"], data["h"]
            return bx <= cx <= bx + bw and by <= cy <= by + bh
        except Exception:
            return True  # fallback — не отсеиваем

    def walk(node: dict) -> None:
        nonlocal best, best_score
        if not isinstance(node, dict):
            return
        role = str(node.get("role") or "").strip().lower()
        if role and (role == target_role or (target_role in ("input", "textarea") and role in ("textbox", "searchbox"))):
            score = 1.0 if _rect_overlaps(node) else 0.2
            if score > best_score:
                best = node
                best_score = score
        children = node.get("children")
        if isinstance(children, list):
            for child in children:
                if isinstance(child, dict):
                    walk(child)

    walk(ax)
    return best if best_score > 0 else None


def _build_fallback_candidates(event_info: dict) -> list[dict]:
    """B-8: построить candidate locator вручную из tag + text + id."""
    tag = event_info.get("tag", "")
    text = (event_info.get("text") or "")[:40].strip()
    eid = event_info.get("id", "")
    candidates: list[dict] = []
    if eid and not eid.startswith(":"):
        candidates.append({"kind": "css", "value": f"#{eid}", "score": 0.8, "tier": "T1", "unique": True})
    if text and tag:
        candidates.append({
            "kind": "text",
            "value": f"text={text}",
            "score": 0.65 if not eid else 0.5,
            "tier": "T2",
            "unique": len(text.split()) == 1,
        })
    if tag:
        candidates.append({"kind": "css", "value": tag, "score": 0.4, "tier": "T3", "unique": False})
    return candidates


def _on_click(event_info: dict) -> None:
    """Чистый коллектор клика (вызывается из JS через expose_binding).

    B-10: НИКАКИХ page.evaluate / page.accessibility.snapshot / build_candidates
    здесь — это sync Playwright API, а повторный вход из binding-колбэка
    = deadlock. Только собрать event_info из JS, инкремент eventId и append
    в очередь (под _lock — B-11 data race).

    Обогащение (AX-нода, candidates, valueClass, isAmbiguous) — в
    `_enrich_observed_event`, вызывается из `browser_observe_event` в
    HTTP-потоке вне binding-колбэка.
    """
    global _observe_last_event_id
    evt = {
        "timestamp": __import__("time").time(),
        "action": "click",
        "element": {
            "tag": event_info.get("tag", ""),
            "id": event_info.get("id", ""),
            "classes": event_info.get("classes", ""),
            "text": (event_info.get("text") or "")[:80],
            "rect": event_info.get("rect", {"x": 0, "y": 0, "w": 0, "h": 0}),
            "name": event_info.get("name", ""),
            "placeholder": event_info.get("placeholder", ""),
            "type": event_info.get("type", ""),
            "dataTestId": event_info.get("dataTestId", ""),
        },
    }
    with _lock:
        _observe_last_event_id += 1
        evt["eventId"] = f"cdp-{_observe_last_event_id}"
        _observed_events.append(evt)


def _enrich_observed_event(evt: dict) -> None:
    """Обогатить собранное событие (AX-нода, candidates, valueClass, isAmbiguous).

    Вызывается из `browser_observe_event` в HTTP-потоке под _lock, ВНЕ
    binding-колбэка — здесь page.evaluate / snapshot безопасны.
    """
    element = evt.get("element", {})
    event_info = {
        "tag": element.get("tag", ""),
        "id": element.get("id", ""),
        "classes": element.get("classes", ""),
        "text": element.get("text", ""),
        "rect": element.get("rect", {"x": 0, "y": 0, "w": 0, "h": 0}),
        "name": element.get("name", ""),
        "placeholder": element.get("placeholder", ""),
        "type": element.get("type", ""),
        "dataTestId": element.get("dataTestId", ""),
    }

    # Merge AX snapshot info
    page = _observe_page
    if page is not None:
        ax_node = _find_ax_node_for_element(page, event_info)
        if ax_node:
            element["role"] = str(ax_node.get("role") or "").strip().lower()
            element["accessibleName"] = str(ax_node.get("name") or "").strip()
            # Classify value (secret/email/phone)
            try:
                from utils.discovery_element_extractor import _classify_value
                evt["valueClass"] = _classify_value(ax_node)
            except ImportError:
                logger.warning("_classify_value not available (discovery_element_extractor missing)")
                evt["valueClass"] = "unknown"

    # Build candidate locators
    try:
        from utils.discovery_candidate_builder import build_candidates
        el_for_candidate = {
            "test_id": event_info.get("dataTestId", ""),
            "clean_id": event_info.get("id", "") if event_info.get("id") and not event_info.get("id", "").startswith(":") else "",
            "accessible_name": element.get("accessibleName", ""),
            "role": element.get("role", ""),
            "label_for": "",
            "placeholder": event_info.get("placeholder", ""),
            "name_attr": event_info.get("name", ""),
            "tag": event_info.get("tag", ""),
        }
        candidates = build_candidates([el_for_candidate])
        if candidates and candidates[0].get("candidates"):
            evt["candidates"] = candidates[0]["candidates"]
        else:
            # B-8: fallback — построить candidate вручную из tag + text + id
            evt["candidates"] = _build_fallback_candidates(event_info)
        top_score = evt["candidates"][0].get("score", 0) if evt.get("candidates") else 0
        logger.info(
            "browser_observe click: tag=%s text=%.40s candidates=%d top_score=%.2f",
            event_info.get("tag", "?"),
            (event_info.get("text") or "")[:40],
            len(evt.get("candidates", [])),
            top_score,
        )
    except ImportError:
        logger.warning("build_candidates not available (discovery_candidate_builder missing)")
        evt["candidates"] = _build_fallback_candidates(event_info)
    except Exception:
        evt["candidates"] = _build_fallback_candidates(event_info)

    # Ambiguity: if best candidate is non-unique and weak
    evt["isAmbiguous"] = False
    cands = evt.get("candidates", [])
    if cands:
        best = cands[0]
        if not best.get("unique") and best.get("score", 0) < 0.7:
            evt["isAmbiguous"] = True


def _binding_handler(*args) -> None:
    """Playwright expose_binding callback: последний аргумент — info-словарь из JS."""
    if not args:
        return
    info = args[-1]
    if isinstance(info, dict) and info.get("tag"):
        _on_click(info)


def browser_observe_start() -> dict:
    """POST /api/browser/observe/start — begin capturing browser click events."""
    global _observe_active, _observed_events, _observe_last_event_id, _observe_page
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "browser not available"}

        if _observe_active:
            return {"ok": True, "status": "already_active"}

        _observed_events.clear()
        _observe_active = True
        _observe_last_event_id = 0
        _observe_page = page

        try:
            # Прямой мост JS → Python: клик в браузере дёргает _binding_handler
            page.expose_binding("__pk_cdp_click__", _binding_handler)

            page.evaluate("""
                if (!window.__pk_cdp_click_listener__) {
                    window.__pk_cdp_click_listener__ = true;
                    // B-11: именованная функция в window — чтобы stop мог снять
                    // слушателя через removeEventListener, а не только флаг.
                    window.__pk_cdp_click_handler__ = function(e) {
                        const el = e.target;
                        const rect = el.getBoundingClientRect();
                        const info = {
                            tag: el.tagName.toLowerCase(),
                            id: el.id || '',
                            classes: (el.className && typeof el.className === 'string') ? el.className : '',
                            text: (el.textContent || '').trim(),
                            name: el.getAttribute('name') || '',
                            placeholder: el.getAttribute('placeholder') || '',
                            type: el.getAttribute('type') || '',
                            dataTestId: el.getAttribute('data-testid') || el.getAttribute('data-test-id') || '',
                            rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
                        };
                        window.__pk_cdp_click__(info);
                    };
                    document.addEventListener('click', window.__pk_cdp_click_handler__, true);
                }
            """)

            logger.info("browser_observe_start: click listener + binding injected")
            return {"ok": True, "status": "observing"}
        except Exception as e:
            _observe_active = False
            _observe_page = None
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def browser_observe_stop() -> dict:
    """POST /api/browser/observe/stop — stop click capture."""
    global _observe_active, _observed_events, _observe_page
    with _lock:
        _observe_active = False
        count = len(_observed_events)
        _observed_events.clear()

        page = _observe_page
        if page is not None:
            try:
                # B-11: снять слушателя через removeEventListener (не только флаг),
                # чтобы повторный start/stop не плодил лишние listener'ы.
                page.evaluate(
                    "if (window.__pk_cdp_click_handler__) {"
                    " document.removeEventListener('click', window.__pk_cdp_click_handler__, true);"
                    " window.__pk_cdp_click_handler__ = null;"
                    "}"
                    "window.__pk_cdp_click_listener__ = false;"
                )
            except Exception:
                pass
        _observe_page = None

        logger.info("browser_observe_stop: %d events discarded", count)
        return {"ok": True, "eventsDiscarded": count}


def browser_observe_event() -> dict:
    """POST /api/browser/observe/event — pop one observed event (or return empty).

    События попадают в очередь через expose_binding (живой клик) — `_on_click`
    только собирает сырьё. Здесь в HTTP-потоке (вне binding-колбэка) выполняется
    обогащение через `_enrich_observed_event` (AX-нода, candidates, valueClass,
    isAmbiguous) — page.evaluate/snapshot здесь безопасны.
    """
    global _observe_active, _observed_events

    with _lock:
        if not _observe_active:
            return {"ok": True, "connected": False, "observing": False}

        if _observed_events:
            evt = _observed_events.pop(0)
            _enrich_observed_event(evt)
            return {"ok": True, "connected": True, "observing": True, "event": evt}

        return {"ok": True, "connected": True, "observing": True, "event": None}


def browser_observe_click(x: float, y: float) -> dict:
    """POST /api/browser/observe/click — клик по скриншоту → реальный DOM click.

    HDO-B2: оператор кликает по картинке (рендер скриншотом), фронт шлёт
    координаты в масштабе viewport. Здесь `page.mouse.click(x, y)` производит
    реальный DOM click, который ловится существующим
    `document.addEventListener('click')` + `expose_binding` → `_on_click` →
    очередь. Событие достаётся через `browser_observe_event`.

    ВАЖНО: НЕ держим `_lock` во время `page.mouse.click` — sync Playwright
    синхронно дёргает `expose_binding` → `_on_click` → `_lock` (threading.Lock
    не reentrant → deadlock при повторном входе).

    RACE FIX: `expose_binding` колбэк выполняется на dispatcher-потоке Playwright
    АСИНХРОННО — `page.mouse.click()` возвращается раньше, чем `_on_click`
    успевает положить событие в очередь. Поэтому после клика ждём появления
    события в `_observed_events` (короткий дедлайн), не полагаясь на тайминг.
    """
    global _observe_active, _observed_events
    if not _observe_active:
        return {"ok": False, "error": "observe not active — call observe/start first"}
    page = _observe_page
    if page is None:
        return {"ok": False, "error": "browser not available"}

    try:
        # move() перед click() обязателен: без предварительного движения мыши
        # Playwright на свежем viewport может не пройти hit-test и mouse.click
        # не диспатчит DOM click (проверено на реальном headless Chromium).
        page.mouse.move(float(x), float(y))
        page.mouse.click(float(x), float(y))
        logger.info("browser_observe_click: click at (%.1f, %.1f)", x, y)

        # Ждём асинхронный binding-колбэк: событие попадает в очередь с задержкой.
        deadline = time.time() + 2.0
        while time.time() < deadline:
            with _lock:
                if _observed_events:
                    break
            time.sleep(0.02)

        return {"ok": True, "x": x, "y": y, "queued": bool(_observed_events)}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def browser_context_ensure(context: str = "operator", url: str | None = None) -> dict:
    """Ensure the Studio authoring Browser object exists.

    There is one authoring context for now. The explicit context contract keeps
    it separate from execution and from the external browser-hands CDP tool.
    """
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "browser not available"}
        if url and url != "about:blank":
            try:
                if page.url == "about:blank":
                    page.goto(url, timeout=8000, wait_until="domcontentloaded")
            except Exception as e:
                return {"ok": False, "error": f"{type(e).__name__}: {e}"}
        return {
            "ok": True,
            "context": context,
            "contextId": f"{_browser_id}:operator",
            "browserId": _browser_id,
            "purpose": "authoring",
            "transport": "playwright",
        }


def browser_context_destroy() -> dict:
    """POST /api/browser/context/destroy — закрыть страницу и браузер."""
    global _page, _browser_obj, _connected, _browser_id
    with _lock:
        if _page is not None:
            try:
                _page.close()
            except Exception:
                pass
            _page = None
        if _browser_obj is not None:
            try:
                _browser_obj.close()
            except Exception:
                pass
            _browser_obj = None
        _connected = False
        logger.info("browser_service: authoring browser destroyed")
        return {"ok": True}