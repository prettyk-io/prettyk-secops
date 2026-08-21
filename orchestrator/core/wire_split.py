# -*- coding: utf-8 -*-
"""
Разбор wire `component|action|args…` с учётом кавычек и ${…}.

Обычный str.split('|') ломает литералы вроде "|" внутри Склеить / let.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

def split_save_as_arrow(text: str) -> Tuple[str, Optional[str]]:
    """
    Снять хвостовой ` → name` / ` -> name` с wire (контракт FE runtime flatten).

    Возвращает (wire_без_стрелки, save_as|None). Не wire (нет `|`) — без изменений.
    Linear scan — без nested-quantifier regex (S8786).
    """
    s = (text or "").strip()
    if not s or "|" not in s:
        return s, None
    arrow = "→"
    idx = s.rfind(arrow)
    if idx < 0:
        idx = s.rfind("->")
        arrow = "->"
    if idx < 0:
        return s, None
    wire = s[:idx].rstrip()
    name = s[idx + len(arrow) :].strip()
    if not wire or "|" not in wire:
        return s, None
    if not name or not (name[0].isalpha() or name[0] == "_"):
        return s, None
    for ch in name[1:]:
        if not (ch.isalnum() or ch in "._"):
            return s, None
    return wire, name


def _advance_in_string(s: str, i: int, in_str: str, buf: List[str]) -> tuple[int, str | None]:
    ch = s[i]
    buf.append(ch)
    if ch == "\\" and i + 1 < len(s):
        buf.append(s[i + 1])
        return i + 2, in_str
    if ch == in_str:
        return i + 1, None
    return i + 1, in_str


def _consume_interpolation(s: str, i: int, buf: List[str]) -> int | None:
    """Return new index, or None if remainder was appended (caller should stop)."""
    j = s.find("}", i + 2)
    if j < 0:
        buf.append(s[i:])
        return None
    buf.append(s[i : j + 1])
    return j + 1


def split_wire(text: str) -> List[str]:
    """Сегменты по `|` вне кавычек и вне `${…}`."""
    s = text or ""
    out: List[str] = []
    buf: List[str] = []
    i = 0
    n = len(s)
    in_str: str | None = None
    while i < n:
        ch = s[i]
        if in_str is not None:
            i, in_str = _advance_in_string(s, i, in_str, buf)
            continue
        if ch in "\"'":
            in_str = ch
            buf.append(ch)
            i += 1
            continue
        if s.startswith("${", i):
            nxt = _consume_interpolation(s, i, buf)
            if nxt is None:
                break
            i = nxt
            continue
        if ch == "|":
            out.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    out.append("".join(buf))
    return out


def wire_segments(text: str) -> List[Dict[str, int]]:
    """Смещения сегментов (как split, но с start/end) — для diagnostics."""
    s = text or ""
    segs: List[Dict[str, int]] = []
    start = 0
    i = 0
    n = len(s)
    in_str: str | None = None
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
            i += 1
            continue
        if s.startswith("${", i):
            j = s.find("}", i + 2)
            if j < 0:
                break
            i = j + 1
            continue
        if ch == "|":
            segs.append({"start": start, "end": i})
            start = i + 1
            i += 1
            continue
        i += 1
    segs.append({"start": start, "end": n})
    return segs
