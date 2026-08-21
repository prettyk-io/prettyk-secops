# -*- coding: utf-8 -*-
"""IMP-CHAIN: record HAR → token slots → materialize → play (sequence/fuzz).

Industry: ZAP Sequence + Burp Stepper-style extract/replace. No silent scan.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import parse_qsl, quote, urlparse, urlunparse

PLACEHOLDER_RE = re.compile(r"\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}")

# Headers / cookies that usually go stale between record and play.
SUGGEST_HEADERS = frozenset(
    {
        "authorization",
        "cookie",
        "x-csrf-token",
        "x-xsrf-token",
        "x-auth-token",
        "x-access-token",
    }
)
SUGGEST_COOKIE_KEYS = frozenset(
    {
        "session",
        "sessionid",
        "jsessionid",
        "csrf",
        "csrftoken",
        "xsrf",
        "token",
        "auth",
        "access_token",
        "refresh_token",
    }
)
SUGGEST_QUERY_KEYS = frozenset(
    {"token", "access_token", "csrf", "state", "code", "session"}
)
BODY_TOKEN_RE = re.compile(
    r'("?(?:access_token|refresh_token|csrf|csrftoken|token|id_token)"?\s*:\s*")([^"]+)(")',
    re.IGNORECASE,
)

ROLE_PRECONDITION = "precondition"
ROLE_ATTACK = "attack"
_EXTRACT_BIND_RE = re.compile(
    r"^extract:step:(\d+):(jsonpath|regex|header):(.+)$",
    re.IGNORECASE | re.DOTALL,
)


class ChainError(ValueError):
    """Honest reject for bad HAR / slots."""


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _header_map(headers: Any) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if isinstance(headers, dict):
        for key, value in headers.items():
            if key is None:
                continue
            out[str(key)] = "" if value is None else str(value)
        return out
    if not isinstance(headers, list):
        return out
    for item in headers:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if name is None:
            continue
        out[str(name)] = str(item.get("value") or "")
    return out


def _headers_to_har_list(headers: Dict[str, str]) -> List[Dict[str, str]]:
    return [{"name": k, "value": v} for k, v in headers.items()]


def load_har(raw: str | bytes | Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(raw, dict):
        data = raw
    else:
        text = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else str(raw)
        text = text.lstrip("\ufeff").strip()
        if not text:
            raise ChainError("пустой HAR")
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ChainError(f"HAR не JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ChainError("корень HAR должен быть object")
    log = data.get("log")
    if not isinstance(log, dict):
        raise ChainError("HAR: нет log")
    entries = log.get("entries")
    if not isinstance(entries, list):
        raise ChainError("HAR: log.entries должен быть array")
    return data


def har_entries(har: Dict[str, Any]) -> List[Dict[str, Any]]:
    return list(_as_dict(har.get("log")).get("entries") or [])


def trim_noise_entries(
    entries: Sequence[Dict[str, Any]],
    *,
    skip_assets: bool = True,
) -> List[Dict[str, Any]]:
    """Drop OPTIONS / static assets — keep API-ish traffic."""
    out: List[Dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        req = _as_dict(entry.get("request"))
        method = str(req.get("method") or "GET").upper()
        if method == "OPTIONS":
            continue
        url = str(req.get("url") or "")
        if skip_assets and _looks_like_asset(url):
            continue
        out.append(entry)
    return out


def _looks_like_asset(url: str) -> bool:
    path = urlparse(url).path.lower()
    return path.endswith(
        (
            ".js",
            ".css",
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".svg",
            ".ico",
            ".woff",
            ".woff2",
            ".map",
            ".ttf",
        )
    )


def steps_from_har(
    raw: str | bytes | Dict[str, Any],
    *,
    skip_assets: bool = True,
) -> List[Dict[str, Any]]:
    har = load_har(raw)
    entries = trim_noise_entries(har_entries(har), skip_assets=skip_assets)
    steps: List[Dict[str, Any]] = []
    for i, entry in enumerate(entries):
        req = _as_dict(entry.get("request"))
        method = str(req.get("method") or "GET").upper()
        url = str(req.get("url") or "")
        headers = _header_map(req.get("headers"))
        post = req.get("postData")
        body = ""
        mime = ""
        if isinstance(post, dict):
            body = str(post.get("text") or "")
            mime = str(post.get("mimeType") or "")
        res = _as_dict(entry.get("response"))
        res_headers = _header_map(res.get("headers"))
        res_content = res.get("content")
        res_body = ""
        if isinstance(res_content, dict):
            res_body = str(res_content.get("text") or "")
        steps.append(
            {
                "index": i,
                "method": method,
                "url": url,
                "headers": headers,
                "body": body,
                "mime": mime,
                "status": int(res.get("status") or 0) or None,
                "response_headers": res_headers,
                "response_body": res_body[:50000],
                "role": ROLE_ATTACK,
            }
        )
    return steps


def normalize_step_role(step: Dict[str, Any]) -> str:
    raw = str(step.get("role") or ROLE_ATTACK).strip().lower().replace("ё", "е")
    if raw in ("pre", "precondition", "setup", "прекондишен", "прекондишн"):
        return ROLE_PRECONDITION
    return ROLE_ATTACK


def with_step_roles(steps: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for step in steps:
        row = dict(step)
        row["role"] = normalize_step_role(row)
        out.append(row)
    return out


def filter_steps_by_role(
    steps: Sequence[Dict[str, Any]],
    role: str,
) -> List[Dict[str, Any]]:
    want = ROLE_PRECONDITION if role == ROLE_PRECONDITION else ROLE_ATTACK
    return [s for s in with_step_roles(steps) if s["role"] == want]


def _simple_json_path(data: Any, path: str) -> Optional[str]:
    """Minimal ``$.a.b`` / ``a.b`` walker (no jsonpath-ng)."""
    expr = (path or "").strip()
    if expr.startswith("$."):
        expr = expr[2:]
    elif expr.startswith("$"):
        expr = expr[1:].lstrip(".")
    if not expr:
        return None
    cur: Any = data
    for part in expr.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    if cur is None:
        return None
    if isinstance(cur, (dict, list)):
        return json.dumps(cur, ensure_ascii=False)
    return str(cur)


def parse_slot_extract(slot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract rule from ``slot.extract`` or bind ``extract:step:N:kind:expr``.
    kind: jsonpath | regex | header
    """
    raw = slot.get("extract")
    if isinstance(raw, dict) and raw.get("kind"):
        return {
            "from_step": int(raw.get("from_step") or 0),
            "kind": str(raw.get("kind") or "jsonpath").lower(),
            "expr": str(raw.get("expr") or "").strip(),
            "source": str(raw.get("source") or "body").lower(),
        }
    bind = str(slot.get("bind") or "").strip()
    match = _EXTRACT_BIND_RE.match(bind)
    if not match:
        return None
    return {
        "from_step": int(match.group(1)),
        "kind": match.group(2).lower(),
        "expr": match.group(3).strip(),
        "source": "body",
    }


