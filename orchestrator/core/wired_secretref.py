# -*- coding: utf-8 -*-
"""
G-62: secretref в манифесте — `${ENV:VAR}` или `secretref:VAR` → os.environ.

Plaintext в git не кладём; при load подставляем значение и отдаём его в seed
для mask_for_log (G-60).
"""
from __future__ import annotations

import os
import re
from typing import Any, List, Tuple

from core.errors import WiredError

# Целиком строка-значение поля манифеста / аргумента.
_ENV_REF_BRACE = re.compile(r"^\$\{ENV:([A-Za-z_][A-Za-z0-9_]*)\}$")
_ENV_REF_DOLLAR = re.compile(r"^\$ENV:([A-Za-z_][A-Za-z0-9_]*)$")
_SECRETREF = re.compile(r"^secretref:([A-Z_][A-Z0-9_]*)$", re.IGNORECASE)
# Path внутри $… / ${…} для DataStream.get_path / interpolate.
_ENV_PATH = re.compile(r"^ENV:([A-Za-z_][A-Za-z0-9_]*)$")


def env_name_from_path(path_expr: str) -> str | None:
    m = _ENV_PATH.match((path_expr or "").strip())
    return m.group(1) if m else None


def parse_secretref_string(value: str) -> str | None:
    """Если строка — secretref / $ENV:… / ${ENV:…}, вернуть имя переменной."""
    text = (value or "").strip()
    m = _ENV_REF_DOLLAR.match(text) or _ENV_REF_BRACE.match(text)
    if m:
        return m.group(1)
    m = _SECRETREF.match(text)
    if m:
        return m.group(1)
    return None


def read_env_secret(name: str) -> str:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        raise WiredError(
            f"Секрет ENV:{name} не задан (ожидался $ENV:{name} или secretref:{name})"
        )
    return raw


def resolve_secretref_tree(data: Any) -> Tuple[Any, List[str]]:
    """
    Подставить secretref / ${ENV:} в дереве JSON.
    Возвращает (новое дерево, список plaintext для маскирования в логах).
    """
    seeds: List[str] = []

    def walk(node: Any) -> Any:
        if isinstance(node, str):
            name = parse_secretref_string(node)
            if name is None:
                return node
            value = read_env_secret(name)
            seeds.append(value)
            return value
        if isinstance(node, list):
            return [walk(item) for item in node]
        if isinstance(node, dict):
            return {k: walk(v) for k, v in node.items()}
        return node

    return walk(data), seeds


def prepare_wired_data(data: Any) -> Tuple[Any, List[str]]:
    """G-61 decrypt + G-62 secretref. Порядок: сначала enc, потом ENV."""
    from core.wired_crypto import decrypt_tree, tree_has_encrypted

    if tree_has_encrypted(data):
        data = decrypt_tree(data)
    return resolve_secretref_tree(data)
