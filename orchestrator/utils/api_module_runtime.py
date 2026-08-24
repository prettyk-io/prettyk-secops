# -*- coding: utf-8 -*-
"""
Мост исполнения для module_type OpenAPI / GraphQL.

Модуль = контракт + перечень операций + явные флаги ZAP; сам по себе сканером не является.
"""
from __future__ import annotations

import base64
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urljoin

from core.auth_module import load_auth_profile_from_wired
from core.errors import WiredError
from models.wired import Wired
from utils.api_import_lab import dumps_ops, read_local_text
from utils.attack_target import (
    attack_base_url,
    resolve_attack_relative_or_allowlisted,
)
from utils.graphql_ops import GraphQlParseError, parse_introspection_ops, parse_sdl_ops
from utils.openapi_ops import OpenApiParseError, parse_openapi_ops

OPENAPI_MODULE_TYPE = "OpenAPI"
GRAPHQL_MODULE_TYPE = "GraphQL"
_API_MODULE_TYPES = frozenset({OPENAPI_MODULE_TYPE, GRAPHQL_MODULE_TYPE})


@dataclass
class ResolvedOpenApi:
    module_id: str = ""
    from_module: bool = False
    spec: str = ""
    base_url: str = ""
    auth_module_id: str = ""
    zap_import: bool = False
    notes: List[str] = field(default_factory=list)


@dataclass
class ResolvedGraphql:
    module_id: str = ""
    from_module: bool = False
    schema: str = ""
    endpoint: str = ""
    headers: Dict[str, str] = field(default_factory=dict)
    auth_module_id: str = ""
    zap_import: bool = False
    zap_scan: bool = False
    notes: List[str] = field(default_factory=list)


def env_force_zap_import(*, openapi: bool = True) -> bool:
    if openapi:
        keys = ("KDT_OPENAPI_ZAP_IMPORT", "KDT_API_ZAP_IMPORT")
    else:
        keys = ("KDT_GRAPHQL_ZAP_IMPORT", "KDT_API_ZAP_IMPORT")
    for key in keys:
        raw = (os.environ.get(key) or "").strip().lower()
        if raw in ("1", "true", "yes", "on"):
            return True
    return False


def env_force_zap_scan(*, openapi: bool = False) -> bool:
    if openapi:
        keys = ("KDT_OPENAPI_ZAP_SCAN", "KDT_API_ZAP_SCAN")
    else:
        keys = ("KDT_GRAPHQL_ZAP_SCAN", "KDT_API_ZAP_SCAN")
    for key in keys:
        raw = (os.environ.get(key) or "").strip().lower()
        if raw in ("1", "true", "yes", "on"):
            return True
    return False


def find_api_module(
    wired: Any,
    module_id: str,
    *,
    module_types: Optional[Sequence[str]] = None,
) -> Any:
    mid = (module_id or "").strip()
    if not mid or wired is None:
        return None
    allowed = set(module_types) if module_types else set(_API_MODULE_TYPES)
    suites = getattr(wired, "test_suites", None)
    if suites is None:
        return None
    for mod in getattr(suites, "test_data_constructor", None) or []:
        if (getattr(mod, "id", None) or "").strip() != mid:
            continue
        mtype = getattr(mod, "module_type", None) or ""
        if mtype in allowed:
            return mod
    return None


def _fields_dict(mod: Any, attr: str) -> Dict[str, Any]:
    raw = getattr(mod, attr, None)
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if hasattr(raw, "model_dump"):
        return raw.model_dump()
    out: Dict[str, Any] = {}
    for key in (
        "spec_mode",
        "spec_as",
        "spec_path_rel",
        "spec_source",
        "spec_url",
        "spec_path",
        "base_url_override",
        "auth_module_id",
        "zap_import",
        "last_inventory",
        "schema_mode",
        "sdl_as",
        "schema_path_rel",
        "endpoint_rel",
        "endpoint",
        "schema_source",
        "schema_url",
        "sdl_path",
        "sdl_text",
        "headers",
        "zap_scan",
    ):
        if hasattr(raw, key):
            out[key] = getattr(raw, key)
    return out