def _extract_header_value(step: Dict[str, Any], expr: str) -> Optional[str]:
    headers = _as_dict(step.get("response_headers"))
    for name, val in headers.items():
        if name.lower() == expr.lower():
            return str(val)
    return None


def _extract_body_value(
    step: Dict[str, Any], *, kind: str, expr: str, sid: str, notes: List[str]
) -> Optional[str]:
    text = str(step.get("response_body") or "")
    if kind == "jsonpath":
        try:
            payload = json.loads(text) if text.strip() else None
        except json.JSONDecodeError:
            notes.append(f"extract {sid}: response не JSON")
            return None
        if payload is None:
            return None
        return _simple_json_path(payload, expr)
    if kind == "regex":
        match = re.search(expr, text)
        if not match:
            return None
        return match.group(1) if match.lastindex else match.group(0)
    return None


def _extract_one_slot(
    slot: Dict[str, Any],
    by_index: Dict[int, Dict[str, Any]],
    notes: List[str],
) -> Optional[Tuple[str, str]]:
    if not slot.get("enabled", True):
        return None
    sid = str(slot.get("id") or "").strip()
    rule = parse_slot_extract(slot)
    if not sid or rule is None:
        return None
    step = by_index.get(int(rule["from_step"]))
    if step is None:
        notes.append(f"extract {sid}: нет шага {rule['from_step']}")
        return None
    expr = rule["expr"]
    if not expr:
        notes.append(f"extract {sid}: пустой expr")
        return None
    kind = rule["kind"]
    if kind == "header":
        value = _extract_header_value(step, expr)
    else:
        value = _extract_body_value(step, kind=kind, expr=expr, sid=sid, notes=notes)
    if value is None or value == "":
        notes.append(f"extract {sid}: пусто (honest)")
        return None
    notes.append(f"extract {sid}: ok from step {rule['from_step']}")
    return sid, value


def apply_slot_extracts(
    steps: Sequence[Dict[str, Any]],
    slots: Sequence[Dict[str, Any]],
) -> Tuple[Dict[str, str], List[str]]:
    """Fill bindings from recorded step responses (PRE-2 correlate)."""
    by_index = {int(s.get("index") or i): s for i, s in enumerate(steps)}
    out: Dict[str, str] = {}
    notes: List[str] = []
    for slot in slots:
        hit = _extract_one_slot(slot, by_index, notes)
        if hit is None:
            continue
        out[hit[0]] = hit[1]
    return out, notes


def filter_har_by_roles(
    har_text: str,
    steps: Sequence[Dict[str, Any]],
    roles: Sequence[str],
) -> str:
    """Keep HAR entries whose step index has role in ``roles``."""
    want = {normalize_step_role({"role": r}) for r in roles}
    indexed = with_step_roles(steps)
    keep_idx = {
        int(s.get("index") or i)
        for i, s in enumerate(indexed)
        if s["role"] in want
    }
    har = load_har(har_text)
    log = _as_dict(har.get("log"))
    entries = list(log.get("entries") or [])
    # Template HAR is already trimmed to same order as steps indices.
    kept: List[Dict[str, Any]] = []
    for i, entry in enumerate(entries):
        if i in keep_idx:
            kept.append(entry)
    log["entries"] = kept
    har["log"] = log
    return json.dumps(har, ensure_ascii=False, indent=2)


