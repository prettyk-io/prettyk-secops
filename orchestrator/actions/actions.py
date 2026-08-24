# -*- coding: utf-8 -*-
"""PW-6: Unified actions layer for Playwright.

Consumer-agnostic contract — discovery, regression, CDP-agent, fuzzing
all use the same action primitives.

Every action:
  - Takes a Playwright Page as first positional argument
  - Returns Dict[str, Any] with at least {"ok": True/False}
  - Raises no exceptions — errors are returned via {"ok": False, "error": "..."}
"""
from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

__all__ = [
    "action_navigate",
    "action_click",
    "action_click_text",
    "action_click_role",
    "action_fill",
    "action_fill_label",
    "action_submit",
    "action_wait_selector",
    "action_wait_url",
    "action_wait_timeout",
    "action_press_key",
    "action_reload",
    "action_auth_http_basic",
]


# ---------------------------------------------------------------------------
# Public action functions
# ---------------------------------------------------------------------------

def _ensure_page(page: Any) -> Any | None:
    """Compatibility shim: if adapter is passed instead of page, unwrap."""
    if page is None:
        return None
    if hasattr(page, "_page"):
        p = page._page
        return p if p is not None else None
    return page


def action_navigate(page: Any, url: str, *, wait_until: str = "domcontentloaded", timeout: int = 30_000) -> dict[str, Any]:
    """Navigate to URL."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        p.goto(url, wait_until=wait_until, timeout=timeout)
        return {"ok": True, "url": p.url}
    except Exception as exc:
        logger.warning("action_navigate(%r): %s", url, exc)
        return {"ok": False, "error": str(exc), "url": url}


def action_click(page: Any, locator: str, *, timeout: int = 10_000) -> dict[str, Any]:
    """Click an element by Playwright locator string (e.g. 'page.getByRole(...)')."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        # Evaluate the locator string as Playwright expression
        loc = _resolve_locator(p, locator)
        loc.click(timeout=timeout)
        return {"ok": True, "locator": locator}
    except Exception as exc:
        logger.warning("action_click(%r): %s", locator, exc)
        return {"ok": False, "error": str(exc), "locator": locator}


def action_click_text(page: Any, text: str, *, exact: bool = True, timeout: int = 10_000) -> dict[str, Any]:
    """Click by visible text."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        p.get_by_text(text, exact=exact).first.click(timeout=timeout)
        return {"ok": True, "text": text}
    except Exception as exc:
        logger.warning("action_click_text(%r): %s", text, exc)
        return {"ok": False, "error": str(exc), "text": text}


def action_click_role(page: Any, role: str, *, name: str = "", timeout: int = 10_000) -> dict[str, Any]:
    """Click by ARIA role + accessible name."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        loc = p.get_by_role(role)
        if name:
            loc = loc.filter(has_text=name)
        loc.first.click(timeout=timeout)
        return {"ok": True, "role": role, "name": name}
    except Exception as exc:
        logger.warning("action_click_role(%r, name=%r): %s", role, name, exc)
        return {"ok": False, "error": str(exc), "role": role, "name": name}


def action_fill(page: Any, locator: str, value: str, *, timeout: int = 10_000) -> dict[str, Any]:
    """Fill an input by Playwright locator string."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        loc = _resolve_locator(p, locator)
        loc.fill(value, timeout=timeout)
        return {"ok": True, "locator": locator, "value": value}
    except Exception as exc:
        logger.warning("action_fill(%r, %r): %s", locator, value, exc)
        return {"ok": False, "error": str(exc), "locator": locator}


def action_fill_label(page: Any, label: str, value: str, *, timeout: int = 10_000) -> dict[str, Any]:
    """Fill by label text (maps to <label for="...">)."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        p.get_by_label(label).fill(value, timeout=timeout)
        return {"ok": True, "label": label, "value": value}
    except Exception as exc:
        logger.warning("action_fill_label(%r, %r): %s", label, value, exc)
        return {"ok": False, "error": str(exc), "label": label}


