# -*- coding: utf-8 -*-
"""AUTH-13: compose CSV/modules + form/action dialect."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.auth_module import (
    apply_auth_profiles,
    parse_auth_module,
    resolve_active_auth_profiles,
    split_auth_module_ids,
    validate_auth_module,
)


class FakeHttp:
    def __init__(self):
        self.calls = []
        self._get_body = "ok"
        self._get_status = 200

    def set_auth_api_key(self, key, value, location="header"):
        self.calls.append(("api_key", key, value, location))

    def set_auth_bearer(self, token):
        self.calls.append(("bearer", token))

    def get(self, url, params=None, headers=None, **kwargs):
        self.calls.append(("get", url))
        return {
            "status": self._get_status,
            "status_code": self._get_status,
            "text": self._get_body,
            "body": self._get_body,
        }

    def post(self, url, data=None, json_data=None, headers=None):
        self.calls.append(("post", url, json_data))
        return {
            "status": 200,
            "json": {"access_token": "tok-from-chain"},
            "headers": {},
        }


def _mod(mid: str, text: str):
    return SimpleNamespace(
        id=mid,
        module_type="Авторизация",
        auth_fields=SimpleNamespace(constructor=text),
    )


def _Wired(*mods):
    return SimpleNamespace(
        test_suites=SimpleNamespace(test_data_constructor=list(mods))
    )


def test_split_auth_module_ids():
    assert split_auth_module_ids("a, b;c") == ["a", "b", "c"]
    assert split_auth_module_ids("") == []


def test_dialect_compose_and_form_action():
    assert validate_auth_module("auth=compose\nmodules=a,b\n") == []
    diags = validate_auth_module("auth=compose\n")
    assert diags and "modules" in diags[0]["message"]

    form = parse_auth_module(
        "\n".join(
            [
                "auth=form",
                "login_url=https://app/login",
                "login=u",
                "#password=p",
                "user_locator=css #email",
                "pass_locator=id password",
                "submit_locator=css button[type=submit]",
            ]
        )
    )
    assert form.kind == "form"
    assert form.bootstrap_auth_type() == "Страница авторизации"
    assert form.bootstrap_auth_details()["URL входа"] == "https://app/login"

    action = parse_auth_module(
        "\n".join(
            [
                "auth=action",
                "login_url=https://sso",
                "login=u",
                "password=p",
                "user_locator=css #u",
                "pass_locator=id p",
                "submit_locator=css button",
                "mfa=totp",
                "totp_secret=JBSWY3DPEHPK3PXP",
                "otp_locator=css #otp",
            ]
        )
    )
    assert action.kind == "action"
    assert action.bootstrap_auth_type() == "Последовательность действий / SSO"


def test_action_rejects_http_steps():
    import pytest
    from core.errors import WiredError

    with pytest.raises(WiredError):
        parse_auth_module(
            "auth=action\nlogin_url=https://x\nGET https://x\n  Capture $.a as b\n"
        )


def test_resolve_csv_and_compose_module():
    man = _Wired(
        _mod("k", "auth=apikey\nname=X-Key\nvalue=1\n"),
        _mod("b", "auth=bearer\ntoken=bt\n"),
        _mod("c", "auth=compose\nmodules=k,b\n"),
    )
    profiles, notes = resolve_active_auth_profiles(man, "k,b")
    assert [p.module_id for p in profiles] == ["k", "b"]

    profiles2, _ = resolve_active_auth_profiles(man, "c")
    assert [p.kind for p in profiles2] == ["apikey", "bearer"]


def test_apply_auth_profiles_static_combo(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    profiles = [
        parse_auth_module("auth=apikey\nname=X-Key\nvalue=1\n", module_id="k"),
        parse_auth_module(
            "auth=bearer\ntoken=bt\nsuccess_url=https://app/me\nsuccess_string=ok\n",
            module_id="b",
        ),
    ]
    http = FakeHttp()
    out = apply_auth_profiles(profiles, http)
    assert out["applied"] is True
    assert ("api_key", "X-Key", "1", "header") in http.calls
    assert ("bearer", "bt") in http.calls


def test_apply_auth_profiles_with_call_chain(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    profiles = [
        parse_auth_module("auth=apikey\nname=X-Key\nvalue=1\n", module_id="k"),
        parse_auth_module(
            "\n".join(
                [
                    "auth=chain",
                    "POST https://idp/token",
                    '  Body {"u":1}',
                    "  Capture $.access_token as token",
                ]
            ),
            module_id="ch",
        ),
    ]
    http = FakeHttp()
    out = apply_auth_profiles(profiles, http)
    assert out["applied"] is True
    assert ("api_key", "X-Key", "1", "header") in http.calls
    assert ("bearer", "tok-from-chain") in http.calls


def test_form_action_http_not_applied(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    monkeypatch.delenv("PK_AUTH_FORM_BROWSER", raising=False)
    form = parse_auth_module(
        "\n".join(
            [
                "auth=form",
                "login_url=https://app/login",
                "login=u",
                "password=p",
                "user_locator=css #email",
                "pass_locator=id password",
                "submit_locator=name commit",
            ]
        )
    )
    http = FakeHttp()
    out = apply_auth_profiles([form], http)
    assert out["applied"] is False
    assert any("PK_AUTH_FORM_BROWSER" in n or "form не applied" in n for n in out["notes"])

    action = parse_auth_module(
        "\n".join(
            [
                "auth=action",
                "login_url=https://sso",
                "login=u",
                "password=p",
                "user_locator=css #u",
                "pass_locator=id p",
                "submit_locator=css button",
                "mfa=totp",
                "totp_secret=JBSWY3DPEHPK3PXP",
                "otp_locator=css #otp",
            ]
        )
    )
    out2 = apply_auth_profiles([action], http)
    assert out2["applied"] is False
    assert any("MFA" in n or "browser auth" in n for n in out2["notes"])
    assert "stub" not in " ".join(out2["notes"]).lower()


def test_controller_csv_compose(monkeypatch):
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    from core.controller import Controller

    man = _Wired(
        _mod("k", "auth=apikey\nname=X-Key\nvalue=1\n"),
        _mod("b", "auth=bearer\ntoken=bt\n"),
    )
    man.security_configuration = SimpleNamespace(
        auth_type="Без авторизации",
        auth_details={},
        active_auth_module="k,b",
    )
    ctrl = object.__new__(Controller)
    ctrl.wired = man
    ctrl.adapters = {"http": FakeHttp()}
    ctrl.auth_bootstrap_result = None
    ctrl._apply_auth_bootstrap()
    assert ctrl.auth_bootstrap_result["applied"] is True
    assert ("api_key", "X-Key", "1", "header") in ctrl.adapters["http"].calls
    assert ("bearer", "bt") in ctrl.adapters["http"].calls


def test_compose_cycle_ab_no_recurse():
    """BOT-A1: A→B→A не взрывает стек; cycle skip notes."""
    man = _Wired(
        _mod("a", "auth=compose\nmodules=b\n"),
        _mod("b", "auth=compose\nmodules=a\n"),
        _mod("k", "auth=apikey\nname=X-Key\nvalue=1\n"),
    )
    profiles, notes = resolve_active_auth_profiles(man, "a")
    assert profiles == []
    joined = " ".join(notes)
    assert "cycle" in joined


def test_compose_empty_modules_no_silent_legacy(monkeypatch):
    """BOT-A3: пустой modules= → applied false + notes, не legacy auth_type."""
    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    from core.controller import Controller

    man = _Wired(_mod("c", "auth=compose\nmodules=\n"))
    man.security_configuration = SimpleNamespace(
        auth_type="Bearer Token",
        auth_details={"Токен": "should-not-apply"},
        active_auth_module="c",
    )
    http = FakeHttp()
    ctrl = object.__new__(Controller)
    ctrl.wired = man
    ctrl.adapters = {"http": http}
    ctrl.auth_bootstrap_result = None
    ctrl._apply_auth_bootstrap()
    assert ctrl.auth_bootstrap_result["applied"] is False
    assert any("пустой modules" in n for n in ctrl.auth_bootstrap_result["notes"])
    assert ("bearer", "should-not-apply") not in http.calls


def test_enrich_primenit_auth_compose_not_none(monkeypatch):
    """BOT-A2: ПрименитьAuth + compose → resolved apps, не «Без авторизации»."""
    import json

    from core.controller import Controller

    man = _Wired(
        _mod("k", "auth=apikey\nname=X-Key\nvalue=1\n"),
        _mod("b", "auth=bearer\ntoken=bt\n"),
        _mod("c", "auth=compose\nmodules=k,b\n"),
    )
    man.security_configuration = SimpleNamespace(
        auth_type="Без авторизации",
        auth_details={},
        active_auth_module="c",
        scan_policy="custom_policy",
    )
    man.scan_base_url = lambda: "https://app.lab"  # type: ignore[attr-defined]
    ctrl = object.__new__(Controller)
    ctrl.wired = man
    params = {"module_id": "c"}
    ctrl._enrich_zap_wired_params("apply_wired_auth", params)
    assert params["auth_type"] != "Без авторизации"
    apps = json.loads(params["auth_applications_json"])
    assert [a["auth_type"] for a in apps] == ["API Key", "Bearer Token"]


class FakeZap:
    def __init__(self):
        self.rules = []
        self.connected = True

    def _ensure_connected(self):
        return True

    def _get_context_id(self, name):
        return "1"

    def create_context(self, name):
        return "1"

    def domains_csv_to_include_regexes(self, csv):
        return []

    def set_context_include(self, ctx, rx):
        return None

    def add_replacer_rule(
        self, description, match_type, match_string, replacement, match_regex=False
    ):
        self.rules.append(
            (description, match_type, match_string, replacement, match_regex)
        )


def test_apply_wired_auth_compose_multi():
    """BOT-A2: ZapAdapter apply multi applications from compose resolve."""
    from adapters.zap_adapter import ZapAdapter

    zap = object.__new__(ZapAdapter)
    fake = FakeZap()
    zap._ensure_connected = fake._ensure_connected
    zap._get_context_id = fake._get_context_id
    zap.create_context = fake.create_context
    zap.domains_csv_to_include_regexes = fake.domains_csv_to_include_regexes
    zap.set_context_include = fake.set_context_include
    zap.add_replacer_rule = fake.add_replacer_rule

    import json

    apps = [
        {
            "auth_type": "API Key",
            "auth_details": {"Заголовок": "X-Key", "Токен": "1"},
            "module_id": "k",
        },
        {
            "auth_type": "Bearer Token",
            "auth_details": {"Токен": "bt"},
            "module_id": "b",
        },
    ]
    out = ZapAdapter.apply_wired_auth(
        zap,
        "ctx",
        auth_applications_json=json.dumps(apps),
    )
    assert out["applied"] is True
    assert out["auth_type"] == "compose"
    assert len(fake.rules) == 2
    assert any(r[2] == "X-Key" for r in fake.rules)
    assert any(r[2] == "Authorization" for r in fake.rules)
