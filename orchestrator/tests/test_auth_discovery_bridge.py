# -*- coding: utf-8 -*-
from __future__ import annotations

from core.auth_module import apply_auth_chain, parse_auth_module
from utils.auth_discovery_bridge import (
    OPERATOR_MATRIX,
    discovery_login_result,
    live_discovery_fail_clue,
    merge_auth_or_discovery,
)


class _HttpOk:
    def __init__(self):
        self.bearer = None

    def post(self, url, data=None, json_data=None, headers=None):
        return {"status": 200, "json": {"token": "t-juice"}, "text": "", "headers": {}}

    def set_auth_bearer(self, token):
        self.bearer = token


def test_operator_matrix_non_empty():
    assert len(OPERATOR_MATRIX) >= 3


def test_discovery_fail_never_applied():
    res = discovery_login_result(ok=False, notes=["login form not found"])
    assert res["applied"] is False
    assert res["session_hint"] is None
    assert "login form not found" in res["notes"]


def test_merge_prefers_auth_module():
    auth = {"applied": True, "notes": ["bearer ok"]}
    disc = discovery_login_result(ok=True, session_hint="cookie")
    merged = merge_auth_or_discovery(auth, disc)
    assert merged["applied"] is True
    assert merged["source"] == "auth_module"


def test_merge_both_fail_honest():
    auth = {"applied": False, "notes": ["no token"]}
    disc = discovery_login_result(ok=False, notes=["no form"])
    merged = merge_auth_or_discovery(auth, disc)
    assert merged["applied"] is False
    assert merged["source"] is None
    clue = live_discovery_fail_clue(disc, run_id="r1")
    assert clue["applied"] is False
    assert "auth-discovery fail" in clue["diary_line"]


def test_auto_authorize_publishes_diary(monkeypatch):
    from adapters.webdriver_adapter import WebDriverAdapter

    lines: list[str] = []

    def _pub(kind, text, channel="diary"):
        lines.append(f"{kind}:{text}:{channel}")

    monkeypatch.setattr("utils.diary_bus.publish", _pub)
    wd = WebDriverAdapter.__new__(WebDriverAdapter)
    out = wd.auto_authorize_discovery("https://x/login")
    assert out["applied"] is False
    assert lines and lines[0].startswith("AUTH:")


def test_auth_ir_juice_like_chain_lab():
    """IMP-AD-3: Auth IR login → session (http mock, Juice-shaped)."""
    text = "\n".join(
        [
            "auth=chain",
            "POST http://juice-shop:3000/rest/user/login",
            '  Body {"email":"demo","password":"demo"}',
            "  Capture $.token as token",
        ]
    )
    profile = parse_auth_module(text, module_id="juice_login")
    out = apply_auth_chain(profile, _HttpOk())
    assert out["applied"] is True
    merged = merge_auth_or_discovery(
        out, discovery_login_result(ok=False, notes=["unused"])
    )
    assert merged["source"] == "auth_module"
