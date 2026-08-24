# -*- coding: utf-8 -*-
"""Discovery Engine — CDP Recorder (legacy, delegated to PW-4).

PW-4: Now delegates to discovery_pw_recorder.py for Playwright-native API.
Kept for backwards-compat — callers may still import from this module.
"""
from __future__ import annotations

from typing import Any, Optional

from utils.discovery_pw_recorder import (
    AXSnapshot,
    DiscoveryRecorder,
    NetworkEvent,
    _safe_id,
    discover_page,
)
from lab.discovery_session import (
    create_or_update_family,
    add_transition,
    get_session,
    route_from_url,
)
from utils.discovery_element_extractor import extract_elements


def record_navigate(session_id: str, url: str) -> Optional[dict[str, Any]]:
    """Record a navigation event: creates/updates page family for the URL."""
    if not url:
        return get_session(session_id)

    route = route_from_url(url)
    family_id = f"pf_{_safe_id(route)}"

    return create_or_update_family(
        session_id=session_id,
        family_id=family_id,
        route=route,
        elements=[],
        evidence={"screenshot_ref": "", "ax_tree_ref": "", "wireframe_svg_ref": ""},
    )


def record_ax_snapshot(
    session_id: str,
    url: str,
    ax_nodes: list[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Process accessibility snapshot: extract elements, build candidates, store in IR.

    Backwards-compat wrapper — prefers Playwright-native snapshot via discovery_pw_recorder.
    """
    route = route_from_url(url or "")
    family_id = f"pf_{_safe_id(route)}"

    raw_elements = extract_elements(ax_nodes)

    return create_or_update_family(
        session_id=session_id,
        family_id=family_id,
        route=route,
        elements=raw_elements,
        evidence={"screenshot_ref": "", "ax_tree_ref": "", "wireframe_svg_ref": ""},
    )


def record_action(
    session_id: str,
    from_url: str,
    action_type: str,  # click, fill, navigate
    action_target: str,  # element semantic_name
    to_url: str,
    response_class: str = "",
) -> Optional[dict[str, Any]]:
    """Record a user action (click/fill/navigate) as a transition."""
    from_route = route_from_url(from_url or "")
    to_route = route_from_url(to_url or "")
    from_var = f"sv_{_safe_id(from_route)}_main"
    to_var = f"sv_{_safe_id(to_route)}_main"

    return add_transition(
        session_id=session_id,
        from_variant=from_var,
        action_type=action_type,
        action_target=action_target,
        to_variant=to_var,
        url_change=to_route,
        response_class=response_class,
    )