# -*- coding: utf-8 -*-
"""TRAF-A: passive observed insertion points from ZAP History (query + JSON).

Не Param Miner. Не SoT. Opt-in feed в ФаззингВолна через env / helper.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Noise / tracker — не фаззить как дыры (волна A).
_SKIP_QUERY_NAMES = frozenset(
    {
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "gclid",
        "fbclid",
        "_",
        "cachebuster",
        "cb",
        "v",
        "ver",
        "timestamp",
        "ts",
    }
)

_SKIP_JSON_KEYS = frozenset(
    {
        "password",
        "passwd",
        "secret",
        "token",
        "access_token",
        "refresh_token",
        "csrf",
        "csrftoken",
        "_csrf",
    }
)

_DEFAULT_OK = frozenset(range(200, 400))
_FUZZ_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE"})

TRAFFIC_FEED_ENV = "KDT_TRAFFIC_INSERTION_FEED"


@dataclass(frozen=True)
class ObservedInsertionPoint:
    url: str
    method: str
    location_kind: str  # query_param | json_body
    name: str
    status: Optional[int] = None
    sample_value: str = ""

    def dedupe_key(self) -> Tuple[str, str, str, str]:
        return (self.method.upper(), self.url.split("?", 1)[0], self.location_kind, self.name)


def traffic_feed_enabled(env: Optional[Dict[str, str]] = None) -> bool:
    src = env if env is not None else os.environ
    raw = str(src.get(TRAFFIC_FEED_ENV) or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _status_from_message(message: Dict[str, Any]) -> Optional[int]:
    for key in ("statusCode", "status_code", "responseCode", "response_code"):
        raw = message.get(key)
        if raw is None:
            continue
        try:
            return int(raw)
        except (TypeError, ValueError):
            continue
    header = str(message.get("responseHeader") or message.get("response_header") or "")
    m = re.match(r"HTTP/\d(?:\.\d)?\s+(\d{3})", header.strip(), re.I)
    if m:
        return int(m.group(1))
    return None


def _request_body(message: Dict[str, Any]) -> str:
    for key in ("requestBody", "request_body", "body"):
        raw = message.get(key)
        if raw is None:
            continue
        if isinstance(raw, (bytes, bytearray)):
            try:
                return raw.decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                return ""
        text = str(raw)
        if text.strip():
            return text
    return ""


def _parse_message(message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Lazy import parse to avoid circular import at module load."""
    try:
        from core.fuzzing import parse_zap_history_message
    except ImportError:  # pragma: no cover
        from orchestrator.core.fuzzing import parse_zap_history_message  # type: ignore

    try:
        parsed = parse_zap_history_message(message)
    except Exception:  # noqa: BLE001 — skip bad rows
        return None
    parsed["status"] = _status_from_message(message)
    parsed["body"] = _request_body(message)
    return parsed


def _query_points(parsed: Dict[str, Any]) -> List[ObservedInsertionPoint]:
    url = str(parsed.get("url") or "")
    method = str(parsed.get("method") or "GET").upper()
    status = parsed.get("status")
    parts = urlsplit(url)
    out: List[ObservedInsertionPoint] = []
    for name, value in parse_qsl(parts.query, keep_blank_values=True):
        key = (name or "").strip()
        if not key or key.lower() in _SKIP_QUERY_NAMES:
            continue
        out.append(
            ObservedInsertionPoint(
                url=url,
                method=method,
                location_kind="query_param",
                name=key,
                status=status if isinstance(status, int) else None,
                sample_value=str(value)[:200],
            )
        )
    return out


def _json_top_level_keys(body: str) -> List[Tuple[str, str]]:
    text = (body or "").strip()
    if not text or text[0] not in "{[":
        return []
    try:
        data = json.loads(text)
    except Exception:  # noqa: BLE001
        return []
    if not isinstance(data, dict):
        return []
    pairs: List[Tuple[str, str]] = []
    for key, value in data.items():
        name = str(key).strip()
        if not name or name.lower() in _SKIP_JSON_KEYS:
            continue
        if isinstance(value, (dict, list)):
            continue  # A: only scalar top-level
        pairs.append((name, "" if value is None else str(value)[:200]))
    return pairs


