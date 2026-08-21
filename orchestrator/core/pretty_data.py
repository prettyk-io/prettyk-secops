# -*- coding: utf-8 -*-
"""
Pretty → wire для слоя данных (+ маркеры листа для LanguageEngine).

Канон: logic-construction.md
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from core import expr
from core.errors import WiredError
from core.language_engine import LanguageEngine

# Пусть ${email} = "…"   |   Пусть ${user.role} = "…"   |   Let / Secret aliases
_LET = re.compile(
    r"^(Пусть|Секрет|Let|Secret)\s+(\S+)\s*=\s*(\S[\s\S]*)$",
    re.IGNORECASE,
)
def _is_quoted_scalar(v: str) -> bool:
    return len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'"


def assert_clean_assignment_rhs(value: str, *, kind: str) -> None:
    """
    Пусть/Секрет: пустой RHS — ошибка.
    Секрет: только кавычки или $ref (не плейсхолдер `value`, не склейка со следующей строкой).
    """
    v = (value or "").strip()
    if not v:
        raise WiredError(f"{kind}: пустое значение справа от «=»")
    if kind.lower() != "секрет" and kind.lower() != "secret":
        return
    if _is_quoted_scalar(v):
        return
    if expr.strip_ref(v) is not None:
        return
    # Типичный косяк: data|secret|name|value + следующая строка без \\n
    # → valueПусть… / голый плейсхолдер value из сигнатуры.
    raise WiredError(
        f"Секрет: значение должно быть в кавычках (\"…\") или ссылкой $name, "
        f"получено {v!r}. Пустое/плейсхолдер value и склейка со следующей "
        f"строкой недопустимы."
    )
# Пусть ${x} = Размер ${names}
_SIZE_EXPR = re.compile(
    r"^Размер\s+(\S+)\s*$",
    re.IGNORECASE,
)
# Пусть ${x} = Склеить ${a} "/" ${b}
_CONCAT_EXPR = re.compile(
    r"^Склеить(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
# Пусть ${x} = Содержит ${hay} ${needle}
_CONTAINS_EXPR = re.compile(
    r"^Содержит(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
# Пусть ${x} = Подстрока ${s} 0 5
_SUBSTRING_EXPR = re.compile(
    r"^Подстрока(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
# Пусть ${x} = ЗаменитьРег ${s} "\d+" "X"  (до Заменить!)
_REPLACE_RE_EXPR = re.compile(
    r"^ЗаменитьРег(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
# Пусть ${x} = СовпадаетРег ${s} "^\d+$"
_MATCH_RE_EXPR = re.compile(
    r"^СовпадаетРег(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
# Пусть ${x} = Заменить ${s} "old" "new"
_REPLACE_EXPR = re.compile(
    r"^Заменить(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
# Пусть ${x} = РазделитьРег ${s} "\s+"  (до Разделить!)
_SPLIT_RE_EXPR = re.compile(
    r"^РазделитьРег(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
# Пусть ${x} = Разделить ${s} ","
_SPLIT_EXPR = re.compile(
    r"^Разделить(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
# Пусть ${x} = ИзвлечьРегВсе ${s} "(\d+)"  (до ИзвлечьРег!)
_EXTRACT_RE_ALL_EXPR = re.compile(
    r"^ИзвлечьРегВсе(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
# Пусть ${x} = ИзвлечьРег ${s} "код=(\d+)"
_EXTRACT_RE_EXPR = re.compile(
    r"^ИзвлечьРег(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
# Пусть ${x} = Обрезать ${s}
_TRIM_EXPR = re.compile(
    r"^Обрезать(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
_STARTS_EXPR = re.compile(
    r"^Начинается(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
_ENDS_EXPR = re.compile(
    r"^Заканчивается(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
_UPPER_EXPR = re.compile(
    r"^Верхний(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
_LOWER_EXPR = re.compile(
    r"^Нижний(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
_FETCH_LEFT_EXPR = re.compile(
    r"^ВзятьДо(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
_FETCH_RIGHT_EXPR = re.compile(
    r"^ВзятьПосле(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
_REMOVE_EXPR = re.compile(
    r"^Убрать(?:\s+(.*))?$",
    re.IGNORECASE | re.DOTALL,
)
# Добавить "carol" в ${names} — без жадного `.+\s+[Вв]` (S8786).
_LIST_ADD_HEAD = re.compile(r"^Добавить\s+", re.IGNORECASE)
# legacy
_LIST_APPEND = re.compile(
    r"^ДобавитьВСписок\s+(\S+)\s+(\S.*)$",
    re.IGNORECASE,
)
_LIST_REMOVE = re.compile(
    r"^УдалитьИзСписка\s+(\S+)\s+(\S+)\s*$",
    re.IGNORECASE,
)
_OBJ_PUT = re.compile(
    r"^ПоложитьВОбъект\s+(\S+)\s+(\S+)\s+(\S.*)$",
    re.IGNORECASE,
)
_OBJ_GET = re.compile(
    r"^ВзятьИзОбъекта\s+(\S+)\s+(\S+)\s+(\S+)\s*$",
    re.IGNORECASE,
)
# legacy: Размер ${len} ${names}
_SIZE_LEGACY = re.compile(
    r"^Размер\s+(\S+)\s+(\S+)\s*$",
    re.IGNORECASE,
)

# Вычисляемый RHS на core: генераторы и время.
#   Пусть ${email} = СлучайныйEmail
#   Пусть ${pin} = СлучайныеЦифры 4
#   Пусть ${stamp} = Сейчас "%d.%m.%Y"
# RU-имя → (core action, минимум аргументов, максимум аргументов)
_CORE_RHS: Dict[str, Tuple[str, int, int]] = {
    "uuid": ("generate_uuid", 0, 0),
    "случайнаястрока": ("generate_random_string", 0, 2),
    "randomstring": ("generate_random_string", 0, 2),
    "случайноечисло": ("generate_random_int", 2, 2),
    "randomint": ("generate_random_int", 2, 2),
    "случайныйemail": ("generate_random_email", 0, 1),
    "randomemail": ("generate_random_email", 0, 1),
    "случайныйтелефон": ("generate_random_phone", 0, 1),
    "randomphone": ("generate_random_phone", 0, 1),
    "случайныебуквы": ("generate_random_letters", 0, 1),
    "randomletters": ("generate_random_letters", 0, 1),
    "случайныестрочные": ("generate_random_lowercase", 0, 1),
    "randomlower": ("generate_random_lowercase", 0, 1),
    "случайныепрописные": ("generate_random_uppercase", 0, 1),
    "randomupper": ("generate_random_uppercase", 0, 1),
    "случайныецифры": ("generate_random_digits", 0, 1),
    "randomdigits": ("generate_random_digits", 0, 1),
    "пошаблону": ("generate_from_pattern", 1, 1),
    "pattern": ("generate_from_pattern", 1, 1),
    "сейчас": ("current_datetime", 0, 1),
    "now": ("current_datetime", 0, 1),
    "таймстамп": ("current_timestamp", 0, 0),
    "timestamp": ("current_timestamp", 0, 0),
    "форматдаты": ("format_datetime", 1, 2),
    "formatdate": ("format_datetime", 1, 2),
    "разобратьдату": ("parse_datetime", 1, 2),
    "parsedate": ("parse_datetime", 1, 2),
}
_CORE_RHS_HEAD = re.compile(r"^(\S+)(?:\s+(\S[\s\S]*))?$")

# Зеркало _PAGE_CALL из language_parse: `login.Войти …` справа от Пусть.
_PAGE_CALL_RHS = re.compile(
    r"^[A-Za-z_][A-Za-z0-9_]*\.(?!\$\{|\{\{)[^\s|]+(?:\s+\S.*)?$",
)


def _match_list_add(raw: str) -> Optional[Tuple[str, str]]:
    """Добавить <value> в <list> — split по последнему « в » (S8786-safe)."""
    if not _LIST_ADD_HEAD.match(raw):
        return None
    rest = _LIST_ADD_HEAD.sub("", raw, count=1).rstrip()
    lower = rest.lower()
    # ищем последний разделитель « в » / « В » как отдельный токен
    idx = -1
    search_at = 0
    while True:
        j = lower.find(" в ", search_at)
        if j < 0:
            break
        idx = j
        search_at = j + 3
    if idx < 0:
        return None
    value_raw = rest[:idx].strip()
    name_raw = rest[idx + 3 :].strip()
    if not value_raw or not name_raw or any(ch.isspace() for ch in name_raw):
        return None
    return value_raw, name_raw


def _lhs_path(token: str) -> str:
    """${user.role} / user.role / email → path для data|let."""
    token = token.strip()
    inner = expr.strip_ref(token)
    if inner is not None:
        expr.parse_path(inner)  # validate
        return inner
    expr.parse_path(token)
    return token


def _name_token(token: str) -> str:
    """Только простой идентификатор (не path). Принимает $ref или legacy bare."""
    inner = expr.strip_ref(token.strip())
    if inner is not None:
        parts = expr.parse_path(inner)
        if len(parts) != 1 or not isinstance(parts[0], str):
            raise WiredError(f"Ожидалось простое имя переменной, не path: {token!r}")
        return parts[0]
    token = token.strip()
    if not token.isidentifier():
        raise WiredError(f"Некорректное имя переменной: {token!r}")
    return token


def _name_ref(token: str, *, op: str) -> str:
    """Слот переменной/контейнера: только $name / ${name}."""
    raw = token.strip()
    if expr.strip_ref(raw) is None:
        raise WiredError(
            f"{op}: нужна ссылка $name или ${{name}}, получено {raw!r}. "
            f"Пример: Пусть $n = Размер $data_module"
        )
    return _name_token(raw)


def _let_save_simple(lhs: str, path: str, op: str) -> None:
    if "." in path or "[" in path:
        raise WiredError(
            f"{op} справа от Пусть: слева пока только простое имя "
            f"(не path), получено {lhs!r}"
        )


def _token_for_list_literal(tok: str) -> str:
    """Токен после split (уже без кавычек) → элемент Список […]. Пустая → \"\"."""
    if tok == "":
        return '""'
    if expr.strip_ref(tok) is not None:
        return tok
    low = tok.lower()
    if low in ("true", "false", "null", "none"):
        return low
    if re.fullmatch(r"-?\d+", tok) or re.fullmatch(r"-?\d+\.\d+", tok):
        return tok
    escaped = tok.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _split_rhs_args(rest: str):
    from core.method_id import split_pretty_args_tagged

    return split_pretty_args_tagged(rest)


