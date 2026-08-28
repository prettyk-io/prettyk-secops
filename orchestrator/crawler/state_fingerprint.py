# -*- coding: utf-8 -*-
"""State Fingerprinting for Playwright SPA/State Crawler."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlsplit, urlunsplit


def extract_route(url: str) -> str:
    """Normalize URL to SPA route (including hash-routes like /#/dashboard)."""
    if not url:
        return "/"
    parts = urlsplit(url)
    path = parts.path or "/"
    # SPA hash routing e.g. http://localhost:3000/#/dashboard
    if parts.fragment:
        frag = parts.fragment.split("?")[0].split("&")[0]
        if frag.startswith("/"):
            return f"#{frag}"
        return f"#{frag}"
    return path


def normalize_url(url: str) -> str:
    """Strip tracking / ephemeral query parameters from URL."""
    if not url:
        return ""
    parts = urlsplit(url)
    from urllib.parse import parse_qsl, urlencode

    # Filter query
    filtered_query = ""
    if parts.query:
        pairs = [
            (k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
            if k.lower() not in {"_", "ts", "timestamp", "cb", "cachebuster", "v", "ver", "utm_source", "utm_medium"}
        ]
        if pairs:
            filtered_query = urlencode(pairs)

    # Filter fragment query (hash-routing e.g. /#/home?utm_source=...)
    filtered_frag = parts.fragment
    if parts.fragment and "?" in parts.fragment:
        fpath, fquery = parts.fragment.split("?", 1)
        fpairs = [
            (k, v) for k, v in parse_qsl(fquery, keep_blank_values=True)
            if k.lower() not in {"_", "ts", "timestamp", "cb", "cachebuster", "v", "ver", "utm_source", "utm_medium"}
        ]
        filtered_frag = f"{fpath}?{urlencode(fpairs)}" if fpairs else fpath

    return urlunsplit((parts.scheme, parts.netloc, parts.path, filtered_query, filtered_frag))


def extract_accessible_digest(ax_nodes: Sequence[Dict[str, Any]]) -> str:
    """Create a stable digest from AX nodes (role, name, value_class, disabled state)."""
    items = []
    for node in ax_nodes:
        if not isinstance(node, dict):
            continue
        role = str(node.get("role") or "").strip().lower()
        name = str(node.get("name") or "").strip()
        # Skip generic non-interactive containers without name
        if role in {"generic", "none", "presentation", "paragraph"} and not name:
            continue
        disabled = bool(node.get("disabled", False))
        items.append(f"{role}:{name}:d={int(disabled)}")
    items.sort()
    raw = "|".join(items)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def compute_state_fingerprint(
    url: str,
    *,
    route: str = "",
    ax_nodes: Optional[Sequence[Dict[str, Any]]] = None,
    headings: Optional[Sequence[str]] = None,
    dialogs: Optional[Sequence[str]] = None,
    tabs: Optional[Sequence[str]] = None,
    active_controls: Optional[Sequence[str]] = None,
    dom_snippet: str = "",
) -> str:
    """
    Compute canonical state fingerprint for a crawler state.

    Components:
      - route (e.g. /#/login or /#/dashboard)
      - visible accessible controls digest
      - visible headings
      - modal / dialog identity
      - active tabs / views
    """
    effective_route = route or extract_route(url)
    ax_digest = extract_accessible_digest(ax_nodes or [])
    
    clean_headings = sorted(set(h.strip() for h in (headings or []) if h and h.strip()))
    clean_dialogs = sorted(set(d.strip() for d in (dialogs or []) if d and d.strip()))
    clean_tabs = sorted(set(t.strip() for t in (tabs or []) if t and t.strip()))
    clean_controls = sorted(set(c.strip() for c in (active_controls or []) if c and c.strip()))

    blob = json.dumps(
        {
            "route": effective_route,
            "ax_digest": ax_digest,
            "headings": clean_headings,
            "dialogs": clean_dialogs,
            "tabs": clean_tabs,
            "controls": clean_controls,
        },
        sort_keys=True,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:20]
