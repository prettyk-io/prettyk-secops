# -*- coding: utf-8 -*-
"""Парсер pretty language-скрипта → AST (канон)."""
from __future__ import annotations

import re
from typing import List, Optional, Tuple

from core.errors import WiredError
from core.lang_ast import (
    ActionNode,
    BreakNode,
    ContinueNode,
    ForeachNode,
    GroupNode,
    IfBranch,
    IfNode,
    LoopNode,
    Node,
    PageCallNode,
    TryNode,
    WhileNode,
)
from core.method_id import ensure_wire, resolve_line
from core.pretty_data import pretty_line_to_wire

_KEYWORD_HEAD = re.compile(
    r"^(Если|If|ИначеЕсли|ElseIf|Иначе|Else|Цикл|Loop|ДляКаждого|ForEach|Пока|While|Попробовать|Try|"
    r"Перехватить|Catch|Финализировать|Finally|Поймать|ВКонце|Группа|Group)\b"
)
_CATCH_HEAD = ("Перехватить", "Поймать", "Catch")
_FINALLY_HEAD = ("Финализировать", "ВКонце", "Finally")
# login.Войти  |  login.Заполнить ${row}
_PAGE_CALL = re.compile(
    r"^([A-Za-z_][A-Za-z0-9_]*)\.([^\s]+)(?:\s+(\S[\s\S]*))?$",
)
_CSS_HASH_CTX = re.compile(r"(?i)\bcss(?:\s+|\|)$")
# Без вложенных жадных классов — иначе Sonar S8786 (super-linear backtracking).
_FOREACH_NESTED_BINDER = re.compile(r"\$\{[^}.]+\.[^}]+\}")
_GROUP_QUOTED = re.compile(r'^(?:Группа|Group)\s+"([^"]*)"\s*(.*)$', re.DOTALL)
_GROUP_BARE = re.compile(r'^(?:Группа|Group)\s+(\S+)\s*(.*)$', re.DOTALL)
_LANG_KEYWORD_LINE = re.compile(
    r"(?:^|[\s{])(?:Если|If|Цикл|Loop|ДляКаждого|ForEach|Пока|While|Попробовать|Try|Группа|Group|Прервать|Break|"
    r"Продолжить|Continue|Пусть|Let|Секрет|Secret|Элемент|Локатор|Селектор|КоллекцияЭлементов|Операция)\b",
    re.M,
)
_TRY_MIRROR_LINE = re.compile(r"^\s*\?", re.M)


class LanguageParseError(WiredError):
    """Ошибка синтаксиса language-скрипта.

    ``pos`` — индекс в том буфере, где искали (обычно cleaned script).
    """

    def __init__(self, message: str, *, pos: Optional[int] = None) -> None:
        super().__init__(message)
        self.pos = pos


def _is_css_hash_context(line: str, pos: int) -> bool:
    """`#id` после `css ` / `css|` — селектор, не line-comment."""
    return bool(_CSS_HASH_CTX.search(line[:pos]))


def _is_url_hash_context(line: str, pos: int) -> bool:
    """`/#/register`, `http://x/#/y` — fragment URL, не line-comment."""
    return pos > 0 and line[pos - 1] == "/"


def _chunks_lstrip_startswith(chunks: List[str], prefix: str) -> bool:
    """Как ``''.join(chunks).lstrip().startswith(prefix)`` без полной склейки."""
    for chunk in chunks:
        stripped = chunk.lstrip()
        if not stripped:
            continue
        return stripped.startswith(prefix)
    return False


def _strip_hash_comment_line(line: str) -> str:
    """Одна строка без mid-line `#`-comment вне строк."""
    if "#" not in line:
        return line.rstrip()
    in_str = False
    quote = ""
    buf: List[str] = []
    i = 0
    while i < len(line):
        ch = line[i]
        if in_str:
            buf.append(ch)
            if ch == "\\" and i + 1 < len(line):
                buf.append(line[i + 1])
                i += 2
                continue
            if ch == quote:
                in_str = False
            i += 1
            continue
        if ch in ('"', "'"):
            in_str = True
            quote = ch
            buf.append(ch)
            i += 1
            continue
        if ch == "#":
            if _is_css_hash_context(line, i) or _is_url_hash_context(line, i):
                buf.append(ch)
                i += 1
                continue
            break
        buf.append(ch)
        i += 1
    return "".join(buf).rstrip()