def _wire_value_arg(arg, *, op: str = "аргумент") -> str:
    """
    Значение в wire: $ref | \"строка\" | число/atom.
    Голое имя (kind=bare) — ошибка: это не канон и не строка.
    """
    from core.method_id import PrettyArg

    if not isinstance(arg, PrettyArg):
        # legacy call sites — один сырой токен
        tok = str(arg).strip()
        if expr.strip_ref(tok) is not None:
            return tok
        if re.fullmatch(r"-?\d+(\.\d+)?", tok) or tok.lower() in (
            "true",
            "false",
            "null",
            "none",
        ):
            return tok
        raise WiredError(
            f"{op}: голое имя {tok!r} — нужна ссылка $… или строка в кавычках"
        )
    if arg.kind == "ref":
        return arg.text
    if arg.kind == "quoted":
        return _token_for_list_literal(arg.text)
    if arg.kind in ("number", "atom", "opaque"):
        return arg.text if arg.kind != "opaque" else _token_for_list_literal(arg.text)
    raise WiredError(
        f"{op}: голое имя {arg.text!r} — нужна ссылка $… или строка в кавычках. "
        f"Пример: Размер $data_module / Склеить $a \"/x\""
    )


def _rhs_data_op(
    lhs: str,
    path: str,
    op_label: str,
    action: str,
    parts,
    *,
    arity: int,
) -> Tuple[str, str]:
    if len(parts) != arity:
        raise WiredError(
            f"{op_label}: ожидалось аргументов {arity}, получено {len(parts)}"
        )
    _let_save_simple(lhs, path, op_label)
    args = [_wire_value_arg(p, op=op_label) for p in parts]
    return "data|" + action + "|" + "|".join(args), path


