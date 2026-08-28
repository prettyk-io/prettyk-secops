# -*- coding: utf-8 -*-
"""
Песочница языка данных + валидатор конструкторов + lab run (dev API).

  py tools/data_playground.py
  POST /api/data/eval                 {"script": "Пусть ${n} = 10\\n..."}
  POST /api/validate/constructor      {"text": "webdriver|click|css|.x"}
  POST /api/validate/data-script      {"script": "..."}
  POST /api/run/start                 {"wired": {...}, "resource_contents"?: {as: text}, "session_name"?: "...", "stub"?: true, "stub_opts"?: {...}}
  POST /api/run/stop
  POST /api/run/step                  {"action":"Type","strategy":"label","strategy_value":"Email","payload":"$user_email"}
  GET  /api/run/status
  GET  /api/checks                    NAV-API registry (reports/live/checks_registry.json)
  PUT  /api/checks                    {"version": 1, "items": [...]}
  POST /api/validate/auth-module      {"text": "auth=bearer\\ntoken=...", "module_id"?: "..."}
  POST /api/lab/openapi/parse         {"spec": "url|path|inline"}  → ops (не silent scan)
  POST /api/lab/graphql/parse         {"schema": "url|path|inline"}
  POST /api/lab/grpc/parse            {"proto": "path|inline"}
  POST /api/lab/grpc/pack             {"proto_pack": "dir|zip", "import_paths"?}
  POST /api/lab/grpc/unary            {"host","method","request_json"?}  → bolvan harness
  POST /api/lab/chain/from-har        {"har","har_as"?} → steps + slots + template
  POST /api/lab/chain/materialize     {"chain_fields","bindings"?} → har_text + setup/attack
  POST /api/lab/chain/dry-run-pre     {"chain_fields","bindings"?} → setup HAR + extract
  POST /api/lab/chain/value-pack      {"chain_fields","pack"} → N materialize iterations

Идеи: Postman console + «тот же движок, что рантайм» (catalog AST).
Vite проксирует /api → :8765.
"""
from __future__ import annotations


import json
import sys

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import inspect

from adapters.data_adapter import DataAdapter
from adapters.data_processor import DataProcessor
from core.constructor_validate import (
    validate_constructor,
    validate_data_script,
    validate_language_script,
)
from core.data_stream import DataStream
from core.errors import WiredError
from core.expr import KindDict, LocatorDesc
from core.lang_ast import ActionNode
from core.language_engine import LanguageEngine
from core.language_parse import is_language_script
from core.pretty_data import script_to_steps
from core.auth_module import dry_run_auth_module, validate_auth_module
from utils.checks_registry import load_checks_registry, save_checks_registry
from utils.lab_run import get_run_status, start_run, stop_run

HOST = "127.0.0.1"
PORT = 8765


def _jsonable(value: Any) -> Any:
    """KindDict → JSON с меткой $kind (Словарь/Объект), иначе kind теряется."""
    if isinstance(value, LocatorDesc):
        return {
            "$kind": "КоллекцияЭлементов" if value.collection else "Элемент",
            "by": value.by,
            "value": value.value,
        }
    if isinstance(value, KindDict):
        label = "Словарь" if value.kind == "dict" else "Объект"
        out: dict[str, Any] = {"$kind": label}
        for key, item in value.items():
            out[str(key)] = _jsonable(item)
        return out
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, tuple):
        return [_jsonable(v) for v in value]
    return value


