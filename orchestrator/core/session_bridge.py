# -*- coding: utf-8 -*-
"""Мосты между плоскостями сессии: Browser jar ↔ HTTP headers (для ZAP sender).

Не продуктовая поверхность PrettyK. См. docs/session-composition.md.

Redact: в meta пишем только имена cookie / storage keys; значения — только в
runtime headers для zap_http_request / Campaign, не в evidence.
"""
from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple
from urllib.parse import urlsplit

# SPA часто кладёт JWT в localStorage/sessionStorage под этими именами.
DEFAULT_TOKEN_STORAGE_KEYS: Tuple[str, ...] = (
    "token",
    "access_token",
    "accessToken",
    "id_token",
    "idToken",
    "jwt",
    "authToken",
    "auth_token",
)


def cookie_header_from_jar(
    cookies: Sequence[Mapping[str, Any]] | Iterable[Mapping[str, Any]] | None,
    *,
    names: Sequence[str] | None = None,
) -> str:
    """Selenium ``get_cookies()`` / ``get_all_cookies()`` → значение заголовка Cookie.

    Формат: ``name=value; name2=value2`` (RFC-стиль для request Cookie).
    Пустые name пропускаем. При ``names`` — только перечисленные (порядок jar).
    """
    if not cookies:
        return ""
    allow = {n.strip() for n in names} if names else None
    if allow is not None:
        allow = {n for n in allow if n}
    parts: list[str] = []
    seen: set[str] = set()
    for item in cookies:
        if not isinstance(item, Mapping):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        if allow is not None and name not in allow:
            continue
        # Последнее вхождение имени побеждает (как в типичном jar).
        if name in seen:
            parts = [p for p in parts if not p.startswith(name + "=")]
            seen.discard(name)
        value = item.get("value")
        if value is None:
            value = ""
        parts.append(f"{name}={value}")
        seen.add(name)
    return "; ".join(parts)