def _rhs_core_op(
    lhs: str, path: str, value: str, *, secret: bool
) -> Optional[Tuple[str, str]]:
    """Пусть ${email} = СлучайныйEmail → core|generate_random_email + save_as."""
    head_m = _CORE_RHS_HEAD.match(value.strip())
    if not head_m:
        return None
    entry = _CORE_RHS.get(head_m.group(1).lower())
    if entry is None:
        return None
    action, min_args, max_args = entry
    label = head_m.group(1)
    if secret:
        raise WiredError(
            f"Секрет ${{…}} = {label}: вычисляемое значение нельзя пометить секретом. "
            f"Пиши Пусть, либо Секрет с готовым значением"
        )
    parts = _split_rhs_args(head_m.group(2) or "")
    if not min_args <= len(parts) <= max_args:
        expected = (
            f"{min_args}" if min_args == max_args else f"от {min_args} до {max_args}"
        )
        raise WiredError(
            f"{label}: ожидалось аргументов {expected}, получено {len(parts)}"
        )
    for p in parts:
        if p.kind == "bare":
            raise WiredError(
                f"{label}: голое имя {p.text!r} — нужна ссылка $… или строка в кавычках"
            )
    _let_save_simple(lhs, path, label)
    # core: кавычки — синтаксис pretty; в wire уходит text без kind=quoted обёртки.
    return "|".join(["core", action] + [p.text for p in parts]), path


