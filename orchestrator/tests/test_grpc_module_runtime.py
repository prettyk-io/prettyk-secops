# -*- coding: utf-8 -*-
"""gRPC cascade: proto_pack resource → module → attack URL host."""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from core.errors import WiredError
from utils.grpc_module_runtime import (
    assert_attack_host_allowed,
    attack_target_from_wired,
    reject_absolute_host_arg,
    resolve_grpc_module,
)

ROOT = Path(__file__).resolve().parents[2]
PROTO_PACK = ROOT / "services" / "pk-api-lab" / "proto_pack"


def _Wired(*, proto_as="bank_proto", proto_path=None, allow="127.0.0.1|localhost"):
    path = str(proto_path or PROTO_PACK)
    return SimpleNamespace(
        scan_base_url=lambda: "http://127.0.0.1:8090",
        scan_allowed_extra_domains=lambda: allow,
        infrastructure=SimpleNamespace(
            base_url_override="http://127.0.0.1:8090",
            allowed_extra_domains=allow,
        ),
        security_configuration=SimpleNamespace(base_url_override=None),
        test_suites=SimpleNamespace(
            imports=[
                SimpleNamespace(
                    path=path,
                    kind="proto_pack",
                    as_name=proto_as,
                    import_paths=[],
                )
            ],
            test_data_constructor=[
                SimpleNamespace(
                    id="bank_grpc",
                    module_type="gRPC",
                    grpc_fields=SimpleNamespace(
                        proto_as=proto_as,
                        auth_module_id="",
                        last_inventory=[],
                    ),
                )
            ],
        ),
    )


def test_attack_target_from_base_url():
    m = _Wired()
    host, tls, abs_url = attack_target_from_wired(m)
    assert host == "127.0.0.1:8090"
    assert tls is False
    assert abs_url.startswith("http://127.0.0.1:8090")


def test_reject_absolute_host_in_args():
    with pytest.raises(WiredError):
        reject_absolute_host_arg("https://evil.test/x", label="метод")
    with pytest.raises(WiredError):
        reject_absolute_host_arg("evil.test:50051", label="метод")
    reject_absolute_host_arg("AccountService/Ping")


def test_resolve_grpc_module_cascade():
    if not PROTO_PACK.is_dir() or not any(PROTO_PACK.rglob("*.proto")):
        pytest.skip("lab proto_pack missing")
    m = _Wired()
    resolved = resolve_grpc_module(m, "bank_grpc", wired_dir=str(ROOT))
    assert resolved.from_module
    assert resolved.host == "127.0.0.1:8090"
    assert resolved.proto_as == "bank_proto"
    assert Path(resolved.proto_path).exists()


def test_assert_deny_foreign_host():
    m = _Wired(allow="127.0.0.1")
    with pytest.raises(WiredError, match="разрешен"):
        assert_attack_host_allowed(m, "http://evil.test/")
