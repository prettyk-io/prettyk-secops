# -*- coding: utf-8 -*-
from __future__ import annotations

from core.auth_module import (
    dry_run_auth_module,
    parse_auth_module,
    validate_auth_module,
)
from core.errors import WiredError
import pytest


def test_parse_bearer_and_secret():
    profile = parse_auth_module(
        "auth=bearer\n#token=sekret\n",
        module_id="login",
    )
    assert profile.kind == "bearer"
    assert profile.values["token"] == "sekret"
    assert "token" in profile.secret_keys
    assert profile.bootstrap_auth_type() == "Bearer Token"
    assert profile.bootstrap_auth_details()["Токен"] == "sekret"


def test_validate_missing_token():
    diags = validate_auth_module("auth=bearer\n")
    assert diags and diags[0]["severity"] == "error"


def test_dry_run_hides_secret_values():
    out = dry_run_auth_module("auth=bearer\n#token=sekret\n", module_id="a")
    assert out["ok"] is True
    assert out["profile"]["kind"] == "bearer"
    assert "sekret" not in str(out["profile"])
    assert "token" in out["profile"]["secret_keys"]


def test_empty_ok():
    assert validate_auth_module("") == []
    assert dry_run_auth_module("")["ok"] is True


def test_bad_kind():
    with pytest.raises(WiredError):
        parse_auth_module("auth=oauth\n")


def test_profile_feeds_http_bootstrap():
    from core.auth_bootstrap import apply_auth_bootstrap

    class FakeHttp:
        def __init__(self):
            self.calls = []

        def set_auth_bearer(self, token):
            self.calls.append(("bearer", token))

    profile = parse_auth_module("auth=bearer\ntoken=abc\n")
    http = FakeHttp()
    out = apply_auth_bootstrap(
        auth_type=profile.bootstrap_auth_type(),
        auth_details=profile.bootstrap_auth_details(),
        http_adapter=http,
    )
    assert out["applied"] is True
    assert http.calls == [("bearer", "abc")]


def test_parse_chain_and_capture():
    text = "\n".join(
        [
            "auth=chain",
            "login=u",
            "POST https://idp/token",
            "  Header Content-Type = application/json",
            '  Body {"user":"$login"}',
            "  Capture $.access_token as token",
            "GET https://api/me",
            "  Header Authorization = Bearer $token",
            "  Capture $.id as uid",
        ]
    )
    profile = parse_auth_module(text, module_id="sso")
    assert profile.kind == "chain"
    assert len(profile.steps) == 2
    assert profile.steps[0].method == "POST"
    assert profile.steps[0].headers["Content-Type"] == "application/json"
    assert profile.steps[0].bind_as == "token"
    assert profile.steps[1].url == "https://api/me"
    pub = profile.dry_run_public()
    assert pub["steps"] == 2
    assert pub["captures"][0]["as"] == "token"


def test_validate_chain_needs_capture():
    diags = validate_auth_module("auth=chain\nPOST https://x\n")
    assert diags and "Capture" in diags[0]["message"]


def test_apply_auth_chain_sets_bearer():
    from core.auth_module import apply_auth_chain

    class FakeHttp:
        def __init__(self):
            self.bearer = None

        def post(self, url, data=None, json_data=None, headers=None):
            assert json_data == {"user": "u"}
            return {"status": 200, "json": {"access_token": "tok-1"}, "headers": {}}

        def set_auth_bearer(self, token):
            self.bearer = token

    profile = parse_auth_module(
        "\n".join(
            [
                "auth=chain",
                "login=u",
                "POST https://idp/token",
                "  Body {\"user\":\"$login\"}",
                "  Capture $.access_token as token",
            ]
        )
    )
    http = FakeHttp()
    out = apply_auth_chain(profile, http)
    assert out["applied"] is True
    assert http.bearer == "tok-1"
