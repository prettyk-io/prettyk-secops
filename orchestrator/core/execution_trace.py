"""Независимая трасса фактического исполнения сценария."""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, field
from time import monotonic
from typing import Iterator, List, Optional


@dataclass
class TraceNode:
    """Один исполнившийся узел языка или adapter action."""

    kind: str
    category: str
    title: str
    method_id: str = ""
    constructor: str = ""
    started_at: float = field(default_factory=monotonic)
    finished_at: Optional[float] = None
    status: str = "running"
    error: str = ""
    children: List["TraceNode"] = field(default_factory=list)


class ExecutionTrace:
    """Дерево событий без зависимостей от Allure, Live или адаптеров."""

    def __init__(self) -> None:
        self.roots: List[TraceNode] = []
        self._stack: List[TraceNode] = []

    @property
    def current(self) -> Optional[TraceNode]:
        return self._stack[-1] if self._stack else None

    @contextmanager
    def span(
        self,
        *,
        kind: str,
        category: str,
        title: str,
        method_id: str = "",
        constructor: str = "",
    ) -> Iterator[TraceNode]:
        node = TraceNode(
            kind=kind,
            category=category,
            title=title,
            method_id=method_id,
            constructor=constructor,
        )
        if self._stack:
            self._stack[-1].children.append(node)
        else:
            self.roots.append(node)
        self._stack.append(node)
        try:
            yield node
        except BaseException as exc:
            node.status = "failed"
            node.error = str(exc)
            raise
        else:
            node.status = "passed"
        finally:
            node.finished_at = monotonic()
            self._stack.pop()