def _rhs_method_call(
    lhs: str, path: str, value: str, *, secret: bool
) -> Optional[Tuple[str, str]]:
    """Пусть ${n} = Сессия КоличествоCookies → browser|get_cookies_count + save_as."""
    from core.method_id import looks_like_wire, resolve_call

    src = value.strip()
    if not src or src[0] in "\"'$":
        return None  # литерал / ${ссылка} — это обычное присваивание
    if _PAGE_CALL_RHS.match(src):
        raise WiredError(
            f"Пусть {lhs} = {src}: результат операции страницы в переменную не кладём. "
            f"Сохраняй нужное внутри операции или полем «Сохранить как»"
        )
    wire = src if looks_like_wire(src) else resolve_call(src)
    if not wire or "|" not in wire:
        return None
    label = src.split(None, 1)[0]
    if secret:
        raise WiredError(
            f"Секрет ${{…}} = {label}: результат шага нельзя пометить секретом. "
            f"Пиши Пусть, либо Секрет с готовым значением"
        )
    _let_save_simple(lhs, path, label)
    return wire, path


_LET_RHS_OPS = (
    (_SPLIT_RE_EXPR, "РазделитьРег", "split_re", 2),
    (_SPLIT_EXPR, "Разделить", "split", 2),
    (_EXTRACT_RE_ALL_EXPR, "ИзвлечьРегВсе", "extract_re_all", 2),
    (_EXTRACT_RE_EXPR, "ИзвлечьРег", "extract_re", 2),
    (_TRIM_EXPR, "Обрезать", "trim", 1),
    (_STARTS_EXPR, "Начинается", "starts_with", 2),
    (_ENDS_EXPR, "Заканчивается", "ends_with", 2),
    (_UPPER_EXPR, "Верхний", "upper", 1),
    (_LOWER_EXPR, "Нижний", "lower", 1),
    (_FETCH_LEFT_EXPR, "ВзятьДо", "fetch_left", 2),
    (_FETCH_RIGHT_EXPR, "ВзятьПосле", "fetch_right", 2),
    (_REMOVE_EXPR, "Убрать", "remove_str", 2),
)