def action_submit(page: Any, *, form_selector: str = "form", timeout: int = 10_000) -> dict[str, Any]:
    """Submit the first visible form."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        p.locator(form_selector).first.press("Enter", timeout=timeout)
        p.wait_for_load_state("domcontentloaded")
        return {"ok": True, "form": form_selector, "url": p.url}
    except Exception as exc:
        logger.warning("action_submit(%r): %s", form_selector, exc)
        return {"ok": False, "error": str(exc), "form": form_selector}


def action_wait_selector(page: Any, selector: str, *, state: str = "visible", timeout: int = 10_000) -> dict[str, Any]:
    """Wait for a selector to become visible/hidden/attached."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        p.wait_for_selector(selector, state=state, timeout=timeout)
        return {"ok": True, "selector": selector, "state": state}
    except Exception as exc:
        logger.warning("action_wait_selector(%r): %s", selector, exc)
        return {"ok": False, "error": str(exc), "selector": selector}


def action_wait_url(page: Any, pattern: str, *, timeout: int = 15_000) -> dict[str, Any]:
    """Wait for URL to match a glob/regex pattern."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        p.wait_for_url(pattern, timeout=timeout)
        return {"ok": True, "pattern": pattern, "url": p.url}
    except Exception as exc:
        logger.warning("action_wait_url(%r): %s", pattern, exc)
        return {"ok": False, "error": str(exc), "pattern": pattern}


def action_wait_timeout(page: Any, seconds: float = 1.0) -> dict[str, Any]:
    """Explicit sleep."""
    time.sleep(float(seconds))
    return {"ok": True, "seconds": seconds}


def action_press_key(page: Any, key: str) -> dict[str, Any]:
    """Press a keyboard key."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        p.keyboard.press(key)
        return {"ok": True, "key": key}
    except Exception as exc:
        logger.warning("action_press_key(%r): %s", key, exc)
        return {"ok": False, "error": str(exc), "key": key}


def action_reload(page: Any) -> dict[str, Any]:
    """Reload the current page."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        p.reload(wait_until="domcontentloaded")
        return {"ok": True, "url": p.url}
    except Exception as exc:
        logger.warning("action_reload: %s", exc)
        return {"ok": False, "error": str(exc)}


def action_auth_http_basic(page: Any, username: str, password: str) -> dict[str, Any]:
    """Set HTTP Basic Auth credentials for the context."""
    p = _ensure_page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        ctx = p.context
        ctx.set_http_credentials({"username": username, "password": password})
        return {"ok": True}
    except Exception as exc:
        logger.warning("action_auth_http_basic: %s", exc)
        return {"ok": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_locator(page: Any, expr: str) -> Any:
    """Resolve a Playwright locator expression.

    Supports:
      - 'page.locator("css")'  → page.locator(...)
      - 'page.getByRole(...)'  → page.get_by_role(...)
      - 'page.getByLabel(...)' → page.get_by_label(...)
      - 'page.getByTestId(...)'→ page.get_by_test_id(...)
      - 'page.getByText(...)'  → page.get_by_text(...)
      - 'page.getByPlaceholder(...)' → page.get_by_placeholder(...)
      - bare CSS string → page.locator(css)
    """
    expr = (expr or "").strip()
    if not expr:
        raise ValueError("empty locator expression")

    if expr.startswith("page."):
        method_map: dict[str, str] = {
            "getByRole": "get_by_role",
            "getByLabel": "get_by_label",
            "getByTestId": "get_by_test_id",
            "getByText": "get_by_text",
            "getByPlaceholder": "get_by_placeholder",
            "locator": "locator",
        }
        for js_name, py_name in method_map.items():
            prefix = f"page.{js_name}("
            if expr.startswith(prefix):
                tail = expr[len(prefix):].rstrip(")")
                method = getattr(page, py_name)
                return _call_with_literal(method, tail)
        raise ValueError(f"unsupported locator expression: {expr}")

    return page.locator(expr)


def _call_with_literal(method: Any, args_str: str) -> Any:
    """Call a Playwright locator method with a single string literal arg.

    Handles both positional and keyword forms:
      "button", {name: "Submit"}
      "button"
    """
    args_str = args_str.strip()
    if not args_str:
        return method()

    # Check for {name: ...} keyword
    brace = args_str.find("{")
    if brace >= 0:
        pos_part = args_str[:brace].rstrip(",").strip()
        kw_part = args_str[brace:]
        loc = method(pos_part) if pos_part else method()

        # Crude keyword parse: {name: "X"} or {name: "X", exact: true}
        import re
        name_match = re.search(r'name:\s*["\']([^"\']+)["\']', kw_part)
        if name_match:
            loc = loc.filter(has_text=name_match.group(1))
        return loc

    return method(args_str.strip('"').strip("'"))