# -*- coding: utf-8 -*-
"""
Data-модуль в формате test.properties → stream.

  username=admin
  #password_value=secret

key=value     → обычный let
#key=value    → Секрет (не «закомментированная» строка)
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from core.errors import WiredError

# Без `\s*(.*)$` — Sonar S8786 (super-linear backtracking).
_PROP_LINE = re.compile(r"^(#?)([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
_BARE_HASH_COMMENT = re.compile(r"^\s*#(?:\s.*)?$")


def looks_like_properties_module(text: str) -> bool:
    """Полотно похоже на properties, не URL-list и не PrettyK Пусть."""
    raw = (text or "").strip()
    if not raw:
        return False
    from core.language_parse import is_language_script

    if is_language_script(raw):
        return False
    prop_n = 0
    other_n = 0
    for line in raw.splitlines():
        st = line.strip()
        if not st or _BARE_HASH_COMMENT.match(st):
            continue
        eq = st.find("=")
        if eq > 0:
            left, right = st[:eq].rstrip(), st[eq + 1 :].lstrip()
            if _PROP_LINE.match(f"{left}={right}"):
                prop_n += 1
                continue
        other_n += 1
    return prop_n >= 1 and prop_n >= other_n


def parse_properties_module(text: str) -> List[Tuple[str, Any, bool]]:
    """
    → список (key, value, secret).
    value: str (уже без обязательных кавычек; кавычки снимаем если парные).
    """
    out: List[Tuple[str, Any, bool]] = []
    seen: set[str] = set()
    for line_no, line in enumerate((text or "").splitlines(), start=1):
        st = line.strip()
        if not st or _BARE_HASH_COMMENT.match(st):
            continue
        # нормализуем пробелы вокруг «=» до match (regex без `\s*`)
        eq = st.find("=")
        if eq <= 0:
            raise WiredError(
                f"properties модуль, строка {line_no}: ожидали key=value "
                f"или #key=value, получено {st!r}"
            )
        left, right = st[:eq].rstrip(), st[eq + 1 :].lstrip()
        m = _PROP_LINE.match(f"{left}={right}")
        if not m:
            raise WiredError(
                f"properties модуль, строка {line_no}: ожидали key=value "
                f"или #key=value, получено {st!r}"
            )
        secret = m.group(1) == "#"
        key = m.group(2)
        raw_val = m.group(3)
        if key in seen:
            raise WiredError(
                f"properties модуль, строка {line_no}: дубль ключа {key!r}"
            )
        seen.add(key)
        out.append((key, _decode_prop_value(raw_val), secret))
    if not out:
        raise WiredError("properties модуль: нет ни одного key=value")
    return out


def _decode_prop_value(raw: str) -> str:
    v = raw.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def apply_properties_module(stream: Any, module_id: str, text: str) -> Dict[str, Any]:
    """
    Записать плоские ключи + объект stream[module_id].
    secret → stream.set(..., secret=True).
    """
    mid = (module_id or "").strip()
    if not mid:
        raise WiredError("properties модуль без id")
    if mid in stream:
        raise WiredError(
            f"Коллизия имён: ${{{mid}}} уже есть в stream "
            f"(data-модуль / предыдущий export)"
        )
    pairs = parse_properties_module(text)
    obj: Dict[str, Any] = {}
    for key, value, secret in pairs:
        if key in stream:
            raise WiredError(
                f"Коллизия имён: ${{{key}}} уже есть в stream "
                f"(properties модуль {mid!r})"
            )
        stream.set(key, value, secret=secret)
        obj[key] = value
    stream.set(mid, obj, secret=False)
    return obj


__all__ = [
    "looks_like_properties_module",
    "parse_properties_module",
    "apply_properties_module",
]
