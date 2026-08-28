# -*- coding: utf-8 -*-
"""G-36: scanner ПрименитьAuth — Basic/Bearer/Cookie + SSO note."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.auth_bootstrap import apply_scanner_auth  # noqa: E402


class Fakescanner:
    def __init__(self):
        self.rules = []
        self.http_auth = None
        self.forced = None
        self.browser = None
        self.verification = None
        self.session = None

    def add_replacer_rule(self, description, match_type, match_string, replacement, match_regex=False):
        self.rules.append(
            (description, match_type, match_string, replacement, match_regex)
        )

    def set_http_authentication(self, context_name, hostname, realm="", port="80"):
        self.http_auth = (context_name, hostname, realm, port)

    def create_and_force_user(self, context_name, username, login=None, password=None):
        self.forced = (context_name, username, login, password)
        return "1"

    def set_browser_based_auth(
        self, context_name, login_page_url, browser_id="firefox-headless", login_page_wait=5
    ):
        self.browser = (context_name, login_page_url, browser_id, login_page_wait)

    def set_auth_verification_autodetect(self, context_name):
        self.verification = context_name

    def set_session_management_autodetect(self, context_name):
        self.session = context_name


def test_scanner_bearer_replacer():
    scanner = Fakescanner()
    out = apply_scanner_auth(
        scanner_adapter=scanner,
        context_name="ctx",
        auth_type="Bearer Token",
        auth_details={"Токен": "abc"},
    )
    assert out["applied"] is True
    assert scanner.rules[0][2] == "Authorization"
    assert scanner.rules[0][3] == "Bearer abc"


def test_scanner_cookie_replacer():
    scanner = Fakescanner()
    out = apply_scanner_auth(
        scanner_adapter=scanner,
        context_name="ctx",
        auth_type="На основе Cookie",
        auth_details={"Cookie": "a=1; b=2"},
    )
    assert out["applied"] is True
    assert scanner.rules[0][2] == "Cookie"
    assert "a=1" in scanner.rules[0][3]


def test_scanner_basic_with_host():
    scanner = Fakescanner()
    out = apply_scanner_auth(
        scanner_adapter=scanner,
        context_name="ctx",
        auth_type="Базовая авторизация",
        auth_details={"Логин": "u", "Пароль": "p", "Хост": "lab.test", "Порт": "443"},
        base_url="https://lab.test/",
    )
    assert out["applied"] is True
    assert scanner.http_auth[1] == "lab.test"
    assert scanner.forced[2] == "u"


def test_scanner_basic_replacer_fallback_no_host():
    scanner = Fakescanner()
    out = apply_scanner_auth(
        scanner_adapter=scanner,
        context_name="ctx",
        auth_type="Базовая авторизация",
        auth_details={"Логин": "u", "Пароль": "p"},
    )
    assert out["applied"] is True
    assert scanner.rules[0][2] == "Authorization"
    assert scanner.rules[0][3].startswith("Basic ")


def test_scanner_sso_browser_helper():
    scanner = Fakescanner()
    out = apply_scanner_auth(
        scanner_adapter=scanner,
        context_name="ctx",
        auth_type="Последовательность действий / SSO",
        auth_details={"URL входа": "http://lab/login", "Логин": "u", "Пароль": "p"},
        base_url="http://lab",
    )
    assert out["applied"] is True
    assert scanner.browser[1] == "http://lab/login"
    assert scanner.verification == "ctx"
    assert scanner.forced is not None


def test_scanner_sso_helper_missing_honest_skip():
    class Boomscanner(Fakescanner):
        def set_browser_based_auth(self, *a, **k):
            raise RuntimeError("addon missing")

    scanner = Boomscanner()
    out = apply_scanner_auth(
        scanner_adapter=scanner,
        context_name="ctx",
        auth_type="Последовательность действий / SSO",
        auth_details={"URL входа": "http://lab/login"},
    )
    assert out["applied"] is False
    assert any("только шагами" in n for n in out["notes"])


def test_http_bootstrap_still_ignores_scanner(monkeypatch):
    from core.auth_bootstrap import apply_auth_bootstrap

    class Http:
        def __init__(self):
            self.calls = []

        def set_auth_bearer(self, token):
            self.calls.append(token)

    monkeypatch.delenv("PK_AUTH_BOOTSTRAP", raising=False)
    http = Http()
    scanner = Fakescanner()
    out = apply_auth_bootstrap(
        auth_type="Bearer Token",
        auth_details={"Токен": "t"},
        http_adapter=http,
        scanner_adapter=scanner,
    )
    assert out["applied"] is True
    assert scanner.rules == []
