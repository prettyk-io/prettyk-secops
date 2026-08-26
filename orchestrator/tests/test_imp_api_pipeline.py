# -*- coding: utf-8 -*-
"""IMP: PrettyK → validator → dry adapter pipeline (без живого ZAP/браузера)."""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from adapters.webdriver_adapter import WebDriverAdapter
from adapters.zap_adapter import ZapAdapter
from core.action_factory import ActionFactory
from core.constructor_validate import validate_language_script
from core.controller import Controller
from core.data_stream import DataStream
from core.language_engine import LanguageEngine
from core.wired_validate import build_dry_action_factory, collect_wired_problems
from core.method_id import ensure_wire, lookup_method_id

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "openapi"
OAS = FIXTURES / "petstore-mini.oas3.json"
SDL_FILE = FIXTURES / "mini.sdl"
PROTO_FILE = FIXTURES / "mini.proto"

SDL = """
type Query {
  products: [Product]
}
"""

PROTO = """
syntax = "proto3";
service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply);
}
"""


@pytest.fixture(autouse=True)
def _lab_dry(monkeypatch):
    monkeypatch.setenv("PK_API_LAB_DRY", "1")
    if not SDL_FILE.exists():
        SDL_FILE.write_text("type Query {\n  products: ID\n}\n", encoding="utf-8")
    if not PROTO_FILE.exists():
        PROTO_FILE.write_text(PROTO, encoding="utf-8")


def test_pretty_methodids_resolve_and_validate():
    assert lookup_method_id("СписокОперацийOpenAPI") == (
        "zap",
        "list_openapi_operations",
    )
    assert lookup_method_id("СписокОперацийGraphQL") == (
        "zap",
        "list_graphql_operations",
    )
    assert lookup_method_id("ВыполнитьОперацииOpenAPI") == (
        "http",
        "execute_openapi_module",
    )
    assert lookup_method_id("ВыполнитьGraphQL") == (
        "http",
        "execute_graphql_module",
    )
    assert lookup_method_id("СписокСервисовgRPC") == ("grpc", "list_services")
    assert lookup_method_id("ВызовgRPC") == ("grpc", "unary_call")
    assert lookup_method_id("АвтоАвторизоваться") == (
        "webdriver",
        "auto_authorize_discovery",
    )
    assert ensure_wire(f"СписокОперацийOpenAPI {OAS.as_posix()}").startswith(
        "zap|list_openapi_operations|"
    )
    diags = validate_language_script(
        "\n".join(
            [
                f"СписокОперацийOpenAPI {OAS.as_posix()}",
                f"ИмпортOpenAPI {OAS.as_posix()}",
                f"ВыполнитьОперацииOpenAPI {OAS.as_posix()} 3",
                f"СписокОперацийGraphQL {SDL_FILE.as_posix()}",
                "ВыполнитьGraphQL bank_graphql",
                "СписокСервисовgRPC bank_grpc",
                "ВызовgRPC bank_grpc Greeter/SayHello {}",
                "АвтоАвторизоваться https://example/login u p",
            ]
        )
    )
    assert diags == [], diags


def test_dry_factory_registers_new_actions():
    factory = build_dry_action_factory()
    assert factory.get_method("zap", "list_openapi_operations")
    assert factory.get_method("zap", "list_graphql_operations")
    assert factory.get_method("http", "execute_openapi_module")
    assert factory.get_method("http", "execute_graphql_module")
    assert factory.get_method("grpc", "list_services")
    assert factory.get_method("grpc", "unary_call")
    assert factory.get_method("webdriver", "auto_authorize_discovery")


