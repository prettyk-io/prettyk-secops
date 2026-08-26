# -*- coding: utf-8 -*-
"""Lab OpenAPI / Swagger → normalized operations (IMP-OA).

Не запускает ZAP scan от галочки анкеты. SoT-манифест не трогает.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urljoin

from utils.env_dual import pk_env_name

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None  # type: ignore


HTTP_METHODS = ("get", "put", "post", "delete", "options", "head", "patch", "trace")
FUZZ_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE"})


class OpenApiParseError(ValueError):
    """Честный reject: не OAS3/Swagger2 или битый документ."""


def _load_document(raw: str | bytes | Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    text = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else str(raw)
    text = text.lstrip("\ufeff").strip()
    if not text:
        raise OpenApiParseError("пустой OpenAPI документ")
    if text.startswith("{") or text.startswith("["):
        data = json.loads(text)
    else:
        if yaml is None:
            raise OpenApiParseError("YAML OpenAPI требует pyyaml")
        data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise OpenApiParseError("корень OpenAPI должен быть object")
    return data


def detect_spec_kind(doc: Dict[str, Any]) -> str:
    if isinstance(doc.get("openapi"), str) and str(doc["openapi"]).startswith("3."):
        return "openapi3"
    if doc.get("swagger") == "2.0" or str(doc.get("swagger") or "") == "2.0":
        return "swagger2"
    raise OpenApiParseError(
        "ожидался OpenAPI 3.x (openapi:) или Swagger 2.0 (swagger: 2.0)"
    )


def _servers_base(doc: Dict[str, Any], kind: str) -> str:
    if kind == "openapi3":
        servers = doc.get("servers") or []
        if isinstance(servers, list) and servers:
            url = servers[0].get("url") if isinstance(servers[0], dict) else None
            if url:
                return str(url).rstrip("/") + "/"
        return "/"
    # swagger2
    host = str(doc.get("host") or "").strip()
    base_path = str(doc.get("basePath") or "/").strip() or "/"
    schemes = doc.get("schemes") or ["https"]
    scheme = schemes[0] if isinstance(schemes, list) and schemes else "https"
    if not host:
        return base_path if base_path.endswith("/") else base_path + "/"
    bp = base_path if base_path.startswith("/") else "/" + base_path
    return f"{scheme}://{host}{bp}".rstrip("/") + "/"


def _path_item_ops(path_item: Dict[str, Any]) -> List[Tuple[str, Dict[str, Any]]]:
    out: List[Tuple[str, Dict[str, Any]]] = []
    for method in HTTP_METHODS:
        op = path_item.get(method)
        if isinstance(op, dict):
            out.append((method.upper(), op))
    return out


def _operation_row(
    method: str,
    path_str: str,
    op: Dict[str, Any],
    resolved_base: str,
) -> Dict[str, Any]:
    op_id = op.get("operationId")
    tags = op.get("tags") if isinstance(op.get("tags"), list) else []
    summary = op.get("summary") or op.get("description") or ""
    url = urljoin(resolved_base, path_str.lstrip("/"))
    if path_str.startswith("/"):
        root = resolved_base.rstrip("/")
        url = root + path_str if root else path_str
    return {
        "method": method,
        "path": path_str,
        "operation_id": str(op_id) if op_id else None,
        "summary": str(summary)[:240] if summary else "",
        "tags": [str(t) for t in tags],
        "url": url,
    }


def parse_openapi_ops(
    raw: str | bytes | Dict[str, Any],
    *,
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    → {
        "kind": "openapi3"|"swagger2",
        "base_url": str,
        "operations": [
          {"method","path","operation_id","summary","tags","url"}
        ],
        "notes": [...]
      }
    """
    doc = _load_document(raw)
    kind = detect_spec_kind(doc)
    resolved_base = (base_url or _servers_base(doc, kind)).rstrip("/") + "/"
    paths = doc.get("paths") or {}
    if not isinstance(paths, dict):
        raise OpenApiParseError("paths должен быть object")

    operations: List[Dict[str, Any]] = []
    notes: List[str] = []
    for path_key, path_item in paths.items():
        if not isinstance(path_item, dict):
            notes.append(f"пропуск path {path_key!r}: не object")
            continue
        path_str = str(path_key)
        for method, op in _path_item_ops(path_item):
            operations.append(_operation_row(method, path_str, op, resolved_base))

    if not operations:
        notes.append("в spec нет HTTP operations")

    return {
        "kind": kind,
        "base_url": resolved_base.rstrip("/"),
        "operations": operations,
        "notes": notes,
    }


def ops_to_fuzz_targets(
    operations: Sequence[Dict[str, Any]],
    *,
    corpus: str = "intent_boundary",
    limit: int = 50,
    methods: Optional[Sequence[str]] = None,
) -> List[Dict[str, Any]]:
    """Кандидаты targets[] для SuiteFuzzer (opt-in, не авто-волна)."""
    allow = {m.upper() for m in (methods or FUZZ_METHODS)}
    targets: List[Dict[str, Any]] = []
    for op in operations:
        if len(targets) >= limit:
            break
        method = str(op.get("method") or "GET").upper()
        if method not in allow or method not in FUZZ_METHODS:
            continue
        url = str(op.get("url") or "").strip()
        if not url:
            continue
        targets.append(
            {
                "url": url,
                "method": method,  # type: ignore[dict-item]
                "corpus": corpus,
                "body": None,
            }
        )
    return targets


def seed_prettyk_comments(operations: Sequence[Dict[str, Any]], *, limit: int = 20) -> str:
    """Комментарии-seed для конструктора — не готовый suite."""
    lines = [
        "# OpenAPI ops (lab seed) — правь руками, это не автогенерация suite",
        f"# operations: {min(len(operations), limit)} / {len(operations)}",
    ]
    for op in list(operations)[:limit]:
        mid = op.get("operation_id") or ""
        tag = f" [{mid}]" if mid else ""
        lines.append(
            f"# {op.get('method')} {op.get('path')}{tag}"
            f" — {op.get('summary') or ''}".rstrip()
        )
    return "\n".join(lines) + "\n"


def try_zap_import_openapi(
    spec_url_or_file: str,
    *,
    zap_adapter: Any = None,
    env_flag: str = "PK_OPENAPI_ZAP_IMPORT",
) -> Dict[str, Any]:
    """
    Opt-in ZAP OpenAPI import. Без флага / адаптера → skipped (не fail прогона).
    """
    result: Dict[str, Any] = {
        "attempted": False,
        "imported": False,
        "skipped": True,
        "notes": [],
    }
    flag = pk_env_name(env_flag).strip().lower()
    if flag not in ("1", "true", "yes", "on"):
        result["notes"].append(f"{env_flag} не включён — ZAP import skipped")
        return result
    if zap_adapter is None:
        result["notes"].append("zap_adapter не передан — skipped")
        return result
    result["skipped"] = False
    result["attempted"] = True
    try:
        ok = bool(zap_adapter.import_openapi_spec(spec_url_or_file))
        result["imported"] = ok
        if not ok:
            result["notes"].append("import_openapi_spec вернул false")
    except Exception as exc:  # pragma: no cover - adapter errors
        result["notes"].append(f"ZAP import error: {exc}")
        result["imported"] = False
    return result


def load_openapi_file(path: str | Path) -> Dict[str, Any]:
    p = Path(path)
    return parse_openapi_ops(p.read_text(encoding="utf-8"))
