# -*- coding: utf-8 -*-
"""PW-6: Unified probes layer for Playwright — read-only page state.

Consumer-agnostic contract — discovery, regression, CDP-agent, fuzzing
all use the same probe primitives.

Every probe:
  - Takes a Playwright Page as first positional argument
  - Returns Dict[str, Any] with at least {"ok": True/False}
  - Never mutates page state
  - Raises no exceptions — errors are returned via {"ok": False, "error": "..."}
"""
from __future__ import annotations

import time
from typing import Any

__all__ = [
    "probe_url",
    "probe_title",
    "probe_heading",
    "probe_state",
    "probe_ax",
    "probe_network_traffic",
    "probe_element_exists",
    "probe_element_count",
    "probe_text_visible",
    "probe_screenshot",
]


def _page(page: Any) -> Any | None:
    """Unwrap adapter if needed."""
    if page is None:
        return None
    if hasattr(page, "_page"):
        p = page._page
        return p if p is not None else None
    return page


# ---------------------------------------------------------------------------
# Page-level probes
# ---------------------------------------------------------------------------

def probe_url(page: Any) -> dict[str, Any]:
    """Current URL."""
    p = _page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        return {"ok": True, "url": p.url}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def probe_title(page: Any) -> dict[str, Any]:
    """Current page title."""
    p = _page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        return {"ok": True, "title": p.title()}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def probe_heading(page: Any) -> dict[str, Any]:
    """First visible <h1> text (or title fallback)."""
    p = _page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        h1 = p.locator("h1").first
        if h1.count() > 0:
            return {"ok": True, "heading": h1.inner_text(), "source": "h1"}
        return {"ok": True, "heading": p.title(), "source": "title"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def probe_state(page: Any) -> dict[str, Any]:
    """Aggregated viewport state: URL, title, scroll, viewport size."""
    p = _page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}

    result: dict[str, Any] = {"ok": True, "ts": time.time()}
    try:
        result["url"] = p.url
    except Exception:
        result["url"] = ""

    try:
        result["title"] = p.title()
    except Exception:
        result["title"] = ""

    try:
        vp = p.viewport_size
        result["viewport"] = {"width": vp.get("width", 0) if vp else 0, "height": vp.get("height", 0) if vp else 0}
    except Exception:
        result["viewport"] = {"width": 0, "height": 0}

    try:
        scroll = p.evaluate("() => ({x: window.scrollX, y: window.scrollY})")
        result["scroll"] = scroll
    except Exception:
        result["scroll"] = {"x": 0, "y": 0}

    try:
        result["ready_state"] = p.evaluate("document.readyState")
    except Exception:
        result["ready_state"] = "unknown"

    return result


# ---------------------------------------------------------------------------
# Accessibility / DOM probes
# ---------------------------------------------------------------------------

def probe_ax(page: Any) -> dict[str, Any]:
    """Accessibility snapshot of the current page."""
    p = _page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        raw = p.accessibility.snapshot()
        return {"ok": True, "ax": raw}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "ax": None}


def probe_text_visible(page: Any, text: str) -> dict[str, Any]:
    """Check if text is visible on the page."""
    p = _page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        loc = p.get_by_text(text)
        count = loc.count()
        return {"ok": True, "visible": count > 0, "count": count, "text": text}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "text": text}


def probe_element_exists(page: Any, locator: str) -> dict[str, Any]:
    """Check if an element exists by Playwright locator string."""
    p = _page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        from actions.actions import _resolve_locator  # noqa: PLC0415
        loc = _resolve_locator(p, locator)
        count = loc.count()
        return {"ok": True, "exists": count > 0, "count": count, "locator": locator}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "locator": locator}


def probe_element_count(page: Any, selector: str) -> dict[str, Any]:
    """Count elements matching a CSS selector."""
    p = _page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        count = p.locator(selector).count()
        return {"ok": True, "count": count, "selector": selector}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "selector": selector}


# ---------------------------------------------------------------------------
# Screenshot
# ---------------------------------------------------------------------------

def probe_screenshot(page: Any, *, path: str = "", full_page: bool = False) -> dict[str, Any]:
    """Take a screenshot — returns base64 PNG or saves to path."""
    p = _page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}
    try:
        if path:
            p.screenshot(path=path, full_page=full_page)
            return {"ok": True, "path": path}
        import base64
        raw = p.screenshot(type="png", full_page=full_page)
        return {"ok": True, "png_base64": base64.b64encode(raw).decode("ascii")}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Network probe (in-memory recorder)
# ---------------------------------------------------------------------------

def probe_network_traffic(
    page: Any,
    *,
    limit: int = 30,
) -> dict[str, Any]:
    """Return recently recorded network events from the page's recorder.

    Requires that a DiscoveryRecorder was previously attached to the page
    (otherwise returns empty list).
    """
    p = _page(page)
    if p is None:
        return {"ok": False, "error": "page_not_ready"}

    # Try to reach the recorder attached to the page via a known attribute
    recorder = getattr(p, "_discovery_recorder", None)
    if recorder is None:
        return {"ok": True, "events": [], "note": "no_recorder_attached"}

    try:
        events = recorder.network_dump(limit=limit)
        return {"ok": True, "events": events, "count": len(events)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}