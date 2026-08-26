# -*- coding: utf-8 -*-
"""
G-61: Fernet encryption at rest для строковых значений манифеста.

Префикс в JSON: ``pk:enc:v1:<token>``.
Ключ: env ``PK_WIRED_KEY`` (url-safe base64, как выдаёт Fernet.generate_key).
Ключ не кладём в репозиторий и не в бандл фронта.
"""
from __future__ import annotations

import os
from typing import Any

from core.errors import WiredError

ENC_PREFIX = "pk:enc:v1:"
ENV_WIRED_KEY = "PK_WIRED_KEY"


def is_encrypted_value(value: Any) -> bool:
    return isinstance(value, str) and value.startswith(ENC_PREFIX)


def _load_fernet():
    raw = (os.getenv(ENV_WIRED_KEY) or "").strip()
    if not raw:
        raise WiredError(
            f"В манифесте есть {ENC_PREFIX}…, но не задан {ENV_WIRED_KEY}. "
            "Сгенерируйте ключ: python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    try:
        from cryptography.fernet import Fernet, InvalidToken
    except ImportError as exc:
        raise WiredError(
            "Для pk:enc нужен пакет cryptography (см. orchestrator/requirements.txt)"
        ) from exc
    try:
        key = raw.encode("ascii") if isinstance(raw, str) else raw
        return Fernet(key), InvalidToken
    except Exception as exc:
        raise WiredError(
            f"{ENV_WIRED_KEY} не является ключом Fernet (url-safe base64, 32 байта)"
        ) from exc


def encrypt_string(plaintext: str, *, key: bytes | str | None = None) -> str:
    """Зашифровать строку → pk:enc:v1:… (для CI/утилиты)."""
    if key is None:
        fernet, _ = _load_fernet()
    else:
        from cryptography.fernet import Fernet

        key_b = key.encode("ascii") if isinstance(key, str) else key
        fernet = Fernet(key_b)
    token = fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")
    return f"{ENC_PREFIX}{token}"


def decrypt_string(value: str, *, key: bytes | str | None = None) -> str:
    """Расшифровать одну строку с префиксом; без префикса — как есть."""
    if not is_encrypted_value(value):
        return value
    token = value[len(ENC_PREFIX):]
    if key is None:
        fernet, invalid = _load_fernet()
    else:
        from cryptography.fernet import Fernet, InvalidToken

        key_b = key.encode("ascii") if isinstance(key, str) else key
        fernet, invalid = Fernet(key_b), InvalidToken
    try:
        return fernet.decrypt(token.encode("ascii")).decode("utf-8")
    except invalid as exc:
        raise WiredError(
            f"Не удалось расшифровать значение {ENC_PREFIX}… (неверный ключ или повреждённый token)"
        ) from exc
    except Exception as exc:
        raise WiredError(
            f"Не удалось расшифровать значение {ENC_PREFIX}…: {exc}"
        ) from exc


def decrypt_tree(data: Any, *, key: bytes | str | None = None) -> Any:
    """Рекурсивно расшифровать все строки-листья с префиксом pk:enc:v1:."""
    if isinstance(data, str):
        if is_encrypted_value(data):
            return decrypt_string(data, key=key)
        return data
    if isinstance(data, list):
        return [decrypt_tree(item, key=key) for item in data]
    if isinstance(data, dict):
        return {k: decrypt_tree(v, key=key) for k, v in data.items()}
    return data


def tree_has_encrypted(data: Any) -> bool:
    if isinstance(data, str):
        return is_encrypted_value(data)
    if isinstance(data, list):
        return any(tree_has_encrypted(item) for item in data)
    if isinstance(data, dict):
        return any(tree_has_encrypted(v) for v in data.values())
    return False