def _add_suggested_slot(
    seen: Dict[str, Dict[str, Any]],
    *,
    slot_id: str,
    location: str,
    key: str,
    recorded_value: str,
    step_index: int,
) -> None:
    val = (recorded_value or "").strip()
    if not val or len(val) < 4:
        return
    sid = re.sub(r"[^A-Za-z0-9_]", "_", slot_id).strip("_") or "token"
    if sid in seen:
        return
    seen[sid] = {
        "id": sid,
        "location": location,
        "key": key,
        "recorded_value": val,
        "enabled": True,
        "bind": "",
        "step_index": step_index,
        "apply": "step",
        "match": "",
    }


def _suggest_slots_from_headers(
    seen: Dict[str, Dict[str, Any]], headers: Dict[str, Any], idx: int
) -> None:
    for hname, hval in headers.items():
        low = hname.lower()
        if low in SUGGEST_HEADERS:
            _add_suggested_slot(
                seen,
                slot_id=low.replace("-", "_"),
                location="header",
                key=hname,
                recorded_value=str(hval),
                step_index=idx,
            )
        if low != "cookie":
            continue
        for part in str(hval).split(";"):
            if "=" not in part:
                continue
            ck, cv = part.split("=", 1)
            ck = ck.strip()
            cv = cv.strip()
            if ck.lower() in SUGGEST_COOKIE_KEYS or "token" in ck.lower():
                _add_suggested_slot(
                    seen,
                    slot_id=f"cookie_{ck}",
                    location="cookie",
                    key=ck,
                    recorded_value=cv,
                    step_index=idx,
                )


def _suggest_slots_from_query_body(
    seen: Dict[str, Dict[str, Any]], step: Dict[str, Any], idx: int
) -> None:
    parsed = urlparse(str(step.get("url") or ""))
    for qk, qv in parse_qsl(parsed.query, keep_blank_values=True):
        if qk.lower() in SUGGEST_QUERY_KEYS:
            _add_suggested_slot(
                seen,
                slot_id=f"q_{qk}",
                location="query",
                key=qk,
                recorded_value=qv,
                step_index=idx,
            )
    body = str(step.get("body") or "")
    for match in BODY_TOKEN_RE.finditer(body):
        field = re.sub(r'["\s:]', "", match.group(1)).lower()
        _add_suggested_slot(
            seen,
            slot_id=f"body_{field}",
            location="body",
            key=field,
            recorded_value=match.group(2),
            step_index=idx,
        )


