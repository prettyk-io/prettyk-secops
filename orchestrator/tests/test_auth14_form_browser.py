# -*- coding: utf-8 -*-
"""AUTH-14: browser form dialect + Selenium executor (mock driver)."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest

from core.auth_module import (
    apply_auth_form,
    parse_auth_locator,
    parse_auth_module,
    profile_from_page_auth_details,
    validate_auth_module,
)
from core.errors import WiredError


FORM_TEXT = "\n".join(
    [
        "auth=form",
        "login_url=https://app.lab/login",
        "login=u1",
        "#password=sekret",
        "user_locator=css input[name=email]",
        "pass_locator=id password",
        "submit_locator=css button[type=submit]",
        "form_locator=css form#login",
        "success_string=Logout",
    ]
)


class FakeDriver:
    def __init__(self):
        self.current_url = ""
        self.page_source = "<html>Logout</html>"
        self._cookies = [{"name": "sid", "value": "abc", "domain": "app.lab"}]

    def get(self, url):
        self.current_url = url

    def get_cookies(self):
        return list(self._cookies)


class FakeWd:
    def __init__(self):
        self.driver = FakeDriver()
        self.calls = []

    def open_by_url(self, url, wait_for_load=True):
        self.calls.append(("open", url))
        self.driver.get(url)

    def send_keys(self, st, sv, text, clear_first=True, timeout=None):
        self.calls.append(("keys", st, sv, text))

    def click(self, st, sv, timeout=None):
        self.calls.append(("click", st, sv))

    def wait_for_page_load(self, timeout=30):
        self.calls.append(("wait", timeout))

    def _find_element(self, st, sv, timeout=None):
        self.calls.append(("find", st, sv))
        return object()


class FakeHttp:
    def __init__(self):
        self.cookies = []

    def set_auth_cookie(self, name, value, domain=None):
        self.cookies.append((name, value, domain))

    def get(self, url, **kwargs):
        return {"status": 200, "text": "Logout", "body": "Logout"}


class FakeZap:
    def __init__(self):
        self.rules = []

    def add_replacer_rule(
        self, description, match_type, match_string, replacement, match_regex=False
    ):
        self.rules.append(
            (description, match_type, match_string, replacement, match_regex)
        )


def test_parse_locator_strategies():
    assert parse_auth_locator("css input[name=email]")[0] == "css"
    assert parse_auth_locator("id password") == ("id", "password")
    assert parse_auth_locator("xpath //button")[0] == "xpath"
    with pytest.raises(WiredError):
        parse_auth_locator("password")  # PT-style bare — reject


def test_validate_form_needs_locators():
    diags = validate_auth_module(
        "auth=form\nlogin_url=https://x\nlogin=u\npassword=p\n"
    )
    assert diags
    assert any("user_locator" in d["message"] for d in diags)


def test_parse_form_maps_page_auth():
    profile = parse_auth_module(FORM_TEXT, module_id="login_form")
    assert profile.kind == "form"
    assert profile.bootstrap_auth_type() == "Страница авторизации"
    details = profile.bootstrap_auth_details()
    nested = details["Дополнительные настройки формы"]
    assert "css input" in nested["Локатор поля логина"]
    assert nested["Локатор поля пароля"].startswith("id ")
    assert validate_auth_module(FORM_TEXT) == []


def test_form_bolvan_without_env(monkeypatch):
    monkeypatch.delenv("KDT_AUTH_FORM_BROWSER", raising=False)
    profile = parse_auth_module(FORM_TEXT)
    out = apply_auth_form(profile, FakeWd(), FakeHttp())
    assert out["applied"] is False
    assert any("form profile ready" in n for n in out["notes"])
    assert "bolvan" not in " ".join(out["notes"]).lower()
    assert "stub" not in " ".join(out["notes"]).lower()


def test_form_live_mock(monkeypatch):
    monkeypatch.setenv("KDT_AUTH_FORM_BROWSER", "1")
    profile = parse_auth_module(FORM_TEXT)
    wd = FakeWd()
    http = FakeHttp()
    out = apply_auth_form(profile, wd, http)
    assert out["applied"] is True
    assert out["attempted"] is True
    assert ("keys", "css", "input[name=email]", "u1") in wd.calls
    assert ("keys", "id", "password", "sekret") in wd.calls
    assert ("click", "css", "button[type=submit]") in wd.calls
    assert ("sid", "abc", "app.lab") in http.cookies


def test_form_cookies_to_zap_replacer(monkeypatch):
    monkeypatch.setenv("KDT_AUTH_FORM_BROWSER", "1")
    profile = parse_auth_module(FORM_TEXT)
    wd = FakeWd()
    wd.driver._cookies = [
        {"name": "sid", "value": "abc", "domain": "app.lab"},
        {"name": "csrf", "value": "tok", "domain": "app.lab"},
    ]
    http = FakeHttp()
    zap = FakeZap()
    out = apply_auth_form(profile, wd, http, zap)
    assert out["applied"] is True
    assert out["cookies_http"] == 2
    assert out["cookies_zap"] == 2
    assert any("cookies→ZAP Replacer: 2" in n for n in out["notes"])
    assert len(zap.rules) == 1
    desc, match_type, match_string, replacement, _ = zap.rules[0]
    assert desc == "kdt-auth-browser-cookie"
    assert match_type == "REQ_HEADER"
    assert match_string == "Cookie"
    assert "sid=abc" in replacement and "csrf=tok" in replacement


def test_form_success_fail(monkeypatch):
    monkeypatch.setenv("KDT_AUTH_FORM_BROWSER", "1")
    profile = parse_auth_module(FORM_TEXT)
    wd = FakeWd()
    wd.driver.page_source = "<html>anon</html>"
    out = apply_auth_form(profile, wd, FakeHttp())
    assert out["applied"] is False
    assert out.get("error") == "success check failed"


def test_legacy_page_auth_details(monkeypatch):
    monkeypatch.setenv("KDT_AUTH_FORM_BROWSER", "1")
    profile = profile_from_page_auth_details(
        {
            "URL входа": "https://app.lab/login",
            "Логин": "u1",
            "Пароль": "sekret",
            "Проверочная строка": "Logout",
            "Дополнительные настройки формы": {
                "Локатор формы авторизации": "login",
                "Локатор поля логина": "email",
                "Локатор поля пароля": "password",
                "Локатор кнопки отправки формы": "submitBtn",
            },
        }
    )
    assert profile is not None
    assert profile.values["user_locator"] == "id email"  # PT bare → id
    out = apply_auth_form(profile, FakeWd(), FakeHttp())
    assert out["applied"] is True


def test_controller_form_wire(monkeypatch):
    monkeypatch.setenv("KDT_AUTH_FORM_BROWSER", "1")
    from core.controller import Controller

    mod = SimpleNamespace(
        id="login_form",
        module_type="Авторизация",
        auth_fields=SimpleNamespace(constructor=FORM_TEXT),
    )
    man = SimpleNamespace(
        test_suites=SimpleNamespace(test_data_constructor=[mod]),
        security_configuration=SimpleNamespace(
            auth_type="Без авторизации",
            auth_details={},
            active_auth_module="login_form",
        ),
    )
    ctrl = object.__new__(Controller)
    ctrl.wired = man
    zap = FakeZap()
    ctrl.adapters = {"http": FakeHttp(), "webdriver": FakeWd(), "zap": zap}
    ctrl.auth_bootstrap_result = None
    ctrl._apply_auth_bootstrap()
    assert ctrl.auth_bootstrap_result["applied"] is True
    assert ctrl.auth_bootstrap_result.get("cookies_zap") == 1
    assert zap.rules and zap.rules[0][2] == "Cookie"
