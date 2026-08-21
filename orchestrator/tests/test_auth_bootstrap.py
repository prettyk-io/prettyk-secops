# -*- coding: utf-8 -*-
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.auth_bootstrap import apply_auth_bootstrap


class FakeHttp:
    def __init__(self):
        self.calls = []

    def set_auth_basic(self, username, password):
        self.calls.append(("basic", username, password))

    def set_auth_bearer(self, token):
        self.calls.append(("bearer", token))

    def set_auth_cookie(self, name, value, domain=None):
        self.calls.append(("cookie", name, value, domain))

    def set_default_header(self, key, value):
        self.calls.append(("header", key, value))

    def set_auth_api_key(self, key, value, location="header"):
        self.calls.append(("api_key", key, value, location))

    def get(self, url, params=None, headers=None, **kwargs):
        self.calls.append(("get", url))
        return {"status": 200, "status_code": 200, "text": "ok", "body": "ok"}


class FakeZap:
    def __init__(self):
        self.rules = []

    def add_replacer_rule(self, description, match_type, match_string, replacement, match_regex=False):
        self.rules.append((description, match_type, match_string, replacement, match_regex))


def test_basic_applies_http_only(monkeypatch):
    monkeypatch.delenv("KDT_AUTH_BOOTSTRAP", raising=False)
    http = FakeHttp()
    zap = FakeZap()
    out = apply_auth_bootstrap(
        auth_type="Базовая авторизация",
        auth_details={"Логин": "u", "Пароль": "p"},
        http_adapter=http,
        zap_adapter=zap,
    )
    assert out["applied"] is True
    assert http.calls[0] == ("basic", "u", "p")
    assert zap.rules == []  # без Replacer


def test_bearer(monkeypatch):
    monkeypatch.delenv("KDT_AUTH_BOOTSTRAP", raising=False)
    http = FakeHttp()
    out = apply_auth_bootstrap(
        auth_type="Bearer Token",
        auth_details={"Токен": "abc"},
        http_adapter=http,
        zap_adapter=None,
    )
    assert out["applied"] is True
    assert http.calls == [("bearer", "abc")]


def test_web_cookie_parses_pairs(monkeypatch):
    monkeypatch.delenv("KDT_AUTH_BOOTSTRAP", raising=False)
    http = FakeHttp()
    out = apply_auth_bootstrap(
        auth_type="На основе Cookie",
        auth_details={"Cookie": "a=1; b=2"},
        http_adapter=http,
    )
    assert out["applied"] is True
    assert ("cookie", "a", "1", None) in http.calls
    assert ("cookie", "b", "2", None) in http.calls
    assert any("Browser cookie не выставляем" in n for n in out["notes"])


def test_unsupported_sso_skipped(monkeypatch):
    monkeypatch.delenv("KDT_AUTH_BOOTSTRAP", raising=False)
    http = FakeHttp()
    out = apply_auth_bootstrap(
        auth_type="Последовательность действий / SSO",
        auth_details={},
        http_adapter=http,
    )
    assert out["applied"] is False
    assert http.calls == []


def test_disabled_via_env(monkeypatch):
    monkeypatch.setenv("KDT_AUTH_BOOTSTRAP", "0")
    http = FakeHttp()
    out = apply_auth_bootstrap(
        auth_type="Bearer Token",
        auth_details={"Токен": "x"},
        http_adapter=http,
    )
    assert out["applied"] is False
    assert http.calls == []


def test_quality_gate_flag(monkeypatch):
    from core.controller import Controller

    class Z:
        def summarize_alerts_for_live(self, risks=None, limit=None):
            return {
                "high_total": 2,
                "medium_total": 0,
                "low_total": 0,
                "info_total": 0,
            }

    # Минимальный stub Controller без __init__ адаптеров
    ctrl = object.__new__(Controller)
    ctrl.adapters = {"zap": Z()}
    ctrl.quality_gate_failed = False
    ctrl.quality_gate_summary = None
    ctrl.admission_risk_hints = {}
    ctrl.admission_recommendations = []
    monkeypatch.delenv("KDT_QUALITY_GATE", raising=False)
    monkeypatch.delenv("KDT_QUALITY_GATE_ON_ALERT_ERROR", raising=False)
    monkeypatch.delenv("KDT_GATE_MAX_HIGH", raising=False)
    assert ctrl.evaluate_quality_gate() is True
    assert ctrl.quality_gate_failed is True

    monkeypatch.setenv("KDT_QUALITY_GATE", "0")
    assert ctrl.evaluate_quality_gate() is False


def test_quality_gate_alert_error_fail_closed(monkeypatch):
    from core.controller import Controller

    class ZBoom:
        def summarize_alerts_for_live(self, risks=None, limit=None):
            raise RuntimeError("zap down")

        def summarize_high_alerts(self, limit=30):
            raise RuntimeError("zap down")

    ctrl = object.__new__(Controller)
    ctrl.adapters = {"zap": ZBoom()}
    ctrl.quality_gate_failed = False
    ctrl.quality_gate_summary = None
    ctrl.admission_risk_hints = {}
    ctrl.admission_recommendations = []
    monkeypatch.delenv("KDT_QUALITY_GATE", raising=False)
    monkeypatch.delenv("KDT_QUALITY_GATE_ON_ALERT_ERROR", raising=False)
    # Evidence error → не fail_gate; summary.error для exit 1 в main.
    assert ctrl.evaluate_quality_gate() is False
    assert ctrl.quality_gate_failed is False
    assert ctrl.quality_gate_summary["fail_mode"] == "closed"
    assert ctrl.quality_gate_summary.get("error")

    monkeypatch.setenv("KDT_QUALITY_GATE_ON_ALERT_ERROR", "open")
    assert ctrl.evaluate_quality_gate() is False
    assert ctrl.quality_gate_failed is False
    assert ctrl.quality_gate_summary["fail_mode"] == "open"


def test_quality_gate_missing_zap_fail_closed(monkeypatch):
    from core.controller import Controller

    ctrl = object.__new__(Controller)
    ctrl.adapters = {}
    ctrl.quality_gate_failed = False
    ctrl.quality_gate_summary = None
    ctrl.admission_risk_hints = {}
    ctrl.admission_recommendations = []
    monkeypatch.delenv("KDT_QUALITY_GATE", raising=False)
    monkeypatch.delenv("KDT_QUALITY_GATE_ON_ALERT_ERROR", raising=False)
    assert ctrl.evaluate_quality_gate() is False
    assert ctrl.quality_gate_failed is False
    assert ctrl.quality_gate_summary.get("error")
