# -*- coding: utf-8 -*-
"""AUTH-VAULT-CHAIN-INJECTOR: тесты сервисного слоя.

Покрытие:
  - encrypt/decrypt roundtrip (AES-256-GCM) и is_encrypted;
  - mask_secret (JWT / Bearer / длинный секрет) + mask_headers + mask_json;
  - extract_session_tokens (JSON / Authorization / Set-Cookie / JWT в raw);
  - execute_oauth2 (client_credentials success / invalid / non-json);
  - build_authorization_url (PKCE S256);
  - apply_to_scanner_replacer (bearer + cookie rules);
  - AutoRefreshSession (401/403 → refresh → retry; TTL expiry);
  - load_mtls_context (empty / not_found);
  - check_auth_flow (registered profile → masked tokens, state saved).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services import auth_vault as av  # noqa: E402


# ── encrypted vault ──


def test_encrypt_decrypt_roundtrip():
    secret = "super-secret-client-password"
    enc = av.encrypt_secret(secret)
    assert enc.startswith("pk:vault:v1:")
    assert enc != secret
    assert av.is_encrypted(enc)
    assert av.decrypt_secret(enc) == secret


def test_encrypt_is_randomized():
    a = av.encrypt_secret("x")
    b = av.encrypt_secret("x")
    assert a != b  # nonce уникален
    assert av.decrypt_secret(a) == "x"
    assert av.decrypt_secret(b) == "x"


def test_decrypt_invalid_returns_empty():
    assert av.decrypt_secret("pk:vault:v1:notbase64:!!") == ""
    assert av.decrypt_secret("plain") == ""


def test_encrypted_vault_store():
    v = av.EncryptedVault()
    v.put("client_secret", "abc123")
    assert v.get("client_secret") == "abc123"
    # peek — зашифрованный вид
    assert v.peek("client_secret").startswith("pk:vault:v1:")
    # masked
    assert av.mask_secret(v.get("client_secret")) != "abc123"


# ── masking ──


def test_mask_secret_jwt():
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sigvalue12345"
    masked = av.mask_secret(jwt)
    assert "eyJzdWIiOiJ1c2VyIn0" not in masked  # payload скрыт
    assert masked.count("***") >= 1


def test_mask_secret_bearer():
    masked = av.mask_secret("Bearer abcdef1234567890token")
    assert masked == "Bearer ***"


def test_mask_secret_short():
    assert av.mask_secret("secret") == "***"


def test_mask_headers():
    h = {"Authorization": "Bearer tok123", "X-Custom": "ok", "Cookie": "sid=abc"}
    m = av.mask_headers(h)
    assert "tok123" not in m["Authorization"]
    assert m["X-Custom"] == "ok"
    assert "abc" not in m["Cookie"]


def test_mask_json_recursive():
    data = {"access_token": "tok123", "nested": {"password": "pwd"}, "safe": "visible"}
    m = av.mask_json(data)
    assert m["access_token"] == "***" or "tok123" not in m["access_token"]
    assert "pwd" not in m["nested"]["password"]
    assert m["safe"] == "visible"


# ── token extraction ──


def test_extract_session_tokens_json():
    body = {"access_token": "jwt-token-abc", "expires_in": 3600}
    tokens = av.extract_session_tokens(body_json=body)
    assert tokens["access_token"] == "jwt-token-abc"


def test_extract_session_tokens_header():
    tokens = av.extract_session_tokens(headers={"Authorization": "Bearer hdr-token"})
    assert tokens["access_token"] == "hdr-token"


def test_extract_session_tokens_cookie():
    tokens = av.extract_session_tokens(
        headers={"Set-Cookie": "JSESSIONID=abc123; Path=/; HttpOnly"}
    )
    assert tokens["jsessionid"] == "abc123"


def test_extract_session_tokens_jwt_raw():
    tokens = av.extract_session_tokens(body_raw="header.payload.sig")
    assert tokens["access_token"] == "header.payload.sig"


# ── oauth2 ──


def _http_fn(body, status=200):
    class _R:
        status_code = status
        text = body

    def fn(method, url, **kwargs):
        return _R()

    return fn


def test_execute_oauth2_client_credentials():
    cfg = av.OAuth2Config(
        token_url="https://idp/token",
        client_id="cid",
        client_secret="csecret",
        grant_type="client_credentials",
    )
    body = json.dumps({"access_token": "tok-1", "expires_in": 300})
    res = av.execute_oauth2(cfg, http_fn=_http_fn(body))
    assert res["ok"] is True
    assert res["tokens"]["access_token"] == "tok-1"


def test_execute_oauth2_invalid_grant():
    cfg = av.OAuth2Config(token_url="https://idp/token", client_id="cid", client_secret="s")
    body = json.dumps({"error": "invalid_client"})
    res = av.execute_oauth2(cfg, http_fn=_http_fn(body, status=400))
    assert res["ok"] is False
    assert "invalid_client" in res["error"]


def test_execute_oauth2_non_json():
    cfg = av.OAuth2Config(token_url="https://idp/token", client_id="c", client_secret="s")
    res = av.execute_oauth2(cfg, http_fn=_http_fn("<html>bad</html>"))
    assert res["ok"] is False
    assert "non-json" in res["error"]


def test_execute_oauth2_missing_url():
    res = av.execute_oauth2(av.OAuth2Config())
    assert res["ok"] is False
    assert res["error"] == "token_url empty"


def test_build_authorization_url_pkce():
    cfg = av.OAuth2Config(
        authorization_url="https://idp/authorize",
        client_id="cid",
        redirect_uri="https://app/cb",
        code_verifier="verifier123",
        scope="openid",
    )
    url = av.build_authorization_url(cfg)
    assert "code_challenge_method=S256" in url
    assert "response_type=code" in url


# ── scanner replacer ──


def test_apply_to_scanner_replacer_bearer():
    calls = []

    class _scanner:
        def add_replacer_rule(self, name, mtype, header, val, enabled):
            calls.append((name, mtype, header, val))

    tokens = {"access_token": "tok-abc"}
    applied = av.apply_to_scanner_replacer(tokens, _scanner())
    assert applied.get("header") == "Authorization"
    assert calls[0][2] == "Authorization"
    assert "Bearer tok-abc" in calls[0][3]


def test_apply_to_scanner_replacer_cookie():
    calls = []

    class _scanner:
        def add_replacer_rule(self, name, mtype, header, val, enabled):
            calls.append((name, mtype, header, val))

    tokens = {"jsessionid": "sess-1"}
    applied = av.apply_to_scanner_replacer(tokens, _scanner())
    assert applied.get("cookie") == "Cookie"


def test_apply_to_scanner_replacer_no_adapter():
    applied = av.apply_to_scanner_replacer({"access_token": "x"}, None)
    assert applied == {}


# ── auto-refresh session ──


def test_auto_refresh_session_retry_401():
    refresh_calls = {"n": 0}

    def refresh():
        refresh_calls["n"] += 1
        return {"ok": True, "tokens": {"access_token": "fresh-token", "expires_in": "3600"}}

    sess = av.AutoRefreshSession(refresh)

    class _R:
        def __init__(self, status):
            self.status_code = status

    sent = []

    def send_fn(method, url, headers=None, **kwargs):
        sent.append(headers)
        if len(sent) == 1:
            return _R(401)
        return _R(200)

    resp = sess.send("GET", "https://api/x", send_fn=send_fn)
    assert resp.status_code == 200
    assert refresh_calls["n"] >= 1
    assert sent[-1]["Authorization"] == "Bearer fresh-token"


def test_auto_refresh_session_ttl_expiry():
    import time as _time

    calls = {"n": 0}

    def refresh():
        calls["n"] += 1
        return {"ok": True, "tokens": {"access_token": f"t{calls['n']}", "expires_in": "1"}}

    sess = av.AutoRefreshSession(refresh)
    t1 = sess.ensure_token()
    assert t1 == "t1"
    # сдвигаем issued_at в прошлое, чтобы форсировать expiry
    sess.issued_at = _time.time() - 10
    assert sess.expired() is True
    t2 = sess.ensure_token()
    assert t2 == "t2"
    assert calls["n"] == 2


def test_auto_refresh_session_validity():
    sess = av.AutoRefreshSession(lambda: {"ok": False, "error": "x"})
    v = sess.validity()
    assert v["ok"] is False
    assert v["last_error"] == ""


# ── mTLS ──


def test_load_mtls_context_empty():
    r = av.load_mtls_context()
    assert r["ok"] is False
    assert r["error"] == "cert_path empty"


def test_load_mtls_context_not_found():
    r = av.load_mtls_context(cert_path="/no/such/file.pem")
    assert r["ok"] is False
    assert "not_found" in r["error"]


# ── check auth flow ──


def test_check_auth_flow_registered(monkeypatch, tmp_path):
    # redirect state path to tmp
    monkeypatch.setattr(av, "_state_path", lambda: str(tmp_path / "state.json"))
    av.register_oauth2_profile(
        "p1",
        av.OAuth2Config(token_url="https://idp/token", client_id="c", client_secret="s"),
    )
    body = json.dumps({"access_token": "flow-token", "expires_in": 60})
    res = av.check_auth_flow("p1", http_fn=_http_fn(body))
    assert res["ok"] is True
    assert res["tokens"] and "flow-token" not in res["tokens"][0]  # замаскировано
    state = av.load_vault_state()
    assert any(p["id"] == "p1" and p["session_ok"] for p in state.get("profiles", []))


def test_check_auth_flow_unknown():
    res = av.check_auth_flow("nope")
    assert res["ok"] is False
    assert "profile_not_registered" in res["error"]
