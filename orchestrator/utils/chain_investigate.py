# -*- coding: utf-8 -*-
"""РасследованиеЦепи helpers (8a/8b/8c). Not CANON hub."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlparse

# Quick caps for spider / active / passive wait inside investigation wrap.
INV_QUICK_TIMEOUT_MIN = 1

_AUTH_BEARER = "Bearer Token"
_AUTH_COOKIE = "На основе Cookie"
_REPLACER_PREFIX = "kdt-auth"


def seed_prettyk_investigate_chain(module_or_as: str) -> str:
    mid = (module_or_as or "").strip()
    return f"РасследованиеЦепи {mid}" if mid else ""


def hosts_from_har_path(har_path: Path) -> List[str]:
    """Unique origins ``scheme://netloc`` from HAR request URLs."""
    path = Path(har_path)
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    entries = (data.get("log") or {}).get("entries") or []
    seen = set()
    out: List[str] = []
    for ent in entries:
        if not isinstance(ent, dict):
            continue
        req = ent.get("request") or {}
        url = str(req.get("url") or "").strip()
        if not url:
            continue
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            continue
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin in seen:
            continue
        seen.add(origin)
        out.append(origin)
    return out


def ephemeral_context_name(module_id: str) -> str:
    mid = (module_id or "chain").strip() or "chain"
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in mid)[:48]
    return f"kdt-inv-{safe}"


def investigation_log_name(module_id: str) -> str:
    mid = (module_id or "chain").strip() or "chain"
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in mid)[:48]
    return f"chain-inv-{safe}"


def _header_map(headers: Any) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if not isinstance(headers, list):
        return out
    for h in headers:
        if not isinstance(h, dict):
            continue
        name = str(h.get("name") or "").strip()
        if not name:
            continue
        out[name.lower()] = str(h.get("value") or "")
    return out


def extract_auth_from_har(har_path: Path) -> Dict[str, Any]:
    """
    First Authorization Bearer or Cookie from HAR → apply_zap_auth shape.
    Never put raw token into returned notes.
    """
    result: Dict[str, Any] = {
        "found": False,
        "auth_type": "",
        "auth_details": {},
        "notes": [],
    }
    path = Path(har_path)
    if not path.is_file():
        result["notes"].append("auth_har_missing")
        return result
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        result["notes"].append("auth_har_unreadable")
        return result
    entries = (data.get("log") or {}).get("entries") or []
    # Prefer last entry with auth (post-materialize bindings live there).
    for ent in reversed(list(entries)):
        if not isinstance(ent, dict):
            continue
        hit = _auth_from_headers(_header_map((ent.get("request") or {}).get("headers")))
        if hit is not None:
            result.update(hit)
            return result
    result["notes"].append("auth_none_in_har")
    return result


def _auth_from_headers(headers: Dict[str, str]) -> Optional[Dict[str, Any]]:
    auth = headers.get("authorization", "").strip()
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token:
            return {
                "found": True,
                "auth_type": _AUTH_BEARER,
                "auth_details": {"Токен": token},
                "notes": ["auth_from_har=Bearer"],
            }
    cookie = headers.get("cookie", "").strip()
    if cookie:
        return {
            "found": True,
            "auth_type": _AUTH_COOKIE,
            "auth_details": {"Cookie": cookie},
            "notes": ["auth_from_har=Cookie"],
        }
    return None


def redact_notes(notes: Sequence[str]) -> List[str]:
    """Strip likely secrets from diary/evidence notes."""
    out: List[str] = []
    bearer_re = re.compile(r"(?i)bearer\s+\S+")
    for raw in notes:
        text = bearer_re.sub("Bearer <redacted>", str(raw))
        if "Токен" in text and ":" in text:
            text = re.sub(r"(Токен['\"]?\s*[:=]\s*)\S+", r"\1<redacted>", text)
        out.append(text)
    return out


def write_investigate_evidence(
    *,
    wired_dir: Optional[Path],
    module_id: str,
    payload: Dict[str, Any],
) -> Optional[Path]:
    """Sidecar under run/wired dir for later package pickup (8c)."""
    if wired_dir is None:
        return None
    root = Path(wired_dir)
    meta = root / "meta"
    try:
        meta.mkdir(parents=True, exist_ok=True)
    except OSError:
        return None
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in module_id)[:48]
    dest = meta / f"chain_investigate_{safe}.json"
    body = dict(payload)
    if isinstance(body.get("notes"), list):
        body["notes"] = redact_notes(body["notes"])
    try:
        dest.write_text(
            json.dumps(body, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError:
        return None
    return dest


def purge_kdt_auth_replacer(zap: Any) -> List[str]:
    """Remove Replacer rules whose description starts with kdt-auth*."""
    notes: List[str] = []
    try:
        rules = zap.list_replacer_rules() or []
    except Exception as exc:
        notes.append(f"purge_list_fail: {exc}")
        return notes
    removed = 0
    for rule in rules:
        if isinstance(rule, dict):
            desc = str(rule.get("description") or rule.get("desc") or "")
            rule_id = rule.get("id") or rule.get("description") or desc
        else:
            desc = str(rule)
            rule_id = rule
        if not desc.startswith(_REPLACER_PREFIX):
            continue
        try:
            zap.remove_replacer_rule(rule_id)
            removed += 1
        except Exception as exc:
            notes.append(f"purge_rule_fail {desc}: {exc}")
    notes.append(f"purge_kdt_auth removed={removed}")
    return notes
