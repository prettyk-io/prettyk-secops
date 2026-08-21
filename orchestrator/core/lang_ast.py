# -*- coding: utf-8 -*-
"""AST узлы языка сценария (канон в манифесте/памяти)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Union


@dataclass
class ActionNode:
    kind: str = "action"
    constructor: str = ""
    save_as: str = ""
    # Исходная pretty-строка листа (RU MethodId) — заголовок STEP в Live.
    source_line: str = ""
    # Абсолютные смещения в тексте конструктора (−1 = ещё не размечено).
    source_start: int = -1
    source_end: int = -1


@dataclass
class IfBranch:
    condition: Optional[str]  # None = else
    body: List["Node"] = field(default_factory=list)


@dataclass
class IfNode:
    kind: str = "if"
    branches: List[IfBranch] = field(default_factory=list)


@dataclass
class LoopNode:
    kind: str = "loop"
    count: str = "1"  # Expr / литерал / ${n}
    body: List["Node"] = field(default_factory=list)


@dataclass
class ForeachNode:
    kind: str = "foreach"
    item: str = ""  # ${item} или k,v
    item2: Optional[str] = None  # для Словаря ${k}, ${v}
    iterable: str = ""
    body: List["Node"] = field(default_factory=list)


@dataclass
class WhileNode:
    kind: str = "while"
    condition: str = ""
    body: List["Node"] = field(default_factory=list)
    max_iterations: int = 10_000


@dataclass
class TryNode:
    kind: str = "try"
    try_body: List["Node"] = field(default_factory=list)
    catch_body: List["Node"] = field(default_factory=list)
    finally_body: List["Node"] = field(default_factory=list)


@dataclass
class GroupNode:
    kind: str = "group"
    title: str = ""
    body: List["Node"] = field(default_factory=list)


@dataclass
class PageCallNode:
    kind: str = "page_call"
    page: str = ""
    action: str = ""
    payload: Optional[str] = None  # expr: ${row} / литерал


@dataclass
class BreakNode:
    kind: str = "break"


@dataclass
class ContinueNode:
    kind: str = "continue"


Node = Union[
    ActionNode,
    IfNode,
    LoopNode,
    ForeachNode,
    WhileNode,
    TryNode,
    GroupNode,
    PageCallNode,
    BreakNode,
    ContinueNode,
]
