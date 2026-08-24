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