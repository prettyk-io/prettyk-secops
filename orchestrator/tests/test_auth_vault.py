# -*- coding: utf-8 -*-
"""Тесты для AUTH-CHAIN-VAULT (AuthProfile, extract_value_by_path, AuthChainVault)."""
import json
from unittest.mock import MagicMock

from core.auth_vault import (
    AuthChainVault,
    AuthExtractRule,
    AuthProfile,
    extract_value_by_path,
)


def test_extract_value_by_path_nested_dict():
    data = {
        "status": "success",
        "data": {
            "token": "secret_jwt_xyz",
            "user": {"id": 42, "role": "admin"},
        },
    }
    assert extract_value_by_path(data, "data.token") == "secret_jwt_xyz"
    assert extract_value_by_path(data, "data.user.id") == 42
    assert extract_value_by_path(data, "data.nonexistent") is None


def test_extract_value_by_path_array():
    data = {"items": [{"id": "item-1"}, {"id": "item-2"}]}
    assert extract_value_by_path(data, "items.1.id") == "item-2"


def test_auth_chain_vault_preflight_and_extract():
    vault = AuthChainVault()

    # Создаем фиктивный ответ сервера
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {
        "Content-Type": "application/json",
        "Set-Cookie": "session_id=sess_999888; Path=/; HttpOnly",
    }
    mock_resp.text = json.dumps({
        "access_token": "bearer_token_12345",
        "expires_in": 3600,
        "meta": {"csrf": "csrf_abc_777"},
    })

    def mock_http_client(**kwargs):
        return mock_resp

    profile = AuthProfile(
        name="bank_sso",
        auth_type="bearer",
        login_url="/api/v1/auth/login",
        method="POST",
        body={"username": "test_user", "password": "secure_pass"},
        extract_rules=[
            AuthExtractRule(target_var="auth.token", source="body_json", path="access_token"),
            AuthExtractRule(target_var="auth.csrf", source="body_json", path="meta.csrf"),
            AuthExtractRule(target_var="auth.cookie", source="cookie", path="session_id"),
        ],
    )

    res = vault.execute_preflight(profile, base_url="http://127.0.0.1:8000", http_client=mock_http_client)
    assert res["success"] is True
    assert res["tokens"]["auth.token"] == "bearer_token_12345"
    assert res["tokens"]["auth.csrf"] == "csrf_abc_777"
    assert res["tokens"]["auth.cookie"] == "sess_999888"

    assert vault.get_token("auth.token") == "bearer_token_12345"
    assert vault.get_token("token") == "bearer_token_12345"
    assert vault.get_token("csrf") == "csrf_abc_777"


def test_auth_chain_vault_inject_into_scanner():
    vault = AuthChainVault()
    vault.set_token("auth.token", "bearer_token_12345")
    vault.set_token("auth.cookie", "session_id=sess_999")

    mock_scanner = MagicMock()

    # Инъекция Bearer
    ok_bearer = vault.inject_into_scanner(mock_scanner, token_var="auth.token", auth_type="bearer")
    assert ok_bearer is True
    mock_scanner.add_replacer_rule.assert_any_call(
        "pk-vault-bearer", "REQ_HEADER", "Authorization", "Bearer bearer_token_12345", False
    )

    # Инъекция Cookie
    ok_cookie = vault.inject_into_scanner(mock_scanner, token_var="auth.cookie", auth_type="cookie")
    assert ok_cookie is True
    mock_scanner.add_replacer_rule.assert_any_call(
        "pk-vault-cookie", "REQ_HEADER", "Cookie", "session_id=sess_999", False
    )
