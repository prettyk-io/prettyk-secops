# -*- coding: utf-8 -*-
"""Lightweight CDP browser service for Studio Browser Panel.

Manages a Playwright connection to Chrome CDP (localhost:9222).
Used by the /api/browser/* endpoints in data_playground.py.
"""
from __future__ import annotations

import base64
import io
import logging
import threading
from typing import Optional

logger = logging.getLogger("orchestrator.browser")

_CDP_ENDPOINT = "http://127.0.0.1:9222"
_lock = threading.Lock()
_page: Optional[object] = None
_pw: Optional[object] = None
_browser_obj: Optional[object] = None
_connected = False


def _get_page():
    """Lazy-connect to CDP Chrome. Returns (page, True) on success, (None, False) on failure."""
    # Return cached page if browser is still alive
    global _page, _pw, _browser_obj, _connected
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
        _browser_obj = _pw.chromium.connect_over_cdp(_CDP_ENDPOINT)
        contexts = _browser_obj.contexts
        if contexts:
            pages = contexts[0].pages
            if pages:
                _page = pages[0]
            else:
                _page = contexts[0].new_page()
        else:
            ctx = _browser_obj.new_context()
            _page = ctx.new_page()

        _connected = True
        logger.info("browser_service: connected to CDP %s", _CDP_ENDPOINT)
        return _page
    except Exception as e:
        logger.warning("browser_service: CDP connect failed: %s", e)
        _page = None
        _connected = False
        return None


def browser_status() -> dict:
    """GET /api/browser/status — check CDP connection and get current page info."""
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": True, "connected": False, "url": None, "title": None}

        try:
            url = page.evaluate("window.location.href")
            title = page.evaluate("document.title")
            return {"ok": True, "connected": True, "url": url, "title": title}
        except Exception as e:
            return {"ok": True, "connected": False, "url": None, "title": None, "error": str(e)}


def browser_navigate(url: str) -> dict:
    """POST /api/browser/navigate — go to URL."""
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "CDP browser not available"}

        try:
            page.goto(url, timeout=15000, wait_until="domcontentloaded")
            title = page.evaluate("document.title")
            return {"ok": True, "url": page.evaluate("window.location.href"), "title": title}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def browser_screenshot() -> dict:
    """POST /api/browser/screenshot — take viewport screenshot, return base64 PNG."""
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "CDP browser not available"}

        try:
            data = page.screenshot(type="png", full_page=False)
            b64 = base64.b64encode(data).decode("utf-8")
            return {"ok": True, "screenshot": f"data:image/png;base64,{b64}", "format": "png"}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def browser_highlight(selector: str, strategy: str = "css") -> dict:
    """POST /api/browser/highlight — highlight an element by selector.

    Uses a temporary overlay to draw a colored border around the element.
    """
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "CDP browser not available"}

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
            return {"ok": False, "error": "CDP browser not available"}

        try:
            result = page.evaluate(expression)
            return {"ok": True, "result": result}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}


# ---------------------------------------------------------------------------
# CDP observe — live click capture for POC-CDP-1 / CDP-WIRE Phase 1
# ---------------------------------------------------------------------------

_observe_active = False
_observed_events: list[dict] = []
_observe_last_event_id = 0
_observe_page = None  # page, на которой установлен expose_binding


def _find_ax_node_for_element(page, element_info: dict) -> dict | None:
    """Walk page.accessibility.snapshot() to find AX node matching clicked element."""
    try:
        ax = page.accessibility.snapshot()
    except Exception:
        return None
    if ax is None:
        return None

    target_role = (element_info.get("tag") or "").lower()

    best: dict | None = None
    best_dist = float("inf")

    def walk(node: dict) -> None:
        nonlocal best, best_dist
        if not isinstance(node, dict):
            return
        role = str(node.get("role") or "").strip().lower()
        # Score: role match first (AX snapshot has no rect — first role match wins)
        if role and (role == target_role or (target_role in ("input", "textarea") and role in ("textbox", "searchbox"))):
            if 0 < best_dist:
                best = node
                best_dist = 0
        children = node.get("children")
        if isinstance(children, list):
            for child in children:
                if isinstance(child, dict):
                    walk(child)

    walk(ax)
    return best