def _pretty_let_size_concat(lhs: str, path: str, value: str) -> Optional[Tuple[str, str]]:
    size_m = _SIZE_EXPR.match(value)
    if size_m:
        target = _name_ref(size_m.group(1), op="Размер")
        _let_save_simple(lhs, path, "Размер")
        return f"data|size|{target}", path
    concat_m = _CONCAT_EXPR.match(value)
    if not concat_m:
        return None
    parts = _split_rhs_args(concat_m.group(1) or "")
    if len(parts) < 1:
        raise WiredError("Склеить: нужен хотя бы один аргумент")
    _let_save_simple(lhs, path, "Склеить")
    lit = "Список [" + ", ".join(_wire_value_arg(p, op="Склеить") for p in parts) + "]"
    return f"data|concat|{lit}", path


def _pretty_let_contains_sub(lhs: str, path: str, value: str) -> Optional[Tuple[str, str]]:
    contains_m = _CONTAINS_EXPR.match(value)
    if contains_m:
        parts = _split_rhs_args(contains_m.group(1) or "")
        if len(parts) != 2:
            raise WiredError(
                "Содержит справа от Пусть: ровно два аргумента "
                f"(haystack needle), получено {len(parts)}"
            )
        _let_save_simple(lhs, path, "Содержит")
        hay = _wire_value_arg(parts[0], op="Содержит")
        needle = _wire_value_arg(parts[1], op="Содержит")
        return f"data|contains|{hay}|{needle}", path
    sub_m = _SUBSTRING_EXPR.match(value)
    if not sub_m:
        return None
    parts = _split_rhs_args(sub_m.group(1) or "")
    if len(parts) not in (2, 3):
        raise WiredError(
            "Подстрока: Подстрока ${s} start [end] "
            f"(2 или 3 аргумента), получено {len(parts)}"
        )
    _let_save_simple(lhs, path, "Подстрока")
    args = [_wire_value_arg(p, op="Подстрока") for p in parts]
    return "data|substring|" + "|".join(args), path


def _pretty_let_regex_replace(lhs: str, path: str, value: str) -> Optional[Tuple[str, str]]:
    for regex, label, action, arity in (
        (_MATCH_RE_EXPR, "СовпадаетРег", "match_re", 2),
        (_REPLACE_RE_EXPR, "ЗаменитьРег", "replace_re", 3),
        (_REPLACE_EXPR, "Заменить", "replace", 3),
    ):
        matched = regex.match(value)
        if not matched:
            continue
        parts = _split_rhs_args(matched.group(1) or "")
        if len(parts) != arity:
            raise WiredError(
                f"{label}: ожидалось аргументов {arity}, получено {len(parts)}"
            )
        _let_save_simple(lhs, path, label)
        args = [_wire_value_arg(p, op=label) for p in parts]
        return "data|" + action + "|" + "|".join(args), path
    return None


def _pretty_let_special(lhs: str, path: str, value: str) -> Optional[Tuple[str, str]]:
    for handler in (
        _pretty_let_size_concat,
        _pretty_let_contains_sub,
        _pretty_let_regex_replace,
    ):
        got = handler(lhs, path, value)
        if got is not None:
            return got
    return None


def _pretty_let_to_wire(kind: str, lhs: str, value: str) -> Tuple[str, Optional[str]]:
    action = "secret" if kind.lower() == "секрет" else "let"
    if action != "secret":
        assert_clean_assignment_rhs(value, kind=kind)
    path = _lhs_path(lhs)
    special = _pretty_let_special(lhs, path, value)
    if special is not None:
        return special
    for regex, label, wire_op, arity in _LET_RHS_OPS:
        matched = regex.match(value)
        if matched:
            return _rhs_data_op(
                lhs,
                path,
                label,
                wire_op,
                _split_rhs_args(matched.group(1) or ""),
                arity=arity,
            )
    core_rhs = _rhs_core_op(lhs, path, value, secret=action == "secret")
    if core_rhs is not None:
        return core_rhs
    call_rhs = _rhs_method_call(lhs, path, value, secret=action == "secret")
    if call_rhs is not None:
        return call_rhs
    if action == "secret":
        assert_clean_assignment_rhs(value, kind=kind)
    if expr.has_sum_diff_ops(value):
        _let_save_simple(lhs, path, "Арифметика")
        return f"data|{action}|{path}|{value}", None
    if re.match(
        r"^(Список|Массив|Объект|Словарь)\b",
        value,
        flags=re.IGNORECASE,
    ) or value[:1] in "[{":
        return f"data|{action}|{path}|{value}", None
    vparts = _split_rhs_args(value)
    if len(vparts) != 1:
        raise WiredError(
            f"{kind}: справа от «=» одно значение ($ref, \"…\" или число), "
            f"получено {len(vparts)} токенов. Пример: Пусть $x = \"var\""
        )
    wired = _wire_value_arg(vparts[0], op=kind)
    return f"data|{action}|{path}|{wired}", None


