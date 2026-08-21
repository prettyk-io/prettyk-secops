# -*- coding: utf-8 -*-
"""Волна C: OA + GQL + gRPC MethodId-цепочки в одном pipe на болванках."""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from adapters.grpc_adapter import GrpcAdapter
from adapters.http_adapter import HttpAdapter
from adapters.zap_adapter import ZapAdapter
from core.action_factory import ActionFactory
from core.constructor_validate import validate_language_script
from core.controller import Controller
from core.data_stream import DataStream
from core.language_engine import LanguageEngine
from core.wired_validate import parse_constructor
from core.method_id import lookup_method_id

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "openapi"
OAS = FIXTURES / "petstore-mini.oas3.json"
SDL = FIXTURES / "mini.sdl"
PROTO_PACK = ROOT / "services" / "kdt-api-lab" / "proto_pack"


@pytest.fixture(autouse=True)
def _lab_dry(monkeypatch):
    monkeypatch.setenv("KDT_API_LAB_DRY", "1")
    monkeypatch.delenv("KDT_GRPC_UNARY", raising=False)
    if not SDL.exists():
        SDL.write_text("type Query {\n  health: String\n}\n", encoding="utf-8")


def _bank_manifest():
    return SimpleNamespace(
        debug_mode=False,
        scan_base_url=lambda: "http://127.0.0.1:8090",
        scan_allowed_extra_domains=lambda: "127.0.0.1|localhost",
        infrastructure=SimpleNamespace(
            base_url_override="http://127.0.0.1:8090",
            allowed_extra_domains="127.0.0.1|localhost",
        ),
        security_configuration=SimpleNamespace(base_url_override=None),
        test_suites=SimpleNamespace(
            imports=[
                SimpleNamespace(
                    path=str(OAS),
                    kind="openapi_spec",
                    as_name="bank_oas",
                    import_paths=[],
                ),
                SimpleNamespace(
                    path=str(SDL),
                    kind="graphql_sdl",
                    as_name="bank_sdl",
                    import_paths=[],
                ),
                SimpleNamespace(
                    path=str(PROTO_PACK),
                    kind="proto_pack",
                    as_name="bank_proto",
                    import_paths=[],
                ),
            ],
            test_data_constructor=[
                SimpleNamespace(
                    id="bank_openapi",
                    module_type="OpenAPI",
                    openapi_fields={
                        "spec_mode": "resource",
                        "spec_as": "bank_oas",
                        "spec_path_rel": "/openapi.json",
                        "zap_import": True,
                        "auth_module_id": "",
                    },
                ),
                SimpleNamespace(
                    id="bank_graphql",
                    module_type="GraphQL",
                    graphql_fields={
                        "schema_mode": "resource",
                        "sdl_as": "bank_sdl",
                        "schema_path_rel": "/graphql",
                        "endpoint_rel": "/graphql",
                        "zap_import": True,
                        "zap_scan": False,
                        "auth_module_id": "",
                    },
                ),
                SimpleNamespace(
                    id="bank_grpc",
                    module_type="gRPC",
                    grpc_fields=SimpleNamespace(
                        proto_as="bank_proto",
                        auth_module_id="",
                        last_inventory=[],
                    ),
                ),
            ],
        ),
    )


def test_triple_methodids_validate():
    script = "\n".join(
        [
            "СписокОперацийOpenAPI bank_openapi",
            "ИмпортOpenAPI bank_openapi",
            "ВыполнитьОперацииOpenAPI bank_openapi 3",
            "СписокОперацийGraphQL bank_graphql",
            "ИмпортGraphQL bank_graphql",
            'ВыполнитьGraphQL bank_graphql "{ health }"',
            "СписокСервисовgRPC bank_grpc",
            'ВызовgRPC bank_grpc bank.v1.AccountService/Ping "{}"',
        ]
    )
    assert lookup_method_id("ВыполнитьОперацииOpenAPI")[0] == "http"
    assert lookup_method_id("ВыполнитьGraphQL")[0] == "http"
    assert lookup_method_id("СписокСервисовgRPC")[0] == "grpc"
    diags = validate_language_script(script)
    assert diags == [], diags