def _find_import(wired: Any, as_name: str, kind: str) -> Any:
    key = (as_name or "").strip()
    if not key or wired is None:
        return None
    suites = getattr(wired, "test_suites", None)
    if suites is None:
        return None
    for item in getattr(suites, "imports", None) or []:
        if (getattr(item, "kind", None) or "") != kind:
            continue
        if (getattr(item, "as_name", None) or "").strip() == key:
            return item
    return None


def _resolve_import_file_path(wired: Any, path: str) -> str:
    from pathlib import Path

    raw = (path or "").strip()
    if not raw:
        raise WiredError("пустой path ресурса")
    p = Path(raw)
    if p.is_file():
        return str(p.resolve())
    mdir = getattr(wired, "_wired_dir", None) or getattr(
        Wired, "wired_dir", None
    )
    candidates = []
    if mdir:
        candidates.append(Path(mdir) / raw)
    candidates.append(Path.cwd() / raw)
    for cand in candidates:
        if cand.is_file():
            return str(cand.resolve())
    raise WiredError(f"файл ресурса не найден: {raw}")


def _bind_wired_dir(wired: Any, wired_dir: Optional[str]) -> None:
    if not wired_dir or getattr(wired, "_wired_dir", None):
        return
    try:
        setattr(Wired, "_wired_dir", wired_dir)
    except Exception:  # noqa: BLE001
        pass


def _resolve_named_import_path(
    wired: Any,
    *,
    name: str,
    kind: str,
    wired_dir: Optional[str],
    missing_note: str,
) -> Tuple[Optional[str], List[str]]:
    notes: List[str] = []
    imp = _find_import(wired, name, kind)
    if imp is None:
        notes.append(missing_note)
        return None, notes
    try:
        _bind_wired_dir(wired, wired_dir)
        return _resolve_import_file_path(
            wired, getattr(imp, "path", "") or ""
        ), notes
    except WiredError as exc:
        notes.append(str(exc))
        return None, notes


def _openapi_spec_from_fields(
    out: ResolvedOpenApi,
    wired: Any,
    fields: Dict[str, Any],
    *,
    module_id: str,
    wired_dir: Optional[str],
) -> None:
    mode = (fields.get("spec_mode") or "").strip()
    if not mode:
        legacy_src = (fields.get("spec_source") or "url").strip()
        mode = "resource" if legacy_src == "file" else "url_relative"

    if mode == "resource":
        spec_as = str(fields.get("spec_as") or "").strip()
        legacy_path = str(fields.get("spec_path") or "").strip()
        if spec_as:
            path, notes = _resolve_named_import_path(
                wired,
                name=spec_as,
                kind="openapi_spec",
                wired_dir=wired_dir,
                missing_note=f"ресурс openapi_spec не найден: {spec_as}",
            )
            out.notes.extend(notes)
            if path:
                out.spec = path
        elif legacy_path:
            out.spec = legacy_path
            out.notes.append("legacy spec_path (предпочтите ресурс openapi_spec)")
        else:
            out.notes.append(f"модуль {module_id}: не задан spec_as")
        return

    rel = str(fields.get("spec_path_rel") or fields.get("spec_url") or "").strip()
    if not rel:
        rel = "/openapi.json"
    try:
        out.spec = resolve_attack_relative_or_allowlisted(
            wired, rel, label="схема OpenAPI"
        )
    except WiredError as exc:
        out.notes.append(str(exc))
        out.spec = rel


def resolve_openapi_arg(
    wired: Any,
    arg: str,
    *,
    wired_dir: Optional[str] = None,
) -> ResolvedOpenApi:
    """module id → cascade; иначе raw url/path (lab)."""
    raw = (arg or "").strip()
    out = ResolvedOpenApi(spec=raw)
    if not raw:
        out.notes.append("пустой аргумент OpenAPI")
        return out
    mod = find_api_module(wired, raw, module_types=[OPENAPI_MODULE_TYPE])
    if mod is None:
        return out
    fields = _fields_dict(mod, "openapi_fields")
    out.module_id = raw
    out.from_module = True
    out.auth_module_id = str(fields.get("auth_module_id") or "").strip()
    out.zap_import = bool(fields.get("zap_import"))
    try:
        out.base_url = attack_base_url(wired)
    except WiredError as exc:
        out.notes.append(str(exc))
        out.base_url = ""

    _openapi_spec_from_fields(
        out, wired, fields, module_id=raw, wired_dir=wired_dir
    )
    if not out.spec:
        out.notes.append(f"модуль {raw}: пуста схема OpenAPI")
    out.notes.append(f"модуль OpenAPI: {raw}")
    return out


