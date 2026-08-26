# -*- coding: utf-8 -*-
"""Playground lab API + unary bolvan (IMP OA-5 / GQL-4 / GRPC-5 surface)."""
from __future__ import annotations

import json
from pathlib import Path

from tools.data_playground import Handler

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "openapi"


class _FakeHandler(Handler):
    def __init__(self):
        self.code = None
        self.payload = None

    def _json(self, code, payload):
        self.code = code
        self.payload = payload


def test_lab_openapi_parse_endpoint():
    h = _FakeHandler()
    spec = (FIXTURES / "petstore-mini.oas3.json").read_text(encoding="utf-8")
    h._post_lab_openapi_parse({"spec": spec})
    assert h.code == 200
    assert h.payload["ok"] is True
    assert len(h.payload["operations"]) >= 2
    assert "scan не запущен" in " ".join(h.payload["notes"])


def test_lab_graphql_parse_endpoint():
    h = _FakeHandler()
    h._post_lab_graphql_parse({"schema": "type Query {\n  products: ID\n}\n"})
    assert h.payload["ok"] is True
    assert any(o["name"] == "products" for o in h.payload["operations"])


def test_lab_grpc_parse_and_unary_bolvan(monkeypatch):
    monkeypatch.delenv("PK_GRPC_UNARY", raising=False)
    h = _FakeHandler()
    h._post_lab_grpc_parse(
        {
            "proto": (
                'syntax = "proto3";\n'
                "service Greeter {\n"
                "  rpc SayHello (A) returns (B);\n"
                "}\n"
            )
        }
    )
    assert h.payload["ok"] is True
    h._post_lab_grpc_unary(
        {"host": "localhost:50051", "method": "Greeter/SayHello", "request_json": "{}"}
    )
    assert h.payload["ok"] is True
    assert h.payload["skipped"] is True


def test_unary_methodid_and_adapter(monkeypatch):
    monkeypatch.delenv("PK_GRPC_UNARY", raising=False)
    from adapters.zap_adapter import ZapAdapter
    from core.method_id import lookup_method_id

    assert lookup_method_id("ВызовgRPC") == ("zap", "unary_grpc_call")
    zap = ZapAdapter.__new__(ZapAdapter)
    out = json.loads(zap.unary_grpc_call("localhost:1", "Svc/M", "{}"))
    assert out["ok"] is True
    assert out["skipped"] is True
