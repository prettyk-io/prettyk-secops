# -*- coding: utf-8 -*-
"""Discovery Engine — Session dispatcher.

In-memory store: start/stop/compile сессий. Никаких БД.
Как _ATTACK_SESSIONS в intruder_engine.py.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

_LOCK = threading.Lock()
_SESSIONS: dict[str, dict[str, Any]] = {}
_SESSION_TTL = 3600


def _uid() -> str:
    return f"disc_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def start_session(target_url: str, persona_context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    session_id = _uid()
    origin = (target_url or "").strip()
    session: dict[str, Any] = {
        "session_id": session_id,
        "target": {"origin": origin, "started_at": _now()},
        "persona_context": persona_context or {
            "auth_subject_kind": "anonymous",
            "granted_capabilities": [],
            "feature_flags": [],
            "locale": "ru-RU",
            "viewport_profile": "desktop",
        },
        "page_families": [],
        "transitions": [],
        "status": "active",
        "stopped_at": None,
    }
    with _LOCK:
        _SESSIONS[session_id] = session
    return session


def stop_session(session_id: str, ir_dir: str = "reports/live") -> dict[str, Any]:
    with _LOCK:
        s = _SESSIONS.get(session_id)
        if not s:
            return {"ok": False, "error": "session_not_found"}
        s["status"] = "stopped"
        s["stopped_at"] = _now()

    os.makedirs(ir_dir, exist_ok=True)
    ir_path = os.path.join(ir_dir, f"discovery_{session_id}.json")
    with open(ir_path, "w", encoding="utf-8") as fh:
        json.dump(s, fh, ensure_ascii=False, indent=2, default=str)

    return {"ok": True, "session_id": session_id, "ir_path": ir_path, "status": "stopped"}


def compile_session(session_id: str, existing_wired: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Compile IR to wired. If existing_wired is provided, incremental merge.

    Incremental merge preserves:
    - Manually edited selectors (trust = manual-edited)
    - Element ordering within pages
    - Disappeared elements marked _removed, not deleted
    - Existing data bindings, only new value_classes appended
    """
    from utils.discovery_compiler import compile_wired, merge_wired

    with _LOCK:
        s = _SESSIONS.get(session_id)

    if not s:
        return {"ok": False, "error": "session_not_found"}

    flattened = _flatten_for_compiler(s)
    try:
        if existing_wired:
            wired = merge_wired(existing_wired, flattened)
            mode = "merge"
        else:
            wired = compile_wired(flattened)
            mode = "fresh"
        return {
            "ok": True,
            "session_id": session_id,
            "wired": wired,
            "status": "compiled",
            "compile_mode": mode,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _flatten_for_compiler(session: dict[str, Any]) -> dict[str, Any]:
    pages = []
    for pf in session.get("page_families", []) or []:
        for sv in pf.get("variants", []) or []:
            revs = sv.get("revisions", []) or []
            if not revs:
                continue
            rev = revs[-1]
            elements = rev.get("elements", []) or []
            flat_els = []
            for i, el in enumerate(elements):
                flat_els.append({
                    "id": el.get("semantic_name", f"el_{i}"),
                    "label": el.get("semantic_name", ""),
                    "accessible_name": el.get("semantic_name", ""),
                    "value_class": el.get("value_class", "unknown"),
                    "candidates": el.get("candidates", []),
                })
            pages.append({
                "name": sv.get("description", pf.get("route", "")),
                "url": pf.get("route", "/"),
                "elements": flat_els,
            })

    return {
        "pages": pages,
        "target_url": session.get("target", {}).get("origin", ""),
        "project_id": "discovery",
        "initiator": "Discovery Engine",
    }


def get_session(session_id: str) -> Optional[dict[str, Any]]:
    with _LOCK:
        return _SESSIONS.get(session_id)


def create_or_update_family(
    session_id: str,
    family_id: str,
    route: str,
    elements: list[dict[str, Any]],
    evidence: Optional[dict[str, Any]] = None,
    persona_hash: str = "",
) -> Optional[dict[str, Any]]:
    from utils.discovery_candidate_builder import build_candidates

    built = build_candidates(elements)

    rev_id = f"rev_{int(time.time() * 1000)}"

    with _LOCK:
        s = _SESSIONS.get(session_id)
        if not s:
            return None

        pf = None
        for p in s.setdefault("page_families", []):
            if p.get("family_id") == family_id:
                pf = p
                break

        if pf is None:
            pf = {
                "family_id": family_id,
                "route": route,
                "persona_hash": persona_hash,
                "variants": [],
            }
            s["page_families"].append(pf)

        variant_id = family_id.replace("pf_", "sv_") + "_main"
        sv = None
        for v in pf.setdefault("variants", []):
            if v.get("variant_id") == variant_id:
                sv = v
                break

        if sv is None:
            sv = {
                "variant_id": variant_id,
                "variant_key": f"{route}-main-form",
                "description": f"Main state for {route}",
                "revisions": [],
                "expansions": [],
            }
            pf["variants"].append(sv)

        revs = sv.setdefault("revisions", [])
        parent = revs[-1]["revision_id"] if revs else None
        rev = {
            "revision_id": rev_id,
            "parent_revision_id": parent,
            "created_at": _now(),
            "ax_hash": "",
            "fingerprint": {"element_count": len(built)},
            "elements": built,
            "evidence": evidence or {"screenshot_ref": "", "ax_tree_ref": "", "wireframe_svg_ref": ""},
        }
        revs.append(rev)
        return s


def add_transition(
    session_id: str,
    from_variant: str,
    action_type: str,
    action_target: str,
    to_variant: str,
    url_change: str = "",
    response_class: str = "",
) -> Optional[dict[str, Any]]:
    tr_id = f"tr_{int(time.time() * 1000)}"
    transition = {
        "transition_id": tr_id,
        "from_variant": from_variant,
        "action": {"type": action_type, "target": action_target},
        "to_variant": to_variant,
        "observed_outcome": {
            "url_change": url_change,
            "response_class": response_class,
            "visible_assertions": [],
        },
    }
    with _LOCK:
        s = _SESSIONS.get(session_id)
        if not s:
            return None
        s.setdefault("transitions", []).append(transition)
        return s


_clean_route = re.compile(r"[?#].*")


def route_from_url(url: str) -> str:
    return _clean_route.sub("", url or "")