def _graphql_mode(fields: Dict[str, Any]) -> str:
    mode = (fields.get("schema_mode") or "").strip()
    if mode:
        return mode
    legacy = (fields.get("schema_source") or "introspection_url").strip()
    if legacy == "sdl_file":
        return "resource"
    if legacy == "sdl_inline":
        return "inline_legacy"
    return "introspection_relative"


def _graphql_schema_from_fields(
    out: ResolvedGraphql,
    wired: Any,
    fields: Dict[str, Any],
    *,
    module_id: str,
    wired_dir: Optional[str],
    endpoint_rel: str,
) -> None:
    mode = _graphql_mode(fields)
    if mode == "resource":
        sdl_as = str(fields.get("sdl_as") or "").strip()
        legacy_sdl = str(fields.get("sdl_path") or "").strip()
        if sdl_as:
            path, notes = _resolve_named_import_path(
                wired,
                name=sdl_as,
                kind="graphql_sdl",
                wired_dir=wired_dir,
                missing_note=f"ресурс graphql_sdl не найден: {sdl_as}",
            )
            out.notes.extend(notes)
            if path:
                out.schema = path
        elif legacy_sdl:
            out.schema = legacy_sdl
            out.notes.append("legacy sdl_path (предпочтите ресурс graphql_sdl)")
        else:
            out.notes.append(f"модуль {module_id}: не задан sdl_as")
        return
    if mode == "inline_legacy":
        out.schema = str(fields.get("sdl_text") or "").strip()
        out.notes.append("legacy sdl_inline")
        return
    rel = str(
        fields.get("schema_path_rel") or fields.get("schema_url") or endpoint_rel
    ).strip() or "/graphql"
    try:
        out.schema = resolve_attack_relative_or_allowlisted(
            wired, rel, label="схема GraphQL"
        )
    except WiredError as exc:
        out.notes.append(str(exc))
        out.schema = rel


def resolve_graphql_arg(
    wired: Any,
    arg: str,
    *,
    wired_dir: Optional[str] = None,
) -> ResolvedGraphql:
    raw = (arg or "").strip()
    out = ResolvedGraphql(schema=raw)
    if not raw:
        out.notes.append("пустой аргумент GraphQL")
        return out
    mod = find_api_module(wired, raw, module_types=[GRAPHQL_MODULE_TYPE])
    if mod is None:
        return out
    fields = _fields_dict(mod, "graphql_fields")
    out.module_id = raw
    out.from_module = True
    out.auth_module_id = str(fields.get("auth_module_id") or "").strip()
    out.zap_import = bool(fields.get("zap_import"))
    out.zap_scan = bool(fields.get("zap_scan"))

    endpoint_rel = str(
        fields.get("endpoint_rel") or fields.get("endpoint") or "/graphql"
    ).strip() or "/graphql"
    try:
        out.endpoint = resolve_attack_relative_or_allowlisted(
            wired, endpoint_rel, label="GraphQL endpoint"
        )
    except WiredError as exc:
        out.notes.append(str(exc))
        out.endpoint = endpoint_rel

    _graphql_schema_from_fields(
        out,
        wired,
        fields,
        module_id=raw,
        wired_dir=wired_dir,
        endpoint_rel=endpoint_rel,
    )
    headers = fields.get("headers") or {}
    if isinstance(headers, dict):
        out.headers = {str(k): str(v) for k, v in headers.items()}
    if not out.schema:
        out.notes.append(f"модуль {raw}: пуста schema/sdl")
    out.notes.append(f"модуль GraphQL: {raw}")
    return out