def _strip_comments_keep_lines(text: str) -> str:
    """Убрать line-comment `#` вне строк (mid-line ок).

    Исключения: `css #id` / `css|#id`; URL-hash `/#/…`.
    `//` никогда не comment (xpath/URL/regex).
    """
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return "\n".join(_strip_hash_comment_line(line) for line in lines)


# MethodId / действия, у которых первый аргумент — тип локатора (css/xpath/…).
_BARE_HASH_METHOD_RE = re.compile(
    r"(?i)(?P<head>\b(?:Нажать(?:JS|ПоТексту|ПоИндексу|Правой|Дважды|Удерживая|Клавишу)?|"
    r"ВставитьЗначение|ОчиститьПоле|Навести|Выбрать(?:ПоТексту)?|"
    r"ПроверитьНаличиеЭлемента|ПроверитьВидимостьЭлемента|ПроверитьНевидимостьЭлемента|"
    r"ПроверитьЧекбокс|ТекстыЭлементов|ТекстыЭлементовСТекстом|КоличествоЭлементов|"
    r"ФильтрЭлементовПоТексту|ТекстЭлемента|АтрибутЭлемента)\s+)"
    r"#(?P<id>[A-Za-z_][\w-]*)"
)
_BARE_HASH_WIRE_RE = re.compile(
    r"(?i)\|(?P<act>click|click_js|click_element_by_(?:text|index)|double_click|right_click|"
    r"hold_click|send_keys|clear|hover|select(?:_by_text)?|"
    r"assert_element_(?:present|visible|not_visible)|assert_checkbox_checked|"
    r"get_elements_texts|get_elements_count|filter_elements_by_text|"
    r"get_text|get_attribute)\|#(?P<id>[A-Za-z_][\w-]*)"
)


def lint_bare_hash_selectors(text: str) -> List[dict]:
    """`Нажать #email` без `css` — ошибка (иначе `#` съест комментарий)."""
    raw = text or ""
    if not raw:
        return []
    diags: List[dict] = []
    for cre in (_BARE_HASH_METHOD_RE, _BARE_HASH_WIRE_RE):
        for m in cre.finditer(raw):
            sel = m.group("id")
            start, end = m.start(), m.end()
            diags.append(
                {
                    "severity": "error",
                    "message": (
                        f"Локатор «#{sel}»: укажите тип «css #{sel}» "
                        f"(без css символ # начинает комментарий)."
                    ),
                    "start": start,
                    "end": end,
                }
            )
    return diags


def _skip_ws(s: str, i: int) -> int:
    while i < len(s) and s[i] in " \t\n":
        i += 1
    return i


def _skip_string_or_ref(s: str, i: int) -> Optional[int]:
    """
    Если s[i] — начало строки / ${…} / {{…}}, вернуть индекс после.
    Иначе None. Критично: `}` внутри ${status} не закрывает блоки.
    """
    if i >= len(s):
        return None
    ch = s[i]
    if ch in ('"', "'"):
        quote = ch
        j = i + 1
        while j < len(s):
            if s[j] == "\\" and j + 1 < len(s):
                j += 2
                continue
            if s[j] == quote:
                return j + 1
            j += 1
        raise LanguageParseError("незакрытая строка", pos=i)
    if s.startswith("${", i):
        j = s.find("}", i + 2)
        if j < 0:
            raise LanguageParseError("незакрытая ссылка ${…}", pos=i)
        return j + 1
    if s.startswith("{{", i):
        j = s.find("}}", i + 2)
        if j < 0:
            raise LanguageParseError("незакрытая ссылка {{…}}", pos=i)
        return j + 2
    return None


