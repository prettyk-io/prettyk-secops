# -*- coding: utf-8 -*-
"""G-62: ${ENV:} / secretref: + маскирование."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.data_stream import SECRET_LOG_MASK, DataStream
from core.errors import WiredError
from core.wired_secretref import prepare_manifest_data, resolve_secretref_tree


def test_resolve_env_ref(monkeypatch):
    monkeypatch.setenv("KDT_TEST_SECRET", "env-plain-secret")
    data, seeds = resolve_secretref_tree(
        {"Пароль": "${ENV:KDT_TEST_SECRET}", "ok": 1}
    )
    assert data["Пароль"] == "env-plain-secret"
    assert "env-plain-secret" in seeds


def test_resolve_secretref_prefix(monkeypatch):
    monkeypatch.setenv("LOGIN_PASSWORD", "via-secretref")
    data, seeds = resolve_secretref_tree({"p": "secretref:LOGIN_PASSWORD"})
    assert data["p"] == "via-secretref"
    assert seeds == ["via-secretref"]


def test_resolve_secretref_prefix_case_insensitive(monkeypatch):
    """Префикс SECRETREF: и lowercase имя env — IGNORECASE без дубля a-z/A-Z."""
    monkeypatch.setenv("mixed_Secret", "case-ok")
    data, seeds = resolve_secretref_tree({"p": "SECRETREF:mixed_Secret"})
    assert data["p"] == "case-ok"
    assert seeds == ["case-ok"]


def test_missing_env_raises(monkeypatch):
    monkeypatch.delenv("MISSING_KDT_SECRET", raising=False)
    with pytest.raises(WiredError, match="MISSING_KDT_SECRET"):
        resolve_secretref_tree({"x": "${ENV:MISSING_KDT_SECRET}"})


def test_stream_env_path_and_mask(monkeypatch):
    monkeypatch.setenv("KDT_STREAM_SECRET", "stream-secret-val")
    stream = DataStream()
    assert stream.resolve("${ENV:KDT_STREAM_SECRET}") == "stream-secret-val"
    assert stream.mask_for_log("leak stream-secret-val") == f"leak {SECRET_LOG_MASK}"


def test_stream_secretref_string(monkeypatch):
    monkeypatch.setenv("KDT_SR", "sr-val")
    stream = DataStream()
    assert stream.resolve("secretref:KDT_SR") == "sr-val"
    assert stream.mask_for_log("sr-val") == SECRET_LOG_MASK


def test_prepare_order_enc_then_env(monkeypatch):
    from cryptography.fernet import Fernet

    from core.wired_crypto import ENV_MANIFEST_KEY, encrypt_string

    key = Fernet.generate_key().decode("ascii")
    monkeypatch.setenv(ENV_MANIFEST_KEY, key)
    monkeypatch.setenv("KDT_NESTED", "from-env")
    # enc вокруг plaintext, не вокруг ENV-ссылки — типичный кейс: либо enc, либо ENV.
    enc = encrypt_string("only-enc")
    data, seeds = prepare_manifest_data(
        {"a": enc, "b": "${ENV:KDT_NESTED}"}
    )
    assert data["a"] == "only-enc"
    assert data["b"] == "from-env"
    assert "from-env" in seeds
