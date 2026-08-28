# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

import pytest

from utils.openapi_ops import (
    OpenApiParseError,
    load_openapi_file,
    ops_to_fuzz_targets,
    parse_openapi_ops,
    seed_prettyk_comments,
    try_scanner_import_openapi,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "openapi"


def test_parse_openapi3_petstore_mini():
    out = load_openapi_file(FIXTURES / "petstore-mini.oas3.json")
    assert out["kind"] == "openapi3"
    assert out["base_url"] == "https://petstore.example/v2"
    methods = {(o["method"], o["path"]) for o in out["operations"]}
    assert ("GET", "/pet/{petId}") in methods
    assert ("POST", "/pet") in methods
    get_pet = next(o for o in out["operations"] if o["operation_id"] == "getPetById")
    assert get_pet["url"] == "https://petstore.example/v2/pet/{petId}"


def test_parse_swagger2_compat():
    out = load_openapi_file(FIXTURES / "petstore-mini.swagger2.json")
    assert out["kind"] == "swagger2"
    assert out["base_url"] == "https://petstore.example/v2"
    assert any(o["operation_id"] == "loginUser" for o in out["operations"])


def test_reject_unknown_kind():
    with pytest.raises(OpenApiParseError):
        parse_openapi_ops({"info": {"title": "x"}})


def test_ops_to_fuzz_targets_and_seed():
    out = load_openapi_file(FIXTURES / "petstore-mini.oas3.json")
    targets = ops_to_fuzz_targets(out["operations"], limit=3)
    assert len(targets) == 3
    assert targets[0]["corpus"] == "intent_boundary"
    assert targets[0]["method"] in {"GET", "POST", "PUT", "PATCH", "DELETE"}
    seed = seed_prettyk_comments(out["operations"], limit=2)
    assert "OpenAPI ops (lab seed)" in seed
    assert seed.count("\n# ") >= 2


def test_scanner_import_skipped_without_flag(monkeypatch):
    monkeypatch.delenv("PK_OPENAPI_scanner_IMPORT", raising=False)

    class scanner:
        def import_openapi_spec(self, _):
            raise AssertionError("must not call")

    res = try_scanner_import_openapi("https://example/openapi.json", scanner_adapter=scanner())
    assert res["skipped"] is True
    assert res["attempted"] is False


def test_scanner_import_opt_in(monkeypatch):
    monkeypatch.setenv("PK_OPENAPI_scanner_IMPORT", "1")
    calls: list[str] = []

    class scanner:
        def import_openapi_spec(self, spec):
            calls.append(spec)
            return True

    res = try_scanner_import_openapi("file:///tmp/a.json", scanner_adapter=scanner())
    assert res["imported"] is True
    assert calls == ["file:///tmp/a.json"]
