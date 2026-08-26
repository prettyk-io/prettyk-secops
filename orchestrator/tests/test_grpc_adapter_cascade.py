# -*- coding: utf-8 -*-
"""GrpcAdapter MethodId cascade (module_id, no host)."""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from adapters.grpc_adapter import GrpcAdapter
from core.errors import WiredError
from core.method_id import lookup_method_id

ROOT = Path(__file__).resolve().parents[2]
PROTO_PACK = ROOT / "services" / "pk-api-lab" / "proto_pack"


def _Wired():
    return SimpleNamespace(
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
                    path=str(PROTO_PACK),
                    kind="proto_pack",
                    as_name="bank_proto",
                    import_paths=[],
                )
            ],
            test_data_constructor=[
                SimpleNamespace(
                    id="bank_grpc",
                    module_type="gRPC",
                    grpc_fields=SimpleNamespace(
                        proto_as="bank_proto",
                        auth_module_id="",
                        last_inventory=[],
                    ),
                )
            ],
        ),
    )


def test_method_id_wire_grpc_adapter():
    assert lookup_method_id("СписокСервисовgRPC") == ("grpc", "list_services")
    assert lookup_method_id("ВызовgRPC") == ("grpc", "unary_call")


def test_list_services_and_unary_module_id():
    if not PROTO_PACK.is_dir() or not any(PROTO_PACK.rglob("*.proto")):
        pytest.skip("lab proto_pack missing")
    ad = GrpcAdapter()
    ad.bind_run_wired(_Wired(), str(ROOT))
    raw = ad.list_services("bank_grpc")
    payload = json.loads(raw) if isinstance(raw, str) else raw
    assert payload.get("ok") is True
    assert payload.get("services")
    assert payload.get("host") == "127.0.0.1:8090"

    unary = json.loads(ad.unary_call("bank_grpc", "AccountService/Ping", "{}"))
    assert unary.get("module_id") == "bank_grpc"
    assert unary.get("ok") is True  # bolvan without PK_GRPC_UNARY


def test_legacy_host_first_arg_rejected():
    ad = GrpcAdapter()
    ad.bind_run_wired(_Wired(), str(ROOT))
    with pytest.raises(WiredError, match="устаревшая"):
        ad.unary_call("127.0.0.1:50051", "AccountService/Ping", "{}")
