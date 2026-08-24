# -*- coding: utf-8 -*-
"""G-61: Fernet kdt:enc:v1:…"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cryptography.fernet import Fernet

from core.errors import WiredError
from core.wired_crypto import (
    ENC_PREFIX,
    ENV_WIRED_KEY,
    decrypt_string,
    decrypt_tree,
    encrypt_string,
    is_encrypted_value,
    tree_has_encrypted,
)


@pytest.fixture
def fernet_key(monkeypatch):
    key = Fernet.generate_key().decode("ascii")
    monkeypatch.setenv(ENV_WIRED_KEY, key)
    return key


def test_roundtrip(fernet_key):
    enc = encrypt_string("s3cret-value")
    assert enc.startswith(ENC_PREFIX)
    assert is_encrypted_value(enc)
    assert decrypt_string(enc) == "s3cret-value"


def test_decrypt_tree_nested(fernet_key):
    enc = encrypt_string("nested-pass")
    data = {
        "security_configuration": {
            "auth_details": {"Логин": "admin", "Пароль": enc},
        },
        "plain": "ok",
    }
    assert tree_has_encrypted(data)
    out = decrypt_tree(data)
    assert out["security_configuration"]["auth_details"]["Пароль"] == "nested-pass"
    assert out["plain"] == "ok"
    assert tree_has_encrypted(out) is False


def test_missing_key_raises(monkeypatch):
    monkeypatch.delenv(ENV_WIRED_KEY, raising=False)
    with pytest.raises(WiredError, match=ENV_WIRED_KEY):
        decrypt_string(f"{ENC_PREFIX}not-a-real-token")


def test_wrong_key_raises(fernet_key, monkeypatch):
    enc = encrypt_string("x")
    monkeypatch.setenv(ENV_WIRED_KEY, Fernet.generate_key().decode("ascii"))
    with pytest.raises(WiredError, match="Не удалось расшифровать"):
        decrypt_string(enc)


def test_json_file_decrypt_pipeline(tmp_path, fernet_key):
    enc = encrypt_string("from-file")
    path = tmp_path / "m.json"
    path.write_text(
        json.dumps({"Пароль": enc, "x": 1}, ensure_ascii=False),
        encoding="utf-8",
    )
    data = json.loads(path.read_text(encoding="utf-8"))
    assert decrypt_tree(data)["Пароль"] == "from-file"
