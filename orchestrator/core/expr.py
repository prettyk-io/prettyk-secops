# -*- coding: utf-8 -*-
"""
Выражения значений для языка данных PK.

Канон ссылок: $name, $user.email, $names[0], $ENV:VAR
Legacy: ${name}, ${user.email}, …

Не eval: литералы, ref/path, список/объект с вложенными expr.
"""
from __future__ import annotations

import json
import re
from typing import Any, List, Optional, Sequence, Tuple, Union

from core.errors import WiredError

# Path после `$`: ENV:… или name / name[i] / a.b[0]
_PATH_BODY = (
    r"(?:ENV:[A-Za-z_][A-Za-z0-9_]*|"
    r"[A-Za-z_][A-Za-z0-9_]*(?:\[-?\d+\])?"
    r"(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[-?\d+\])?)*)"
)
# Целиком строка — одна ссылка (канон $… и legacy ${…}).
_REF_BRACE = re.compile(r"^\$\{([^}]+)\}$")
_REF_DOLLAR = re.compile(r"^\$(" + _PATH_BODY + r")$")
# Скан mid-string / аргументов.
_REF_BRACE_G = re.compile(r"\$\{([^}]+)\}")
_REF_DOLLAR_AT = re.compile(r"\$(" + _PATH_BODY + r")")

# Сегменты path: name | name[index]
_PATH_SEG = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)(?:\[(-?\d+)\])?$")


Path = List[Union[str, int]]


class ExprError(WiredError):
    pass


class KindDict(dict):
    """dict с меткой kind: object | dict (Объект vs Словарь)."""

    __slots__ = ("_pk_kind",)

    def __init__(self, data=None, *, kind: str = "object"):
        super().__init__(data or {})
        self._pk_kind = kind if kind in ("object", "dict") else "object"

    @property
    def kind(self) -> str:
        return self._pk_kind


class LocatorDesc:
    """
    Lazy-локатор в stream (не WebElement).

    kind element | elements; Selene ищет при MethodId.
    Wire-пара: by|value (как css|#email).
    """

    __slots__ = ("by", "value", "collection")

    def __init__(self, by: str, value: str, *, collection: bool = False):
        self.by = (by or "").strip()
        self.value = value if value is not None else ""
        self.collection = bool(collection)
        if not self.by:
            raise ExprError("Локатор: пустой тип (css/xpath/…)")
        if self.value == "":
            raise ExprError("Локатор: пустое значение селектора")

    @property
    def kind(self) -> str:
        return "elements" if self.collection else "element"

    def as_wire(self) -> str:
        return f"{self.by}|{self.value}"

    def __repr__(self) -> str:
        tag = "КоллекцияЭлементов" if self.collection else "Элемент"
        return f"{tag}({self.by!r}, {self.value!r})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, LocatorDesc):
            return NotImplemented
        return (
            self.by == other.by
            and self.value == other.value
            and self.collection == other.collection
        )


def map_kind(value: Any) -> str | None:
    if isinstance(value, LocatorDesc):
        return value.kind
    if isinstance(value, KindDict):
        return value.kind
    if isinstance(value, dict):
        return "object"
    return None


def _prefixed_rest(s: str, prefix: str) -> str | None:
    """prefix + пробел/конец; не матчит ЭлементОтображается."""
    if s == prefix:
        return ""
    if s.startswith(prefix) and len(s) > len(prefix) and s[len(prefix)].isspace():
        return s[len(prefix) :].strip()
    return None


def parse_locator_text(text: str, *, collection: bool = False) -> LocatorDesc:
    """
    `css #email` | `css|#email` | `xpath //div[@id=x]`.
    """
    s = (text or "").strip()
    if not s:
        raise ExprError("Локатор: пустое значение")
    if "|" in s:
        by, _, value = s.partition("|")
        return LocatorDesc(by.strip(), value.strip(), collection=collection)
    parts = s.split(None, 1)
    if len(parts) < 2:
        raise ExprError(
            f"Локатор: ожидалось '<тип> <значение>' или 'тип|значение', получено {s!r}"
        )
    return LocatorDesc(parts[0], parts[1], collection=collection)


