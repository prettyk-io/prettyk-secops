# -*- coding: utf-8 -*-
"""AUTH-15: MFA action (TOTP/SMS) browser path."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.auth_module import (
    apply_auth_action,
    generate_totp_code,
    parse_auth_module,
    profile_from_sso_auth_details,
    validate_auth_module,
)


ACTION_TEXT = "\n".join(
    [
        "auth=action",
        "login_url=https://app.lab/login",
        "login=u1",
        "#password=sekret",
        "user_locator=css #email",
        "pass_locator=id password",
        "submit_locator=css button[type=submit]",
        "mfa=totp",
        "#totp_secret=JBSWY3DPEHPK3PXP",
        "otp_locator=css input[name=otp]",
        "otp_submit_locator=css button.continue",
        "success_string=Logout",
    ]
)


class FakeDriver:
    def __init__(self):
        self.current_url = ""
        self.page_source = "<html>Logout</html>"
        self._cookies = [{"name": "sid", "value": "mfa1"}]

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
        self.calls.append(("wait",))


class FakeHttp:
    def __init__(self):
        self.cookies = []

    def set_auth_cookie(self, name, value, domain=None):
        self.cookies.append((name, value, domain))


class Fakescanner:
    def __init__(self):
        self.rules = []

    def add_replacer_rule(
        self, description, match_type, match_string, replacement, match_regex=False
    ):
        self.rules.append(
            (description, match_type, match_string, replacement, match_regex)
        )


def test_totp_deterministic():
    a = generate_totp_code("JBSWY3DPEHPK3PXP", for_time=1_111_111_111)
    b = generate_totp_code("JBSWY3DPEHPK3PXP", for_time=1_111_111_111)
    assert a == b and len(a) == 6 and a.isdigit()


def test_validate_action_mfa():
    assert validate_auth_module(ACTION_TEXT) == []
    diags = validate_auth_module(
        "auth=action\nlogin_url=https://x\nlogin=u\npassword=p\n"
        "user_locator=css #e\npass_locator=id p\nsubmit_locator=css b\n"
        "mfa=totp\notp_locator=css #otp\n"
    )
    assert diags and any("totp_secret" in d["message"] for d in diags)


def test_mfa_profile_ready_quiet(monkeypatch):
    monkeypatch.delenv("PK_AUTH_FORM_BROWSER", raising=False)
    profile = parse_auth_module(ACTION_TEXT)
    out = apply_auth_action(profile, FakeWd(), FakeHttp())
    assert out["applied"] is False
    assert out["mfa"] == "totp"
    joined = " ".join(out["notes"]).lower()
    assert "stub" not in joined and "bolvan" not in joined and "residual" not in joined
    assert any("MFA profile ready" in n for n in out["notes"])


def test_mfa_live_totp(monkeypatch):
    monkeypatch.setenv("PK_AUTH_FORM_BROWSER", "1")
    profile = parse_auth_module(ACTION_TEXT)
    wd = FakeWd()
    out = apply_auth_action(profile, wd, FakeHttp())
    assert out["applied"] is True
    assert any(c[0] == "keys" and c[2] == "#email" for c in wd.calls)
    otp_keys = [c for c in wd.calls if c[0] == "keys" and c[2] == "input[name=otp]"]
    assert otp_keys and otp_keys[0][3].isdigit() and len(otp_keys[0][3]) == 6
    assert ("click", "css", "button.continue") in wd.calls
    joined = " ".join(out["notes"]).lower()
    assert "stub" not in joined and "bolvan" not in joined


def test_mfa_cookies_to_scanner_replacer(monkeypatch):
    monkeypatch.setenv("PK_AUTH_FORM_BROWSER", "1")
    profile = parse_auth_module(ACTION_TEXT)
    scanner = Fakescanner()
    out = apply_auth_action(profile, FakeWd(), FakeHttp(), scanner)
    assert out["applied"] is True
    assert out["cookies_scanner"] == 1
    assert any("cookies→scanner Replacer: 1" in n for n in out["notes"])
    assert scanner.rules[0][2] == "Cookie"
    assert scanner.rules[0][3] == "sid=mfa1"


def test_mfa_sms_code(monkeypatch):
    monkeypatch.setenv("PK_AUTH_FORM_BROWSER", "1")
    text = ACTION_TEXT.replace("mfa=totp", "mfa=sms").replace(
        "#totp_secret=JBSWY3DPEHPK3PXP", "otp_code=424242"
    )
    profile = parse_auth_module(text)
    wd = FakeWd()
    out = apply_auth_action(profile, wd, FakeHttp())
    assert out["applied"] is True
    assert any(
        c[0] == "keys" and c[2] == "input[name=otp]" and c[3] == "424242"
        for c in wd.calls
    )


def test_mfa_split_digit_fields(monkeypatch):
    monkeypatch.setenv("PK_AUTH_FORM_BROWSER", "1")
    lines = [
        "auth=action",
        "login_url=https://app.lab/login",
        "login=u1",
        "password=sekret",
        "user_locator=css #email",
        "pass_locator=id password",
        "submit_locator=css button[type=submit]",
        "mfa=totp",
        "totp_secret=JBSWY3DPEHPK3PXP",
        "totp_digits=6",
        "otp_locator_1=css input[data-otp='1']",
        "otp_locator_2=css input[data-otp='2']",
        "otp_locator_3=css input[data-otp='3']",
        "otp_locator_4=css input[data-otp='4']",
        "otp_locator_5=css input[data-otp='5']",
        "otp_locator_6=css input[data-otp='6']",
        "otp_submit_locator=css button.continue",
        "success_string=Logout",
    ]
    assert validate_auth_module("\n".join(lines)) == []
    profile = parse_auth_module("\n".join(lines))
    wd = FakeWd()
    out = apply_auth_action(profile, wd, FakeHttp())
    assert out["applied"] is True
    digit_keys = [
        c for c in wd.calls if c[0] == "keys" and "data-otp" in c[2]
    ]
    assert len(digit_keys) == 6
    assert all(len(c[3]) == 1 and c[3].isdigit() for c in digit_keys)
    assert any("split" in n.lower() for n in out["notes"])


def test_legacy_sso_page_to_action(monkeypatch):
    monkeypatch.setenv("PK_AUTH_FORM_BROWSER", "1")
    profile = profile_from_sso_auth_details(
        {
            "Провайдер авторизации (IdP URL)": "https://idp/login",
            "Метод получения сессии": "page",
            "Страница авторизации": {
                "Логин": "u1",
                "Пароль": "sekret",
                "Проверочная строка": "Logout",
                "Дополнительные настройки формы": {
                    "Локатор поля логина": "email",
                    "Локатор поля пароля": "password",
                    "Локатор кнопки отправки формы": "go",
                    "Локатор OTP": "otp",
                },
            },
            "MFA": "totp",
            "TOTP secret": "JBSWY3DPEHPK3PXP",
        }
    )
    assert profile is not None and profile.kind == "action"
    assert profile.values["user_locator"] == "id email"
    out = apply_auth_action(profile, FakeWd(), FakeHttp())
    assert out["applied"] is True