def test_triple_controller_pipe_dry():
    if not OAS.is_file():
        pytest.skip("OAS fixture missing")
    if not PROTO_PACK.is_dir():
        pytest.skip("lab proto_pack missing")

    wired = _bank_manifest()
    zap = ZapAdapter.__new__(ZapAdapter)
    zap._connected = False
    zap._zap = None
    zap.bind_run_wired(wired, str(ROOT))

    http = HttpAdapter()
    http.bind_run_wired(wired)
    http.get = lambda url, headers=None, **kw: {  # type: ignore
        "status": 200,
        "json": {"data": {"health": "ok"}},
        "body": '{"data":{"health":"ok"}}',
    }
    http.post = lambda url, data=None, json=None, headers=None, **kw: {  # type: ignore
        "status": 200,
        "json": {"data": {"health": "ok"}},
        "body": '{"data":{"health":"ok"}}',
    }

    grpc = GrpcAdapter()
    grpc.bind_run_wired(wired, str(ROOT))

    factory = ActionFactory()
    factory.register("zap", "list_openapi_operations", zap.list_openapi_operations)
    factory.register("zap", "import_openapi_spec", zap.import_openapi_spec)
    factory.register("zap", "list_graphql_operations", zap.list_graphql_operations)
    factory.register("zap", "import_graphql_schema", zap.import_graphql_schema)
    factory.register("http", "execute_openapi_module", http.execute_openapi_module)
    factory.register("http", "execute_graphql_module", http.execute_graphql_module)
    factory.register("grpc", "list_services", grpc.list_services)
    factory.register("grpc", "unary_call", grpc.unary_call)

    ctrl = Controller.__new__(Controller)
    ctrl.language_engine = LanguageEngine()
    ctrl.page_resolver = None
    ctrl.adapters = {"zap": zap, "http": http, "grpc": grpc}
    ctrl._manifest_problems = []
    ctrl.last_zap_report = None
    ctrl.wired = wired
    ctrl.action_factory = factory
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_manifest_error = lambda e, **k: e
    ctrl._diary_high_alerts = lambda: None
    ctrl._parse_constructor = lambda raw: parse_constructor(raw, factory)

    stream = DataStream()
    lines = [
        "СписокОперацийOpenAPI bank_openapi",
        "ИмпортOpenAPI bank_openapi",
        "ВыполнитьОперацииOpenAPI bank_openapi 3",
        "СписокОперацийGraphQL bank_graphql",
        "ИмпортGraphQL bank_graphql",
        'ВыполнитьGraphQL bank_graphql "{ health }"',
        "СписокСервисовgRPC bank_grpc",
        'ВызовgRPC bank_grpc bank.v1.AccountService/Ping "{}"',
    ]
    for i, line in enumerate(lines):
        step = SimpleNamespace(
            constructor=line,
            retry=0,
            retry_delay=1,
            failsafe=False,
            continue_on_failure=False,
            save_as="",
            id=f"t{i}",
            description=None,
        )
        ok = ctrl._run_step(step, stream, SimpleNamespace(id="triple"), f"t{i}")
        assert ok is True, line

    oa_exec = getattr(http, "_last_openapi_execute", {}) or {}
    assert oa_exec.get("ok") is True, oa_exec
    assert oa_exec.get("module_id") == "bank_openapi"

    gql_exec = getattr(http, "_last_graphql_execute", {}) or {}
    assert gql_exec.get("ok") is True, gql_exec
    assert gql_exec.get("module_id") == "bank_graphql"

    grpc_list = getattr(grpc, "_last_list_services", None)
    if grpc_list is None:
        # adapter may store differently — re-call sanity
        payload = json.loads(grpc.list_services("bank_grpc"))
        assert payload.get("ok") is True
    unary = json.loads(grpc.unary_call("bank_grpc", "bank.v1.AccountService/Ping", "{}"))
    assert unary.get("ok") is True
    assert unary.get("module_id") == "bank_grpc"
