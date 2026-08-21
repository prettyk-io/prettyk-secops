# -*- coding: utf-8 -*-
"""Lab GraphQL → operations list (IMP-GQL). Authoring/lab only; no executor."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

# Rough SDL field head: name (optional args) : Type… — no nested quantifiers (S8786).
_FIELD_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


class GraphQlParseError(ValueError):
    pass


def lab_graphql_shape(
    *,
    endpoint: str = "",
    headers: Optional[Dict[str, str]] = None,
    sdl: str = "",
    schema_url: str = "",
) -> Dict[str, Any]:
    """Lab shape до SoT-кивка (не писать в docs/Wired.json)."""
    return {
        "kind": "graphql_lab",
        "endpoint": endpoint,
        "headers": dict(headers or {}),
        "sdl": sdl,
        "schema_url": schema_url,
        "executor": False,
        "notes": ["нет runtime executor — authoring/lab inventory only"],
    }


def _ops_from_type_fields(type_name: str, fields: Any, kind: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not isinstance(fields, list):
        return out
    for field in fields:
        if not isinstance(field, dict):
            continue
        name = field.get("name")
        if not name:
            continue
        out.append(
            {
                "kind": kind,
                "name": str(name),
                "type": type_name,
                "description": str(field.get("description") or "")[:240],
            }
        )
    return out


def parse_introspection_ops(raw: str | Dict[str, Any]) -> Dict[str, Any]:
    """Introspection JSON (__schema) → query/mutation/subscription field list."""
    doc = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(doc, dict):
        raise GraphQlParseError("introspection root должен быть object")
    data = doc.get("data") if "data" in doc else doc
    schema = (data or {}).get("__schema") if isinstance(data, dict) else None
    if not isinstance(schema, dict):
        raise GraphQlParseError("нет __schema в introspection")

    types = {t.get("name"): t for t in (schema.get("types") or []) if isinstance(t, dict)}
    operations: List[Dict[str, Any]] = []
    notes: List[str] = []

    for root_key, kind in (
        ("queryType", "query"),
        ("mutationType", "mutation"),
        ("subscriptionType", "subscription"),
    ):
        root = schema.get(root_key)
        if not isinstance(root, dict) or not root.get("name"):
            continue
        type_name = str(root["name"])
        tdef = types.get(type_name) or {}
        ops = _ops_from_type_fields(type_name, tdef.get("fields"), kind)
        if not ops:
            notes.append(f"{kind}: тип {type_name} без fields")
        operations.extend(ops)

    if not operations:
        notes.append("introspection без query/mutation fields")
    return {"source": "introspection", "operations": operations, "notes": notes}


def parse_sdl_ops(sdl: str) -> Dict[str, Any]:
    """Минимальный SDL scrape: блоки type Query/Mutation/Subscription."""
    text = sdl or ""
    if not text.strip():
        raise GraphQlParseError("пустой SDL")

    operations: List[Dict[str, Any]] = []
    notes: List[str] = []
    type_blocks = re.finditer(
        r"type\s+(Query|Mutation|Subscription)\s*\{([^}]*)\}",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    found = False
    for match in type_blocks:
        found = True
        kind = match.group(1).lower()
        body = match.group(2)
        type_name = match.group(1)
        for line in body.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            head = line.rstrip(",").strip()
            m = _FIELD_NAME.match(head)
            if not m:
                continue
            rest = head[m.end() :].lstrip()
            if rest.startswith("("):
                depth = 0
                cut = -1
                for i, ch in enumerate(rest):
                    if ch == "(":
                        depth += 1
                    elif ch == ")":
                        depth -= 1
                        if depth == 0:
                            cut = i
                            break
                if cut < 0:
                    continue
                rest = rest[cut + 1 :].lstrip()
            if not rest.startswith(":"):
                continue
            operations.append(
                {
                    "kind": kind,
                    "name": m.group(0),
                    "type": type_name,
                    "description": "",
                }
            )
    if not found:
        raise GraphQlParseError("в SDL нет type Query|Mutation|Subscription")
    if not operations:
        notes.append("блоки root types пусты")
    return {"source": "sdl", "operations": operations, "notes": notes}


def build_query_leaf_poc(
    operation_name: str,
    *,
    endpoint: str,
    kind: str = "query",
) -> Dict[str, Any]:
    """HTTP leaf PoC (тело) — не исполняет сеть само по себе."""
    op = operation_name.strip()
    if not op:
        return {
            "ok": False,
            "notes": ["пустое имя operation"],
            "request": None,
        }
    if kind not in ("query", "mutation"):
        return {
            "ok": False,
            "notes": [f"kind {kind!r} не для leaf PoC"],
            "request": None,
        }
    body = {kind: f"{{ {op} }}"}
    # GraphQL HTTP: {"query": "..."} даже для mutation keyword внутри
    gql = f"{kind} {{ {op} }}"
    return {
        "ok": True,
        "notes": ["lab PoC body; executor не вызван"],
        "request": {
            "method": "POST",
            "url": endpoint,
            "headers": {"Content-Type": "application/json"},
            "json": {"query": gql},
            "body_hint": body,
        },
    }
