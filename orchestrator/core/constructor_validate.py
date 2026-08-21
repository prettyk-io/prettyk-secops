# -*- coding: utf-8 -*-
"""
Валидация конструкторов тем же контрактом, что рантайм (без ZAP/Selenium).

Источник сигнатур — AST-каталог export_keywords.build_catalog() (как у фронта).
Песочница/редактор бьют сюда, чтобы не ловить «зелёный UI → красный прогон».
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.errors import WiredError
from core.lang_ast import (
    ActionNode,
    BreakNode,
    ContinueNode,
    ForeachNode,
    GroupNode,
    IfNode,
    LoopNode,
    Node,
    PageCallNode,
    TryNode,
    WhileNode,
)
from core.language_engine import LanguageEngine
from core.method_id import looks_like_wire
from core.pretty_data import pretty_line_to_wire, script_to_steps

# Ленивый импорт каталога — tools не всегда на path при unit-тестах.
_CATALOG: Optional[Dict[str, Any]] = None

_KNOWN_AT_DIRECTIVES = {
    "@Title", "@Название",
    "@Description", "@Описание",
    "@Tag", "@Тег",
    "@Author", "@Автор",
    "@ Title", "@ Название",
    "@ Description", "@ Описание",
    "@ Tag", "@ Тег",
    "@ Author", "@ Автор",
}


def _is_at_directive_line(line: str) -> bool:
    """Строка начинается с @ — директива метаданных (не исполняемый шаг)."""
    return bool(line) and line.lstrip().startswith("@")


def _validate_at_directive(line: str) -> List[Dict[str, Any]]:
    """Валидация известных @-директив. Неизвестные — error с подсказкой."""
    stripped = line.strip()
    parts = stripped.split(None, 2)
    if len(parts) < 2:
        # Bare `@` or `@` alone — unknown
        known = ", ".join(sorted(_KNOWN_AT_DIRECTIVES))
        return [_diag("error", f'Неизвестная директива "{stripped}". Известны: {known}', 0, len(stripped))]
    head = f"{parts[0]} {parts[1]}"  # "@ Title"
    if head in _KNOWN_AT_DIRECTIVES:
        if len(parts) < 3:
            return [_diag("warning", f'Директива "{head}": укажите значение', 0, len(stripped))]
        return []
    known = ", ".join(sorted(_KNOWN_AT_DIRECTIVES))
    return [_diag("error", f'Неизвестная директива "{head}". Известны: {known}', 0, len(stripped))]


def _filter_at_directive_lines(lines: List[str]) -> tuple[List[str], List[str]]:
    """Разделить строки скрипта на исполняемые и @-директивы."""
    script_lines: List[str] = []
    at_lines: List[str] = []
    for ln in lines:
        if _is_at_directive_line(ln):
            at_lines.append(ln.strip())
        else:
            script_lines.append(ln)
    return script_lines, at_lines


def get_catalog() -> Dict[str, Any]:
    global _CATALOG
    if _CATALOG is None:
        from tools.export_keywords import build_catalog

        _CATALOG = build_catalog()
    return _CATALOG


def reload_catalog() -> None:
    global _CATALOG
    _CATALOG = None


def catalog_components(catalog: Dict[str, Any]) -> Dict[str, Any]:
    """AC-surface `components` + legacy_wire (G-09 inspector и т.п.) для validate."""
    merged = dict(catalog.get("components") or {})
    legacy = catalog.get("legacy_components") or {}
    for name, body in legacy.items():
        merged.setdefault(name, body)
    return merged


def _validate_wire_constructor(
    raw: str, *, catalog: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    from core.language_parse import lint_bare_hash_selectors
    from core.wire_split import split_wire, wire_segments

    diagnostics: List[Dict[str, Any]] = list(lint_bare_hash_selectors(raw))
    try:
        leaf = LanguageEngine.parse_leaf(raw)
    except WiredError as e:
        diagnostics.append(_diag("error", str(e), 0, len(raw)))
        return diagnostics

    wire = leaf.constructor
    catalog = catalog or get_catalog()
    parts = split_wire(wire)
    segments = wire_segments(wire)
    raw = wire

    if len(parts) < 2:
        diagnostics.append(
            _diag(
                "error",
                "Конструктор должен иметь вид '<компонент>|<действие>[|аргументы]'",
                0,
                len(raw),
            )
        )
        return diagnostics

    component, action = parts[0].strip(), parts[1].strip()
    args = parts[2:]
    components = catalog_components(catalog)

    if component not in components:
        known = ", ".join(sorted(components))
        diagnostics.append(
            _diag(
                "error",
                f"Неизвестный компонент {component!r}. Доступны: {known}",
                segments[0]["start"],
                segments[0]["end"],
            )
        )
        return diagnostics

    actions = components[component].get("actions") or {}
    if action not in actions:
        hint = sorted(actions)[:5]
        msg = f"Неизвестное действие {component}|{action}"
        if hint:
            msg += f". Есть например: {', '.join(hint)}"
        diagnostics.append(
            _diag("error", msg, segments[1]["start"], segments[1]["end"])
        )
        return diagnostics

    diagnostics.extend(
        _check_wire_arity(component, action, args, actions[action], segments, raw)
    )
    diagnostics.extend(
        _check_wire_arg_types(component, action, args, actions[action], segments, raw)
    )
    diagnostics.extend(_check_wire_secret(component, action, args, segments, raw))
    return diagnostics


def _check_wire_arity(
    component: str,
    action: str,
    args: List[str],
    action_spec: Dict[str, Any],
    segments: List[Dict[str, Any]],
    raw: str,
) -> List[Dict[str, Any]]:
    params = action_spec.get("params") or []
    positional = [p for p in params if p.get("kind") == "positional"]
    var_pos = any(p.get("kind") == "var_positional" for p in params)
    required = sum(1 for p in positional if p.get("required"))
    max_args = None if var_pos else len(positional)
    sig = f"{action}({', '.join(p['name'] for p in positional)})"
    if len(args) < required:
        return [
            _diag(
                "error",
                f"{component}|{action}: мало аргументов ({len(args)}), "
                f"обязательных {required}. Сигнатура: {sig}",
                0,
                len(raw),
            )
        ]
    if max_args is not None and len(args) > max_args:
        start = (
            segments[min(2 + max_args, len(segments) - 1)]["start"] if segments else 0
        )
        return [
            _diag(
                "error",
                f"{component}|{action}: лишние аргументы ({len(args)} > {max_args}). "
                f"Сигнатура: {sig}",
                start,
                len(raw),
            )
        ]
    return []


_NUMERIC_PARAM_NAMES = {
    "timeout",
    "seconds",
    "delay",
    "retry",
    "retries",
    "retry_delay",
    "port",
    "index",
    "status_code",
    "count",
    "max_depth",
    "limit",
    "offset",
    "wait_seconds",
    "implicit",
    "page_load",
    "multiplier",
    "size_abs_delta",
    "max_requests",
    "requests_per_second",
}

_BOOLEAN_PARAM_NAMES = {
    "failsafe",
    "continue_on_failure",
    "follow_redirects",
    "session_replay",
    "disabled",
    "enabled",
    "secure",
    "http_only",
    "clear",
    "strict",
}


def _check_wire_arg_types(
    component: str,
    action: str,
    args: List[str],
    action_spec: Dict[str, Any],
    segments: List[Dict[str, Any]],
    raw: str,
) -> List[Dict[str, Any]]:
    params = action_spec.get("params") or []
    positional = [p for p in params if p.get("kind") == "positional"]
    diags: List[Dict[str, Any]] = []

    for idx, arg_val in enumerate(args):
        if idx >= len(positional):
            break
        p = positional[idx]
        p_name = str(p.get("name") or "")
        p_type = str(p.get("type") or "").lower()
        val = str(arg_val).strip()

        if not val or val.startswith("$") or val.startswith("${"):
            continue

        # Check numeric parameter
        is_num_param = p_type in ("int", "integer", "float", "number") or p_name in _NUMERIC_PARAM_NAMES
        if is_num_param and p_type != "str":
            if not re.match(r"^-?\d+(?:\.\d+)?$", val):
                seg = segments[2 + idx] if len(segments) > 2 + idx else {"start": 0, "end": len(raw)}
                diags.append(
                    _diag(
                        "error",
                        f"{component}|{action}: параметр «{p_name}» ожидает число или $переменную, получено {val!r}",
                        seg["start"],
                        seg["end"],
                    )
                )

        # Check boolean parameter
        is_bool_param = p_type in ("bool", "boolean") or p_name in _BOOLEAN_PARAM_NAMES
        if is_bool_param and p_type != "str":
            if val.lower() not in ("true", "false", "1", "0", "да", "нет"):
                seg = segments[2 + idx] if len(segments) > 2 + idx else {"start": 0, "end": len(raw)}
                diags.append(
                    _diag(
                        "error",
                        f"{component}|{action}: параметр «{p_name}» ожидает true/false или $переменную, получено {val!r}",
                        seg["start"],
                        seg["end"],
                    )
                )

    return diags


def _check_wire_secret(
    component: str,
    action: str,
    args: List[str],
    segments: List[Dict[str, Any]],
    raw: str,
) -> List[Dict[str, Any]]:
    if component != "data" or action != "secret":
        return []
    from core.pretty_data import assert_clean_assignment_rhs

    if len(args) < 2 or not str(args[1]).strip():
        return [
            _diag(
                "error",
                "Секрет: пустое значение (data|secret|<name>|<value>). "
                "Значение — в кавычках, не плейсхолдер value из сигнатуры.",
                0,
                len(raw),
            )
        ]
    try:
        assert_clean_assignment_rhs(args[1], kind="Секрет")
    except WiredError as e:
        seg = segments[3] if len(segments) > 3 else segments[-1]
        return [_diag("error", str(e), seg["start"], seg["end"])]
    return []


def validate_constructor(text: str, *, catalog: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Wire `component|action|…`, language-скрипт, MethodId pretty, или макет страницы.
    """
    from core.language_parse import is_language_script
    from core.method_id import looks_like_wire
    from core.page_layout import looks_like_page_layout

    raw_nl = (text or "").replace("\r\n", "\n").replace("\r", "")
    if looks_like_page_layout(raw_nl):
        return validate_page_layout(raw_nl, catalog=catalog)
    if is_language_script(raw_nl):
        return validate_language_script(raw_nl, catalog=catalog)

    # Pretty MethodId / несколько листьев без маркеров языка: не схлопывать \n в wire.
    stripped = raw_nl.strip()
    if stripped and not looks_like_wire(stripped):
        if "\n" in stripped:
            return validate_language_script(stripped, catalog=catalog)
        return validate_action_constructor(stripped, catalog=catalog)

    raw = stripped.replace("\n", "").strip()
    if not raw:
        return []
    return _validate_wire_constructor(raw, catalog=catalog)