def _guard_data_markers(raw: str, leaf: Any) -> Optional[Tuple[str, Optional[str]]]:
    if not (leaf.failsafe or leaf.recover_constructors):
        return None
    # Wire-действие с маркерами: не data-скрипт — отдаём как есть (Controller снимет).
    first = raw.split("|", 1)[0].strip().lower()
    if "|" in raw and first not in ("data",) and not raw.lower().startswith("пусть"):
        return raw, None
    raise WiredError(
        "Маркеры >? / >@ на строках данных не поддерживаются "
        "(только на шагах действий)"
    )


def _pretty_list_line(raw: str) -> Optional[Tuple[str, Optional[str]]]:
    list_add = _match_list_add(raw)
    if list_add is not None:
        value_raw, name_raw = list_add
        name = _name_ref(name_raw, op="Добавить")
        vparts = _split_rhs_args(value_raw)
        if len(vparts) != 1:
            raise WiredError(
                f"Добавить: одно значение слева от «в», получено {len(vparts)}"
            )
        value = _wire_value_arg(vparts[0], op="Добавить")
        return f"data|list_append|{name}|{value}", None

    m = _LIST_APPEND.match(raw)
    if m:
        name = _name_ref(m.group(1), op="ДобавитьВСписок")
        vparts = _split_rhs_args(m.group(2).strip())
        if len(vparts) != 1:
            raise WiredError("ДобавитьВСписок: одно значение после имени списка")
        value = _wire_value_arg(vparts[0], op="ДобавитьВСписок")
        return f"data|list_append|{name}|{value}", None

    m = _LIST_REMOVE.match(raw)
    if m:
        name = _name_ref(m.group(1), op="УдалитьИзСписка")
        vparts = _split_rhs_args(m.group(2).strip())
        if len(vparts) != 1:
            raise WiredError("УдалитьИзСписка: одно значение после имени списка")
        value = _wire_value_arg(vparts[0], op="УдалитьИзСписка")
        return f"data|list_remove|{name}|{value}", None
    return None


def _pretty_object_line(raw: str) -> Optional[Tuple[str, Optional[str]]]:
    m = _OBJ_PUT.match(raw)
    if m:
        name = _name_ref(m.group(1), op="ПоложитьВОбъект")
        key_parts = _split_rhs_args(m.group(2).strip())
        val_parts = _split_rhs_args(m.group(3).strip())
        if len(key_parts) != 1 or len(val_parts) != 1:
            raise WiredError("ПоложитьВОбъект: ключ и значение — по одному токену")
        key = _wire_value_arg(key_parts[0], op="ПоложитьВОбъект")
        value = _wire_value_arg(val_parts[0], op="ПоложитьВОбъект")
        return f"data|object_put|{name}|{key}|{value}", None

    m = _OBJ_GET.match(raw)
    if m:
        save_as = _name_ref(m.group(1), op="ВзятьИзОбъекта")
        obj = _name_ref(m.group(2), op="ВзятьИзОбъекта")
        key_parts = _split_rhs_args(m.group(3).strip())
        if len(key_parts) != 1:
            raise WiredError("ВзятьИзОбъекта: ключ — один токен")
        key = _wire_value_arg(key_parts[0], op="ВзятьИзОбъекта")
        return f"data|object_get|{obj}|{key}", save_as

    m = _SIZE_LEGACY.match(raw)
    if m:
        save_as = _name_ref(m.group(1), op="Размер (legacy)")
        target_name = _name_ref(m.group(2), op="Размер (legacy)")
        return f"data|size|{target_name}", save_as
    return None


