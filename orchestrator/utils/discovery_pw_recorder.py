# -*- coding: utf-8 -*-
"""PW-4: Playwright Discovery Recorder.

Replaces raw CDP listener with Playwright-native API.

Pipeline:
  open URL → snapshot AX → extract candidates → detect forms
  → click/fill/submit → capture network + DOM after → build transitions → seed ZAP

Uses:
  - page.accessibility.snapshot() instead of CDP AX nodes
  - page.route() / page.on('request') / page.on('response') instead of Network.enable
  - page.on('console') / page.on('pageerror') for error collection
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Callable, Optional

from lab.discovery_session import (
    add_transition,
    create_or_update_family,
    get_session,
    route_from_url,
)
from utils.discovery_element_extractor import extract_elements

logger = logging.getLogger(__name__)

__all__ = [
    "DiscoveryRecorder",
    "discover_page",
    "AXSnapshot",
    "NetworkEvent",
]


class AXSnapshot:
    """Thin wrapper around page.accessibility.snapshot() result."""

    def __init__(self, raw: dict[str, Any] | None, url: str = "", title: str = ""):
        self.raw: dict[str, Any] = raw or {}
        self.url: str = url or ""
        self.title: str = title or ""
        self.ts: float = time.time()

    def flatten(self) -> list[dict[str, Any]]:
        nodes: list[dict[str, Any]] = []

        def walk(node: dict[str, Any]) -> None:
            if not isinstance(node, dict):
                return
            nodes.append(node)
            children = node.get("children")
            if isinstance(children, list):
                for child in children:
                    if isinstance(child, dict):
                        walk(child)

        walk(self.raw)
        return nodes

    def interactive_nodes(self) -> list[dict[str, Any]]:
        return extract_elements(self.flatten())


class NetworkEvent:
    """Recorded network request/response pair."""

    def __init__(
        self,
        url: str = "",
        method: str = "GET",
        status: int = 0,
        request_headers: dict[str, str] | None = None,
        response_headers: dict[str, str] | None = None,
        body: str = "",
        ts: float = 0,
    ):
        self.url = url
        self.method = method
        self.status = status
        self.request_headers: dict[str, str] = request_headers or {}
        self.response_headers: dict[str, str] = response_headers or {}
        self.body = body
        self.ts = ts or time.time()

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "method": self.method,
            "status": self.status,
            "request_headers": self.request_headers,
            "response_headers": self.response_headers,
            "body_snippet": self.body[:2000] if self.body else "",
            "ts": self.ts,
        }


class DiscoveryRecorder:
    """Instrument a Playwright Page for discovery recording.

    Usage:
        recorder = DiscoveryRecorder(session_id, page, adapter)
        recorder.start()
        page.goto("https://example.com")
        recorder.snapshot()           # after page load
        recorder.fill("username", "admin")
        recorder.click("Login")
        recorder.snapshot()           # after transition
        result = recorder.stop()
    """

    def __init__(
        self,
        session_id: str,
        page,
        adapter=None,
    ):
        self._session_id = session_id
        self._page = page
        self._adapter = adapter
        self._network_events: list[NetworkEvent] = []
        self._console_errors: list[str] = []
        self._page_errors: list[str] = []
        self._last_url = page.url if page else ""
        self._last_action: tuple[str, str] = ("", "")
        self._started = False

    # ------------------------------------------------------------------
    # life cycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Attach listeners to the page."""
        if self._started:
            return
        self._started = True

        page = self._page
        if page is None:
            return

        def _on_request(request) -> None:
            self._network_events.append(
                NetworkEvent(
                    url=request.url,
                    method=request.method,
                    request_headers=dict(request.headers),
                    ts=time.time(),
                )
            )

        def _on_response(response) -> None:
            # Match with last request to the same URL and update status
            for ev in reversed(self._network_events):
                if ev.url == response.url and ev.status == 0:
                    ev.status = response.status
                    ev.response_headers = dict(response.headers)
                    try:
                        ev.body = response.text()[:4000]
                    except Exception:
                        pass
                    break

        def _on_console(msg) -> None:
            if msg.type in ("error", "warning"):
                self._console_errors.append(f"[{msg.type}] {msg.text}")

        def _on_page_error(err) -> None:
            self._page_errors.append(str(err))

        page.on("request", _on_request)
        page.on("response", _on_response)
        page.on("console", _on_console)
        page.on("pageerror", _on_page_error)

    def stop(self) -> dict[str, Any]:
        """Return the collected IR session."""
        session = get_session(self._session_id)
        if not session:
            return {"ok": False, "error": "session_not_found", "session_id": self._session_id}
        return {
            "ok": True,
            "session_id": self._session_id,
            "session": session,
            "network_events": len(self._network_events),
            "console_errors": self._console_errors,
            "page_errors": self._page_errors,
        }

    # ------------------------------------------------------------------
    # actions
    # ------------------------------------------------------------------

    def navigate(self, url: str) -> None:
        """Navigate to URL and register the page family."""
        page = self._page
        if page is None:
            return
        page.goto(url, wait_until="domcontentloaded")
        self._last_url = page.url
        route = route_from_url(page.url)
        family_id = f"pf_{_safe_id(route)}"
        create_or_update_family(
            session_id=self._session_id,
            family_id=family_id,
            route=route,
            elements=[],
            evidence={"screenshot_ref": "", "ax_tree_ref": "", "wireframe_svg_ref": ""},
        )

    def snapshot(self) -> AXSnapshot:
        """Capture current page state: AX tree → elements → session IR."""
        page = self._page
        if page is None:
            return AXSnapshot(None)

        url = page.url
        route = route_from_url(url or "")
        family_id = f"pf_{_safe_id(route)}"

        try:
            raw = page.accessibility.snapshot()
        except Exception as exc:
            logger.warning("Discovery AX snapshot failed: %s", exc)
            raw = None

        try:
            title = page.title()
        except Exception:
            title = ""

        snap = AXSnapshot(raw, url=url, title=title)
        elements = snap.interactive_nodes()
        raw_elements = [el for el in elements]  # already dicts

        create_or_update_family(
            session_id=self._session_id,
            family_id=family_id,
            route=route,
            elements=raw_elements,
            evidence={
                "screenshot_ref": "",
                "ax_tree_ref": "",
                "wireframe_svg_ref": "",
            },
        )

        self._last_url = url
        return snap

    def click(self, target: str) -> None:
        """Click a semantic element and record the transition."""
        page = self._page
        if page is None:
            return
        from_url = page.url

        try:
            # Try by accessible name first
            page.get_by_role("button", name=target).first.click(timeout=5000)
        except Exception:
            try:
                page.get_by_role("link", name=target).first.click(timeout=5000)
            except Exception:
                try:
                    page.get_by_text(target).first.click(timeout=5000)
                except Exception as exc:
                    logger.warning("Discovery click failed for %r: %s", target, exc)
                    return

        page.wait_for_load_state("domcontentloaded")
        to_url = page.url

        from_route = route_from_url(from_url or "")
        to_route = route_from_url(to_url or "")
        from_var = f"sv_{_safe_id(from_route)}_main"
        to_var = f"sv_{_safe_id(to_route)}_main"

        add_transition(
            session_id=self._session_id,
            from_variant=from_var,
            action_type="click",
            action_target=target,
            to_variant=to_var,
            url_change=to_route,
            response_class="",
        )

        self._last_url = to_url
        self._last_action = ("click", target)

    def fill(self, target: str, value: str) -> None:
        """Fill an input by label/name and record the transition."""
        page = self._page
        if page is None:
            return
        from_url = page.url

        try:
            page.get_by_label(target).fill(value, timeout=5000)
        except Exception:
            try:
                page.get_by_placeholder(target).fill(value, timeout=5000)
            except Exception as exc:
                logger.warning("Discovery fill failed for %r: %s", target, exc)
                return

        self._last_action = ("fill", target)

    def submit(self, form_selector: str = "form") -> bool:
        """Submit the first visible form."""
        page = self._page
        if page is None:
            return False
        from_url = page.url
        try:
            page.locator(form_selector).first.press("Enter", timeout=5000)
            page.wait_for_load_state("domcontentloaded")
        except Exception as exc:
            logger.warning("Discovery submit failed: %s", exc)
            return False

        to_url = page.url
        from_route = route_from_url(from_url or "")
        to_route = route_from_url(to_url or "")
        from_var = f"sv_{_safe_id(from_route)}_main"
        to_var = f"sv_{_safe_id(to_route)}_main"

        add_transition(
            session_id=self._session_id,
            from_variant=from_var,
            action_type="submit",
            action_target="form",
            to_variant=to_var,
            url_change=to_route,
            response_class="",
        )
        self._last_url = to_url
        return True

    # ------------------------------------------------------------------
    # probes
    # ------------------------------------------------------------------

    def network_dump(self, limit: int = 50) -> list[dict[str, Any]]:
        return [ev.to_dict() for ev in self._network_events[-limit:]]

    def console_dump(self) -> list[str]:
        return list(self._console_errors)

    def page_errors_dump(self) -> list[str]:
        return list(self._page_errors)


def _safe_id(text: str) -> str:
    clean = (text or "").strip().strip("/").replace("https://", "").replace("http://", "")
    result = "".join(c if c.isalnum() or c in "_-" else "_" for c in clean)
    return result[:40] or "root"


def discover_page(
    session_id: str,
    page,
    url: str,
    *,
    adapter=None,
    click_buttons: list[str] | None = None,
    fill_fields: list[tuple[str, str]] | None = None,
) -> dict[str, Any]:
    """One-shot discovery of a single page.

    Returns IR session dict after the pipeline completes.
    """
    recorder = DiscoveryRecorder(session_id, page, adapter)
    recorder.start()
    recorder.navigate(url)
    recorder.snapshot()

    for label, value in (fill_fields or []):
        recorder.fill(label, value)

    for button in (click_buttons or []):
        recorder.click(button)
        recorder.snapshot()

    return recorder.stop()