def iter_action_nodes(nodes: List[Node]) -> List[ActionNode]:
    """Все ActionNode в дереве, включая catch/finally / тела циклов (даже если не выполнятся)."""
    found: List[ActionNode] = []

    def walk(items: List[Node]) -> None:
        for node in items:
            if isinstance(node, ActionNode):
                found.append(node)
            elif isinstance(node, IfNode):
                for branch in node.branches:
                    walk(branch.body)
            elif isinstance(node, (LoopNode, ForeachNode, WhileNode, GroupNode)):
                walk(node.body)
            elif isinstance(node, TryNode):
                walk(node.try_body)
                walk(node.catch_body)
                walk(node.finally_body)
            elif isinstance(node, (PageCallNode, BreakNode, ContinueNode)):
                continue

    walk(nodes)
    return found


def _unknown_step_diag(primary: str) -> Dict[str, Any]:
    return _diag(
        "error",
        f"Неизвестный шаг/MethodId: {primary!r} "
        f"(проверьте имя или wire component|action|…)",
        0,
        len(primary),
    )


def _attach_wire_basis(
    diags: List[Dict[str, Any]], wire: str
) -> List[Dict[str, Any]]:
    for d in diags:
        d["wirek"] = wire
        d["_basis"] = "wire"
    return diags


