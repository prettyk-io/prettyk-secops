# -*- coding: utf-8 -*-
"""Lab gRPC proto scrape → service/method list (IMP-GRPC)."""
from __future__ import annotations

import os
import re
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from utils.env_dual import pk_env

_SERVICE_RE = re.compile(
    r"service\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*\{(?P<body>[^}]*)\}",
    re.DOTALL,
)
_RPC_RE = re.compile(
    r"rpc\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*\((?P<req>[^)]+)\)\s*returns\s*\((?P<resp>[^)]+)\)",
)
_PACKAGE_RE = re.compile(r"^\s*package\s+(?P<name>[A-Za-z_][\w.]*)\s*;", re.MULTILINE)
_IMPORT_RE = re.compile(r'^\s*import\s+"([^"]+)"\s*;', re.MULTILINE)


class GrpcParseError(ValueError):
    pass


def lab_grpc_shape(
    *,
    host: str = "",
    proto_path: str = "",
    metadata: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    return {
        "kind": "grpc_lab",
        "host": host,
        "proto_path": proto_path,
        "metadata": dict(metadata or {}),
        "executor": False,
        "notes": [
            "нет runtime executor — inventory/proto scrape only",
            "TLS/mTLS/streaming — later",
        ],
    }


def parse_proto_services(proto_text: str) -> Dict[str, Any]:
    text = proto_text or ""
    if not text.strip():
        raise GrpcParseError("пустой proto")

    package = ""
    pm = _PACKAGE_RE.search(text)
    if pm:
        package = pm.group("name")

    imports = [m.group(1) for m in _IMPORT_RE.finditer(text)]

    services: List[Dict[str, Any]] = []
    notes: List[str] = []
    for sm in _SERVICE_RE.finditer(text):
        methods: List[Dict[str, Any]] = []
        for rm in _RPC_RE.finditer(sm.group("body")):
            req = rm.group("req").strip()
            resp = rm.group("resp").strip()
            client_stream = req.startswith("stream ")
            server_stream = resp.startswith("stream ")
            methods.append(
                {
                    "name": rm.group("name"),
                    "request": req.replace("stream ", "", 1).strip(),
                    "response": resp.replace("stream ", "", 1).strip(),
                    "client_streaming": client_stream,
                    "server_streaming": server_stream,
                    "unary": not client_stream and not server_stream,
                }
            )
        services.append(
            {
                "name": sm.group("name"),
                "package": package,
                "full_name": f"{package}.{sm.group('name')}" if package else sm.group("name"),
                "methods": methods,
            }
        )
        if not methods:
            notes.append(f"service {sm.group('name')}: нет rpc")

    if not services:
        raise GrpcParseError("в proto нет service { ... }")

    return {
        "source": "proto",
        "package": package,
        "imports": imports,
        "services": services,
        "notes": notes,
    }


def _iter_proto_files(root: Path) -> List[Path]:
    files = sorted(p for p in root.rglob("*.proto") if p.is_file())
    return files


def _extract_zip_pack(zip_path: Path) -> Tuple[Path, tempfile.TemporaryDirectory[str]]:
    tmp = tempfile.TemporaryDirectory(prefix="kdt-grpc-pack-")
    root = Path(tmp.name)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(root)
    return root, tmp


def _find_proto_pack_path(
    raw: str,
    search_roots: Optional[Sequence[Path]],
) -> Path:
    candidates: List[Path] = [Path(raw)]
    for root in search_roots or []:
        candidates.append(Path(root) / raw)
    for cand in candidates:
        try:
            if cand.exists():
                return cand.resolve()
        except OSError:
            continue
    raise GrpcParseError(f"proto_pack не найден: {raw}")


def _open_proto_pack_root(
    pack_path: Path,
    notes: List[str],
) -> Tuple[Path, Optional[tempfile.TemporaryDirectory[str]], Optional[List[Path]]]:
    """Return (pack_root, tmp_holder, optional single-file list)."""
    if pack_path.is_file() and pack_path.suffix.lower() == ".zip":
        pack_root, tmp_holder = _extract_zip_pack(pack_path)
        notes.append(f"unzip {pack_path.name}")
        return pack_root, tmp_holder, None
    if pack_path.is_dir():
        return pack_path, None, None
    if pack_path.is_file() and pack_path.suffix.lower() == ".proto":
        return pack_path.parent, None, [pack_path]
    raise GrpcParseError(f"proto_pack не dir/zip/proto: {pack_path}")


def resolve_proto_pack(
    proto_pack: str,
    *,
    import_paths: Optional[Sequence[str]] = None,
    search_roots: Optional[Sequence[Path]] = None,
) -> Dict[str, Any]:
    """
    Загрузить proto pack (dir или .zip) → descriptor inventory (scrape).
    import_paths — дополнительные корни поиска .proto (relative/absolute).
    """
    notes: List[str] = []
    raw = (proto_pack or "").strip()
    if not raw:
        raise GrpcParseError("proto_pack пуст")

    pack_path = _find_proto_pack_path(raw, search_roots)
    tmp_holder: Optional[tempfile.TemporaryDirectory[str]] = None
    try:
        pack_root, tmp_holder, single = _open_proto_pack_root(pack_path, notes)
        if single is not None:
            return _inventory_from_files(
                single,
                pack_root=pack_root,
                import_paths=import_paths,
                notes=notes + ["single .proto as pack"],
            )
        proto_files = _iter_proto_files(pack_root)
        if not proto_files:
            raise GrpcParseError(f"в pack нет .proto: {pack_path}")
        return _inventory_from_files(
            proto_files,
            pack_root=pack_root,
            import_paths=import_paths,
            notes=notes,
        )
    finally:
        if tmp_holder is not None:
            tmp_holder.cleanup()


def _inventory_from_files(
    proto_files: Iterable[Path],
    *,
    pack_root: Path,
    import_paths: Optional[Sequence[str]],
    notes: List[str],
) -> Dict[str, Any]:
    roots = [pack_root]
    for ip in import_paths or []:
        ipath = Path(str(ip).strip())
        if not str(ipath):
            continue
        if not ipath.is_absolute():
            ipath = (pack_root / ipath).resolve()
        if ipath.is_dir():
            roots.append(ipath)
        else:
            notes.append(f"import_path пропущен (не dir): {ip}")

    services: List[Dict[str, Any]] = []
    files_meta: List[Dict[str, Any]] = []
    seen_svc: set[str] = set()

    for pf in proto_files:
        try:
            text = pf.read_text(encoding="utf-8")
        except OSError as exc:
            notes.append(f"не прочитать {pf}: {exc}")
            continue
        try:
            parsed = parse_proto_services(text)
        except GrpcParseError as exc:
            notes.append(f"{pf.name}: {exc}")
            continue
        rel = str(pf.relative_to(pack_root)) if pf.is_relative_to(pack_root) else str(pf)
        files_meta.append(
            {
                "path": rel,
                "package": parsed.get("package") or "",
                "imports": parsed.get("imports") or [],
                "services": [s["name"] for s in parsed.get("services") or []],
            }
        )
        for svc in parsed.get("services") or []:
            key = str(svc.get("full_name") or svc.get("name"))
            if key in seen_svc:
                notes.append(f"duplicate service {key} in {rel}")
                continue
            seen_svc.add(key)
            services.append({**svc, "file": rel})

    if not services:
        raise GrpcParseError("в pack нет service после scrape")

    unresolved: List[str] = []
    for fm in files_meta:
        for imp in fm.get("imports") or []:
            if not _resolve_import(str(imp), roots):
                unresolved.append(str(imp))
    if unresolved:
        notes.append(
            "неразрешённые import (нужен import_paths или файл в pack): "
            + ", ".join(sorted(set(unresolved))[:12])
        )

    return {
        "ok": True,
        "source": "proto_pack",
        "pack_root": str(pack_root),
        "import_roots": [str(r) for r in roots],
        "files": files_meta,
        "services": services,
        "notes": notes,
    }


def _resolve_import(imp: str, roots: Sequence[Path]) -> bool:
    for root in roots:
        cand = root / imp
        if cand.is_file():
            return True
    return False


def try_server_reflection(
    *,
    host: str = "",
    env_flag: str = "KDT_GRPC_REFLECTION",
) -> Dict[str, Any]:
    """Reflection path: opt-in; без флага/зависимостей — skip+note."""
    result: Dict[str, Any] = {
        "attempted": False,
        "skipped": True,
        "services": [],
        "notes": [],
    }
    flag = (os.environ.get(env_flag) or "").strip().lower()
    if flag not in ("1", "true", "yes", "on"):
        result["notes"].append(f"{env_flag} не включён — reflection skipped")
        return result
    if not host.strip():
        result["notes"].append("host пуст — reflection skipped")
        return result
    result["skipped"] = False
    result["attempted"] = True
    result["notes"].append(
        "lab: reflection harness не подключён (нужен grpcio + stub); используй proto scrape"
    )
    return result


def _repo_proto_pack_candidates() -> List[Path]:
    env = (pk_env("GRPC_PROTO_PACK") or "").strip()
    out: List[Path] = []
    if env:
        out.append(Path(env))
    here = Path(__file__).resolve()
    # orchestrator/utils → repo root
    root = here.parents[2]
    out.append(root / "services" / "kdt-api-lab" / "proto_pack")
    return out


def _split_service_method(method: str) -> Tuple[str, str]:
    raw = (method or "").strip().replace(".", "/")
    if "/" not in raw:
        raise GrpcParseError("method: нужен вид Service/Method или package.Service/Method")
    left, _, rpc = raw.rpartition("/")
    service = left.rsplit("/", 1)[-1]
    service = service.rsplit(".", 1)[-1]
    rpc = rpc.strip()
    if not service or not rpc:
        raise GrpcParseError("method: пустой Service или Method")
    return service, rpc


def _codegen_bank_stubs(proto_root: Path) -> Path:
    """grpc_tools.protoc → temp dir with bank.v1 stubs."""
    import grpc_tools.protoc  # type: ignore

    common = proto_root / "bank" / "v1" / "common.proto"
    account = proto_root / "bank" / "v1" / "account.proto"
    if not common.is_file() or not account.is_file():
        raise GrpcParseError(
            f"proto pack без bank/v1/{{common,account}}.proto: {proto_root}"
        )
    out = Path(tempfile.mkdtemp(prefix="kdt-grpc-gen-"))
    (out / "bank" / "v1").mkdir(parents=True, exist_ok=True)
    rc = grpc_tools.protoc.main(
        [
            "grpc_tools.protoc",
            f"-I{proto_root}",
            f"--python_out={out}",
            f"--grpc_python_out={out}",
            "bank/v1/common.proto",
            "bank/v1/account.proto",
        ]
    )
    if rc != 0:
        raise GrpcParseError(f"protoc failed rc={rc}")
    for rel in ("__init__.py", "bank/__init__.py", "bank/v1/__init__.py"):
        p = out / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.exists():
            p.write_text("", encoding="utf-8")
    return out


def _grpc_dial_target(host: str) -> Tuple[str, List[str]]:
    """
    Цель dial для live unary.
    URL атаки bank lab = HTTP :8090, gRPC слушает :50051 — remap + notes.
    Override: KDT_GRPC_PORT=50051 (любой host → этот порт).
    """
    notes: List[str] = []
    target = (host or "").strip()
    if "://" in target:
        target = target.split("://", 1)[-1]
    target = target.split("/", 1)[0]
    if not target:
        raise GrpcParseError("host пуст для live unary")

    override = (pk_env("GRPC_PORT") or "").strip()
    if override:
        name = target.rsplit(":", 1)[0] if ":" in target else target
        # IPv6 [::1]:port — не трогаем грубо; для lab достаточно hostname/IPv4
        if target.startswith("[") and "]:" in target:
            name = target.split("]:", 1)[0] + "]"
        target = f"{name}:{override}"
        notes.append(f"KDT_GRPC_PORT={override} → dial {target}")
        return target, notes

    # api-lab compose: HTTP 8090 + gRPC 50051 на одном хосте
    if target.endswith(":8090"):
        remapped = target[: -len(":8090")] + ":50051"
        notes.append(f"api-lab: gRPC remap {target} → {remapped}")
        return remapped, notes
    return target, notes


def _live_unary_bank(
    *,
    host: str,
    method: str,
    request_json: str,
    proto_pack: str = "",
) -> Dict[str, Any]:
    import sys

    import grpc  # type: ignore
    from google.protobuf import json_format  # type: ignore

    notes: List[str] = []
    service, rpc = _split_service_method(method)
    if service != "AccountService":
        raise GrpcParseError(
            f"live unary lab: поддержан AccountService, получено {service!r}"
        )

    roots: List[Path] = []
    if proto_pack.strip():
        roots.append(Path(proto_pack.strip()))
    roots.extend(_repo_proto_pack_candidates())
    proto_root: Optional[Path] = None
    for cand in roots:
        if cand.is_dir() and (cand / "bank" / "v1" / "account.proto").is_file():
            proto_root = cand.resolve()
            break
    if proto_root is None:
        raise GrpcParseError(
            "не найден proto_pack bank/v1 (KDT_GRPC_PROTO_PACK или services/kdt-api-lab/proto_pack)"
        )
    notes.append(f"proto_pack={proto_root}")

    gen = _codegen_bank_stubs(proto_root)
    notes.append(f"codegen={gen}")
    if str(gen) not in sys.path:
        sys.path.insert(0, str(gen))

    from bank.v1 import account_pb2, account_pb2_grpc, common_pb2  # type: ignore

    target, dial_notes = _grpc_dial_target(host)
    notes.extend(dial_notes)
    channel = grpc.insecure_channel(target)
    stub = account_pb2_grpc.AccountServiceStub(channel)
    body = (request_json or "{}").strip() or "{}"

    if rpc == "Ping":
        resp = stub.Ping(common_pb2.Empty(), timeout=5.0)
        payload = json_format.MessageToDict(resp, preserving_proto_field_name=True)
    elif rpc == "GetAccount":
        req = account_pb2.AccountId()
        json_format.Parse(body, req)
        resp = stub.GetAccount(req, timeout=5.0)
        payload = json_format.MessageToDict(resp, preserving_proto_field_name=True)
    elif rpc == "ListAccounts":
        resp = stub.ListAccounts(account_pb2.ListAccountsRequest(), timeout=5.0)
        payload = json_format.MessageToDict(resp, preserving_proto_field_name=True)
    else:
        raise GrpcParseError(
            f"live unary lab: rpc {rpc!r} не в allowlist (Ping|GetAccount|ListAccounts)"
        )

    return {
        "ok": True,
        "response": payload,
        "notes": notes + [f"live unary ok {service}/{rpc} → {target}"],
    }


def unary_call_harness(
    *,
    host: str = "",
    method: str = "",
    request_json: str = "{}",
    proto_pack: str = "",
    env_flag: str = "KDT_GRPC_UNARY",
) -> Dict[str, Any]:
    """
    IMP-GRPC: unary harness.
    Без флага — честный bolvan (сеть не дергаем).
    С KDT_GRPC_UNARY=1 — live RPC на bank AccountService (codegen из proto_pack).
    """
    result: Dict[str, Any] = {
        "ok": False,
        "attempted": False,
        "skipped": True,
        "host": host,
        "method": method,
        "response": None,
        "notes": [],
    }
    flag = (os.environ.get(env_flag) or "").strip().lower()
    if flag not in ("1", "true", "yes", "on"):
        result["notes"].append(
            f"{env_flag} не включён — unary stub (bolvan); сеть не дергаем"
        )
        result["ok"] = True  # bolvan «прошёл» как lab stub
        return result
    if not host.strip() or not method.strip():
        result["skipped"] = False
        result["notes"].append("нужны host и method (Service/Method)")
        return result
    result["skipped"] = False
    result["attempted"] = True
    try:
        import grpc  # type: ignore  # noqa: F401
    except ImportError:
        result["notes"].append(
            "grpcio не установлен — поставь grpcio (+ grpcio-tools) из requirements.txt"
        )
        result["ok"] = False
        return result
    try:
        live = _live_unary_bank(
            host=host,
            method=method,
            request_json=request_json,
            proto_pack=proto_pack,
        )
        result["ok"] = bool(live.get("ok"))
        result["response"] = live.get("response")
        result["notes"].extend(list(live.get("notes") or []))
    except GrpcParseError as exc:
        result["ok"] = False
        result["notes"].append(str(exc))
    except Exception as exc:  # noqa: BLE001 — сеть/RPC в notes
        result["ok"] = False
        result["notes"].append(f"live unary error: {exc}")
    return result