def _auth_headers_for_kind(
    kind: str, values: Dict[str, Any], mid: str
) -> Tuple[Dict[str, str], List[str]]:
    headers: Dict[str, str] = {}
    notes: List[str] = []
    if kind == "bearer":
        token = (values.get("token") or "").strip()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        else:
            notes.append(f"auth {mid}: bearer без token")
    elif kind == "basic":
        user = (values.get("login") or values.get("username") or "").strip()
        password = (values.get("password") or "").strip()
        if user:
            token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
            headers["Authorization"] = f"Basic {token}"
        else:
            notes.append(f"auth {mid}: basic без login")
    elif kind == "header":
        name = (values.get("header") or "").strip()
        value = (values.get("value") or values.get("token") or "").strip()
        if name and value:
            headers[name] = value
        else:
            notes.append(f"auth {mid}: header без имени/значения")
    elif kind == "cookie":
        cookie = (values.get("cookie") or "").strip()
        if cookie:
            headers["Cookie"] = cookie
        else:
            notes.append(f"auth {mid}: cookie пуст")
    elif kind == "chain":
        notes.append(
            f"auth {mid}: chain — нужен ПрименитьAuth/цепочка; статические заголовки пусты"
        )
    return headers, notes


def static_auth_headers(wired: Any, auth_module_id: str) -> Tuple[Dict[str, str], List[str]]:
    """Статические headers из Auth IR (chain без исполнения → note)."""
    notes: List[str] = []
    mid = (auth_module_id or "").strip()
    if not mid:
        return {}, notes
    profile, load_notes = load_auth_profile_from_wired(wired, mid)
    notes.extend(load_notes)
    if profile is None:
        return {}, notes
    headers, kind_notes = _auth_headers_for_kind(profile.kind, profile.values, mid)
    notes.extend(kind_notes)
    return headers, notes


def allow_zap_import(*, module_flag: bool, openapi: bool) -> Tuple[bool, List[str]]:
    if env_force_zap_import(openapi=openapi):
        return True, ["импорт в ZAP принудительно включён (переменная окружения)"]
    if module_flag:
        return True, []
    return False, ["импорт в ZAP выключен в модуле — шаг пропущен"]


def allow_zap_scan(
    *,
    module_flag: bool,
    openapi: bool,
    from_module: bool,
) -> Tuple[bool, List[str]]:
    if not from_module:
        return True, []
    if env_force_zap_scan(openapi=openapi):
        return True, ["скан в ZAP принудительно включён (переменная окружения)"]
    if openapi:
        # OpenAPI SoT: zap_import gates scan when arg is module id
        if module_flag:
            return True, []
        return False, ["импорт/скан в ZAP выключен в модуле — шаг пропущен"]
    if module_flag:
        return True, []
    return False, ["скан GraphQL в ZAP выключен в модуле — шаг пропущен"]


def inventory_openapi(spec: str) -> Dict[str, Any]:
    text, notes = read_local_text(spec)
    if text is None:
        return {"ok": False, "operations": [], "notes": notes}
    try:
        parsed = parse_openapi_ops(text)
        return {
            "ok": True,
            "kind": parsed.get("kind"),
            "base_url": parsed.get("base_url"),
            "operations": parsed.get("operations") or [],
            "notes": list(parsed.get("notes") or []) + notes,
        }
    except OpenApiParseError as exc:
        return {"ok": False, "operations": [], "notes": notes + [str(exc)]}


def inventory_graphql(schema: str) -> Dict[str, Any]:
    text, notes = read_local_text(schema)
    if text is None:
        return {"ok": False, "operations": [], "notes": notes}
    stripped = text.lstrip("\ufeff").strip()
    try:
        parsed = (
            parse_introspection_ops(stripped)
            if stripped.startswith("{")
            else parse_sdl_ops(stripped)
        )
        return {
            "ok": True,
            "source": parsed.get("source"),
            "operations": parsed.get("operations") or [],
            "notes": list(parsed.get("notes") or []) + notes,
        }
    except GraphQlParseError as exc:
        return {"ok": False, "operations": [], "notes": notes + [str(exc)]}


def _join_url(base: str, path: str) -> str:
    b = (base or "").strip()
    p = (path or "").strip()
    if p.startswith(("http://", "https://")):
        return p
    if not b:
        return p
    return urljoin(b.rstrip("/") + "/", p.lstrip("/"))