def _validate_pretty_primary(
    primary: str, *, catalog: Dict[str, Any]
) -> List[Dict[str, Any]]:
    try:
        pair = pretty_line_to_wire(primary)
    except WiredError as e:
        msg = str(e)
        if msg.startswith("Не понял строку данных"):
            return [_unknown_step_diag(primary)]
        a, b = _token_span_in_text(primary, msg)
        return [_diag("error", msg, a, b)]
    if pair is None:
        return [_unknown_step_diag(primary)]
    wire, _save = pair
    return _attach_wire_basis(validate_constructor(wire, catalog=catalog), wire)


def validate_action_constructor(
    text: str, *, catalog: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Лист сценария: wire / MethodId / pretty-data.
    Неизвестный токен вроде «ХУЙ» → error (даже если ветка catch не исполнится).
    """
    from core.method_id import resolve_call

    catalog = catalog or get_catalog()
    raw_in = (text or "").strip()
    if not raw_in:
        return [_diag("error", "Пустой шаг", 0, 0)]

    if _is_at_directive_line(raw_in):
        return _validate_at_directive(raw_in)

    try:
        leaf = LanguageEngine.parse_leaf(raw_in)
    except WiredError as e:
        msg = str(e)
        a, b = _token_span_in_text(raw_in, msg)
        return [_diag("error", msg, a, b)]

    out: List[Dict[str, Any]] = []
    for recover in leaf.recover_constructors:
        out.extend(validate_action_constructor(recover, catalog=catalog))

    primary = (leaf.constructor or "").strip()
    if not primary:
        out.append(_diag("error", "Пустой шаг", 0, 0))
        return out

    resolved = resolve_call(primary)
    if resolved is not None:
        out.extend(
            _attach_wire_basis(validate_constructor(resolved, catalog=catalog), resolved)
        )
        return out

    # Нельзя: «"|" in primary» — кавычки в Склеить ${q} "|" ${bs} ломают путь
    # (pretty → validate_constructor → language → рекурсия).
    if looks_like_wire(primary):
        out.extend(
            _attach_wire_basis(validate_constructor(primary, catalog=catalog), primary)
        )
        return out

    out.extend(_validate_pretty_primary(primary, catalog=catalog))
    return out


def validate_page_layout(
    text: str, *, catalog: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Макет страницы: разобрать Элемент/Операция.
    Тела Операция содержат ${email} (локатор страницы) — arity wire здесь не проверяем;
    рантайм expand → css|….
    """
    from core.language_parse import lint_bare_hash_selectors, parse_script
    from core.page_layout import parse_page_layout

    _ = catalog  # API как у других validate_*
    raw = (text or "").replace("\r\n", "\n").replace("\r", "")
    out: List[Dict[str, Any]] = list(lint_bare_hash_selectors(raw))

    # Validate @-directives on pages (same as scenarios).
    for line in raw.split("\n"):
        t = line.strip()
        if t.startswith("@"):
            at_diags = _validate_at_directive(t)
            for d in at_diags:
                idx = raw.find(t)
                if idx >= 0:
                    d["start"] = idx
                    d["end"] = idx + len(t)
            out.extend(at_diags)

    try:
        _, actions = parse_page_layout(raw)
    except WiredError as e:
        msg = str(e)
        start, end, line, column = _span_for_page_layout_error(raw, msg)
        out.append(_diag("error", msg, start, end, line=line, column=column))
        return out
    for action in actions:
        body = str(action.get("constructor") or "")
        try:
            # Не валидируем arity до page-ref expansion, но syntax/markers должны
            # быть одинаково строги в Редакторе и в runtime.
            parse_script(body)
        except WiredError as e:
            marker = max(body.find(">?", 0), body.find(">@", 0))
            body_start = raw.find(body)
            start = body_start + max(marker, 0) if body_start >= 0 else 0
            end = start + (2 if marker >= 0 else max(1, len(body)))
            line, column = _line_col_at(raw, start)
            out.append(
                _diag(
                    "error",
                    f"Операция {action.get('id')}: {e}",
                    start,
                    end,
                    line=line,
                    column=column,
                )
            )
    return out


def _span_for_page_layout_error(
    text: str, message: str
) -> Tuple[int, int, Optional[int], Optional[int]]:
    """строка N: … / quoted token → абсолютный span + line/column."""
    if not text:
        return 0, 0, 1, 1
    line = _line_from_msg(message)
    lines = text.split("\n")
    if line is not None and 1 <= line <= len(lines):
        line_text = lines[line - 1]
        line_start = sum(len(lines[j]) + 1 for j in range(line - 1))
        stripped = line_text.lstrip()
        indent = len(line_text) - len(stripped)
        # Токен из сообщения (например 'вфц') — колонка внутрь строки.
        rel_s, rel_e = _token_span_in_text(stripped, message)
        if stripped and rel_e > rel_s and stripped[rel_s:rel_e] != stripped:
            abs_s = line_start + indent + rel_s
            abs_e = line_start + indent + rel_e
            return abs_s, abs_e, line, indent + rel_s + 1
        abs_s = line_start + indent
        abs_e = line_start + len(line_text.rstrip())
        if abs_e < abs_s:
            abs_e = abs_s
        return abs_s, abs_e, line, indent + 1
    # Fallback: ищем quoted-фрагмент во всём тексте.
    abs_s, abs_e = _token_span_in_text(text, message)
    if abs_e > abs_s and text[abs_s:abs_e] != text:
        ln, col = _line_col_at(text, abs_s)
        return abs_s, abs_e, ln, col
    return 0, len(text), 1, 1


_LET_LHS = re.compile(
    r"^(Пусть|Секрет)\s+(\S+)\s*=\s*",
    re.IGNORECASE,
)


def _duplicate_assignment_diag(
    src: str,
    leaf_start: int,
    leaf_end: int,
    assigned: Dict[str, int],
) -> Optional[Dict[str, Any]]:
    """Повтор Пусть/Секрет одного имени в скрипте → error."""
    m = _LET_LHS.match((src or "").strip())
    if not m:
        return None
    from core.pretty_data import _lhs_path

    try:
        path = _lhs_path(m.group(2).strip())
    except WiredError:
        return None
    prev = assigned.get(path)
    if prev is not None:
        return _diag(
            "error",
            f"Переменная ${{{path}}} уже объявлена (повторное Пусть/Секрет запрещено). "
            f"Первое объявление — лист около offset {prev}.",
            max(0, leaf_start),
            max(leaf_start, leaf_end),
        )
    assigned[path] = max(0, leaf_start)
    return None


def _scenario_body_offset(raw_full: str) -> Tuple[bool, str, int, Optional[Dict[str, Any]]]:
    """Failsafe `<!>` → (allowed, body, offset, error_diag|None)."""
    from core.scenario_failsafe import parse_scenario_failsafe_prefix

    try:
        allowed, body = parse_scenario_failsafe_prefix(raw_full)
    except WiredError as e:
        return False, raw_full, 0, _diag(
            "error", str(e), 0, min(3, len(raw_full)), line=1, column=1
        )
    if not allowed:
        return False, raw_full, 0, None
    if "\n" in raw_full:
        return True, body, raw_full.index("\n") + 1, None
    return True, body, len(raw_full), None


def _shift_diag_by_offset(
    d: Dict[str, Any], *, body_offset: int, raw_full: str
) -> Dict[str, Any]:
    d["start"] = int(d.get("start") or 0) + body_offset
    d["end"] = int(d.get("end") or 0) + body_offset
    if d.get("line") is not None and body_offset and "\n" in raw_full[:body_offset]:
        d["line"] = int(d["line"]) + 1
    return d


def _collect_action_leaf_diags(
    raw: str,
    nodes: List[Node],
    *,
    catalog: Dict[str, Any],
    body_offset: int,
    raw_full: str,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    assigned: Dict[str, int] = {}
    for action in iter_action_nodes(nodes):
        src = (getattr(action, "source_line", None) or action.constructor or "").strip()
        diags = validate_action_constructor(src or action.constructor, catalog=catalog)
        leaf_start = getattr(action, "source_start", -1)
        leaf_end = getattr(action, "source_end", -1)
        if leaf_start < 0:
            leaf_start, leaf_end, _, _ = _locate_in_script(raw, src)
        for d in diags:
            d["wirek"] = action.constructor
            abs_s, abs_e, line, column = _map_leaf_diag(
                raw, src, leaf_start, leaf_end, d
            )
            d["start"] = abs_s + body_offset
            d["end"] = abs_e + body_offset
            if line is not None:
                d["line"] = int(line) + (
                    1 if body_offset and "\n" in raw_full[:body_offset] else 0
                )
            if column is not None:
                d["column"] = column
            d.pop("_basis", None)
            out.append(d)
        dup = _duplicate_assignment_diag(src, leaf_start, leaf_end, assigned)
        if dup is not None:
            out.append(_shift_diag_by_offset(dup, body_offset=body_offset, raw_full=raw_full))
    return out


def validate_language_script(
    script: str, *, catalog: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """parse + проверка всех листьев AST (try/catch/finally/циклы)."""
    from core.language_parse import lint_bare_hash_selectors, parse_script
    from core.page_layout import looks_like_page_layout

    if looks_like_page_layout(script or ""):
        return validate_page_layout(script, catalog=catalog)

    catalog = catalog or get_catalog()
    raw_full = (script or "").replace("\r\n", "\n").replace("\r", "")
    allowed, raw, body_offset, failsafe_err = _scenario_body_offset(raw_full)
    if failsafe_err is not None:
        return [failsafe_err]

    out: List[Dict[str, Any]] = list(lint_bare_hash_selectors(raw_full))

    # Отделить @-директивы от исполняемого скрипта
    script_lines, at_lines = _filter_at_directive_lines(raw.split("\n") if raw else [])
    for at_line in at_lines:
        at_diags = _validate_at_directive(at_line)
        for d in at_diags:
            idx = raw_full.find(at_line)
            if idx >= 0:
                d["start"] = idx
                d["end"] = idx + len(at_line)
        out.extend(at_diags)
    raw = "\n".join(script_lines)

    if not raw.strip() and allowed:
        return out
    try:
        nodes = parse_script(raw)
    except WiredError as e:
        err = _shift_diag_by_offset(
            _diag_parse_error(raw, e), body_offset=body_offset, raw_full=raw_full
        )
        out.append(err)
        return out

    _annotate_action_spans(raw, nodes)
    out.extend(
        _collect_action_leaf_diags(
            raw,
            nodes,
            catalog=catalog,
            body_offset=body_offset,
            raw_full=raw_full,
        )
    )
    return out


def _data_step_marker_diag(wire: str) -> Optional[Dict[str, Any]]:
    try:
        leaf = LanguageEngine.parse_leaf(wire)
    except WiredError as e:
        return _diag("error", str(e), 0, 0)
    if not (leaf.failsafe or leaf.recover_constructors):
        return None
    if wire.lower().startswith("data|") or leaf.constructor.lower().startswith("data|"):
        return _diag("error", "Маркеры >? / >@ недопустимы в data-скрипте", 0, 0)
    return None


def validate_data_script(script: str, *, catalog: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Pretty/wire скрипт данных → diagnostics.
    Ловит маркеры >?/>@ на data-строках, битый pretty, неизвестный data|action.
    Language-скрипт (Если / ?…>…) — все листья AST, включая неисполняемый catch.
    """
    from core.language_parse import is_language_script, lint_bare_hash_selectors

    catalog = catalog or get_catalog()
    if is_language_script(script or ""):
        return validate_language_script(script, catalog=catalog)
    out: List[Dict[str, Any]] = list(lint_bare_hash_selectors(script or ""))
    try:
        steps = script_to_steps(script)
    except WiredError as e:
        out.append(_diag("error", str(e), 0, 0, line=_line_from_msg(str(e))))
        return out

    for step in steps:
        wire = step["constructor"]
        marker = _data_step_marker_diag(wire)
        if marker is not None:
            out.append(marker)
            continue
        for d in validate_constructor(wire, catalog=catalog):
            d["wirek"] = wire
            out.append(d)
    return out


def _diag(
    severity: str,
    message: str,
    start: int,
    end: int,
    *,
    line: Optional[int] = None,
    column: Optional[int] = None,
) -> Dict[str, Any]:
    item = {
        "severity": severity,
        "message": message,
        "start": start,
        "end": end,
    }
    if line is not None:
        item["line"] = line
    if column is not None:
        item["column"] = column
    return item


def _diag_parse_error(raw: str, err: WiredError) -> Dict[str, Any]:
    """LanguageParseError с pos → line/column; иначе не врать 1:1 без причины."""
    from core.language_parse import LanguageParseError, _strip_comments_keep_lines

    msg = str(err)
    line_hint = _line_from_msg(msg)
    pos = getattr(err, "pos", None) if isinstance(err, LanguageParseError) else None
    if isinstance(pos, int) and pos >= 0:
        cleaned = _strip_comments_keep_lines(raw)
        # pos из парсера — в cleaned; переносим line/col на исходный raw.
        c_line, c_col = _line_col_at(cleaned, pos)
        start = _offset_at_line_col(raw, c_line, c_col)
        end = min(len(raw), start + 1)
        line, column = _line_col_at(raw, start)
        return _diag("error", msg, start, end, line=line, column=column)
    if line_hint is not None:
        start = _offset_at_line_col(raw, line_hint, 1)
        return _diag("error", msg, start, start, line=line_hint, column=1)
    return _diag("error", msg, 0, 0, line=1, column=1)


def _offset_at_line_col(text: str, line: int, column: int) -> int:
    """1-based line/column → offset; clamp в пределы текста."""
    if not text:
        return 0
    lines = text.split("\n")
    li = max(1, min(line, len(lines))) - 1
    prefix = sum(len(lines[j]) + 1 for j in range(li))
    col = max(1, column) - 1
    return min(len(text), prefix + min(col, len(lines[li])))


def _locate_in_script(
    script: str, needle: str, *, from_pos: int = 0
) -> tuple[int, int, Optional[int], Optional[int]]:
    """Вхождение pretty-листа с from_pos → start/end/line/column (1-based)."""
    raw = (needle or "").strip()
    if not script or not raw:
        return 0, 0, None, None
    pos = max(0, from_pos)
    idx = script.find(raw, pos)
    if idx < 0:
        head = raw.splitlines()[0].strip() if raw else ""
        idx = script.find(head, pos) if head else -1
        if idx < 0:
            return 0, 0, None, None
        end = idx + len(head)
    else:
        end = idx + len(raw)
    line, col = _line_col_at(script, idx)
    return idx, end, line, col


def _line_col_at(script: str, offset: int) -> Tuple[int, int]:
    safe = max(0, min(offset, len(script)))
    line = script.count("\n", 0, safe) + 1
    col = safe - (script.rfind("\n", 0, safe) + 1) + 1
    return line, col


def _annotate_action_spans(script: str, nodes: List[Node]) -> None:
    """Последовательная разметка листьев в исходном тексте (дубликаты строк ок)."""
    cursor = 0
    for action in iter_action_nodes(nodes):
        src = (getattr(action, "source_line", None) or action.constructor or "").strip()
        if not src:
            continue
        start, end, line, _ = _locate_in_script(script, src, from_pos=cursor)
        if line is None or end < start:
            action.source_start = -1
            action.source_end = -1
            continue
        action.source_start = start
        action.source_end = end
        cursor = end


def _token_span_in_text(text: str, message: str) -> Tuple[int, int]:
    """Вытащить из сообщения quoted-токен и найти его в pretty-строке."""
    if not text:
        return 0, 0
    candidates: List[str] = []
    for m in re.finditer(r"'([^']{1,120})'", message or ""):
        candidates.append(m.group(1))
    for m in re.finditer(r'"([^"]{1,120})"', message or ""):
        candidates.append(m.group(1))
    # Короткие токены важнее целой строки (message часто цитирует primary целиком).
    candidates.sort(key=len)
    for tok in candidates:
        if not tok or tok == text:
            continue
        idx = text.find(tok)
        if idx >= 0:
            return idx, idx + len(tok)
    return 0, len(text)


def _map_leaf_diag(
    script: str,
    src: str,
    leaf_start: int,
    leaf_end: int,
    diag: Dict[str, Any],
) -> Tuple[int, int, Optional[int], Optional[int]]:
    """
    Смещения diag (относительно pretty src или wire) → абсолютные start/end + line/col.
    """
    if leaf_start < 0:
        return 0, 0, None, None
    if leaf_end <= leaf_start:
        leaf_end = leaf_start + len(src or "")

    rel_s = int(diag.get("start") or 0)
    rel_e = int(diag.get("end") or 0)
    basis = diag.get("_basis")
    wirek = str(diag.get("wirek") or "")

    # Wire-валидация: колонка в pretty неизвестна — якорь на начало листа.
    if basis == "wire" or (wirek and looks_like_wire(wirek) and wirek != src):
        abs_s, abs_e = leaf_start, leaf_end
    elif src and 0 <= rel_s <= len(src) and 0 <= rel_e <= len(src) + 1:
        abs_s = leaf_start + rel_s
        abs_e = leaf_start + max(rel_e, rel_s)
    else:
        abs_s, abs_e = leaf_start, leaf_end

    abs_s = max(0, min(abs_s, len(script)))
    abs_e = max(abs_s, min(abs_e, len(script)))
    line, col = _line_col_at(script, abs_s)
    return abs_s, abs_e, line, col


def _line_from_msg(message: str) -> Optional[int]:
    # "строка 11: …"
    if message.startswith("строка "):
        try:
            return int(message.split(":", 1)[0].split()[1])
        except (IndexError, ValueError):
            return None
    return None