def _match_brace_block(s: str, open_idx: int) -> Tuple[str, int]:
    """open_idx указывает на '{'. Возвращает (inner, index_after_closing)."""
    if open_idx >= len(s) or s[open_idx] != "{":
        raise LanguageParseError("ожидался блок { … }")
    depth = 0
    i = open_idx
    while i < len(s):
        skipped = _skip_string_or_ref(s, i)
        if skipped is not None:
            i = skipped
            continue
        ch = s[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return s[open_idx + 1 : i], i + 1
        i += 1
    raise LanguageParseError("незакрытый блок { … }")


def _find_block_start(s: str, from_i: int = 0) -> int:
    """Первая `{` блока, не из ${…}/{{…}}/строки."""
    i = _skip_ws(s, from_i)
    while i < len(s):
        skipped = _skip_string_or_ref(s, i)
        if skipped is not None:
            i = skipped
            continue
        if s[i] == "{":
            return i
        i += 1
    raise LanguageParseError("не найден блок { … }")


def _continues_after_closed_brace(s: str, j: int, buf: List[str]) -> bool:
    """После `}` на depth=0: ждём Иначе*/catch/finally или зеркала try `> {` / `>! {`."""
    for kw in ("ИначеЕсли", "Иначе", *_CATCH_HEAD, *_FINALLY_HEAD):
        if s.startswith(kw, j):
            return True
    if not _chunks_lstrip_startswith(buf, "?"):
        return False
    if s.startswith(">!", j):
        return True
    return bool(
        s.startswith(">", j)
        and not s.startswith(">?", j)
        and not s.startswith(">@", j)
    )


def _flush_statement(buf: List[str], stmts: List[str]) -> None:
    text = "".join(buf).strip()
    buf.clear()
    if text:
        stmts.append(text)


def _handle_close_brace(
    s: str, i: int, depth: int, buf: List[str], stmts: List[str]
) -> tuple[int, int]:
    depth -= 1
    buf.append("}")
    i += 1
    if depth != 0:
        return i, depth
    j = _skip_ws(s, i)
    cont = _continues_after_closed_brace(s, j, buf)
    if not cont:
        _flush_statement(buf, stmts)
    return (j if cont else i), depth


def _split_top_level_statements(s: str) -> List[str]:
    """Режет скрипт на top-level statements (учёт {} / ${} / строк)."""
    if not (s or "").strip():
        return []
    # Не strip() весь буфер — иначе pos в LanguageParseError съезжает к 1:1.
    stmts: List[str] = []
    buf: List[str] = []
    i = 0
    depth = 0
    n = len(s)

    while i < n:
        skipped = _skip_string_or_ref(s, i)
        if skipped is not None:
            buf.append(s[i:skipped])
            i = skipped
            continue
        ch = s[i]
        if ch == "{":
            depth += 1
            buf.append(ch)
            i += 1
            continue
        if ch == "}":
            i, depth = _handle_close_brace(s, i, depth, buf, stmts)
            continue
        if ch == "\n" and depth == 0:
            peek = "".join(buf).strip()
            if peek and not _looks_like_open_construct(peek):
                _flush_statement(buf, stmts)
            else:
                buf.append(ch)
            i += 1
            continue
        buf.append(ch)
        i += 1
    _flush_statement(buf, stmts)
    return stmts


def _looks_like_open_construct(peek: str) -> bool:
    head = peek.lstrip()
    if head.startswith("?"):
        # Блочный ? { … } — ждём скобки. Линейный ? A > B >! C — одна строка.
        if head == "?" or head.startswith("?{"):
            return True
        stripped = head.rstrip()
        # После секции } > / } >! ждём следующий { … }
        if stripped.endswith(">!") or stripped.endswith(">"):
            return True
        return "{" in head and head.count("{") > head.count("}")
    m = _KEYWORD_HEAD.match(head)
    if not m:
        return False
    return "{" in head and head.count("{") > head.count("}")


def parse_script(text: str) -> List[Node]:
    cleaned = _strip_comments_keep_lines(text or "")
    stmts = _split_top_level_statements(cleaned)
    nodes: List[Node] = []
    cursor = 0
    for st in stmts:
        idx = cleaned.find(st, cursor)
        if idx < 0:
            idx = cleaned.find(st)
        try:
            nodes.append(_parse_statement(st))
        except LanguageParseError as e:
            if e.pos is not None and idx is not None and idx >= 0:
                e.pos = idx + int(e.pos)
            raise
        if idx is not None and idx >= 0:
            cursor = idx + max(len(st), 1)
    return nodes


def _try_pretty_wire(st: str) -> Optional[Tuple[str, Optional[str]]]:
    try:
        return pretty_line_to_wire(st)
    except WiredError:
        return None


def _action_node(
    constructor: str,
    source_line: str = "",
    save_as: str = "",
) -> ActionNode:
    """ActionNode с сохранением исходной pretty-строки для diary/Live."""
    src = (source_line or "").strip()
    return ActionNode(
        constructor=constructor,
        save_as=save_as or "",
        source_line=src or constructor,
    )


def language_script_is_single_action(script: str) -> bool:
    """True, если скрипт — ровно один action-лист (без блоков)."""
    text = (script or "").strip()
    if not text or not is_language_script(text):
        return False
    try:
        nodes = parse_script(text)
    except LanguageParseError:
        return False
    return len(nodes) == 1 and isinstance(nodes[0], ActionNode)


def leaf_source_description(source_line: str) -> str:
    """Человекочитаемая подпись листа из pretty-строки (не wire)."""
    from core.method_id import looks_like_wire

    src = (source_line or "").strip()
    if not src or looks_like_wire(src):
        return ""
    if len(src) > 160 or "\n" in src:
        return ""
    return src


def diary_human_title(text: str) -> str:
    """
    Строка для левой части diary STEP: description или одна pretty-строка.
    Не wire, не многстрочный language-скрипт.
    """
    from core.method_id import looks_like_wire

    t = (text or "").strip()
    if not t or len(t) > 160 or "\n" in t:
        return ""
    if looks_like_wire(t):
        return ""
    if t.startswith(
        ("scanner|", "scanner|", "webdriver|", "core|", "data|", "browser|", "http|", "allure|")
    ):
        return ""
    if " scanner " in t:
        return ""
    if is_language_script(t) and not language_script_is_single_action(t):
        return ""
    return t


def _parse_control_statement(st: str) -> Optional[Node]:
    """Keyword / try / break|continue; иначе None → action/page-call."""
    if st.startswith("?"):
        rest = st[1:].lstrip()
        if rest.startswith("{"):
            return _parse_try_block_mirrors(st)
        return _parse_linear_try(st)
    if st.startswith("Если") or st.startswith("If"):
        return _parse_if(st)
    if st.startswith("Цикл") or st.startswith("Loop"):
        return _parse_loop(st)
    if st.startswith("ДляКаждого") or st.startswith("ForEach"):
        return _parse_foreach(st)
    if st.startswith("Пока") or st.startswith("While"):
        return _parse_while(st)
    if st.startswith("Попробовать") or st.startswith("Try"):
        return _parse_try_block(st)
    if st.startswith("Группа") or st.startswith("Group"):
        return _parse_group(st)
    if st == "Прервать" or st == "Break":
        return BreakNode()
    if st == "Продолжить" or st == "Continue":
        return ContinueNode()
    return None


def _parse_statement(st: str) -> Node:
    st = st.strip()
    if not st:
        raise LanguageParseError("пустой statement")
    control = _parse_control_statement(st)
    if control is not None:
        return control
    page_call = _try_page_call(st)
    if page_call is not None:
        return page_call
    wire_pair = _try_pretty_wire(st)
    if wire_pair is not None:
        wire, save_as = wire_pair
        return _action_node(wire, source_line=st, save_as=save_as or "")
    mid = resolve_line(st)
    if mid is not None:
        return _action_node(mid, source_line=st)
    from core.wire_split import split_save_as_arrow

    wire, save_as = split_save_as_arrow(st)
    return _action_node(wire, source_line=st, save_as=save_as or "")


def _try_page_call(st: str) -> Optional[PageCallNode]:
    s = st.strip()
    first = s.split(None, 1)[0] if s else ""
    if "|" in first:
        return None  # wire component|action|…
    m = _PAGE_CALL.match(s)
    if not m:
        return None
    page, action, payload = m.group(1), m.group(2), m.group(3)
    if action.startswith("${") or action.startswith("{{"):
        return None
    if payload and payload.lstrip().startswith((">?", ">@")):
        raise LanguageParseError(
            "Маркеры >? / >@ нельзя ставить на page action. "
            "Поставь их на лист внутри Операции или оберни page action в Попробовать."
        )
    return PageCallNode(
        page=page,
        action=action,
        payload=payload.strip() if payload else None,
    )


def _parse_linear_try(st: str) -> TryNode:
    rest = st[1:].strip()
    finally_s: Optional[str] = None
    if " >! " in rest:
        rest, finally_s = rest.rsplit(" >! ", 1)
        finally_s = finally_s.strip()
    catch_s: Optional[str] = None
    if " > " in rest:
        try_s, catch_s = rest.split(" > ", 1)
        try_s, catch_s = try_s.strip(), catch_s.strip()
    else:
        try_s = rest.strip()
    if not try_s:
        raise LanguageParseError("линейный try: пустой primary")
    return TryNode(
        try_body=[_action_node(ensure_wire(try_s), source_line=try_s)],
        catch_body=[_action_node(ensure_wire(catch_s), source_line=catch_s)] if catch_s else [],
        finally_body=[_action_node(ensure_wire(finally_s), source_line=finally_s)] if finally_s else [],
    )


def _next_if_mode(s: str, i: int, first: bool) -> tuple[str, int]:
    if first:
        if s.startswith("Если", i):
            return "if", i + len("Если")
        if s.startswith("If", i):
            return "if", i + len("If")
        raise LanguageParseError("ожидалось Если/If")
    if s.startswith("ИначеЕсли", i):
        return "elif", i + len("ИначеЕсли")
    if s.startswith("ElseIf", i):
        return "elif", i + len("ElseIf")
    if s.startswith("Иначе", i):
        return "else", i + len("Иначе")
    if s.startswith("Else", i):
        return "else", i + len("Else")
    raise LanguageParseError(f"в цепочке Если неожиданно: {s[i:i+20]!r}")


def _parse_if_condition(s: str, i: int) -> tuple[str, int, str]:
    brace = _find_block_start(s, i)
    cond_raw = s[i:brace].strip()
    if cond_raw.endswith(" То"):
        cond_raw = cond_raw[: -len(" То")].rstrip()
    elif cond_raw.endswith("То"):
        cond_raw = cond_raw[:-2].rstrip()
    elif cond_raw.endswith(" Then"):
        cond_raw = cond_raw[: -len(" Then")].rstrip()
    elif cond_raw.endswith("Then"):
        cond_raw = cond_raw[:-4].rstrip()
    if not cond_raw:
        raise LanguageParseError("пустое условие Если/If")
    body_s, nxt = _match_brace_block(s, brace)
    return cond_raw, nxt, body_s


def _parse_if(st: str) -> IfNode:
    branches: List[IfBranch] = []
    i = 0
    s = st
    first = True
    while i < len(s):
        i = _skip_ws(s, i)
        if i >= len(s):
            break
        mode, i = _next_if_mode(s, i, first)
        first = False
        i = _skip_ws(s, i)
        cond: Optional[str] = None
        if mode != "else":
            cond, i, body_s = _parse_if_condition(s, i)
            branches.append(IfBranch(condition=cond, body=parse_script(body_s)))
            continue
        else:
            brace = _find_block_start(s, i)
            body_s, i = _match_brace_block(s, brace)
        branches.append(IfBranch(condition=cond, body=parse_script(body_s)))
    if not branches:
        raise LanguageParseError("пустое Если")
    return IfNode(branches=branches)


def _parse_loop(st: str) -> LoopNode:
    if st.startswith("Loop"):
        keyword = "Loop"
    elif st.startswith("Цикл"):
        keyword = "Цикл"
    else:
        raise LanguageParseError("Цикл/Loop: синтаксис Цикл N { … }")
    rest = st[len(keyword):].strip()
    brace = _find_block_start(rest, 0)
    count = rest[:brace].strip()
    if not count:
        raise LanguageParseError(f"{keyword}: нет числа/выражения")
    body_s, _ = _match_brace_block(rest, brace)
    return LoopNode(count=count, body=parse_script(body_s))


def _parse_foreach(st: str) -> ForeachNode:
    # ДляКаждого ${item} В ${list} { }
    # ДляКаждого ${k}, ${v} В ${map} { }
    # ForEach ${item} In ${list} { }
    if st.startswith("ForEach"):
        keyword = "ForEach"
        marker = " In "
    elif st.startswith("ДляКаждого"):
        keyword = "ДляКаждого"
        marker = " В "
    else:
        raise LanguageParseError("ДляКаждого/ForEach: ожидалось ключевое слово")
    rest = st[len(keyword):].strip()
    idx = rest.find(marker)
    if idx < 0:
        raise LanguageParseError(
            f"{keyword}: синтаксис {keyword} ${{item}} {marker.strip()} ${{list}} {{ … }}"
        )
    binders = rest[:idx].strip()
    after = rest[idx + len(marker) :].strip()
    brace = _find_block_start(after, 0)
    iterable = after[:brace].strip()
    body_s, _ = _match_brace_block(after, brace)
    if _FOREACH_NESTED_BINDER.search(binders):
        raise LanguageParseError(
            "ДляКаждого: нельзя ${names.item} — используйте ${item} В ${names}"
        )
    item2 = None
    if "," in binders:
        parts = [p.strip() for p in binders.split(",", 1)]
        item, item2 = parts[0], parts[1]
    else:
        item = binders
    return ForeachNode(
        item=item, item2=item2, iterable=iterable, body=parse_script(body_s)
    )


def _parse_while(st: str) -> WhileNode:
    if st.startswith("While"):
        keyword = "While"
    elif st.startswith("Пока"):
        keyword = "Пока"
    else:
        raise LanguageParseError("Пока/While: синтаксис Пока условие { … }")
    rest = st[len(keyword):].strip()
    brace = _find_block_start(rest, 0)
    cond = rest[:brace].strip()
    if cond.endswith(" То"):
        cond = cond[: -len(" То")].rstrip()
    elif cond.endswith(" Then"):
        cond = cond[: -len(" Then")].rstrip()
    body_s, _ = _match_brace_block(rest, brace)
    return WhileNode(condition=cond, body=parse_script(body_s))


def _parse_try_block(st: str) -> TryNode:
    i = 0
    s = st
    if s.startswith("Try"):
        i = len("Try")
    elif s.startswith("Попробовать"):
        i = len("Попробовать")
    else:
        raise LanguageParseError("ожидалось Попробовать/Try")
    i = _skip_ws(s, i)
    brace = _find_block_start(s, i)
    try_s, i = _match_brace_block(s, brace)
    catch_s = ""
    finally_s = ""
    i = _skip_ws(s, i)
    for kw in _CATCH_HEAD:
        if s.startswith(kw, i):
            i += len(kw)
            i = _skip_ws(s, i)
            brace = _find_block_start(s, i)
            catch_s, i = _match_brace_block(s, brace)
            i = _skip_ws(s, i)
            break
    for kw in _FINALLY_HEAD:
        if s.startswith(kw, i):
            i += len(kw)
            i = _skip_ws(s, i)
            brace = _find_block_start(s, i)
            finally_s, i = _match_brace_block(s, brace)
            break
    return TryNode(
        try_body=parse_script(try_s),
        catch_body=parse_script(catch_s) if catch_s.strip() else [],
        finally_body=parse_script(finally_s) if finally_s.strip() else [],
    )


def _match_brace_after_marker(
    s: str, i: int, marker: str, *, err: str
) -> tuple[str, int]:
    i = _skip_ws(s, i + len(marker))
    if i >= len(s) or s[i] != "{":
        raise LanguageParseError(err)
    return _match_brace_block(s, i)


def _parse_try_block_mirrors(st: str) -> TryNode:
    """
    Зеркала Попробовать/Перехватить/Финализировать:

      ? { … } > { … } >! { … }
    """
    s = st.strip()
    if not s.startswith("?"):
        raise LanguageParseError("ожидалось ? { … }")
    i = _skip_ws(s, 1)
    if i >= len(s) or s[i] != "{":
        raise LanguageParseError("блочный try: после ? ожидался { … }")
    try_s, i = _match_brace_block(s, i)
    catch_s = ""
    finally_s = ""
    i = _skip_ws(s, i)
    if s.startswith(">!", i):
        finally_s, i = _match_brace_after_marker(
            s, i, ">!", err="блочный try: после >! ожидался { … }"
        )
    elif s.startswith(">", i) and not s.startswith(">?", i) and not s.startswith(">@", i):
        catch_s, i = _match_brace_after_marker(
            s, i, ">", err="блочный try: после > ожидался { … }"
        )
        i = _skip_ws(s, i)
        if s.startswith(">!", i):
            finally_s, i = _match_brace_after_marker(
                s, i, ">!", err="блочный try: после >! ожидался { … }"
            )
    return TryNode(
        try_body=parse_script(try_s),
        catch_body=parse_script(catch_s) if catch_s.strip() else [],
        finally_body=parse_script(finally_s) if finally_s.strip() else [],
    )


def _parse_group(st: str) -> GroupNode:
    m = _GROUP_QUOTED.match(st)
    if not m:
        m2 = _GROUP_BARE.match(st)
        if not m2:
            raise LanguageParseError('Группа/Group: Группа "title" { … }')
        title, rest = m2.group(1), m2.group(2).strip()
    else:
        title, rest = m.group(1), m.group(2).strip()
    brace = _find_block_start(rest, 0)
    body_s, _ = _match_brace_block(rest, brace)
    return GroupNode(title=title, body=parse_script(body_s))


def _is_failsafe_marker_line(ln: str) -> bool:
    return ln == "<!>" or (ln.startswith("<!>") and not ln[3:].strip())


def _line_is_language_leaf(ln: str) -> bool:
    """MethodId / page.action / pretty-data — одна непустая строка."""
    from core.method_id import looks_like_wire

    if _is_failsafe_marker_line(ln) or looks_like_wire(ln):
        return False
    head = ln.split(None, 1)[0] if ln else ""
    if "|" not in head and _PAGE_CALL.match(ln):
        return True
    if resolve_line(ln) is not None:
        return True
    try:
        return pretty_line_to_wire(ln) is not None
    except WiredError:
        return False


def is_language_script(text: str) -> bool:
    """Эвристика: скрипт содержит языковые конструкции / блоки / макет страницы."""
    if not text or not str(text).strip():
        return False
    t = str(text)
    from core.page_layout import looks_like_page_layout

    if looks_like_page_layout(t):
        return True
    if _LANG_KEYWORD_LINE.search(t):
        return True
    # Любой try (`? …`) — language, не wire.
    if _TRY_MIRROR_LINE.search(t):
        return True

    # MethodId / page.action / pretty-data — по любой непустой строке.
    # Иначе `Лог …\nlogin.Войти` схлопывается в wire и орёт про component|action.
    # Чистый wire (`data|…`, `webdriver|…`) — не language (иначе рекурсия
    # validate_constructor ↔ validate_language_script через pretty_line_to_wire).
    lines = [
        ln.strip()
        for ln in t.splitlines()
        if ln.strip() and not ln.strip().startswith("#")
    ]
    return any(_line_is_language_leaf(ln) for ln in lines)