def test_adapter_lab_inventory_no_zap():
    zap = ZapAdapter.__new__(ZapAdapter)
    zap._connected = False
    zap._zap = None
    out = json.loads(zap.list_openapi_operations(str(OAS)))
    assert out["ok"] is True
    assert len(out["operations"]) >= 2
    assert zap.import_openapi_spec(str(OAS)) is True

    gql = json.loads(zap.list_graphql_operations(SDL))
    assert gql["ok"] is True
    assert any(o["name"] == "products" for o in gql["operations"])
    assert zap.import_graphql_schema(SDL) is True

    grpc = json.loads(zap.list_grpc_services(PROTO))
    assert grpc["ok"] is True
    assert grpc["services"][0]["name"] == "Greeter"
    assert zap.import_grpc_proto(PROTO) is True


def test_auto_authorize_stub_honest():
    wd = WebDriverAdapter.__new__(WebDriverAdapter)
    res = wd.auto_authorize_discovery("https://juice/login", "u", "p")
    assert res["applied"] is False
    assert "stub" in " ".join(res["notes"]).lower() or "DISC-1" in " ".join(res["notes"])


def test_controller_pipeline_dry_api_steps():
    """Болванка через Controller._run_step + LanguageEngine (IMP epics close)."""
    zap = ZapAdapter.__new__(ZapAdapter)
    zap._connected = False
    zap._zap = None
    wd = WebDriverAdapter.__new__(WebDriverAdapter)

    stream = DataStream()
    factory = ActionFactory()
    factory.register("zap", "list_openapi_operations", zap.list_openapi_operations)
    factory.register("zap", "import_openapi_spec", zap.import_openapi_spec)
    factory.register("zap", "list_graphql_operations", zap.list_graphql_operations)
    factory.register("zap", "import_graphql_schema", zap.import_graphql_schema)
    factory.register("zap", "import_grpc_proto", zap.import_grpc_proto)
    factory.register("webdriver", "auto_authorize_discovery", wd.auto_authorize_discovery)

    ctrl = Controller.__new__(Controller)
    ctrl.language_engine = LanguageEngine()
    ctrl.page_resolver = None
    ctrl.adapters = {"zap": zap, "webdriver": wd}
    ctrl._wired_problems = []
    ctrl.last_zap_report = None
    ctrl.wired = SimpleNamespace(debug_mode=False)
    ctrl.action_factory = factory
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_wired_error = lambda e, **k: e
    ctrl._diary_high_alerts = lambda: None

    from core.wired_validate import parse_constructor

    ctrl._parse_constructor = lambda raw: parse_constructor(raw, factory)

    steps = [
        f"СписокОперацийOpenAPI {OAS.as_posix()}",
        f"ИмпортOpenAPI {OAS.as_posix()}",
        f"СписокОперацийGraphQL {SDL_FILE.as_posix()}",
        f"ИмпортGraphQL {SDL_FILE.as_posix()}",
        f"ИмпортgRPC {PROTO_FILE.as_posix()}",
        "АвтоАвторизоваться https://juice/login demo demo",
    ]

    for i, line in enumerate(steps):
        step = SimpleNamespace(
            constructor=line,
            retry=0,
            retry_delay=1,
            failsafe=False,
            continue_on_failure=False,
            save_as="",
            id=f"imp{i}",
            description=None,
        )
        ok = ctrl._run_step(step, stream, SimpleNamespace(id="imp_sc"), f"imp{i}")
        assert ok is True, line

    assert getattr(zap, "_last_openapi_ops", {}).get("ok") is True
    assert getattr(zap, "_last_graphql_ops", {}).get("ok") is True
    assert getattr(zap, "_last_grpc_services", {}).get("ok") is True
    assert getattr(wd, "_last_auth_discovery", {}).get("applied") is False


def test_wired_validate_accepts_openapi_pretty():
    class _M:
        test_suites = SimpleNamespace(
            scenarios=[
                SimpleNamespace(
                    id="s1",
                    scenario_name="imp",
                    steps=[
                        SimpleNamespace(
                            id="t1",
                            description="oa",
                            constructor=f"СписокОперацийOpenAPI {OAS.as_posix()}",
                        )
                    ],
                )
            ],
            pages=[],
            test_data_constructor=[],
        )

    problems = collect_wired_problems(_M())
    assert problems == [], problems
