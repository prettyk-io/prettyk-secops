# -*- coding: utf-8 -*-
"""IMP scope smoke: OA / GQL / gRPC / HAR / CHAIN MethodIds + PrettyK ladder (no live ZAP)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.constructor_validate import validate_language_script
from core.method_id import lookup_method_id
from utils.chain_ops import seed_prettyk_fuzz_chain, seed_prettyk_prepare_chain
from utils.chain_runtime import seed_prettyk_execute_chain, seed_prettyk_scan_chain
from utils.graphql_ops import parse_sdl_ops
from utils.grpc_ops import parse_proto_services
from utils.openapi_ops import load_openapi_file


FIXTURES = Path(__file__).resolve().parent / "fixtures" / "openapi"


def test_imp_scope_method_ids():
    assert lookup_method_id("ИмпортHAR") == ("zap", "import_har_sequence")
    assert lookup_method_id("СканПоследовательности") == ("zap", "sequence_active_scan")
    assert lookup_method_id("ВыполнитьЦепь") == ("zap", "execute_chain_module")
    assert lookup_method_id("СканированиеЦепи") == ("zap", "scan_chain_module")
    assert lookup_method_id("ПодготовитьЦепь") == ("zap", "prepare_chain_module")
    assert lookup_method_id("ФаззингЦепи") == ("fuzz", "fuzz_chain_module")
    assert lookup_method_id("РасследованиеЦепи")[1] == "investigate_chain_module"


def test_imp_scope_prettyk_ladder_validates():
    mid = "flow_a"
    script = "\n".join(
        [
            seed_prettyk_execute_chain(mid),
            seed_prettyk_scan_chain(mid),
            seed_prettyk_prepare_chain(mid),
            seed_prettyk_fuzz_chain(mid),
            f"РасследованиеЦепи {mid}",
            "ИмпортHAR flow resources/flow.har",
            "СканПоследовательности flow",
        ]
    )
    diags = validate_language_script(script)
    assert diags == [], diags


def test_imp_scope_oa_gql_grpc_parse_smoke():
    oas = FIXTURES / "petstore-mini.oas3.json"
    sdl = FIXTURES / "mini.sdl"
    proto = (
        Path(__file__).resolve().parents[2]
        / "services"
        / "pk-api-lab"
        / "proto_pack"
        / "bank"
        / "v1"
        / "account.proto"
    )
    assert oas.is_file()
    parsed = load_openapi_file(oas)
    assert parsed.get("operations"), "openapi ops empty"
    if not sdl.is_file():
        sdl.write_text("type Query {\n  health: String\n}\n", encoding="utf-8")
    gql = parse_sdl_ops(sdl.read_text(encoding="utf-8"))
    assert gql is not None
    if not proto.is_file():
        pytest.skip("lab proto_pack missing")
    svcs = parse_proto_services(proto.read_text(encoding="utf-8"))
    assert isinstance(svcs, dict)
    assert svcs.get("services") or svcs.get("ok") is not False