def _result_payload(
    stream: DataStream,
    log: list[dict[str, Any]],
    *,
    diagnostics: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    vars_out = {}
    secrets = []
    for name in sorted(stream.names()):
        if stream.is_secret(name):
            from core.data_stream import SECRET_LOG_MASK

            vars_out[name] = SECRET_LOG_MASK
            secrets.append(name)
        else:
            vars_out[name] = _jsonable(stream.mask_for_log(stream.get(name)))
    payload: dict[str, Any] = {
        "ok": True,
        "variables": vars_out,
        "secrets": secrets,
        "steps": log,
    }
    if diagnostics:
        payload["diagnostics"] = diagnostics
        payload["ok"] = False  # прогон мог отработать, но в скрипте есть косяки
    return payload


def _run_data_wire(
    wire: str,
    *,
    stream: DataStream,
    data: DataAdapter,
    log: list[dict[str, Any]],
    save_as: str = "",
) -> Any:
    from core.wire_split import split_wire

    parts = split_wire(wire)
    if len(parts) < 2 or parts[0] not in ("data", "core"):
        raise WiredError(f"ожидался data|… или core|…, получено {wire!r}")
    component, action, args = parts[0], parts[1], parts[2:]
    # core|… — чистые генераторы и время: считаются по-настоящему, как data.
    target = data if component == "data" else DataProcessor()
    method = getattr(target, action, None)
    if method is None or action.startswith("_") or action == "bind":
        raise WiredError(f"неизвестно {component}|{action}")

    sig = inspect.signature(method)
    names = [
        n
        for n, p in sig.parameters.items()
        if n != "self" and p.kind not in (p.VAR_POSITIONAL, p.VAR_KEYWORD)
    ]
    required = sum(
        1 for n in names if sig.parameters[n].default is inspect.Parameter.empty
    )
    if len(args) < required or len(args) > len(names):
        raise WiredError(
            f"{component}|{action} аргументов {len(args)}, нужно {required}…{len(names)}"
        )
    params = {n: a for n, a in zip(names, args)}
    for key, val in list(params.items()):
        if isinstance(val, str):
            params[key] = stream.resolve(val)

    result = method(**params)
    if save_as:
        stream.set(save_as, result)
    # После data|secret|… значение уже в _secrets — wire в ответе без plaintext.
    log.append(
        {
            "step": len(log) + 1,
            "wirek": stream.mask_for_log(wire),
            "save_as": save_as or None,
            "result": _public(result, stream),
        }
    )
    return result


def eval_script(script: str) -> dict[str, Any]:
    """
    Data-скрипт (Пусть/…) — как раньше.
    Language (Если / ?…>…>! / Цикл…) — LanguageEngine; data| реально,
    остальное (webdriver|…) — dry-run в лог без браузера.
    """
    stream = DataStream()
    data = DataAdapter()
    data.bind(stream)
    log: list[dict[str, Any]] = []

    if is_language_script(script):
        # Как Controller: косяки копим, прогон не abort'им заранее.
        diags = [d for d in validate_language_script(script) if d.get("severity") == "error"]
        eng = LanguageEngine()

        def run_leaf(node: ActionNode) -> Any:
            wire = (node.constructor or "").strip()
            if wire.startswith(("data|", "core|")):
                return _run_data_wire(
                    wire, stream=stream, data=data, log=log, save_as=node.save_as or ""
                )
            # Без Selenium/scanner: фиксируем wire, чтобы видеть RU→MethodId.
            safe_wire = stream.mask_for_log(wire)
            result = {"simulated": True, "wirek": safe_wire}
            if node.save_as:
                stream.set(node.save_as, result)
            log.append(
                {
                    "step": len(log) + 1,
                    "wirek": safe_wire,
                    "save_as": node.save_as or None,
                    "result": result,
                }
            )
            return True

        try:
            eng.execute_script(script, stream=stream, run_leaf=run_leaf)
        except WiredError as e:
            if diags:
                others = "\n".join(f"  - {d['message']}" for d in diags)
                raise WiredError(
                    f"{e}\nДругие проблемы валидации:\n{others}"
                ) from e
            raise
        return _result_payload(stream, log, diagnostics=diags or None)

    steps = script_to_steps(script)
    for step in steps:
        wire = step["constructor"]
        _run_data_wire(
            wire,
            stream=stream,
            data=data,
            log=log,
            save_as=step.get("save_as") or "",
        )
    return _result_payload(stream, log)


def _public(value: Any, stream: DataStream) -> Any:
    tagged = _jsonable(stream.mask_for_log(value))
    try:
        json.dumps(tagged)
        return tagged
    except TypeError:
        return str(tagged)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-PK-User")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            from infra.health import get_playground_health
            self._json(200, get_playground_health().health().as_dict())
            return
        if path == "/api/health/live":
            from infra.health import get_playground_health
            self._json(200, get_playground_health().live().as_dict())
            return
        if path == "/api/health/ready":
            from infra.health import get_playground_health
            self._json(200, get_playground_health().ready().as_dict())
            return
        if path == "/api/metrics":
            from infra.telemetry import get_metrics
            self._json(200, get_metrics().snapshot())
            return
        if path == "/api/profile":
            from infra.profiles import resolve_profile, is_pure_box
            self._json(200, {
                "profile": resolve_profile(),
                "is_pure_box": is_pure_box(),
            })
            return
        if path == "/api/ping":
            self._json(200, {"ok": True, "service": "prettyk-editor-api"})
            return
        # VP-F2: MJPEG stream removed — frames now delivered via WS relay
        if path == "/api/run/status":
            self._json(200, get_run_status())
            return
        if path == "/api/browser/status":
            from browser.browser_service import browser_status
            self._json(200, browser_status())
            return
        if path == "/api/checks":
            self._json(200, load_checks_registry())
            return
        draft_id = self._match_draft_path(path)
        if draft_id is not None:
            from utils.draft_store import load_draft
            payload = load_draft(draft_id)
            if payload is None:
                self._json(404, {"ok": False, "error": "draft not found"})
                return
            self._json(200, payload)
            return
        self._json(404, {"ok": False, "error": "not found"})

    def _read_json_body(self) -> tuple[dict | None, str | None]:
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return None, "invalid JSON"
        if not isinstance(body, dict):
            return None, "body must be an object"
        return body, None

    @staticmethod
    def _match_draft_path(path: str) -> str | None:
        """PK-WB-S1: /api/checks/{checkId}/draft → checkId (или None)."""
        parts = path.strip("/").split("/")
        # ["api", "checks", "{id}", "draft"]
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "checks" and parts[3] == "draft":
            return parts[2]
        return None

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        body, err = self._read_json_body()
        if err:
            self._json(400, {"ok": False, "error": err})
            return
        if path == "/api/checks":
            code, payload = save_checks_registry(body)
            self._json(code, payload)
            return
        draft_id = self._match_draft_path(path)
        if draft_id is not None:
            from utils.draft_store import save_draft
            expected = int(self.headers.get("X-Draft-Revision") or 0)
            code, payload = save_draft(draft_id, body, expected)
            self._json(code, payload)
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        draft_id = self._match_draft_path(path)
        if draft_id is not None:
            from utils.draft_store import delete_draft
            deleted = delete_draft(draft_id)
            if not deleted:
                self._json(404, {"ok": False, "error": "draft not found"})
                return
            self._json(200, {"ok": True, "deleted": True})
            return
        self._json(404, {"ok": False, "error": "not found"})

    def _post_eval(self, body: dict) -> None:
        script = body.get("script")
        if not isinstance(script, str):
            self._json(400, {"ok": False, "error": "field script (string) required"})
            return
        try:
            self._json(200, eval_script(script))
        except WiredError as e:
            self._json(400, {"ok": False, "error": str(e)})
        except Exception as e:
            self._json(500, {"ok": False, "error": f"{type(e).__name__}: {e}"})

    def _post_validate_constructor(self, body: dict) -> None:
        text = body.get("text")
        if not isinstance(text, str):
            self._json(400, {"ok": False, "error": "field text (string) required"})
            return
        diags = validate_constructor(text)
        self._json(200, {"ok": len(diags) == 0, "diagnostics": diags})

    def _post_validate_constructors(self, body: dict) -> None:
        items = body.get("items")
        if not isinstance(items, list):
            self._json(400, {"ok": False, "error": "field items (array) required"})
            return
        results = []
        all_ok = True
        for item in items:
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if not isinstance(text, str):
                continue
            diags = validate_constructor(text)
            if diags:
                all_ok = False
            results.append(
                {
                    "id": item.get("id"),
                    "ok": len(diags) == 0,
                    "diagnostics": diags,
                }
            )
        self._json(200, {"ok": all_ok, "results": results})

    def _post_validate_data_script(self, body: dict) -> None:
        script = body.get("script")
        if not isinstance(script, str):
            self._json(400, {"ok": False, "error": "field script (string) required"})
            return
        diags = validate_data_script(script)
        self._json(200, {"ok": len(diags) == 0, "diagnostics": diags})

    def _post_validate_auth_module(self, body: dict) -> None:
        text = body.get("text")
        if not isinstance(text, str):
            self._json(400, {"ok": False, "error": "field text (string) required"})
            return
        module_id = body.get("module_id")
        mid = module_id if isinstance(module_id, str) else ""
        if body.get("dry_run") is True:
            self._json(200, dry_run_auth_module(text, module_id=mid))
            return
        diags = validate_auth_module(text, module_id=mid)
        self._json(200, {"ok": len(diags) == 0, "diagnostics": diags})

    def _post_lab_openapi_parse(self, body: dict) -> None:
        from utils.api_import_lab import read_local_text
        from utils.openapi_ops import (
            OpenApiParseError,
            parse_openapi_ops,
            seed_prettyk_comments,
        )

        spec = body.get("spec")
        if not isinstance(spec, str) or not spec.strip():
            self._json(400, {"ok": False, "error": "field spec (string) required"})
            return
        text, read_notes = read_local_text(spec)
        if text is None:
            self._json(200, {"ok": False, "operations": [], "notes": read_notes})
            return
        try:
            parsed = parse_openapi_ops(text)
            ops = parsed.get("operations") or []
            self._json(
                200,
                {
                    "ok": True,
                    "kind": parsed.get("kind"),
                    "base_url": parsed.get("base_url"),
                    "operations": ops,
                    "notes": list(parsed.get("notes") or [])
                    + list(read_notes)
                    + ["lab parse only — scanner scan не запущен"],
                    "seed": seed_prettyk_comments(ops, limit=12),
                },
            )
        except OpenApiParseError as exc:
            self._json(
                200,
                {"ok": False, "operations": [], "notes": list(read_notes) + [str(exc)]},
            )

    def _post_lab_graphql_parse(self, body: dict) -> None:
        from utils.api_import_lab import read_local_text
        from utils.graphql_ops import (
            GraphQlParseError,
            parse_introspection_ops,
            parse_sdl_ops,
        )

        schema = body.get("schema")
        if not isinstance(schema, str) or not schema.strip():
            self._json(400, {"ok": False, "error": "field schema (string) required"})
            return
        text, read_notes = read_local_text(schema)
        if text is None:
            self._json(200, {"ok": False, "operations": [], "notes": read_notes})
            return
        stripped = text.lstrip("\ufeff").strip()
        try:
            parsed = (
                parse_introspection_ops(stripped)
                if stripped.startswith("{")
                else parse_sdl_ops(stripped)
            )
            self._json(
                200,
                {
                    "ok": True,
                    "source": parsed.get("source"),
                    "operations": parsed.get("operations") or [],
                    "notes": list(parsed.get("notes") or [])
                    + list(read_notes)
                    + ["lab parse only — executor нет"],
                },
            )
        except GraphQlParseError as exc:
            self._json(
                200,
                {"ok": False, "operations": [], "notes": list(read_notes) + [str(exc)]},
            )

    def _post_lab_grpc_parse(self, body: dict) -> None:
        from utils.api_import_lab import read_local_text
        from utils.grpc_ops import GrpcParseError, parse_proto_services

        proto = body.get("proto")
        if not isinstance(proto, str) or not proto.strip():
            self._json(400, {"ok": False, "error": "field proto (string) required"})
            return
        text, read_notes = read_local_text(proto)
        if text is None:
            self._json(200, {"ok": False, "services": [], "notes": read_notes})
            return
        try:
            parsed = parse_proto_services(text)
            self._json(
                200,
                {
                    "ok": True,
                    "source": parsed.get("source"),
                    "services": parsed.get("services") or [],
                    "notes": list(parsed.get("notes") or []) + list(read_notes),
                },
            )
        except GrpcParseError as exc:
            self._json(
                200,
                {"ok": False, "services": [], "notes": list(read_notes) + [str(exc)]},
            )

    def _post_lab_grpc_pack(self, body: dict) -> None:
        from utils.api_import_lab import lab_search_roots
        from utils.grpc_ops import GrpcParseError, resolve_proto_pack

        pack = body.get("proto_pack")
        if not isinstance(pack, str) or not pack.strip():
            self._json(400, {"ok": False, "error": "field proto_pack (string) required"})
            return
        imports = body.get("import_paths")
        import_paths: list[str] = []
        if isinstance(imports, list):
            import_paths = [str(x) for x in imports if str(x).strip()]
        try:
            parsed = resolve_proto_pack(
                pack.strip(),
                import_paths=import_paths,
                search_roots=lab_search_roots(),
            )
            self._json(
                200,
                {
                    "ok": True,
                    "source": parsed.get("source"),
                    "files": parsed.get("files") or [],
                    "services": parsed.get("services") or [],
                    "notes": list(parsed.get("notes") or [])
                    + ["lab pack inventory — scanner scan не запущен"],
                },
            )
        except GrpcParseError as exc:
            self._json(200, {"ok": False, "services": [], "files": [], "notes": [str(exc)]})

    def _post_lab_grpc_unary(self, body: dict) -> None:
        from utils.grpc_ops import unary_call_harness

        host = body.get("host") if isinstance(body.get("host"), str) else ""
        method = body.get("method") if isinstance(body.get("method"), str) else ""
        req = body.get("request_json")
        request_json = req if isinstance(req, str) else "{}"
        self._json(
            200,
            unary_call_harness(host=host, method=method, request_json=request_json),
        )

    def _post_lab_chain_from_har(self, body: dict) -> None:
        from utils.chain_ops import ChainError, chain_from_har

        har = body.get("har")
        if not isinstance(har, (str, dict)) or (isinstance(har, str) and not har.strip()):
            self._json(400, {"ok": False, "error": "field har (string|object) required"})
            return
        har_as = body.get("har_as") if isinstance(body.get("har_as"), str) else "chain"
        seq = (
            body.get("sequence_name")
            if isinstance(body.get("sequence_name"), str)
            else ""
        )
        skip = body.get("skip_assets") is not False
        try:
            out = chain_from_har(
                har, har_as=har_as.strip() or "chain", sequence_name=seq, skip_assets=skip
            )
            self._json(200, out)
        except ChainError as exc:
            self._json(200, {"ok": False, "notes": [str(exc)]})

    def _post_lab_chain_materialize(self, body: dict) -> None:
        from utils.chain_ops import ChainError, materialize_chain_fields

        fields = body.get("chain_fields")
        if not isinstance(fields, dict):
            self._json(400, {"ok": False, "error": "field chain_fields (object) required"})
            return
        bindings = body.get("bindings")
        bind_map = (
            {str(k): str(v) for k, v in bindings.items()}
            if isinstance(bindings, dict)
            else None
        )
        wired = body.get("wired") if isinstance(body.get("wired"), dict) else None
        try:
            self._json(
                200,
                materialize_chain_fields(fields, bindings=bind_map, wired=wired),
            )
        except ChainError as exc:
            self._json(200, {"ok": False, "notes": [str(exc)], "error": str(exc)})

    def _post_lab_chain_dry_run_pre(self, body: dict) -> None:
        from utils.chain_ops import ChainError, dry_run_preconditions

        fields = body.get("chain_fields")
        if not isinstance(fields, dict):
            self._json(400, {"ok": False, "error": "field chain_fields (object) required"})
            return
        bindings = body.get("bindings")
        bind_map = (
            {str(k): str(v) for k, v in bindings.items()}
            if isinstance(bindings, dict)
            else None
        )
        wired = body.get("wired") if isinstance(body.get("wired"), dict) else None
        try:
            self._json(
                200,
                dry_run_preconditions(fields, bindings=bind_map, wired=wired),
            )
        except ChainError as exc:
            self._json(200, {"ok": False, "notes": [str(exc)], "error": str(exc)})

    def _post_lab_chain_value_pack(self, body: dict) -> None:
        """Legacy lab: pack = properties (preferred) | JSON | CSV deprecated."""
        from utils.chain_ops import ChainError, materialize_value_pack

        fields = body.get("chain_fields")
        if not isinstance(fields, dict):
            self._json(400, {"ok": False, "error": "field chain_fields (object) required"})
            return
        pack = body.get("pack")
        if not isinstance(pack, str) or not pack.strip():
            self._json(
                400,
                {"ok": False, "error": "field pack (properties|JSON string) required"},
            )
            return
        try:
            self._json(200, materialize_value_pack(fields, pack))
        except ChainError as exc:
            self._json(200, {"ok": False, "notes": [str(exc)], "error": str(exc), "count": 0})

    def _post_run_start(self, body: dict) -> None:
        session_name = body.get("session_name")
        stub_opts = body.get("stub_opts")
        resource_contents = body.get("resource_contents")
        chain_bindings = body.get("chain_bindings")
        if session_name is not None and not isinstance(session_name, str):
            self._json(400, {"ok": False, "error": "session_name must be a string"})
            return
        if stub_opts is not None and not isinstance(stub_opts, dict):
            self._json(400, {"ok": False, "error": "stub_opts must be an object"})
            return
        if resource_contents is not None and not isinstance(resource_contents, dict):
            self._json(400, {"ok": False, "error": "resource_contents must be an object"})
            return
        if chain_bindings is not None and not isinstance(chain_bindings, dict):
            self._json(400, {"ok": False, "error": "chain_bindings must be an object"})
            return
        owner_raw = body.get("owner_user_id")
        owner_user_id = (
            owner_raw.strip()
            if isinstance(owner_raw, str) and owner_raw.strip()
            else None
        )
        if not owner_user_id:
            try:
                from utils.live_pers_acl import parse_caller_user

                owner_user_id = parse_caller_user(self.headers)
            except Exception:
                owner_user_id = None
        check_id_raw = body.get("check_id")
        check_id = (
            check_id_raw.strip()
            if isinstance(check_id_raw, str) and check_id_raw.strip()
            else None
        )
        env_raw = body.get("env")
        if env_raw is not None and not isinstance(env_raw, dict):
            self._json(400, {"ok": False, "error": "env must be an object"})
            return
        try:
            started = start_run(
                body.get("wired"),
                session_name=session_name if isinstance(session_name, str) else None,
                stub=body.get("stub") is True,
                stub_opts=stub_opts if isinstance(stub_opts, dict) else None,
                resource_contents=(
                    {str(k): str(v) for k, v in resource_contents.items()}
                    if isinstance(resource_contents, dict)
                    else None
                ),
                chain_bindings=(
                    {str(k): str(v) for k, v in chain_bindings.items()}
                    if isinstance(chain_bindings, dict)
                    else None
                ),
                owner_user_id=owner_user_id,
                check_id=check_id,
                env=(
                    {str(k): str(v) for k, v in env_raw.items()}
                    if isinstance(env_raw, dict)
                    else None
                ),
            )
        except ValueError as e:
            self._json(400, {"ok": False, "error": str(e)})
            return
        except RuntimeError as e:
            msg = str(e)
            code = 409 if "already in progress" in msg else 500
            self._json(code, {"ok": False, "error": msg})
            return
        except Exception as e:
            self._json(500, {"ok": False, "error": f"{type(e).__name__}: {e}"})
            return
        self._json(200, started)

    def _post_run_stop(self) -> None:
        try:
            stopped = stop_run()
        except RuntimeError as e:
            self._json(409, {"ok": False, "error": str(e)})
            return
        except Exception as e:
            self._json(500, {"ok": False, "error": f"{type(e).__name__}: {e}"})
            return
        self._json(200, stopped)

    def _post_run_step(self, body: dict) -> None:
        """Run a single scenario step for Step Debugger (▶).

        Accepts: {action, strategy, strategy_value, payload, deck_id?, step_id?}
          — decomposed form (StepPillRow/ScenarioDeckNode), builds the DSL line.
        Or: {constructor, step_id?}
          — raw PrettyK DSL line (gutter-run from Monaco CodePanel, B6).
        Validates the resulting constructor and returns the result.
        Real Playwright execution happens via controller._run_step when wired
        to a live controller session.
        """
        action = str(body.get("action", "")).strip()
        strategy = str(body.get("strategy", "css")).strip()
        strategy_value = str(body.get("strategy_value", "")).strip()
        payload = str(body.get("payload", "")).strip()
        raw_constructor = str(body.get("constructor", "")).strip()

        if not action and not raw_constructor:
            self._json(400, {"ok": False, "error": "action required"})
            return

        # Build DSL constructor (decomposed form), or use the raw line as-is (B6).
        if raw_constructor and not action:
            constructor = raw_constructor
        elif action == "Open":
            constructor = f"Open {payload or 'about:blank'}"
        elif action == "Wait":
            constructor = f"Wait {payload or '1000'}"
        elif action == "Spider":
            constructor = "SpiderScan"
        elif action == "ActiveScan":
            constructor = "ActiveScan"
        elif action == "FuzzWave":
            constructor = f"FuzzWave {payload or 'corpus'}"
        elif action == "Let":
            constructor = f"Let {strategy_value or 'var'} = {payload or '\"\"'}"
        elif action == "Secret":
            constructor = f"Secret {strategy_value or 'key'} {payload or '\"\"'}"
        elif action == "GenerateEmail":
            constructor = "GenerateEmail"
        elif action == "GeneratePhone":
            constructor = "GeneratePhone"
        else:
            strategy_part = f'{strategy} "{strategy_value}"' if strategy_value else strategy
            constructor = f"{action} {strategy_part} {payload}".strip()

        try:
            from core.constructor_validate import validate_constructor
            diags = validate_constructor(constructor)
            if diags:
                self._json(200, {
                    "ok": False,
                    "constructor": constructor,
                    "diagnostics": diags,
                    "action": action,
                })
                return
            self._json(200, {
                "ok": True,
                "constructor": constructor,
                "action": action,
                "step_id": body.get("step_id"),
            })
        except Exception as e:
            self._json(500, {"ok": False, "error": f"{type(e).__name__}: {e}"})

    def _post_browser_navigate(self, body: dict) -> None:
        from browser.browser_service import browser_navigate
        url = str(body.get("url", "")).strip()
        if not url:
            self._json(400, {"ok": False, "error": "url required"})
            return
        self._json(200, browser_navigate(url))

    def _post_browser_back(self, body: dict) -> None:
        from browser.browser_service import browser_back
        self._json(200, browser_back())

    def _post_browser_forward(self, body: dict) -> None:
        from browser.browser_service import browser_forward
        self._json(200, browser_forward())

    def _post_browser_screenshot(self, body: dict) -> None:
        # VP-F2: smoke-only. Main frame transport is now WS /api/browser/canvas.
        from browser.browser_service import browser_screenshot
        self._json(200, browser_screenshot())

    def _post_browser_click(self, body: dict) -> None:
        from browser.browser_service import browser_click
        selector = str(body.get("selector") or "").strip()
        strategy = str(body.get("strategy") or "css").strip()
        if not selector:
            self._json(400, {"ok": False, "error": "selector required"})
            return
        self._json(200, browser_click(selector, strategy))

    def _post_browser_type(self, body: dict) -> None:
        from browser.browser_service import browser_type_text
        selector = str(body.get("selector") or "").strip()
        text = str(body.get("text") or "").strip()
        strategy = str(body.get("strategy") or "css").strip()
        if not selector:
            self._json(400, {"ok": False, "error": "selector required"})
            return
        if not text:
            self._json(400, {"ok": False, "error": "text required"})
            return
        self._json(200, browser_type_text(selector, text, strategy))

    def _post_browser_highlight(self, body: dict) -> None:
        from browser.browser_service import browser_highlight
        selector = str(body.get("selector", "")).strip()
        strategy = str(body.get("strategy", "css")).strip()
        if not selector:
            self._json(400, {"ok": False, "error": "selector required"})
            return
        self._json(200, browser_highlight(selector, strategy))

    def _post_browser_eval(self, body: dict) -> None:
        from browser.browser_service import browser_eval
        expression = str(body.get("expression", "")).strip()
        if not expression:
            self._json(400, {"ok": False, "error": "expression required"})
            return
        self._json(200, browser_eval(expression))

    def _post_browser_observe_start(self, _body: dict) -> None:
        from browser.browser_service import browser_observe_start
        self._json(200, browser_observe_start())

    def _post_browser_observe_stop(self, _body: dict) -> None:
        from browser.browser_service import browser_observe_stop
        self._json(200, browser_observe_stop())

    def _post_browser_observe_event(self, _body: dict) -> None:
        from browser.browser_service import browser_observe_event
        self._json(200, browser_observe_event())

    def _post_browser_observe_click(self, body: dict) -> None:
        from browser.browser_service import browser_observe_click
        try:
            x = float(body.get("x"))
            y = float(body.get("y"))
        except (TypeError, ValueError):
            self._json(400, {"ok": False, "error": "x and y required (numbers)"})
            return
        self._json(200, browser_observe_click(x, y))

    def _post_browser_context_ensure(self, body: dict) -> None:
        from browser.browser_service import browser_context_ensure
        context = body.get("context")
        url = body.get("url")
        self._json(
            200,
            browser_context_ensure(
                context=context if isinstance(context, str) and context else "operator",
                url=url if isinstance(url, str) and url else None,
            ),
        )

    def _post_browser_context_destroy(self, _body: dict) -> None:
        from browser.browser_service import browser_context_destroy
        self._json(200, browser_context_destroy())

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        body, err = self._read_json_body()
        if err:
            self._json(400, {"ok": False, "error": err})
            return
        routes = {
            "/api/data/eval": self._post_eval,
            "/api/validate/constructor": self._post_validate_constructor,
            "/api/validate/constructors": self._post_validate_constructors,
            "/api/validate/data-script": self._post_validate_data_script,
            "/api/validate/auth-module": self._post_validate_auth_module,
            "/api/lab/openapi/parse": self._post_lab_openapi_parse,
            "/api/lab/graphql/parse": self._post_lab_graphql_parse,
            "/api/lab/grpc/parse": self._post_lab_grpc_parse,
            "/api/lab/grpc/pack": self._post_lab_grpc_pack,
            "/api/lab/grpc/unary": self._post_lab_grpc_unary,
            "/api/lab/chain/from-har": self._post_lab_chain_from_har,
            "/api/lab/chain/materialize": self._post_lab_chain_materialize,
            "/api/lab/chain/dry-run-pre": self._post_lab_chain_dry_run_pre,
            "/api/lab/chain/value-pack": self._post_lab_chain_value_pack,
            "/api/run/start": self._post_run_start,
            "/api/run/step": self._post_run_step,
            "/api/browser/navigate": self._post_browser_navigate,
            "/api/browser/back": self._post_browser_back,
            "/api/browser/forward": self._post_browser_forward,
            "/api/browser/screenshot": self._post_browser_screenshot,
            "/api/browser/highlight": self._post_browser_highlight,
            "/api/browser/eval": self._post_browser_eval,
            "/api/browser/click": self._post_browser_click,
            "/api/browser/type": self._post_browser_type,
            "/api/browser/observe/start": self._post_browser_observe_start,
            "/api/browser/observe/stop": self._post_browser_observe_stop,
            "/api/browser/observe/event": self._post_browser_observe_event,
            "/api/browser/observe/click": self._post_browser_observe_click,
            "/api/browser/context/ensure": self._post_browser_context_ensure,
            "/api/browser/context/destroy": self._post_browser_context_destroy,
        }
        handler = routes.get(path)
        if handler is not None:
            handler(body)
            return
        if path == "/api/run/stop":
            self._post_run_stop()
            return
        self._json(404, {"ok": False, "error": "not found"})

    def _json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(
        f"PrettyK playground http://{HOST}:{PORT}  "
        f"(eval + validate + /api/run + /api/checks)",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye", flush=True)


if __name__ == "__main__":
    main()