def _on_click(event_info: dict) -> None:
    """Обработать один клик (вызывается из JS через expose_binding).

    Module-level, чтобы быть доступной из binding-колбэка (не NameError).
    """
    global _observe_last_event_id
    _observe_last_event_id += 1
    evt = {
        "eventId": f"cdp-{_observe_last_event_id}",
        "timestamp": __import__("time").time(),
        "action": "click",
        "element": {
            "tag": event_info.get("tag", ""),
            "id": event_info.get("id", ""),
            "classes": event_info.get("classes", ""),
            "text": (event_info.get("text") or "")[:80],
            "rect": event_info.get("rect", {"x": 0, "y": 0, "w": 0, "h": 0}),
        },
    }

    # Merge AX snapshot info
    page = _observe_page
    if page is not None:
        ax_node = _find_ax_node_for_element(page, event_info)
        if ax_node:
            evt["element"]["role"] = str(ax_node.get("role") or "").strip().lower()
            evt["element"]["accessibleName"] = str(ax_node.get("name") or "").strip()
            # Classify value (secret/email/phone)
            try:
                from utils.discovery_element_extractor import _classify_value
                evt["valueClass"] = _classify_value(ax_node)
            except ImportError:
                evt["valueClass"] = "unknown"

    # Build candidate locators
    try:
        from utils.discovery_candidate_builder import build_candidates
        el_for_candidate = {
            "test_id": event_info.get("dataTestId", ""),
            "clean_id": event_info.get("id", "") if event_info.get("id") and not event_info.get("id", "").startswith(":") else "",
            "accessible_name": evt["element"].get("accessibleName", ""),
            "role": evt["element"].get("role", ""),
            "label_for": "",
            "placeholder": event_info.get("placeholder", ""),
            "name_attr": event_info.get("name", ""),
            "tag": event_info.get("tag", ""),
        }
        candidates = build_candidates([el_for_candidate])
        if candidates and candidates[0].get("candidates"):
            evt["candidates"] = candidates[0]["candidates"]
    except Exception:
        evt["candidates"] = []

    # Ambiguity: if best candidate is non-unique and weak
    evt["isAmbiguous"] = False
    cands = evt.get("candidates", [])
    if cands:
        best = cands[0]
        if not best.get("unique") and best.get("score", 0) < 0.7:
            evt["isAmbiguous"] = True

    _observed_events.append(evt)


def _binding_handler(*args) -> None:
    """Playwright expose_binding callback: последний аргумент — info-словарь из JS."""
    if not args:
        return
    info = args[-1]
    if isinstance(info, dict) and info.get("tag"):
        _on_click(info)


def browser_observe_start() -> dict:
    """POST /api/browser/observe/start — begin capturing CDP click events."""
    global _observe_active, _observed_events, _observe_last_event_id, _observe_page
    with _lock:
        page = _get_page()
        if page is None:
            return {"ok": False, "error": "CDP browser not available"}

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
                    document.addEventListener('click', function(e) {
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
                    }, true);
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
                page.evaluate("window.__pk_cdp_click_listener__ = false;")
            except Exception:
                pass
        _observe_page = None

        logger.info("browser_observe_stop: %d events discarded", count)
        return {"ok": True, "eventsDiscarded": count}


def browser_observe_event() -> dict:
    """POST /api/browser/observe/event — pop one observed event (or return empty).

    События попадают в очередь через expose_binding (живой клик), а не через
    poll evaluate. Здесь только чтение очереди — никаких вызовов _on_click.
    """
    global _observe_active, _observed_events

    with _lock:
        if not _observe_active:
            return {"ok": True, "connected": False, "observing": False}

        if _observed_events:
            evt = _observed_events.pop(0)
            return {"ok": True, "connected": True, "observing": True, "event": evt}

        return {"ok": True, "connected": True, "observing": True, "event": None}