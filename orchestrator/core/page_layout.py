# -*- coding: utf-8 -*-
"""
Макет страницы → elements[] / actions[] для PageResolver.

Элемент email = css #email
Элемент $email = css #email   # $ допустим, канон — без
КоллекцияЭлементов rows = css .row
Операция Войти {
  Нажать $submit
}
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from core.errors import WiredError
from core.expr import LocatorDesc, parse_locator_text

_DECL_HEAD = re.compile(
    r"^(Элемент|Локатор|Селектор|КоллекцияЭлементов)\s+"
    r"\$?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S[\s\S]*)$"
)
_SLOT_TAIL = re.compile(r"(?i)\s+slot\s+(\S+)$")
_ACTION_HEAD = re.compile(r"^Операция\s+(\S+)\s*\{")

# Канон верхнего уровня (§6.2). Локатор/Селектор парсим как синонимы Элемент — в hint не светятся.
_PAGE_LAYOUT_EXPECT = (
    "На верхнем уровне: Элемент|КоллекцияЭлементов имя = … "
    "или Операция Имя { … }. "
    "Внутри Операция — Пусть/Секрет и шаги MethodId"
)

# Не сахаррить в $… даже если вдруг id элемента совпал.
_NO_SUGAR_TOKENS = frozenset(
    {
        "css",
        "xpath",
        "id",
        "name",
        "class",
        "class_name",
        "tag",
        "tag_name",
        "link",
        "link_text",
        "partial_link",
        "partial_link_text",
        "text",
        "contains_text",
        "text_contains",
        "true",
        "false",
        "null",
        "none",
    }
)


def looks_like_page_layout(text: str) -> bool:
    """Макет страницы: Элемент/КоллекцияЭлементов = … или Операция Name {."""
    if not text or not str(text).strip():
        return False
    for raw in str(text).splitlines():
        st = raw.strip()
        if not st or st.startswith("#") or st.startswith("@"):
            continue
        if re.match(
            r"^(Элемент|Локатор|Селектор|КоллекцияЭлементов)\s+"
            r"\$?[A-Za-z_][A-Za-z0-9_]*\s*=",
            st,
        ):
            return True
        if re.match(r"^Операция\s+\S+\s*\{", st):
            return True
    return False


def _parse_page_action(
    st: str,
    act_m: re.Match,
    lines: List[str],
    i: int,
    line_no: int,
    seen_act: set[str],
) -> tuple[dict, int]:
    action_id = act_m.group(1)
    after_brace = st[act_m.end() - 1 :]
    try:
        body, nxt, suffix = _consume_brace_block(after_brace, lines, i)
    except WiredError as exc:
        raise WiredError(f"строка {line_no}: {exc}") from exc
    if suffix:
        raise WiredError(
            f"строка {line_no}: после Операция {action_id} {{ … }} "
            f"недопустим хвост {suffix!r}. "
            "Маркеры >? / >@ применяются к листу внутри Операции, "
            "не к объявлению page action."
        )
    if action_id in seen_act:
        raise WiredError(
            f"строка {line_no}: Макет страницы: дубль Операция {action_id}"
        )
    seen_act.add(action_id)
    return (
        {
            "id": action_id,
            "description": action_id,
            "constructor": body.strip(),
        },
        nxt,
    )


def _parse_page_element(
    st: str, decl_m: re.Match, line_no: int, seen_el: set[str]
) -> dict:
    kind_word, el_id, rhs = decl_m.group(1), decl_m.group(2), decl_m.group(3).strip()
    if el_id in seen_el:
        raise WiredError(
            f"строка {line_no}: Макет страницы: дубль элемента {el_id}"
        )
    seen_el.add(el_id)
    slot, rhs_loc = _split_slot(rhs)
    collection = kind_word == "КоллекцияЭлементов"
    try:
        loc = parse_locator_text(rhs_loc, collection=collection)
    except WiredError as exc:
        raise WiredError(
            f"строка {line_no}: Макет страницы ({el_id}): {exc}"
        ) from exc
    elem: Dict[str, Any] = {
        "id": el_id,
        "constructor": loc.as_wire(),
    }
    if slot is not None:
        elem["slot"] = slot
    if collection:
        elem["collection"] = True
    return elem


def parse_page_layout(text: str) -> Tuple[List[dict], List[dict]]:
    """Разобрать constructor макета → (elements, actions)."""
    if not text or not str(text).strip():
        return [], []
    lines = str(text).replace("\r\n", "\n").replace("\r", "\n").split("\n")
    elements: List[dict] = []
    actions: List[dict] = []
    seen_el: set[str] = set()
    seen_act: set[str] = set()
    i = 0
    while i < len(lines):
        st = lines[i].strip()
        i += 1
        if not st or st.startswith("#") or st.startswith("@"):
            continue
        line_no = i
        act_m = _ACTION_HEAD.match(st)
        if act_m:
            action, i = _parse_page_action(st, act_m, lines, i, line_no, seen_act)
            actions.append(action)
            continue
        decl_m = _DECL_HEAD.match(st)
        if decl_m:
            elements.append(_parse_page_element(st, decl_m, line_no, seen_el))
            continue
        raise WiredError(
            f"строка {line_no}: Макет страницы: непонятная строка {st!r}. "
            f"{_PAGE_LAYOUT_EXPECT}"
        )
    el_ids = {str(e["id"]) for e in elements if e.get("id")}
    for act in actions:
        body = act.get("constructor") or ""
        act["constructor"] = sugar_page_element_refs(body, el_ids)
    return elements, actions


def _sugar_copy_quoted(body: str, i: int, out: List[str]) -> int:
    quote = body[i]
    out.append(quote)
    i += 1
    n = len(body)
    while i < n:
        c = body[i]
        out.append(c)
        if c == "\\" and i + 1 < n:
            out.append(body[i + 1])
            i += 2
            continue
        i += 1
        if c == quote:
            break
    return i


def _sugar_copy_dollar(body: str, i: int, out: List[str]) -> int:
    # Уже канон $name / ${name} — не трогаем (иначе ${email} → ${$email}).
    out.append("$")
    i += 1
    n = len(body)
    if i < n and body[i] == "{":
        out.append("{")
        i += 1
        while i < n and body[i] != "}":
            out.append(body[i])
            i += 1
        if i < n and body[i] == "}":
            out.append("}")
            i += 1
        return i
    while i < n and body[i].isascii() and (body[i].isalnum() or body[i] in "_.[]"):
        out.append(body[i])
        i += 1
    return i


def _sugar_copy_ident(body: str, i: int, out: List[str], ids: set[str]) -> int:
    n = len(body)
    j = i + 1
    while j < n and body[j].isascii() and (body[j].isalnum() or body[j] == "_"):
        j += 1
    tok = body[i:j]
    out.append(f"${tok}" if tok in ids else tok)
    return j


def _sugar_skip_hash_comment(body: str, i: int, out: List[str]) -> int:
    n = len(body)
    while i < n and body[i] != "\n":
        out.append(body[i])
        i += 1
    return i


def sugar_page_element_refs(body: str, element_ids: set[str]) -> str:
    """
    В теле Операции голый id элемента → $id (сахар).

    Канон по-прежнему $email / ${email}. Голое email удобно в «классе» страницы:
    Нажать submit → Нажать $submit → expand в css|….
    Вне строк/комментариев; стратегии css/id/… не трогаем.
    """
    ids = {
        i
        for i in element_ids
        if i and i.isidentifier() and i.lower() not in _NO_SUGAR_TOKENS
    }
    if not body or not ids:
        return body
    out: List[str] = []
    i = 0
    n = len(body)
    while i < n:
        ch = body[i]
        if ch in "\"'":
            i = _sugar_copy_quoted(body, i, out)
            continue
        if ch == "#":
            i = _sugar_skip_hash_comment(body, i, out)
            continue
        if ch == "$":
            i = _sugar_copy_dollar(body, i, out)
            continue
        if ch.isascii() and (ch.isalpha() or ch == "_"):
            i = _sugar_copy_ident(body, i, out, ids)
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def materialize_page(page: Any) -> dict:
    """
    Слить constructor-макет с legacy elements/actions.
    Макет задаёт/перекрывает id; legacy дополняет отсутствующие.
    """
    if page is None:
        return {}
    if hasattr(page, "model_dump"):
        d = page.model_dump()
    elif isinstance(page, dict):
        d = dict(page)
    else:
        d = dict(page)
    ctor = d.get("constructor") or ""
    layout_els: List[dict] = []
    layout_acts: List[dict] = []
    if isinstance(ctor, str) and ctor.strip():
        layout_els, layout_acts = parse_page_layout(ctor)
    d["elements"] = _merge_by_id(layout_els, d.get("elements") or [])
    d["actions"] = _merge_by_id(layout_acts, d.get("actions") or [])
    return d


def _merge_by_id(primary: List[dict], legacy: List[dict]) -> List[dict]:
    out: List[dict] = []
    seen: set[str] = set()
    for item in primary:
        iid = item.get("id")
        if iid:
            seen.add(str(iid))
        out.append(item)
    for item in legacy:
        if not isinstance(item, dict):
            if hasattr(item, "model_dump"):
                item = item.model_dump()
            else:
                continue
        iid = item.get("id")
        if iid is not None and str(iid) in seen:
            continue
        if iid is not None:
            seen.add(str(iid))
        out.append(item)
    return out


def _split_slot(rhs: str) -> Tuple[Optional[Any], str]:
    m = _SLOT_TAIL.search(rhs)
    if not m:
        return None, rhs.strip()
    raw = m.group(1).strip().strip("\"'")
    try:
        slot: Any = int(raw)
    except ValueError:
        slot = raw
    return slot, rhs[: m.start()].strip()


def _brace_scan_step(
    buf: str,
    i_ch: int,
    *,
    depth: int,
    in_str: bool,
    quote: str,
    start_body: int,
) -> Tuple[int, int, bool, str, int, Optional[Tuple[str, str]]]:
    """
    Один символ в буфере brace-блока.
    Возврат: i_ch, depth, in_str, quote, start_body, done|(body, tail)|None
    """
    ch = buf[i_ch]
    if in_str:
        if ch == "\\" and i_ch + 1 < len(buf):
            return i_ch + 2, depth, in_str, quote, start_body, None
        if ch == quote:
            in_str = False
        return i_ch + 1, depth, in_str, quote, start_body, None
    if ch in "\"'":
        return i_ch + 1, depth, True, ch, start_body, None
    if ch == "{":
        depth += 1
        if depth == 1:
            start_body = i_ch + 1
        return i_ch + 1, depth, in_str, quote, start_body, None
    if ch == "}":
        depth -= 1
        if depth == 0:
            body = buf[start_body:i_ch]
            return i_ch, depth, in_str, quote, start_body, (body, buf[i_ch + 1 :].strip())
        return i_ch + 1, depth, in_str, quote, start_body, None
    return i_ch + 1, depth, in_str, quote, start_body, None


def _consume_brace_block(
    from_brace: str, lines: List[str], next_i: int
) -> Tuple[str, int, str]:
    """
    from_brace начинается с '{'. Вернуть тело, новый индекс и хвост после `}`.
    """
    buf = from_brace
    depth = 0
    in_str = False
    quote = ""
    start_body = -1
    i_ch = 0
    while True:
        while i_ch < len(buf):
            i_ch, depth, in_str, quote, start_body, done = _brace_scan_step(
                buf,
                i_ch,
                depth=depth,
                in_str=in_str,
                quote=quote,
                start_body=start_body,
            )
            if done is not None:
                body, tail = done
                return body, next_i, tail
        if next_i >= len(lines):
            raise WiredError("Макет страницы: незакрытая Операция { … }")
        buf += "\n" + lines[next_i]
        next_i += 1


# re-export for tests
__all__ = [
    "parse_page_layout",
    "materialize_page",
    "looks_like_page_layout",
    "sugar_page_element_refs",
    "LocatorDesc",
]