def cookie_names_from_jar(
    cookies: Sequence[Mapping[str, Any]] | Iterable[Mapping[str, Any]] | None,
) -> list[str]:
    """Имена cookie для evidence/meta — без значений."""
    if not cookies:
        return []
    names: list[str] = []
    seen: set[str] = set()
    for item in cookies:
        if not isinstance(item, Mapping):
            continue
        name = str(item.get("name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        names.append(name)
    return names


def request_headers_from_browser_cookies(
    cookies: Sequence[Mapping[str, Any]] | None,
    *,
    base_headers: Mapping[str, str] | None = None,
    cookie_names: Sequence[str] | None = None,
) -> Dict[str, str]:
    """Собрать headers для sender: base + Cookie из browser jar."""
    headers = {str(k): str(v) for k, v in dict(base_headers or {}).items()}
    cookie_header = cookie_header_from_jar(cookies, names=cookie_names)
    if cookie_header:
        # Канон имени как у History replay в fuzzing.merge_request_headers.
        headers["Cookie"] = cookie_header
    return headers


def browser_cookie_meta(
    cookies: Sequence[Mapping[str, Any]] | None,
) -> Dict[str, object]:
    """Meta для evidence/Live: флаги и имена, не значения."""
    names = cookie_names_from_jar(cookies)
    return {
        "session_source": "browser_jar",
        "has_cookie": bool(names),
        "cookie_names": names,
        "cookies_count": len(names),
    }


def storage_map_from_entries(
    entries: Sequence[Any] | None,
) -> Dict[str, str]:
    """``Object.entries(storage)`` / list of pairs → ``{key: value}``."""
    out: Dict[str, str] = {}
    if not entries:
        return out
    for item in entries:
        key = ""
        value: Any = ""
        if isinstance(item, Mapping):
            key = str(item.get("name") or item.get("key") or "").strip()
            value = item.get("value")
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            key = str(item[0] or "").strip()
            value = item[1]
        if not key:
            continue
        out[key] = "" if value is None else str(value)
    return out


def storage_key_names(
    *maps: Mapping[str, Any] | None,
) -> list[str]:
    """Имена ключей storage для evidence — без значений."""
    names: list[str] = []
    seen: set[str] = set()
    for mp in maps:
        if not mp:
            continue
        for key in mp:
            name = str(key or "").strip()
            if not name or name in seen:
                continue
            seen.add(name)
            names.append(name)
    return names


def pick_token_from_storage(
    *maps: Mapping[str, str] | None,
    token_keys: Sequence[str] | None = None,
) -> tuple[str, str]:
    """Первый непустой токен из storage → ``(key_name, value)`` или ``("", "")``."""
    keys = [k.strip() for k in (token_keys or DEFAULT_TOKEN_STORAGE_KEYS) if k and str(k).strip()]
    for mp in maps:
        if not mp:
            continue
        lower_index = {str(k).lower(): (str(k), str(v)) for k, v in mp.items() if k}
        for want in keys:
            hit = lower_index.get(want.lower())
            if hit is None:
                continue
            name, value = hit
            if value.strip():
                return name, value
    return "", ""


def request_headers_from_browser_storage(
    local_storage: Mapping[str, str] | Sequence[Any] | None = None,
    session_storage: Mapping[str, str] | Sequence[Any] | None = None,
    *,
    base_headers: Mapping[str, str] | None = None,
    token_keys: Sequence[str] | None = None,
) -> Dict[str, str]:
    """S-1: JWT/token из storage → ``Authorization: Bearer …`` (+ merge base)."""
    headers = {str(k): str(v) for k, v in dict(base_headers or {}).items()}
    local_map = (
        dict(local_storage)
        if isinstance(local_storage, Mapping)
        else storage_map_from_entries(local_storage)
    )
    session_map = (
        dict(session_storage)
        if isinstance(session_storage, Mapping)
        else storage_map_from_entries(session_storage)
    )
    _key_name, token = pick_token_from_storage(
        local_map, session_map, token_keys=token_keys
    )
    if not token:
        return headers
    # Не затираем явный Authorization из base/History.
    has_auth = any(str(k).lower() == "authorization" for k in headers)
    if not has_auth:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def browser_storage_meta(
    local_storage: Mapping[str, str] | Sequence[Any] | None = None,
    session_storage: Mapping[str, str] | Sequence[Any] | None = None,
    *,
    token_keys: Sequence[str] | None = None,
) -> Dict[str, object]:
    """S-2: meta storage — только имена ключей / флаги, не JWT."""
    local_map = (
        dict(local_storage)
        if isinstance(local_storage, Mapping)
        else storage_map_from_entries(local_storage)
    )
    session_map = (
        dict(session_storage)
        if isinstance(session_storage, Mapping)
        else storage_map_from_entries(session_storage)
    )
    names = storage_key_names(local_map, session_map)
    token_key, token_val = pick_token_from_storage(
        local_map, session_map, token_keys=token_keys
    )
    return {
        "session_source": "browser_storage",
        "has_storage_token": bool(token_key and token_val),
        "storage_token_key": token_key or "",
        "storage_key_names": names,
        "storage_keys_count": len(names),
    }


def _as_name_list(raw: Any) -> list[str]:
    """Нормализовать ZAP/JSON ответ в список имён (без значений)."""
    if raw is None:
        return []
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        if text.startswith("[") or text.startswith("{"):
            try:
                return _as_name_list(json.loads(text))
            except Exception:
                return [text] if len(text) < 200 else []
        return [text]
    if isinstance(raw, Mapping):
        for key in ("sites", "sessions", "session", "names", "site"):
            if key in raw:
                return _as_name_list(raw.get(key))
        name = str(raw.get("name") or raw.get("session") or "").strip()
        return [name] if name else []
    if isinstance(raw, (list, tuple)):
        out: list[str] = []
        seen: set[str] = set()
        for item in raw:
            if isinstance(item, str):
                name = item.strip()
            elif isinstance(item, Mapping):
                name = str(item.get("name") or item.get("session") or "").strip()
            else:
                name = str(item or "").strip()
            if not name or name in seen:
                continue
            seen.add(name)
            out.append(name)
        return out
    return []


def http_sessions_snapshot_meta(
    sites_raw: Any = None,
    sessions_by_site: Mapping[str, Any] | None = None,
) -> Dict[str, object]:
    """S-3 / N2.5: имена сайтов и session labels из ZAP httpSessions — без cookie/token."""
    sites = _as_name_list(sites_raw)
    session_names: list[str] = []
    seen: set[str] = set()
    for _site, raw in dict(sessions_by_site or {}).items():
        for name in _as_name_list(raw):
            if name in seen:
                continue
            seen.add(name)
            session_names.append(name)
    return {
        "http_sessions_sites": sites,
        "http_sessions_sites_count": len(sites),
        "http_session_names": session_names[:50],
        "http_sessions_count": len(session_names),
    }


def read_http_sessions_snapshot(zap: Any, *, base_url: str = "") -> Dict[str, object]:
    """Best-effort снимок httpSessions с живого ZapAdapter."""
    if zap is None:
        return http_sessions_snapshot_meta()
    sites_raw = None
    getter_sites = getattr(zap, "get_sessions_sites", None)
    try:
        if callable(getter_sites):
            sites_raw = getter_sites()
    except Exception:
        sites_raw = None
    sites = _as_name_list(sites_raw)
    # Prefer origin host match when base_url known.
    prefer = ""
    if base_url:
        try:
            prefer = (urlsplit(base_url).hostname or "").strip().lower()
        except Exception:
            prefer = ""
    ordered = list(sites)
    if prefer:
        ordered = sorted(
            sites,
            key=lambda s: (0 if prefer in str(s).lower() else 1, str(s)),
        )
    sessions_by_site: Dict[str, Any] = {}
    getter = getattr(zap, "get_site_sessions", None)
    for site in ordered[:8]:
        if not callable(getter):
            break
        try:
            sessions_by_site[str(site)] = getter(site)
        except Exception:
            continue
    return http_sessions_snapshot_meta(sites_raw, sessions_by_site)


def read_browser_storage_maps(browser: Any) -> tuple[Dict[str, str], Dict[str, str]]:
    """Считать local/session storage с живого BrowserAdapter (best-effort)."""
    if browser is None:
        return {}, {}
    local_entries: List[Any] = []
    session_entries: List[Any] = []
    getter_local = getattr(browser, "get_local_storage_entries", None)
    getter_session = getattr(browser, "get_session_storage_entries", None)
    try:
        if callable(getter_local):
            local_entries = list(getter_local() or [])
        else:
            exec_script = getattr(browser, "_execute_script", None)
            if callable(exec_script):
                local_entries = list(exec_script("return Object.entries(localStorage);") or [])
    except Exception:
        local_entries = []
    try:
        if callable(getter_session):
            session_entries = list(getter_session() or [])
        else:
            exec_script = getattr(browser, "_execute_script", None)
            if callable(exec_script):
                session_entries = list(
                    exec_script("return Object.entries(sessionStorage);") or []
                )
    except Exception:
        session_entries = []
    return (
        storage_map_from_entries(local_entries),
        storage_map_from_entries(session_entries),
    )