def suggest_slots(steps: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Heuristic token candidates (Burp/ZAP style — operator confirms)."""
    seen: Dict[str, Dict[str, Any]] = {}
    for step in steps:
        idx = int(step.get("index") or 0)
        _suggest_slots_from_headers(seen, _as_dict(step.get("headers")), idx)
        _suggest_slots_from_query_body(seen, step, idx)
    return list(seen.values())


def _replace_cookie_value(cookie_header: str, key: str, new_val: str) -> str:
    parts = []
    found = False
    for part in cookie_header.split(";"):
        raw = part.strip()
        if not raw:
            continue
        if "=" not in raw:
            parts.append(raw)
            continue
        ck, _cv = raw.split("=", 1)
        if ck.strip() == key:
            parts.append(f"{ck.strip()}={new_val}")
            found = True
        else:
            parts.append(raw)
    if not found:
        parts.append(f"{key}={new_val}")
    return "; ".join(parts)


def _find_header_name(headers: Dict[str, str], key: str, *, default: str) -> str:
    for name in headers:
        if name.lower() == key.lower():
            return name
    return default


def _apply_header_value(req: Dict[str, Any], *, key: str, old: str, new: str) -> None:
    headers = _header_map(req.get("headers"))
    target = _find_header_name(headers, key, default=key)
    if old and headers.get(target) == old:
        headers[target] = new
    elif not old:
        headers[target] = new
    else:
        cur = headers.get(target, "")
        headers[target] = cur.replace(old, new) if old in cur else new
    req["headers"] = _headers_to_har_list(headers)


def _apply_cookie_value(req: Dict[str, Any], *, key: str, new: str) -> None:
    headers = _header_map(req.get("headers"))
    cookie_key = _find_header_name(headers, "cookie", default="Cookie")
    if cookie_key not in headers:
        headers[cookie_key] = ""
    headers[cookie_key] = _replace_cookie_value(headers.get(cookie_key, ""), key, new)
    req["headers"] = _headers_to_har_list(headers)


def _query_piece(key: str, value: str) -> str:
    # Keep {{slot}} raw so materialize PLACEHOLDER_RE can see it
    # (urlencode would turn braces into %7B%7B…).
    encoded_key = quote(key, safe="")
    if value.startswith("{{") and value.endswith("}}"):
        return f"{encoded_key}={value}"
    return f"{encoded_key}={quote(value, safe='')}"


def _apply_query_value(req: Dict[str, Any], *, key: str, old: str, new: str) -> None:
    parsed = urlparse(str(req.get("url") or ""))
    new_pairs: List[Tuple[str, str]] = []
    hit = False
    for qk, qv in parse_qsl(parsed.query, keep_blank_values=True):
        if qk == key and (not old or qv == old or old in qv):
            new_pairs.append((qk, new))
            hit = True
        else:
            new_pairs.append((qk, qv))
    if not hit:
        new_pairs.append((key, new))
    req["url"] = urlunparse(
        parsed._replace(query="&".join(_query_piece(k, v) for k, v in new_pairs))
    )


def _apply_body_value(req: Dict[str, Any], *, key: str, old: str, new: str) -> None:
    post = req.get("postData")
    if not isinstance(post, dict):
        post = {"mimeType": "application/json", "text": ""}
        req["postData"] = post
    text = str(post.get("text") or "")
    if old and old in text:
        post["text"] = text.replace(old, new)
        return
    pattern = re.compile(
        rf'("{re.escape(key)}"\s*:\s*")([^"]*)(")',
        re.IGNORECASE,
    )
    post["text"], n = pattern.subn(rf"\1{new}\3", text, count=1)
    if n == 0 and old:
        post["text"] = text.replace(old, new)


def _apply_value_to_request(
    req: Dict[str, Any],
    *,
    location: str,
    key: str,
    old: str,
    new: str,
) -> None:
    if location == "header":
        _apply_header_value(req, key=key, old=old, new=new)
        return
    if location == "cookie":
        _apply_cookie_value(req, key=key, new=new)
        return
    if location == "query":
        _apply_query_value(req, key=key, old=old, new=new)
        return
    if location == "body":
        _apply_body_value(req, key=key, old=old, new=new)


def normalize_slot_apply(raw: Any) -> str:
    """``step`` (default) | ``all`` — where a map row writes."""
    v = str(raw or "step").strip().lower().replace("ё", "е")
    if v in {"all", "*", "any", "все", "global"}:
        return "all"
    return "step"


def slot_matches_url(slot: Dict[str, Any], url: str) -> bool:
    """Empty match → any URL; ``regex:…`` or substring contains."""
    match = str(slot.get("match") or "").strip()
    if not match:
        return True
    if match.lower().startswith("regex:"):
        pat = match[6:].strip()
        if not pat:
            return True
        try:
            return re.search(pat, url) is not None
        except re.error:
            return False
    return match in url


def slot_applies_to_entry(
    slot: Dict[str, Any],
    *,
    entry_index: int,
    url: str,
) -> bool:
    """Replace Map row scope: match URL + apply step|all."""
    if not slot.get("enabled", True):
        return False
    if not str(slot.get("id") or "").strip():
        return False
    if not slot_matches_url(slot, url):
        return False
    if normalize_slot_apply(slot.get("apply")) == "all":
        return True
    step_idx = slot.get("step_index")
    if step_idx is None:
        # Legacy rows without step_index → keep previous «все entries» behaviour.
        return True
    try:
        return int(step_idx) == int(entry_index)
    except (TypeError, ValueError):
        return True


def template_har(
    raw: str | bytes | Dict[str, Any],
    slots: Sequence[Dict[str, Any]],
    *,
    skip_assets: bool = True,
) -> str:
    """Replace recorded slot values with {{slot_id}} placeholders (map-aware)."""
    har = load_har(raw)
    log = _as_dict(har.get("log"))
    entries = trim_noise_entries(har_entries(har), skip_assets=skip_assets)
    enabled = [s for s in slots if s.get("enabled", True) and s.get("id")]
    for entry_index, entry in enumerate(entries):
        req = _as_dict(entry.get("request"))
        url = str(req.get("url") or "")
        for slot in enabled:
            if not slot_applies_to_entry(slot, entry_index=entry_index, url=url):
                continue
            sid = str(slot["id"])
            placeholder = "{{" + sid + "}}"
            _apply_value_to_request(
                req,
                location=str(slot.get("location") or "header"),
                key=str(slot.get("key") or ""),
                old=str(slot.get("recorded_value") or ""),
                new=placeholder,
            )
        entry["request"] = req
    log["entries"] = entries
    har["log"] = log
    if "creator" not in log:
        log["creator"] = {"name": "kdt-imp-chain", "version": "1"}
    return json.dumps(har, ensure_ascii=False, indent=2)


def _fill_placeholders(text: str, bindings: Dict[str, str]) -> str:
    def repl(match: re.Match[str]) -> str:
        sid = match.group(1)
        return bindings[sid] if sid in bindings else match.group(0)

    return PLACEHOLDER_RE.sub(repl, text)


def _materialize_slots_on_entries(
    data: Dict[str, Any],
    bindings: Dict[str, str],
    slots: Sequence[Dict[str, Any]],
) -> None:
    for entry_index, entry in enumerate(har_entries(data)):
        req = _as_dict(entry.get("request"))
        url = str(req.get("url") or "")
        for slot in slots:
            sid = str(slot.get("id") or "")
            if sid not in bindings:
                continue
            if not slot_applies_to_entry(slot, entry_index=entry_index, url=url):
                continue
            _apply_value_to_request(
                req,
                location=str(slot.get("location") or "header"),
                key=str(slot.get("key") or ""),
                old="{{" + sid + "}}",
                new=bindings[sid],
            )
        entry["request"] = req


def materialize_har(
    template: str | Dict[str, Any],
    bindings: Dict[str, str],
    *,
    slots: Optional[Sequence[Dict[str, Any]]] = None,
) -> str:
    """
    Fill {{slot_id}} from bindings.

    Missing binding → keep placeholder (honest; ZAP will fail loudly) unless
    slot has recorded_value fallback when bindings explicitly pass None? No —
    only bindings win; empty string allowed.
    """
    har = load_har(template)
    filled = _fill_placeholders(json.dumps(har, ensure_ascii=False), bindings)
    if slots:
        data = json.loads(filled)
        _materialize_slots_on_entries(data, bindings, slots)
        return json.dumps(data, ensure_ascii=False, indent=2)
    try:
        data = json.loads(filled)
    except json.JSONDecodeError as exc:
        raise ChainError(f"materialize сломал JSON (проверь bindings): {exc}") from exc
    return json.dumps(data, ensure_ascii=False, indent=2)


def parse_value_pack_json(raw: str) -> Tuple[List[Dict[str, str]], List[str]]:
    """JSON object → 1 row; array of objects → N rows (value pack, not map SoT)."""
    text = (raw or "").strip()
    if not text:
        raise ChainError("value pack JSON пуст")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ChainError(f"value pack JSON: {exc}") from exc
    if isinstance(data, dict):
        row = {str(k): "" if v is None else str(v) for k, v in data.items()}
        return [row], ["value_pack_rows=1 json"]
    if isinstance(data, list):
        rows: List[Dict[str, str]] = []
        for i, item in enumerate(data):
            if not isinstance(item, dict):
                raise ChainError(f"value pack[{i}]: нужен object")
            rows.append({str(k): "" if v is None else str(v) for k, v in item.items()})
        if not rows:
            raise ChainError("value pack JSON: пустой array")
        return rows, [f"value_pack_rows={len(rows)} json"]
    raise ChainError("value pack JSON: object или array of objects")


def parse_value_pack_csv(raw: str) -> Tuple[List[Dict[str, str]], List[str]]:
    """CSV: header = slot ids, each data row = one materialize iteration."""
    import csv
    import io

    text = (raw or "").strip()
    if not text:
        raise ChainError("value pack CSV пуст")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ChainError("value pack CSV: нет заголовка (id слотов)")
    rows: List[Dict[str, str]] = []
    for row in reader:
        cleaned = {
            str(k).strip(): "" if v is None else str(v)
            for k, v in row.items()
            if k is not None and str(k).strip()
        }
        if any(v.strip() for v in cleaned.values()):
            rows.append(cleaned)
    if not rows:
        raise ChainError("value pack CSV: нет строк данных")
    return rows, [f"value_pack_rows={len(rows)} csv"]


def parse_value_pack(raw: str) -> Tuple[List[Dict[str, str]], List[str]]:
    """Auto: JSON; else properties (MAP-MOD); CSV legacy multi-row deprecated."""
    from core.properties_module import looks_like_properties_module

    text = (raw or "").strip()
    if not text:
        raise ChainError("value pack пуст")
    if text[0] in "{[":
        return parse_value_pack_json(text)
    if looks_like_properties_module(text):
        row, notes = bindings_from_properties_text(text)
        return [row], notes
    return parse_value_pack_csv(text)


def materialize_value_pack(
    fields: Dict[str, Any],
    pack: str,
) -> Dict[str, Any]:
    """N materialize runs from value pack rows (MAP-3). Map structure stays in slots."""
    rows, pack_notes = parse_value_pack(pack)
    iterations: List[Dict[str, Any]] = []
    notes: List[str] = list(pack_notes)
    for i, row in enumerate(rows):
        try:
            out = materialize_chain_fields(fields, bindings=row)
            iterations.append(
                {
                    "index": i,
                    "ok": bool(out.get("ok", True)),
                    "bindings": row,
                    "har_text": out.get("har_text"),
                    "setup_har_text": out.get("setup_har_text"),
                    "attack_har_text": out.get("attack_har_text"),
                    "notes": list(out.get("notes") or []),
                }
            )
            notes.append(f"iter[{i}] ok")
        except ChainError as exc:
            iterations.append(
                {
                    "index": i,
                    "ok": False,
                    "bindings": row,
                    "notes": [str(exc)],
                }
            )
            notes.append(f"iter[{i}] fail: {exc}")
    return {
        "ok": bool(iterations) and all(bool(it.get("ok")) for it in iterations),
        "count": len(iterations),
        "iterations": iterations,
        "notes": notes,
    }


def chain_from_har(
    raw: str | bytes | Dict[str, Any],
    *,
    har_as: str = "chain",
    sequence_name: str = "",
    skip_assets: bool = True,
) -> Dict[str, Any]:
    steps = steps_from_har(raw, skip_assets=skip_assets)
    slots = suggest_slots(steps)
    templated = template_har(raw, slots, skip_assets=skip_assets)
    return {
        "ok": True,
        "har_as": har_as,
        "sequence_name": sequence_name or har_as,
        "steps": steps,
        "slots": slots,
        "template_har": templated,
        "notes": [
            f"steps={len(steps)} slots_suggested={len(slots)}",
            "подтверди слоты — silent scan нет",
        ],
    }


def fuzz_targets_from_steps(
    steps: Sequence[Dict[str, Any]],
    *,
    limit: int = 40,
    attack_only: bool = True,
) -> List[Dict[str, str]]:
    """Bomb-B seed: method/url(/body). Default: only ``role=attack`` (PRE-1)."""
    ranked = with_step_roles(steps)
    has_pre = any(s["role"] == ROLE_PRECONDITION for s in ranked)
    out: List[Dict[str, str]] = []
    seen = set()
    for step in ranked:
        if attack_only and has_pre and step["role"] != ROLE_ATTACK:
            continue
        method = str(step.get("method") or "GET").upper()
        url = str(step.get("url") or "").strip()
        key = (method, url)
        if not url or key in seen:
            continue
        seen.add(key)
        item: Dict[str, str] = {"method": method, "url": url}
        body = str(step.get("body") or "")
        if body and method in {"POST", "PUT", "PATCH"}:
            item["body"] = body[:8000]
        out.append(item)
        if len(out) >= limit:
            break
    return out


def seed_prettyk_play(
    *,
    sequence_name: str,
    har_path: str = "",
    include_sequence_scan: bool = True,
    module_id: str = "",
) -> str:
    """One-line facade: ВыполнитьЦепь or СканированиеЦепи. har_path unused."""
    _ = har_path
    from utils.chain_runtime import (
        seed_prettyk_execute_chain,
        seed_prettyk_scan_chain,
    )

    mid = (module_id or sequence_name or "").strip()
    if include_sequence_scan:
        return seed_prettyk_scan_chain(mid)
    return seed_prettyk_execute_chain(mid)


def seed_prettyk_prepare_chain(module_or_as: str) -> str:
    mid = (module_or_as or "").strip()
    return f"ПодготовитьЦепь {mid}" if mid else ""


def seed_prettyk_fuzz_chain(module_or_as: str) -> str:
    mid = (module_or_as or "").strip()
    return f"ФаззингЦепи {mid}" if mid else ""


def suggest_chain_fuzzer_id(har_as: str, module_id: str = "") -> str:
    """Studio CHAIN-6 creates ``chain_<harAs>``; fallback module id."""
    raw = (har_as or module_id or "flow").strip() or "flow"
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in raw)[:48]
    return f"chain_{safe}"


def _manifest_fuzzer_ids(wired: Any) -> List[str]:
    suites = getattr(wired, "test_suites", None)
    ids: List[str] = []
    for item in getattr(suites, "fuzzers", None) or []:
        fid = getattr(item, "id", None)
        if fid is None and isinstance(item, dict):
            fid = item.get("id")
        if fid:
            ids.append(str(fid).strip())
    return ids


def resolve_chain_fuzzer_id(wired: Any, *, har_as: str, module_id: str) -> str:
    """Pick existing fuzzer: chain_har → module_id → error hint."""
    ids = _manifest_fuzzer_ids(wired)
    hint = suggest_chain_fuzzer_id(har_as, module_id)
    if hint in ids:
        return hint
    mid = (module_id or "").strip()
    if mid in ids:
        return mid
    for fid in ids:
        if fid.startswith("chain_"):
            return fid
    if ids:
        return ids[0]
    raise ChainError(
        f"нет Fuzzer для Цепи (ожидали {hint!r} или Play с «+ цели фаззинга»)"
    )


def _bind_value_from_slot(
    sid: str, bind: str, notes: List[str]
) -> Optional[str]:
    import os

    if bind.startswith("env:"):
        env_name = bind[4:].strip()
        val = os.environ.get(env_name, "")
        if not val:
            notes.append(f"slot {sid}: env {env_name} пуст")
        return val
    if bind.startswith("literal:"):
        return bind[len("literal:") :]
    if bind.startswith("capture:"):
        notes.append(
            f"slot {sid}: capture:{bind[8:]} — подставь в bindings на Launch "
            "(Capture из Auth на MVP руками/explicit)"
        )
        return None
    return bind


def resolve_bindings(
    slots: Sequence[Dict[str, Any]],
    explicit: Optional[Dict[str, str]] = None,
) -> Tuple[Dict[str, str], List[str]]:
    """
    Merge UI bindings: explicit wins; else slot.bind literal:VALUE or raw value.
    bind forms: ``literal:x`` | ``env:NAME`` | ``extract:step:N:…`` | plain.
    """
    notes: List[str] = []
    out: Dict[str, str] = dict(explicit or {})
    for slot in slots:
        if not slot.get("enabled", True):
            continue
        sid = str(slot.get("id") or "")
        if not sid or sid in out:
            continue
        if parse_slot_extract(slot) is not None:
            # filled later by apply_slot_extracts / dry_run
            continue
        bind = str(slot.get("bind") or "").strip()
        if not bind:
            notes.append(f"slot {sid}: нет bind — placeholder останется")
            continue
        value = _bind_value_from_slot(sid, bind, notes)
        if value is not None:
            out[sid] = value
    return out, notes


def bindings_from_properties_text(text: str) -> Tuple[Dict[str, str], List[str]]:
    """
    Value pack from data-модуль properties (MAP-MOD).
    Keys = slot ids. ``#key=value`` secrets → same string values (masking = stream).
    """
    from core.errors import WiredError
    from core.properties_module import looks_like_properties_module, parse_properties_module

    raw = (text or "").strip()
    notes: List[str] = []
    if not raw:
        return {}, ["value_pack: пустой properties текст"]
    if not looks_like_properties_module(raw):
        raise ChainError(
            "value_pack: ожидали properties key=value (как auth_data), "
            "не URL-list / PrettyK"
        )
    try:
        pairs = parse_properties_module(raw)
    except WiredError as exc:
        raise ChainError(f"value_pack properties: {exc}") from exc
    out = {str(k): "" if v is None else str(v) for k, v, _secret in pairs}
    notes.append(f"value_pack_properties_keys={len(out)}")
    return out, notes


def _manifest_data_modules(wired: Any) -> List[Any]:
    if isinstance(wired, dict):
        suites = wired.get("test_suites")
    else:
        suites = getattr(wired, "test_suites", None)
    if isinstance(suites, dict):
        modules = suites.get("test_data_constructor")
    else:
        modules = getattr(suites, "test_data_constructor", None) if suites else None
    return modules if isinstance(modules, list) else []


def _module_editor_text(mod: Any) -> str:
    if isinstance(mod, dict):
        storage = mod.get("data_storage_fields")
    else:
        storage = getattr(mod, "data_storage_fields", None)
    if isinstance(storage, dict):
        return str(storage.get("editor") or "")
    if storage is not None:
        return str(getattr(storage, "editor", "") or "")
    return ""


def data_module_editor_text(wired: Any, module_id: str) -> str:
    """Read ``data_storage_fields.editor`` for module id (dict or object)."""
    mid = (module_id or "").strip()
    if not mid:
        return ""
    for mod in _manifest_data_modules(wired):
        if isinstance(mod, dict):
            mid_m = str(mod.get("id") or "").strip()
            mtype = str(mod.get("module_type") or "")
        else:
            mid_m = str(getattr(mod, "id", "") or "").strip()
            mtype = str(getattr(mod, "module_type", "") or "")
        if mid_m != mid:
            continue
        if mtype and mtype != "Модуль работы с данными":
            # allow reuse of plain data modules only
            continue
        return _module_editor_text(mod)
    return ""


def bindings_from_value_pack_module(
    wired: Any,
    module_id: str,
) -> Tuple[Dict[str, str], List[str]]:
    """Resolve ``value_pack_module`` id → properties bindings."""
    mid = (module_id or "").strip()
    if not mid:
        return {}, []
    text = data_module_editor_text(wired, mid)
    if not text.strip():
        return {}, [f"value_pack_module {mid!r}: модуль не найден или editor пуст"]
    pack, notes = bindings_from_properties_text(text)
    notes = [f"value_pack_module={mid}"] + notes
    return pack, notes


def _chain_template_and_source(
    fields: Dict[str, Any], slots: Sequence[Dict[str, Any]]
) -> Tuple[str, str]:
    template = str(fields.get("template_har") or "").strip()
    source = str(fields.get("source_har") or "").strip()
    if not template and source:
        template = template_har(source, slots)
    if not template:
        raise ChainError("нет template_har / source_har")
    return template, source


def _merge_value_pack(
    fields: Dict[str, Any],
    *,
    wired: Any,
    target: Dict[str, str],
    notes: List[str],
) -> None:
    pack_text = str(fields.get("value_pack_text") or "").strip()
    if pack_text:
        pack, pack_notes = bindings_from_properties_text(pack_text)
        notes.extend(pack_notes)
        for key, value in pack.items():
            target.setdefault(key, value)
        return
    vpmid = str(fields.get("value_pack_module") or "").strip()
    if not vpmid:
        return
    if wired is not None:
        pack, pack_notes = bindings_from_value_pack_module(wired, vpmid)
        notes.extend(pack_notes)
        for key, value in pack.items():
            target.setdefault(key, value)
        return
    if isinstance(fields.get("value_pack"), dict):
        for key, value in fields["value_pack"].items():
            target.setdefault(str(key), str(value))
        notes.append(f"value_pack_module={vpmid} (inline)")


def _resolve_chain_bindings(
    fields: Dict[str, Any],
    *,
    steps: Sequence[Dict[str, Any]],
    slots: Sequence[Dict[str, Any]],
    bindings: Optional[Dict[str, str]],
    wired: Any,
) -> Tuple[Dict[str, str], List[str]]:
    extracted, extract_notes = apply_slot_extracts(steps, slots)
    merged = dict(extracted)
    notes: List[str] = list(extract_notes)
    _merge_value_pack(fields, wired=wired, target=merged, notes=notes)
    if bindings:
        merged.update(bindings)
    resolved, bind_notes = resolve_bindings(slots, merged)
    notes.extend(bind_notes)
    return resolved, notes


def _chain_materialize_notes(
    *,
    pre_steps,
    atk_steps,
    fields: Dict[str, Any],
    fuzz,
    module_id: str,
) -> List[str]:
    del fields, fuzz, module_id  # reserved for richer notes
    notes: List[str] = []
    if pre_steps:
        notes.append(f"precondition_steps={len(pre_steps)}")
    if atk_steps:
        notes.append(f"attack_steps={len(atk_steps)}")
    notes.append("materialize only — ZAP scan не запущен")
    return notes


def _chain_role_hars(
    har_text: str,
    steps: Sequence[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], str, str]:
    pre_steps = filter_steps_by_role(steps, ROLE_PRECONDITION)
    atk_steps = filter_steps_by_role(steps, ROLE_ATTACK)
    setup_har = (
        filter_har_by_roles(har_text, steps, [ROLE_PRECONDITION]) if pre_steps else ""
    )
    attack_har = (
        filter_har_by_roles(har_text, steps, [ROLE_ATTACK]) if atk_steps else har_text
    )
    return pre_steps, atk_steps, setup_har, attack_har


def materialize_chain_fields(
    fields: Dict[str, Any],
    *,
    bindings: Optional[Dict[str, str]] = None,
    wired: Any = None,
) -> Dict[str, Any]:
    """Authoring chain_fields → full HAR + setup/attack split + fuzz(attack)."""
    slots = list(fields.get("slots") or [])
    template, source = _chain_template_and_source(fields, slots)
    steps = list(fields.get("steps") or [])
    if not steps and source:
        steps = steps_from_har(source)
    steps = with_step_roles(steps)

    resolved, notes = _resolve_chain_bindings(
        fields, steps=steps, slots=slots, bindings=bindings, wired=wired
    )

    har_text = materialize_har(template, resolved, slots=slots)
    pre_steps, atk_steps, setup_har, attack_har = _chain_role_hars(har_text, steps)

    har_as = str(fields.get("har_as") or "chain").strip() or "chain"
    seq = str(fields.get("sequence_name") or har_as).strip() or har_as
    path = f"resources/{har_as}.har"
    include_scan = bool(fields.get("include_sequence_scan", True))
    fuzz = (
        fuzz_targets_from_steps(steps, attack_only=True)
        if fields.get("seed_fuzz_targets")
        else []
    )
    module_id = str(fields.get("module_id") or har_as).strip() or har_as
    notes.extend(
        _chain_materialize_notes(
            pre_steps=pre_steps,
            atk_steps=atk_steps,
            fields=fields,
            fuzz=fuzz,
            module_id=module_id,
        )
    )
    seed = seed_prettyk_play(
        sequence_name=seq,
        har_path=path,
        include_sequence_scan=include_scan,
        module_id=module_id,
    )
    if fields.get("seed_fuzz_targets") and fuzz:
        fuzz_line = seed_prettyk_fuzz_chain(module_id)
        if fuzz_line and fuzz_line not in seed:
            seed = f"{seed}\n{fuzz_line}" if seed else fuzz_line
            notes.append("seed + ФаззингЦепи (attack surface)")
    return {
        "ok": True,
        "har_as": har_as,
        "har_path": path,
        "har_text": har_text,
        "setup_har_text": setup_har,
        "attack_har_text": attack_har,
        "sequence_name": seq,
        "seed": seed,
        "fuzz_targets": fuzz,
        "bindings_used": sorted(resolved.keys()),
        "notes": notes,
        "steps": steps,
    }


def dry_run_preconditions(
    fields: Dict[str, Any],
    *,
    bindings: Optional[Dict[str, str]] = None,
    wired: Any = None,
) -> Dict[str, Any]:
    """
    PRE-3: extract + materialize setup HAR only. No ZAP.
    Honest notes if extracts empty or no precondition steps.
    """
    slots = list(fields.get("slots") or [])
    template, source = _chain_template_and_source(fields, slots)
    steps = with_step_roles(list(fields.get("steps") or []) or (
        steps_from_har(source) if source else []
    ))
    pre = filter_steps_by_role(steps, ROLE_PRECONDITION)
    notes: List[str] = []
    if not pre:
        notes.append("precondition_steps=0 — пометь role=precondition на шагах")
        return {
            "ok": False,
            "setup_har_text": "",
            "attack_har_text": "",
            "bindings_used": [],
            "extract_ok": False,
            "notes": notes,
            "seed": seed_prettyk_prepare_chain(
                str(fields.get("module_id") or fields.get("har_as") or "")
            ),
        }

    resolved, bind_notes = _resolve_chain_bindings(
        fields, steps=steps, slots=slots, bindings=bindings, wired=wired
    )
    notes.extend(bind_notes)

    extract_slots = [s for s in slots if parse_slot_extract(s) is not None]
    missing = [
        str(s.get("id"))
        for s in extract_slots
        if s.get("enabled", True) and str(s.get("id")) not in resolved
    ]
    extract_ok = not missing
    if missing:
        notes.append(f"extract_missing={','.join(missing)}")

    full = materialize_har(template, resolved, slots=slots)
    setup_har = filter_har_by_roles(full, steps, [ROLE_PRECONDITION])
    attack_har = filter_har_by_roles(full, steps, [ROLE_ATTACK])
    mid = str(fields.get("module_id") or fields.get("har_as") or "chain").strip()
    notes.append(f"dry_run_pre ok={extract_ok} setup_entries≈pre={len(pre)}")
    return {
        "ok": extract_ok or not extract_slots,
        "setup_har_text": setup_har,
        "attack_har_text": attack_har,
        "bindings_used": sorted(resolved.keys()),
        "extract_ok": extract_ok if extract_slots else True,
        "notes": notes,
        "seed": seed_prettyk_prepare_chain(mid),
        "steps": steps,
    }
