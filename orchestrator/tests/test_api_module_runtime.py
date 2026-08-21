# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from adapters.http_adapter import HttpAdapter
from adapters.zap_adapter import ZapAdapter
from core.errors import WiredError
from utils.api_module_runtime import (
    allow_zap_import,
    resolve_graphql_arg,
    resolve_openapi_arg,
    static_auth_headers,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "openapi"
OAS = FIXTURES / "petstore-mini.oas3.json"
SDL = FIXTURES / "mini.sdl"


def _manifest(modules, *, imports=None, base_url="http://127.0.0.1:8090"):
    return SimpleNamespace(
        test_suites=SimpleNamespace(
            test_data_constructor=modules,
            imports=imports or [],
        ),
        infrastructure=SimpleNamespace(
            base_url_override=base_url,
            allowed_extra_domains="127.0.0.1|localhost",
        ),
        scan_base_url=lambda: base_url,
        scan_allowed_extra_domains=lambda: "127.0.0.1|localhost",
    )


def test_resolve_openapi_relative_cascade():
    mod = SimpleNamespace(
        id="bank_openapi",
        module_type="OpenAPI",
        openapi_fields={
            "spec_mode": "url_relative",
            "spec_path_rel": "/openapi.json",
            "zap_import": False,
            "auth_module_id": "auth1",
        },
    )
    r = resolve_openapi_arg(_manifest([mod]), "bank_openapi")
    assert r.from_module is True
    assert r.spec == "http://127.0.0.1:8090/openapi.json"
    assert r.base_url == "http://127.0.0.1:8090"
    assert r.zap_import is False
    assert r.auth_module_id == "auth1"


def test_resolve_openapi_resource_file():
    imp = SimpleNamespace(
        kind="openapi_spec",
        as_name="bank_oas",
        path=str(OAS),
    )
    mod = SimpleNamespace(
        id="bank_openapi",
        module_type="OpenAPI",
        openapi_fields={
            "spec_mode": "resource",
            "spec_as": "bank_oas",
            "zap_import": True,
        },
    )
    r = resolve_openapi_arg(_manifest([mod], imports=[imp]), "bank_openapi")
    assert r.from_module is True
    assert Path(r.spec).resolve() == OAS.resolve()
    assert r.zap_import is True


def test_resolve_openapi_denies_foreign_host():
    from utils.allowed_urls import ALLOWED_URL_DENY_MSG

    mod = SimpleNamespace(
        id="bank_openapi",
        module_type="OpenAPI",
        openapi_fields={
            "spec_mode": "url_relative",
            "spec_path_rel": "https://evil.example/openapi.json",
        },
    )
    r = resolve_openapi_arg(_manifest([mod]), "bank_openapi")
    assert r.from_module is True
    assert any(ALLOWED_URL_DENY_MSG in n for n in r.notes)


def test_resolve_openapi_raw_path():
    r = resolve_openapi_arg(None, str(OAS))
    assert r.from_module is False
    assert r.spec == str(OAS)


def test_resolve_openapi_legacy_file_path():
    mod = SimpleNamespace(
        id="bank_openapi",
        module_type="OpenAPI",
        openapi_fields={
            "spec_source": "file",
            "spec_path": str(OAS),
            "zap_import": False,
            "auth_module_id": "auth1",
        },
    )
    r = resolve_openapi_arg(_manifest([mod]), "bank_openapi")
    assert r.from_module is True
    assert r.spec == str(OAS)
    assert r.base_url == "http://127.0.0.1:8090"
    assert r.auth_module_id == "auth1"


def test_resolve_graphql_module():
    if not SDL.exists():
        SDL.write_text("type Query {\n  health: String\n}\n", encoding="utf-8")
    imp = SimpleNamespace(
        kind="graphql_sdl",
        as_name="bank_sdl",
        path=str(SDL),
    )
    mod = SimpleNamespace(
        id="bank_graphql",
        module_type="GraphQL",
        graphql_fields={
            "schema_mode": "resource",
            "sdl_as": "bank_sdl",
            "endpoint_rel": "/graphql",
            "zap_import": True,
            "zap_scan": False,
        },
    )
    r = resolve_graphql_arg(_manifest([mod], imports=[imp]), "bank_graphql")
    assert r.from_module is True
    assert Path(r.schema).resolve() == SDL.resolve()
    assert r.endpoint == "http://127.0.0.1:8090/graphql"
    assert r.zap_import is True


def test_allow_zap_import_gate(monkeypatch):
    monkeypatch.delenv("KDT_OPENAPI_ZAP_IMPORT", raising=False)
    monkeypatch.delenv("KDT_API_ZAP_IMPORT", raising=False)
    ok, notes = allow_zap_import(module_flag=False, openapi=True)
    assert ok is False
    assert notes
    monkeypatch.setenv("KDT_OPENAPI_ZAP_IMPORT", "1")
    ok2, _ = allow_zap_import(module_flag=False, openapi=True)
    assert ok2 is True


def test_static_auth_bearer():
    auth = SimpleNamespace(
        id="a1",
        module_type="Авторизация",
        auth_fields={"constructor": "auth=bearer\ntoken=secret-token\n"},
    )
    headers, notes = static_auth_headers(_manifest([auth]), "a1")
    assert headers.get("Authorization") == "Bearer secret-token"
    assert notes == []


def test_zap_import_skips_when_module_gate(monkeypatch):
    monkeypatch.setenv("KDT_API_LAB_DRY", "1")
    monkeypatch.delenv("KDT_OPENAPI_ZAP_IMPORT", raising=False)
    monkeypatch.delenv("KDT_API_ZAP_IMPORT", raising=False)
    mod = SimpleNamespace(
        id="bank_openapi",
        module_type="OpenAPI",
        openapi_fields={
            "spec_mode": "resource",
            "spec_as": "bank_oas",
            "zap_import": False,
        },
    )
    imp = SimpleNamespace(kind="openapi_spec", as_name="bank_oas", path=str(OAS))
    zap = ZapAdapter.__new__(ZapAdapter)
    zap._connected = False
    zap._zap = None
    zap._run_manifest = _manifest([mod], imports=[imp])
    assert zap.import_openapi_spec("bank_openapi") is True
    assert getattr(zap, "_last_openapi_import", {}).get("skipped") is True


def test_http_set_proxy_and_exercise_dry(monkeypatch):
    monkeypatch.setenv("KDT_API_LAB_DRY", "1")
    http = HttpAdapter()
    assert http.set_proxy("127.0.0.1:8099") is True
    assert "http" in http.session.proxies
    imp = SimpleNamespace(kind="openapi_spec", as_name="bank_oas", path=str(OAS))
    mod = SimpleNamespace(
        id="bank_openapi",
        module_type="OpenAPI",
        openapi_fields={
            "spec_mode": "resource",
            "spec_as": "bank_oas",
            "zap_import": False,
        },
    )
    http.bind_run_wired(_manifest([mod], imports=[imp]))

    http.get = lambda url, headers=None, **kw: {"status": 200, "json": {}, "body": ""}  # type: ignore
    out = json.loads(http.execute_openapi_module("bank_openapi", 3))
    assert out.get("ok") is True
    assert out.get("attempted", 0) >= 1


def test_foreign_absolute_raises_on_resolve_helper():
    from utils.attack_target import resolve_attack_relative_or_allowlisted

    m = _manifest([])
    with pytest.raises(WiredError):
        resolve_attack_relative_or_allowlisted(
            m, "https://evil.example/x", label="схема OpenAPI"
        )