def strip_ref(text: str) -> str | None:
    """Если text — целиком ссылка ($x / ${x}), вернуть path; иначе None."""
    text = text.strip()
    m = _REF_BRACE.match(text)
    if m:
        return m.group(1).strip()
    m = _REF_DOLLAR.match(text)
    if m:
        return m.group(1).strip()
    return None


def match_ref_at(s: str, i: int) -> Optional[Tuple[str, int]]:
    """
    Ссылка начиная с s[i]=='$' → (полный токен ref, индекс после него).
    `${…}` или `$path` / `$ENV:NAME`.
    """
    if i < 0 or i >= len(s) or s[i] != "$":
        return None
    if s.startswith("${", i):
        j = s.find("}", i + 2)
        if j < 0:
            raise ExprError(f"незакрытая ссылка ${{…}}: {s[i:]!r}")
        return s[i : j + 1], j + 1
    m = _REF_DOLLAR_AT.match(s, i)
    if m:
        return m.group(0), m.end()
    return None


def parse_path(path_expr: str) -> Path:
    """
    'user.email' → ['user', 'email']
    'names[0]' → ['names', 0]
    'user.nested.id' → ['user', 'nested', 'id']

    Если передали канон-ссылку `$name` / `${name}` — снимаем `$` (часто из LHS Пусть).
    """
    path_expr = path_expr.strip()
    if not path_expr:
        raise WiredError("Пустой путь переменной")
    inner = strip_ref(path_expr)
    if inner is not None:
        path_expr = inner
    parts: Path = []
    for raw in path_expr.split("."):
        m = _PATH_SEG.match(raw.strip())
        if not m:
            raise WiredError(
                f"Некорректный сегмент пути {raw!r} в {path_expr!r}. "
                f"Ожидается name или name[index]."
            )
        parts.append(m.group(1))
        if m.group(2) is not None:
            parts.append(int(m.group(2)))
    return parts


def format_ref(path_expr: str) -> str:
    """Каноническая запись ссылки."""
    return "$" + path_expr.strip()


def _parse_prefixed_container(s: str, resolve_ref) -> Any | None:
    """Список/Словарь/Объект/локаторы с пробелом после префикса или legacy без пробела."""
    list_rest = _prefixed_rest(s, "Список")
    if list_rest is not None:
        return _parse_list(list_rest, resolve_ref)
    dict_rest = _prefixed_rest(s, "Словарь")
    if dict_rest is not None:
        return _parse_object(dict_rest, resolve_ref, kind="dict")
    obj_rest = _prefixed_rest(s, "Объект")
    if obj_rest is not None:
        return _parse_object(obj_rest, resolve_ref, kind="object")

    coll_rest = _prefixed_rest(s, "КоллекцияЭлементов")
    if coll_rest is not None:
        return parse_locator_text(coll_rest, collection=True)
    for loc_name in ("Элемент", "Локатор", "Селектор"):
        loc_rest = _prefixed_rest(s, loc_name)
        if loc_rest is not None:
            return parse_locator_text(loc_rest, collection=False)

    # Старый стиль без пробела после префикса: Объект{ / Список[
    if s.startswith("Список"):
        return _parse_list(s[len("Список") :].strip(), resolve_ref)
    if s.startswith("Словарь"):
        return _parse_object(s[len("Словарь") :].strip(), resolve_ref, kind="dict")
    if s.startswith("Объект"):
        return _parse_object(s[len("Объект") :].strip(), resolve_ref, kind="object")
    return None


def _try_parse_scalar_literal(s: str) -> tuple[bool, Any]:
    """(True, value) для true/false/null/числа; (False, None) если не скаляр."""
    low = s.lower()
    if low == "true":
        return True, True
    if low == "false":
        return True, False
    if low in ("null", "none"):
        return True, None
    if re.fullmatch(r"-?\d+", s):
        return True, int(s)
    if re.fullmatch(r"-?\d+\.\d+", s):
        return True, float(s)
    return False, None


