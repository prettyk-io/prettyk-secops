# -*- coding: utf-8 -*-
"""AUTH-12 wave1: API Key / Query Key + success check + compose list."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.auth_bootstrap import (
    apply_auth_bootstrap,
    apply_auth_profile_list,
    verify_auth_success,
)
from core.auth_module import parse_auth_module, validate_auth_module


class FakeHttp:
    def __init__(self):
        self.calls = []
        self._get_body = "welcome ok"
        self._get_status = 200
        self.params = {}
        self.headers = {}
        self.cookies = {}

    def set_auth_api_key(self, key, value, location="header"):
        self.calls.append(("api_key", key, value, location))
        if location == "header":
            self.headers[key] = value
        elif location == "query":
            self.params[key] = value
        elif location == "cookie":
            self.cookies[key] = value

    def set_auth_bearer(self, token):
        self.calls.append(("bearer", token))

    def set_auth_basic(self, username, password):
        self.calls.append(("basic", username, password))

    def set_auth_cookie(self, name, value, domain=None):
        self.calls.append(("cookie", name, value, domain))

    def set_default_header(self, key, value):
        self.calls.append(("header", key, value))

    def get(self, url, params=None, headers=None, **kwargs):
        self.calls.append(("get", url))
        return {
            "status_code": self._get_status,
            "status": self._get_status,
            "text": self._get_body,
            "body": self._get_body,
        }


class Fakescanner:
    def __init__(self):
        self.rules = []

    def add_replacer_rule(
        self, description, match_type, match_string, replacement, match_regex=False
    ):
        self.rules.append(
            (description, match_type, match_string, replacement, match_regex)
        )


def test_api_key_header_applied(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    http = FakeHttp()
    out = apply_auth_bootstrap(
        auth_type="API Key",
        auth_details={"Заголовок": "X-Api-Key", "Токен": "k1"},
        http_adapter=http,
    )
    assert out["applied"] is True
    assert ("api_key", "X-Api-Key", "k1", "header") in http.calls


def test_api_key_cookie_place(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    http = FakeHttp()
    out = apply_auth_bootstrap(
        auth_type="API Key",
        auth_details={
            "Заголовок": "session",
            "Токен": "cval",
            "Место": "cookie",
        },
        http_adapter=http,
    )
    assert out["applied"] is True
    assert ("api_key", "session", "cval", "cookie") in http.calls


def test_query_key_applied(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    http = FakeHttp()
    out = apply_auth_bootstrap(
        auth_type="Query Key",
        auth_details={"Query-параметр": "api_key", "Токен": "qk"},
        http_adapter=http,
    )
    assert out["applied"] is True
    assert ("api_key", "api_key", "qk", "query") in http.calls


def test_success_check_ok(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    http = FakeHttp()
    http._get_body = "logged-in-marker"
    out = apply_auth_bootstrap(
        auth_type="API Key",
        auth_details={
            "Заголовок": "X-Key",
            "Токен": "t",
            "Адрес страницы при успешном входе": "https://app/me",
            "Проверочная строка": "logged-in-marker",
        },
        http_adapter=http,
    )
    assert out["applied"] is True
    assert any(c[0] == "get" for c in http.calls)
    assert any("success check ok" in n for n in out["notes"])


def test_success_check_fail_string(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    http = FakeHttp()
    http._get_body = "anonymous"
    out = apply_auth_bootstrap(
        auth_type="API Key",
        auth_details={
            "Заголовок": "X-Key",
            "Токен": "t",
            "Адрес страницы при успешном входе": "https://app/me",
            "Проверочная строка": "logged-in-marker",
        },
        http_adapter=http,
    )
    assert out["applied"] is False
    assert out.get("error") == "success check failed"
    assert any("проверочная строка" in n for n in out["notes"])


def test_verify_auth_success_skip_without_url():
    http = FakeHttp()
    gate = verify_auth_success(http, {"Проверочная строка": "x"})
    assert gate["skipped"] is True
    assert gate["ok"] is True


def test_compose_apikey_then_bearer(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    http = FakeHttp()
    http._get_body = "ok-user"
    out = apply_auth_profile_list(
        [
            (
                "API Key",
                {"Заголовок": "X-Api-Key", "Токен": "k"},
            ),
            (
                "Bearer Token",
                {
                    "Токен": "btok",
                    "Адрес страницы при успешном входе": "https://app/ok",
                    "Проверочная строка": "ok-user",
                },
            ),
        ],
        http,
    )
    assert out["applied"] is True
    assert ("api_key", "X-Api-Key", "k", "header") in http.calls
    assert ("bearer", "btok") in http.calls
    assert len(out["profiles"]) == 2
    assert all(p["applied"] for p in out["profiles"])


def test_compose_success_fail(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    http = FakeHttp()
    http._get_body = "nope"
    out = apply_auth_profile_list(
        [
            ("API Key", {"Заголовок": "X-K", "Токен": "1"}),
            (
                "Bearer Token",
                {
                    "Токен": "2",
                    "Адрес страницы при успешном входе": "https://app/ok",
                    "Проверочная строка": "ok-user",
                },
            ),
        ],
        http,
    )
    assert out["applied"] is False
    assert out.get("error") == "success check failed"


def test_scanner_api_key_header(monkeypatch):
    from core.auth_bootstrap import apply_scanner_auth

    scanner = Fakescanner()
    out = apply_scanner_auth(
        scanner_adapter=scanner,
        context_name="ctx",
        auth_type="API Key",
        auth_details={"Заголовок": "X-Api-Key", "Токен": "z"},
    )
    assert out["applied"] is True
    assert any(r[2] == "X-Api-Key" for r in scanner.rules)


def test_scanner_query_key_honest_not_applied(monkeypatch):
    from core.auth_bootstrap import apply_scanner_auth

    scanner = Fakescanner()
    out = apply_scanner_auth(
        scanner_adapter=scanner,
        context_name="ctx",
        auth_type="Query Key",
        auth_details={"Query-параметр": "k", "Токен": "v"},
    )
    assert out["applied"] is False
    assert any("HttpAdapter" in n for n in out["notes"])
    assert scanner.rules == []


def test_dialect_apikey_maps_bootstrap(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    profile = parse_auth_module(
        "\n".join(
            [
                "auth=apikey",
                "name=X-Api-Key",
                "value=secret",
                "place=header",
                "success_url=https://app/me",
                "success_string=ok",
            ]
        )
    )
    assert profile.kind == "apikey"
    assert profile.bootstrap_auth_type() == "API Key"
    details = profile.bootstrap_auth_details()
    assert details["Заголовок"] == "X-Api-Key"
    assert details["Токен"] == "secret"
    assert validate_auth_module(
        "auth=apikey\nname=X-Api-Key\nvalue=secret\n"
    ) == []

    http = FakeHttp()
    http._get_body = "ok"
    out = apply_auth_bootstrap(
        auth_type=profile.bootstrap_auth_type(),
        auth_details=details,
        http_adapter=http,
    )
    assert out["applied"] is True


def test_dialect_querykey(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    profile = parse_auth_module("auth=querykey\nname=api_key\ntoken=q\n")
    assert profile.kind == "querykey"
    assert profile.bootstrap_auth_type() == "Query Key"
    http = FakeHttp()
    out = apply_auth_bootstrap(
        auth_type=profile.bootstrap_auth_type(),
        auth_details=profile.bootstrap_auth_details(),
        http_adapter=http,
    )
    assert out["applied"] is True
    assert ("api_key", "api_key", "q", "query") in http.calls