def _pick_openapi_ops(
    operations: Sequence[Dict[str, Any]], limit: int
) -> List[Dict[str, Any]]:
    lim = max(0, int(limit))
    picked: List[Dict[str, Any]] = []
    for op in operations:
        method = str(op.get("method") or "GET").upper()
        path = str(op.get("path") or op.get("url") or "")
        if "{" in path or "}" in path or method != "GET":
            continue
        picked.append(op)
        if len(picked) >= lim:
            return picked
    if picked:
        return picked
    for op in operations:
        path = str(op.get("path") or op.get("url") or "")
        if "{" in path or "}" in path:
            continue
        picked.append(op)
        if len(picked) >= lim:
            break
    return picked


def _http_call(
    http_adapter: Any, method: str, url: str, headers: Optional[Dict[str, str]]
) -> Any:
    hdrs = headers or None
    if method == "GET":
        return http_adapter.get(url, headers=hdrs)
    if method == "POST":
        return http_adapter.post(url, json_data={}, headers=hdrs)
    if method == "PUT":
        return http_adapter.put(url, json_data={}, headers=hdrs)
    if method == "DELETE":
        return http_adapter.delete(url, headers=hdrs)
    if method == "PATCH":
        return http_adapter.patch(url, json_data={}, headers=hdrs)
    if method == "HEAD":
        return http_adapter.head(url, headers=hdrs)
    if method == "OPTIONS":
        return http_adapter.options(url, headers=hdrs)
    raise ValueError(f"unsupported method {method}")


def execute_openapi_operations(
    http_adapter: Any,
    *,
    operations: Sequence[Dict[str, Any]],
    base_url: str = "",
    headers: Optional[Dict[str, str]] = None,
    limit: int = 5,
) -> Dict[str, Any]:
    """
    Выполнить простые операции (сначала GET без параметров пути) через HttpAdapter.
    Трафик может идти через прокси ZAP. Активное сканирование не запускает.
    """
    notes: List[str] = []
    results: List[Dict[str, Any]] = []
    picked = _pick_openapi_ops(operations, limit)
    if not picked:
        notes.append("нет операций без параметров пути для выполнения")
        return {"ok": True, "attempted": 0, "results": [], "notes": notes}

    hdrs = dict(headers or {})
    for op in picked:
        method = str(op.get("method") or "GET").upper()
        path = str(op.get("path") or op.get("url") or "")
        url = _join_url(base_url, path)
        try:
            resp = _http_call(http_adapter, method, url, hdrs or None)
        except ValueError:
            notes.append(f"метод пропущен: {method} {path}")
            continue
        except Exception as exc:  # noqa: BLE001
            results.append({"method": method, "url": url, "error": str(exc)})
            notes.append(f"{method} {url}: {exc}")
            continue
        status = resp.get("status") if isinstance(resp, dict) else None
        results.append({"method": method, "url": url, "status": status})
    return {
        "ok": True,
        "attempted": len(results),
        "results": results,
        "notes": notes + ["только HTTP-запросы — активное сканирование ZAP не запускалось"],
    }


def default_graphql_query(operations: Sequence[Dict[str, Any]]) -> str:
    for op in operations:
        if str(op.get("kind") or "").lower() == "query" or op.get("name"):
            name = str(op.get("name") or "").strip()
            if name and name not in ("__schema", "__type"):
                return "{ %s }" % name
    return "{ __typename }"


def execute_graphql_request(
    http_adapter: Any,
    *,
    endpoint: str,
    query: str,
    headers: Optional[Dict[str, str]] = None,
    variables: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    ep = (endpoint or "").strip()
    q = (query or "").strip()
    notes: List[str] = []
    if not ep:
        return {"ok": False, "notes": ["URL GraphQL пуст"], "response": None}
    if not q:
        return {"ok": False, "notes": ["запрос GraphQL пуст"], "response": None}
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    body = {"query": q}
    if variables:
        body["variables"] = variables
    try:
        resp = http_adapter.post(ep, json_data=body, headers=hdrs)
        return {
            "ok": True,
            "endpoint": ep,
            "query": q,
            "status": resp.get("status") if isinstance(resp, dict) else None,
            "response": resp.get("json") if isinstance(resp, dict) else None,
            "notes": notes + ["только выполнение запроса — активное сканирование ZAP не запускалось"],
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "endpoint": ep,
            "query": q,
            "response": None,
            "notes": notes + [str(exc)],
        }


def dumps_runtime(payload: Dict[str, Any]) -> str:
    return dumps_ops(payload)
