# -*- coding: utf-8 -*-
from __future__ import annotations

import pytest

from utils.grpc_ops import (
    GrpcParseError,
    lab_grpc_shape,
    parse_proto_services,
    resolve_proto_pack,
    try_server_reflection,
    unary_call_harness,
)

PROTO = """
syntax = "proto3";
package demo;

service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply);
  rpc Chat (stream HelloRequest) returns (stream HelloReply);
}
"""


def test_lab_shape():
    shape = lab_grpc_shape(host="localhost:50051", proto_path="demo.proto")
    assert shape["executor"] is False


def test_parse_proto_services():
    out = parse_proto_services(PROTO)
    assert len(out["services"]) == 1
    greeter = out["services"][0]
    assert greeter["name"] == "Greeter"
    by_name = {m["name"]: m for m in greeter["methods"]}
    assert by_name["SayHello"]["unary"] is True
    assert by_name["Chat"]["client_streaming"] is True
    assert by_name["Chat"]["server_streaming"] is True


def test_proto_reject_empty():
    with pytest.raises(GrpcParseError):
        parse_proto_services("syntax = \"proto3\";")


def test_reflection_skipped_by_default(monkeypatch):
    monkeypatch.delenv("KDT_GRPC_REFLECTION", raising=False)
    res = try_server_reflection(host="localhost:50051")
    assert res["skipped"] is True
    assert res["attempted"] is False


def test_unary_harness_bolvan(monkeypatch):
    monkeypatch.delenv("KDT_GRPC_UNARY", raising=False)
    res = unary_call_harness(host="localhost:50051", method="Greeter/SayHello")
    assert res["ok"] is True
    assert res["skipped"] is True
    assert any("KDT_GRPC_UNARY" in n for n in res["notes"])


def test_unary_harness_live_flag_uses_bank_path(monkeypatch):
    monkeypatch.setenv("KDT_GRPC_UNARY", "1")

    def _fake_live(**kwargs):
        assert "50051" in kwargs["host"] or kwargs["host"]
        assert "Ping" in kwargs["method"]
        return {
            "ok": True,
            "response": {},
            "notes": ["live unary ok AccountService/Ping → mock"],
        }

    monkeypatch.setattr(
        "utils.grpc_ops._live_unary_bank",
        _fake_live,
    )
    res = unary_call_harness(
        host="127.0.0.1:50051",
        method="bank.v1.AccountService/Ping",
        request_json="{}",
    )
    assert res["attempted"] is True
    assert res["skipped"] is False
    assert res["ok"] is True
    assert not any("bolvan без RPC" in n for n in res["notes"])
    assert any("live unary ok" in n for n in res["notes"])


def test_grpc_dial_target_api_lab_remap(monkeypatch):
    from utils.grpc_ops import _grpc_dial_target

    monkeypatch.delenv("KDT_GRPC_PORT", raising=False)
    target, notes = _grpc_dial_target("127.0.0.1:8090")
    assert target == "127.0.0.1:50051"
    assert any("remap" in n for n in notes)

    monkeypatch.setenv("KDT_GRPC_PORT", "50051")
    target2, notes2 = _grpc_dial_target("127.0.0.1:8090")
    assert target2 == "127.0.0.1:50051"
    assert any("KDT_GRPC_PORT" in n for n in notes2)


def test_unary_harness_import_error_not_silent_bolvan(monkeypatch):
    monkeypatch.setenv("KDT_GRPC_UNARY", "1")
    import builtins

    real_import = builtins.__import__

    def _block_grpc(name, *args, **kwargs):
        if name == "grpc" or name.startswith("grpc."):
            raise ImportError("no grpcio")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _block_grpc)
    res = unary_call_harness(
        host="127.0.0.1:50051",
        method="AccountService/Ping",
    )
    assert res["attempted"] is True
    assert res["skipped"] is False
    assert res["ok"] is False
    assert any("grpcio" in n for n in res["notes"])


def test_split_service_method():
    from utils.grpc_ops import _split_service_method

    assert _split_service_method("AccountService/Ping") == ("AccountService", "Ping")
    assert _split_service_method("bank.v1.AccountService/Ping") == (
        "AccountService",
        "Ping",
    )


def test_resolve_proto_pack_dir(tmp_path):
    pack = tmp_path / "pack"
    pack.mkdir()
    (pack / "common.proto").write_text(
        'syntax = "proto3";\npackage bank.common;\nmessage Empty {}\n',
        encoding="utf-8",
    )
    (pack / "account.proto").write_text(
        """
syntax = "proto3";
package bank.v1;
import "common.proto";
service AccountService {
  rpc GetAccount (AccountId) returns (Account);
}
message AccountId { string id = 1; }
message Account { string id = 1; }
""",
        encoding="utf-8",
    )
    out = resolve_proto_pack(str(pack), import_paths=["."])
    assert out["ok"] is True
    names = {s["name"] for s in out["services"]}
    assert "AccountService" in names
    assert any(f["path"].endswith("account.proto") for f in out["files"])


def test_resolve_proto_pack_zip(tmp_path):
    import zipfile

    pack_dir = tmp_path / "src"
    pack_dir.mkdir()
    (pack_dir / "greeter.proto").write_text(PROTO, encoding="utf-8")
    zpath = tmp_path / "pack.zip"
    with zipfile.ZipFile(zpath, "w") as zf:
        zf.write(pack_dir / "greeter.proto", arcname="greeter.proto")
    out = resolve_proto_pack(str(zpath))
    assert out["ok"] is True
    assert out["services"][0]["name"] == "Greeter"
