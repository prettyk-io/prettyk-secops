# -*- coding: utf-8 -*-
"""
Каскад gRPC: module → imports proto_pack → host/TLS из URL атаки манифеста.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.errors import WiredError
from utils.api_module_runtime import find_api_module, static_auth_headers
from utils.attack_target import assert_url_in_attack_scope, attack_host_tls

GRPC_MODULE_TYPE = "gRPC"


@dataclass
class ResolvedGrpc:
    module_id: str = ""
    from_module: bool = False
    proto_as: str = ""
    proto_path: str = ""
    import_paths: List[str] = field(default_factory=list)
    host: str = ""
    tls: bool = False
    auth_module_id: str = ""
    metadata: Dict[str, str] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)


def attack_target_from_wired(wired: Any) -> Tuple[str, bool, str]:
    return attack_host_tls(wired)


def assert_attack_host_allowed(wired: Any, abs_url: str) -> None:
    assert_url_in_attack_scope(wired, abs_url)


def reject_absolute_host_arg(arg: str, *, label: str = "аргумент") -> None:
    raw = (arg or "").strip()
    if not raw:
        return
    if "://" in raw:
        raise WiredError(
            f"gRPC: {label} — только относительный rpc (Service/Method); "
            f"хост берётся из URL атаки"
        )
    # host:port heuristic (digits after last colon)
    if ":" in raw and "/" not in raw:
        _, _, port = raw.rpartition(":")
        if port.isdigit():
            raise WiredError(
                f"gRPC: {label} не должен быть host:port — цель из URL атаки"
            )


def find_proto_pack_import(wired: Any, proto_as: str) -> Any:
    key = (proto_as or "").strip()
    if not key or wired is None:
        return None
    suites = getattr(wired, "test_suites", None)
    if suites is None:
        return None
    for item in getattr(suites, "imports", None) or []:
        kind = getattr(item, "kind", None) or "data_file"
        if kind != "proto_pack":
            continue
        as_name = (getattr(item, "as_name", None) or "").strip()
        if as_name == key:
            return item
    return None


def resolve_import_path(
    path: str,
    *,
    wired_dir: Optional[str] = None,
) -> str:
    raw = (path or "").strip()
    if not raw:
        raise WiredError("gRPC: пустой path ресурса proto_pack")
    candidates: List[Path] = []
    p = Path(raw)
    if p.exists():
        return str(p.resolve())
    if wired_dir:
        candidates.append(Path(wired_dir) / raw)
    candidates.append(Path.cwd() / raw)
    for cand in candidates:
        if cand.exists():
            return str(cand.resolve())
    raise WiredError(f"gRPC: файл/каталог proto не найден: {raw}")


def resolve_grpc_module(
    wired: Any,
    module_id: str,
    *,
    wired_dir: Optional[str] = None,
) -> ResolvedGrpc:
    mid = (module_id or "").strip()
    out = ResolvedGrpc()
    if not mid:
        out.notes.append("пустой идентификатор модуля gRPC")
        return out
    reject_absolute_host_arg(mid, label="идентификатор модуля")
    mod = find_api_module(wired, mid, module_types=[GRPC_MODULE_TYPE])
    if mod is None:
        out.notes.append(f"модуль gRPC не найден: {mid}")
        return out
    fields = getattr(mod, "grpc_fields", None)
    if fields is None:
        out.notes.append(f"модуль {mid}: нет grpc_fields")
        return out
    if hasattr(fields, "model_dump"):
        fd = fields.model_dump()
    elif isinstance(fields, dict):
        fd = fields
    else:
        fd = {
            "proto_as": getattr(fields, "proto_as", "") or "",
            "auth_module_id": getattr(fields, "auth_module_id", "") or "",
        }
    proto_as = str(fd.get("proto_as") or "").strip()
    auth_mid = str(fd.get("auth_module_id") or "").strip()
    out.module_id = mid
    out.from_module = True
    out.proto_as = proto_as
    out.auth_module_id = auth_mid
    if not proto_as:
        out.notes.append(f"модуль {mid}: не задан proto_as")
        return out
    imp = find_proto_pack_import(wired, proto_as)
    if imp is None:
        out.notes.append(f"ресурс proto_pack не найден: {proto_as}")
        return out
    out.proto_path = resolve_import_path(
        getattr(imp, "path", "") or "",
        wired_dir=wired_dir,
    )
    paths = getattr(imp, "import_paths", None) or []
    out.import_paths = [str(x).strip() for x in paths if str(x).strip()]
    host, tls, abs_url = attack_target_from_wired(wired)
    assert_attack_host_allowed(wired, abs_url)
    out.host = host
    out.tls = tls
    headers, auth_notes = static_auth_headers(wired, auth_mid)
    out.metadata = dict(headers)
    out.notes.extend(auth_notes)
    out.notes.append(f"модуль gRPC: {mid} → {proto_as} @ {host}")
    return out


def dumps_runtime(payload: Dict[str, Any]) -> str:
    from utils.api_import_lab import dumps_ops

    return dumps_ops(payload)