def _data_line_hint(raw: str) -> str:
    st = raw.lstrip()
    if st.startswith("?") or st.startswith(
        (
            "Если",
            "Цикл",
            "ДляКаждого",
            "Пока",
            "Попробовать",
            "Группа",
            "Прервать",
            "Продолжить",
        )
    ):
        return (
            " — это язык сценария (Если/Цикл/?…>…), не слой данных; "
            "в песочницу не класть"
        )
    return ""


def pretty_line_to_wire(line: str) -> Optional[Tuple[str, Optional[str]]]:
    """
    Одна pretty-строка → (wire_constructor, save_as|None).

    Маркеры >? / >@ на строках данных не поддерживаем (только MethodId-листья).
    """
    raw = line.strip()
    if not raw or raw.startswith("#"):
        return None

    leaf = LanguageEngine.parse_leaf(raw)
    marked = _guard_data_markers(raw, leaf)
    if marked is not None:
        return marked

    # Wire / FE flatten `core|… → name` (parse_leaf уже снял стрелку в save_as).
    from core.method_id import looks_like_wire

    if looks_like_wire(leaf.constructor):
        return leaf.constructor, (leaf.save_as or None)

    m = _LET.match(raw)
    if m:
        return _pretty_let_to_wire(m.group(1), m.group(2).strip(), m.group(3).strip())

    for handler in (_pretty_list_line, _pretty_object_line):
        got = handler(raw)
        if got is not None:
            return got

    raise WiredError(f"Не понял строку данных: {raw!r}{_data_line_hint(raw)}")


def _scan_line_bracket_depth(
    line: str, *, depth: int, in_str: Optional[str], escape: bool
) -> Tuple[int, Optional[str], bool]:
    """Обновить depth/in_str/escape по одной физической строке."""
    for ch in line:
        if escape:
            escape = False
            continue
        if in_str:
            if ch == "\\":
                escape = True
            elif ch == in_str:
                in_str = None
            continue
        if ch in "\"'":
            in_str = ch
            continue
        if ch in "{[":
            depth += 1
        elif ch in "}]":
            depth = max(0, depth - 1)
    return depth, in_str, escape


def _logical_statements(script: str) -> List[Tuple[int, str]]:
    """Склеить физические строки в логические операторы (скобки { [ )."""
    statements: List[Tuple[int, str]] = []
    buf: List[str] = []
    start_line = 1
    depth = 0
    in_str = None
    escape = False

    def flush(lineno: int) -> None:
        nonlocal buf, start_line
        text = "\n".join(buf).strip()
        buf = []
        if text:
            statements.append((start_line, text))
        start_line = lineno + 1

    lines = script.splitlines()
    if not lines:
        return []

    for lineno, line in enumerate(lines, start=1):
        if not buf:
            start_line = lineno
            stripped = line.strip()
            if depth == 0 and (not stripped or stripped.startswith("#")):
                continue

        depth, in_str, escape = _scan_line_bracket_depth(
            line, depth=depth, in_str=in_str, escape=escape
        )
        buf.append(line)
        if depth == 0:
            flush(lineno)

    if buf:
        if depth != 0:
            raise WiredError(
                f"строка {start_line}: незакрытая скобка {{ или [ в блоке"
            )
        flush(len(lines))
    return statements


def script_to_steps(script: str) -> List[dict]:
    """Скрипт (pretty и/или wire) → список {constructor, save_as}."""
    steps = []
    for lineno, statement in _logical_statements(script):
        try:
            parsed = pretty_line_to_wire(statement)
        except WiredError as e:
            raise WiredError(f"строка {lineno}: {e}") from e
        if parsed is None:
            continue
        wire, save_as = parsed
        steps.append({"constructor": wire, "save_as": save_as or ""})
    return steps