def parse_value(text: str, resolve_ref) -> Any:
    """
    Разобрать значение из pretty/wire-аргумента.

    resolve_ref(path_expr: str) -> Any — достаёт значение по path (strict).
    """
    if text is None:
        return None
    s = str(text).strip()
    if s == "":
        return ""

    inner = strip_ref(s)
    if inner is not None:
        return resolve_ref(inner)

    prefixed = _parse_prefixed_container(s, resolve_ref)
    if prefixed is not None:
        return prefixed

    if s[0] in "\"'":
        body = _parse_quoted(s)
        if "$" in body:
            return interpolate(body, resolve_ref, strict=True)
        return body

    if s[0] == "[":
        return _parse_list(s, resolve_ref)
    if s[0] == "{":
        return _parse_object(s, resolve_ref, kind="object")

    ok, scalar = _try_parse_scalar_literal(s)
    if ok:
        return scalar

    # Голое слово без кавычек — строка (css-классы и т.п. в других keyword'ах).
    return s


def has_sum_diff_ops(text: str) -> bool:
    """Есть ли top-level бинарный + или - вне кавычек и ${…}."""
    s = (text or "").strip()
    if not s or s[0] in "\"'":
        return False
    i = 0
    n = len(s)
    in_str: str | None = None
    term_has_content = False
    while i < n:
        ch = s[i]
        if in_str is not None:
            if ch == "\\" and i + 1 < n:
                i += 2
                continue
            if ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in "\"'":
            in_str = ch
            term_has_content = True
            i += 1
            continue
        if ch == "$":
            try:
                got = match_ref_at(s, i)
            except ExprError:
                return False
            if got is None:
                return False
            term_has_content = True
            i = got[1]
            continue
        if ch in "+-" and term_has_content:
            return True
        if not ch.isspace():
            term_has_content = True
        i += 1
    return False


def eval_sum_diff(text: str, resolve_ref) -> Any:
    """
    Сумма/разность чисел: `$a + 1`, `$hi - $lo` (legacy `${a}` тоже).
    Не concat строк — для строк Склеить. Не eval.
    """
    s = (text or "").strip()
    if not s:
        raise ExprError("Пустое арифметическое выражение")
    terms, ops = _split_sum_diff(s)
    if len(terms) == 1:
        return parse_value(terms[0], resolve_ref)
    if len(ops) != len(terms) - 1:
        raise ExprError(f"Битая арифметика: {text!r}")

    acc = _require_number(parse_value(terms[0], resolve_ref), terms[0])
    for op, term in zip(ops, terms[1:]):
        val = _require_number(parse_value(term, resolve_ref), term)
        if op == "+":
            acc = acc + val
        else:
            acc = acc - val
    return acc


def parse_value_or_arith(text: str, resolve_ref) -> Any:
    """parse_value, либо +/− если есть бинарные операторы."""
    if isinstance(text, str) and has_sum_diff_ops(text):
        return eval_sum_diff(text, resolve_ref)
    return parse_value(text, resolve_ref)


def _require_number(val: Any, hint: str) -> Any:
    if isinstance(val, bool) or not isinstance(val, (int, float)):
        raise ExprError(
            f"Арифметика +/− только для чисел, получено {val!r} из {hint!r}. "
            f"Строки склеивай через Склеить."
        )
    return val