def _json_points(parsed: Dict[str, Any]) -> List[ObservedInsertionPoint]:
    method = str(parsed.get("method") or "GET").upper()
    if method not in {"POST", "PUT", "PATCH"}:
        return []
    url = str(parsed.get("url") or "")
    status = parsed.get("status")
    out: List[ObservedInsertionPoint] = []
    for name, sample in _json_top_level_keys(str(parsed.get("body") or "")):
        out.append(
            ObservedInsertionPoint(
                url=url.split("?", 1)[0],
                method=method,
                location_kind="json_body",
                name=name,
                status=status if isinstance(status, int) else None,
                sample_value=sample,
            )
        )
    return out


def extract_observed_insertion_points(
    messages: Sequence[Any],
    *,
    ok_statuses: Optional[Iterable[int]] = None,
    methods: Optional[Iterable[str]] = None,
    base_url_contains: str = "",
    limit: int = 200,
) -> List[ObservedInsertionPoint]:
    """Passive harvest: query params + top-level JSON keys from successful traffic."""
    allow_status = set(ok_statuses) if ok_statuses is not None else set(_DEFAULT_OK)
    allow_methods = {m.upper() for m in (methods or _FUZZ_METHODS)}
    needle = (base_url_contains or "").strip()
    seen: Set[Tuple[str, str, str, str]] = set()
    out: List[ObservedInsertionPoint] = []

    for raw in messages or []:
        if not isinstance(raw, dict):
            continue
        parsed = _parse_message(raw)
        if not parsed:
            continue
        method = str(parsed.get("method") or "").upper()
        if method not in allow_methods:
            continue
        url = str(parsed.get("url") or "")
        if needle and needle not in url:
            continue
        status = parsed.get("status")
        # Unknown status: keep (lab fixtures often omit responseHeader).
        if isinstance(status, int) and status not in allow_status:
            continue
        for point in _query_points(parsed) + _json_points(parsed):
            key = point.dedupe_key()
            if key in seen:
                continue
            seen.add(key)
            out.append(point)
            if len(out) >= max(0, int(limit)):
                return out
    return out


def _url_with_only_param(url: str, param: str, value: str = "seed") -> str:
    parts = urlsplit(url)
    pairs = [(param, value)]
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(pairs), parts.fragment)
    )


def _json_body_with_mask(name: str, sample: str) -> str:
    _ = sample  # reserved for future sample-aware masks; body always uses {MASK}
    return json.dumps({name: "{MASK}"}, ensure_ascii=False)


def insertion_points_to_fuzz_targets(
    points: Sequence[ObservedInsertionPoint],
    *,
    corpus: str = "auto",
    limit: int = 40,
) -> List[Dict[str, Any]]:
    """SuiteFuzzer targets[] (url/method/corpus/body + legacy_location for query)."""
    targets: List[Dict[str, Any]] = []
    for point in points:
        if len(targets) >= limit:
            break
        method = point.method.upper()
        if point.location_kind == "query_param":
            targets.append(
                {
                    "url": _url_with_only_param(point.url, point.name, point.sample_value or "seed"),
                    "method": method if method in _FUZZ_METHODS else "GET",
                    "corpus": corpus,
                    "legacy_location": {"kind": "query_param", "name": point.name},
                }
            )
        elif point.location_kind == "json_body":
            targets.append(
                {
                    "url": point.url,
                    "method": method if method in _FUZZ_METHODS else "POST",
                    "corpus": corpus,
                    "body": _json_body_with_mask(point.name, point.sample_value),
                }
            )
    return targets


def feed_targets_from_history(
    messages: Sequence[Any],
    *,
    existing: Optional[Sequence[Dict[str, Any]]] = None,
    corpus: str = "auto",
    limit: int = 40,
    **extract_kwargs: Any,
) -> List[Dict[str, Any]]:
    """Merge observed targets after existing (dedupe by method+url+param)."""
    base = [dict(t) for t in (existing or []) if isinstance(t, dict)]
    points = extract_observed_insertion_points(messages, limit=limit * 3, **extract_kwargs)
    mined = insertion_points_to_fuzz_targets(points, corpus=corpus, limit=limit)
    seen: Set[Tuple[str, str, str]] = set()
    out: List[Dict[str, Any]] = []
    for t in base + mined:
        url = str(t.get("url") or "")
        method = str(t.get("method") or "GET").upper()
        loc = t.get("legacy_location") or {}
        name = ""
        if isinstance(loc, dict):
            name = str(loc.get("name") or "")
        key = (method, url.split("?", 1)[0], name or str(t.get("body") or "")[:40])
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
        if len(out) >= limit:
            break
    return out