def _split_sum_diff(s: str) -> Tuple[List[str], List[str]]:
    """Термы и операторы (+/−) между ними; унарный минус остаётся в терме."""
    terms: List[str] = []
    ops: List[str] = []
    buf: List[str] = []
    i = 0
    n = len(s)
    in_str: str | None = None
    term_has_content = False

    def flush() -> None:
        nonlocal buf, term_has_content
        t = "".join(buf).strip()
        if not t:
            raise ExprError(f"Пустой терм в арифметике: {s!r}")
        terms.append(t)
        buf = []
        term_has_content = False

    while i < n:
        ch = s[i]
        if in_str is not None:
            buf.append(ch)
            if ch == "\\" and i + 1 < n:
                buf.append(s[i + 1])
                i += 2
                continue
            if ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in "\"'":
            in_str = ch
            buf.append(ch)
            term_has_content = True
            i += 1
            continue
        if ch == "$":
            got = match_ref_at(s, i)
            if got is None:
                raise ExprError(f"битая ссылка $… в арифметике: {s!r}")
            buf.append(got[0])
            term_has_content = True
            i = got[1]
            continue
        if ch in "+-" and term_has_content:
            flush()
            ops.append(ch)
            i += 1
            while i < n and s[i].isspace():
                i += 1
            continue
        if not ch.isspace():
            term_has_content = True
        buf.append(ch)
        i += 1

    flush()
    return terms, ops


def _interpolate_ref_at(
    text: str, i: int, resolve_ref, *, strict: bool
) -> Tuple[str, int] | None:
    """Один `$ref` с позиции i → (replacement, end) или None (оставить `$`)."""
    try:
        got = match_ref_at(text, i)
    except ExprError:
        if strict:
            raise
        return None
    if got is None:
        return None
    ref_tok, end = got
    path = strip_ref(ref_tok)
    if path is None:
        return None
    try:
        val = resolve_ref(path)
    except Exception:
        if strict:
            raise
        return ref_tok, end
    return ("" if val is None else str(val)), end


def interpolate(text: str, resolve_ref, *, strict: bool = False) -> str:
    """Подставить `$path` / `${path}` внутри строки (кавычки, URL, Лог)."""
    if not isinstance(text, str) or "$" not in text:
        return text
    out: List[str] = []
    i = 0
    n = len(text)
    while i < n:
        if text[i] != "$":
            out.append(text[i])
            i += 1
            continue
        replaced = _interpolate_ref_at(text, i, resolve_ref, strict=strict)
        if replaced is None:
            out.append(text[i])
            i += 1
            continue
        piece, end = replaced
        out.append(piece)
        i = end
    return "".join(out)


def _parse_quoted(s: str) -> str:
    q = s[0]
    if len(s) < 2 or s[-1] != q:
        raise ExprError(f"Незакрытая строка: {s!r}")
    body = s[1:-1]
    if q == '"':
        body = body.replace('\\"', '"').replace("\\\\", "\\")
    else:
        body = body.replace("\\'", "'").replace("\\\\", "\\")
    return body


def _split_top_level(s: str, open_c: str, close_c: str) -> List[str]:
    """Содержимое [...] / {...} → элементы/пары по запятым верхнего уровня."""
    s = s.strip()
    if not (s.startswith(open_c) and s.endswith(close_c)):
        raise ExprError(f"Ожидался литерал {open_c}...{close_c}, получено: {s!r}")
    inner = s[1:-1].strip()
    if not inner:
        return []
    parts: List[str] = []
    buf: List[str] = []
    depth = 0
    in_str = None
    escape = False
    for ch in inner:
        if escape:
            buf.append(ch)
            escape = False
            continue
        if ch == "\\" and in_str:
            buf.append(ch)
            escape = True
            continue
        if in_str:
            buf.append(ch)
            if ch == in_str:
                in_str = None
            continue
        if ch in "\"'":
            in_str = ch
            buf.append(ch)
            continue
        if ch in "[{":
            depth += 1
            buf.append(ch)
            continue
        if ch in "]}":
            depth -= 1
            buf.append(ch)
            continue
        if ch == "," and depth == 0:
            parts.append("".join(buf).strip())
            buf = []
            continue
        buf.append(ch)
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return parts


def _parse_list(s: str, resolve_ref) -> list:
    # Сначала чистый JSON без ссылок.
    try:
        val = json.loads(s)
        if isinstance(val, list):
            return val
    except json.JSONDecodeError:
        pass
    items = _split_top_level(s, "[", "]")
    return [parse_value(item, resolve_ref) for item in items]


def _parse_object(s: str, resolve_ref, *, kind: str = "object") -> KindDict:
    try:
        val = json.loads(s)
        if isinstance(val, dict):
            return KindDict(val, kind=kind)
    except json.JSONDecodeError:
        pass

    # Pretty: { email: "a@b.c"  role: "admin" } — запятые опциональны (разделитель пробел/NL/`,`).
    s = s.strip()
    if not (s.startswith("{") and s.endswith("}")):
        raise ExprError(f"Ожидался объект {{...}}, получено: {s!r}")
    inner = s[1:-1].strip()
    if not inner:
        return KindDict({}, kind=kind)

    entries = _split_object_entries(inner)
    out = {}
    for entry in entries:
        key, raw_val = _split_key_value(entry)
        out[key] = parse_value(raw_val, resolve_ref)
    return KindDict(out, kind=kind)


def _split_object_entries(inner: str) -> List[str]:
    # Сначала по запятым top-level.
    if "," in inner:
        return [p for p in _split_top_level("{" + inner + "}", "{", "}") if p]
    # Multiline pretty: один key:value на строку.
    if "\n" in inner:
        return [ln.strip() for ln in inner.splitlines() if ln.strip()]
    # Одна строка без запятых: email: "a" role: "b"
    return _split_bare_kv_entries(inner)


_KEY_AT = re.compile(
    r"(?:^|(?<=\s))"
    r"("
    r"[A-Za-z_][A-Za-z0-9_]*"
    r"|\"[^\"\\]*(?:\\.[^\"\\]*)*\""
    r"|'[^'\\]*(?:\\.[^'\\]*)*'"
    r")"
    r"\s*:"
)


def _scan_bare_kv_starts(inner: str) -> List[int]:
    starts: List[int] = []
    depth = 0
    in_str = None
    escape = False
    i = 0
    while i < len(inner):
        ch = inner[i]
        if escape:
            escape = False
            i += 1
            continue
        if in_str:
            if ch == "\\":
                escape = True
            elif ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in "\"'":
            in_str = ch
            i += 1
            continue
        if ch in "[{":
            depth += 1
            i += 1
            continue
        if ch in "]}":
            depth -= 1
            i += 1
            continue
        if depth == 0:
            m = _KEY_AT.match(inner, i)
            if m and (i == 0 or inner[i - 1].isspace()):
                starts.append(m.start(1))
                i = m.end()
                continue
        i += 1
    return starts


def _split_bare_kv_entries(inner: str) -> List[str]:
    """Режет `k: v k2: v2` по началам ключей, учитывая скобки и строки."""
    starts = _scan_bare_kv_starts(inner)
    if not starts:
        return [inner.strip()] if inner.strip() else []
    parts = []
    for idx, start in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(inner)
        part = inner[start:end].strip()
        if part:
            parts.append(part)
    return parts


def _split_key_value(entry: str) -> Tuple[str, str]:
    entry = entry.strip()
    if not entry:
        raise ExprError("Пустая пара ключ:значение в объекте")
    # "X-Token": value  |  email: value
    if entry[0] in "\"'":
        q = entry[0]
        i = 1
        while i < len(entry):
            if entry[i] == "\\" and i + 1 < len(entry):
                i += 2
                continue
            if entry[i] == q:
                key = _parse_quoted(entry[: i + 1])
                rest = entry[i + 1 :].strip()
                if not rest.startswith(":"):
                    raise ExprError(f"Ожидалось ':' после ключа в {entry!r}")
                return key, rest[1:].strip()
            i += 1
        raise ExprError(f"Незакрытый ключ в {entry!r}")
    if ":" not in entry:
        raise ExprError(f"Ожидалось key: value, получено {entry!r}")
    key, _, rest = entry.partition(":")
    key = key.strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
        raise ExprError(f"Ключ объекта должен быть идентификатором или строкой в кавычках: {key!r}")
    return key, rest.strip()
