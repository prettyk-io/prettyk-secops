# -*- coding: utf-8 -*-
"""
LanguageEngine — системный движок языка сценария (не адаптер).

Волна 1: reserved words, разбор маркеров листа (>? / >@).
Волна 2: Если / Цикл / ДляКаждого / Пока / try — parse+execute здесь же.
"""
from __future__ import annotations

import logging
import operator
import re
from contextlib import nullcontext
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Callable, ContextManager, Dict, List, Optional

from core.errors import WiredError
from core.expr import map_kind, parse_value, parse_value_or_arith, strip_ref
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
from core.language_words import RESERVED_LANGUAGE_WORDS

logger = logging.getLogger("language_engine")

_FAILSAFE_SUFFIX = re.compile(r"\s+>\?\s*$")
# HEAL-E / DISC-2 bridge: `>#Log in` — label hint (не путать с >? / >@ / css `a > b`).
_LABEL_HINT_MARK = re.compile(r"\s*>#([^\n]*?)(?=(?:\s*>[?@]|\s*→|\s*$))")
_PAGE_ACTION_LEAF = re.compile(
    r"^[A-Za-z_][A-Za-z0-9_]*\.[^\s]+(?:\s+\S+)*$",
)
_RECOVER_MARK = re.compile(r">@\s*\{")


def _strip_label_hint(raw: str) -> tuple[str, str]:
    """Снять `>#hint`; вернуть (остаток, hint)."""
    m = _LABEL_HINT_MARK.search(raw or "")
    if m is None:
        return (raw or "").strip(), ""
    hint = (m.group(1) or "").strip()
    cleaned = ((raw or "")[: m.start()] + (raw or "")[m.end() :]).strip()
    return cleaned, hint


def _match_recover_suffix(raw: str) -> tuple[str, str] | None:
    """
    ``primary >@ { body }`` без nested-lookahead regex (Sonar S8786).
    Возвращает (primary, body) или None.
    """
    m = _RECOVER_MARK.search(raw)
    if m is None:
        return None
    if m.start() > 0 and not raw[m.start() - 1].isspace():
        return None
    primary = raw[: m.start()].rstrip()
    open_at = raw.find("{", m.start())
    if open_at < 0:
        return None
    depth = 0
    for i in range(open_at, len(raw)):
        ch = raw[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                if raw[i + 1 :].strip():
                    return None
                return primary, raw[open_at + 1 : i]
    return None

_OPS = {
    "==": operator.eq,
    "!=": operator.ne,
    ">": operator.gt,
    ">=": operator.ge,
    "<": operator.lt,
    "<=": operator.le,
}
_OP_RE = re.compile(
    r"^(?P<left>\S.*?)\s+"
    r"(?P<op>==|!=|>=|<=|>|<|содержит|совпадает|рег|начинается|заканчивается)\s+"
    r"(?P<right>\S.*)$",
    re.IGNORECASE,
)
# Если ${status} 200 — дефолт ==
_IMPLICIT_EQ = re.compile(
    r"^(?P<left>\$\{[^}]+\}|\{\{[^}]+\}\}|\S+)\s+(?P<right>\S.*)$",
)


@dataclass
class ParsedLeaf:
    """Лист действия после снятия маркеров."""

    constructor: str
    failsafe: bool = False
    recover_constructors: List[str] = field(default_factory=list)
    retry_self: int = 0
    save_as: str = ""
    label_hint: str = ""


# Callback: выполнить один ActionNode (уже wire/pretty лист), вернуть результат/None.
LeafRunner = Callable[[ActionNode], Any]
PageCallRunner = Callable[[PageCallNode], Any]
TraceScope = Callable[[str, str], ContextManager[Any]]


class LoopControl(Exception):
    """Сигнал Прервать / Продолжить — ловится только циклами."""


class BreakSignal(LoopControl):
    pass


class ContinueSignal(LoopControl):
    pass


def _trace_scope(
    trace_scope: Optional[TraceScope], kind: str, title: str
) -> ContextManager[Any]:
    return trace_scope(kind, title) if trace_scope is not None else nullcontext()


def _first_node_title(body: List[Node]) -> str:
    """Короткий анонс первого действия для заголовка блока control-flow."""
    if not body:
        return ""
    node = body[0]
    if isinstance(node, ActionNode):
        return (node.source_line or node.constructor).strip()
    if isinstance(node, PageCallNode):
        return f"{node.page}.{node.action}"
    if isinstance(node, GroupNode):
        return node.title
    if isinstance(node, IfNode):
        return "Если"
    if isinstance(node, (LoopNode, ForeachNode, WhileNode)):
        return "Цикл"
    if isinstance(node, TryNode):
        return "Попробовать"
    return ""


def _branch_title(prefix: str, body: List[Node]) -> str:
    first = _first_node_title(body)
    return f"{prefix} {first}".strip()


class LanguageEngine:
    """
    Controller передаёт управление; здесь — parse + контроль потока.
    Исполнение листьев и recover — в Controller (общий retry-path).
    """

    reserved_words = RESERVED_LANGUAGE_WORDS

    @staticmethod
    def is_language_word(token: str) -> bool:
        return token.strip() in RESERVED_LANGUAGE_WORDS

    @staticmethod
    def _parse_recover_leaf(raw: str, recover_m, has_failsafe_end: bool) -> ParsedLeaf:
        from core.wire_split import split_save_as_arrow

        primary, body = recover_m[0].strip(), recover_m[1].strip()
        if has_failsafe_end or _FAILSAFE_SUFFIX.search(primary) or ">?" in primary:
            raise WiredError(
                "Нельзя совмещать >? и >@ на одном шаге "
                "(soft-skip и recover+retry конфликтуют)"
            )
        recover = _split_recover_body(body)
        if not primary:
            raise WiredError("У >@ пустой основной конструктор")
        if not recover:
            raise WiredError("У >@ пустой блок recover { … }")
        for item in recover:
            if ">?" in item or _match_recover_suffix(item) is not None:
                raise WiredError(
                    "Внутри >@ { … } маркеры >? / >@ пока не поддерживаются"
                )
            if _PAGE_ACTION_LEAF.match(item):
                raise WiredError(
                    "Внутри >@ { … } page action пока не поддерживается: "
                    "recover принимает только MethodId-листья"
                )
        wire, save_as = split_save_as_arrow(primary)
        return ParsedLeaf(
            constructor=wire,
            failsafe=False,
            recover_constructors=recover,
            retry_self=1,
            save_as=save_as or "",
            label_hint="",
        )

    @staticmethod
    def parse_leaf(constructor: str) -> ParsedLeaf:
        """
        Снять маркеры с constructor-строки.

        >?  — soft-skip (failsafe)
        >#hint — label hint для heal (DISC-2 bridge; нужен soft/`PK_LOCATOR_HEAL`)
        >@ { recover… } — recover body + retry primary ×1
        Комбо >? и >@ на одном листе — ошибка.
        Хвостовой FE-хвост ` → save_as` снимается в save_as.
        """
        from core.wire_split import split_save_as_arrow

        raw = (constructor or "").strip()
        if not raw:
            raise WiredError("Пустой конструктор листа")

        raw, label_hint = _strip_label_hint(raw)
        if not raw:
            raise WiredError("У ># пустой конструктор")

        recover_m = _match_recover_suffix(raw)
        has_failsafe_end = bool(_FAILSAFE_SUFFIX.search(raw))
        if recover_m is not None:
            leaf = LanguageEngine._parse_recover_leaf(raw, recover_m, has_failsafe_end)
            leaf.label_hint = label_hint
            return leaf

        if has_failsafe_end:
            primary = _FAILSAFE_SUFFIX.sub("", raw).strip()
            if not primary:
                raise WiredError("У >? пустой конструктор")
            wire, save_as = split_save_as_arrow(primary)
            return ParsedLeaf(
                constructor=wire,
                failsafe=True,
                save_as=save_as or "",
                label_hint=label_hint,
            )

        wire, save_as = split_save_as_arrow(raw)
        return ParsedLeaf(
            constructor=wire,
            save_as=save_as or "",
            label_hint=label_hint,
        )

    def execute_script(
        self,
        script: str,
        *,
        stream: Any,
        run_leaf: LeafRunner,
        run_page_call: Optional[PageCallRunner] = None,
        step_label: str = "lang",
        trace_scope: Optional[TraceScope] = None,
    ) -> None:
        """Разобрать pretty/language скрипт и исполнить AST."""
        from core.language_parse import parse_script

        nodes = parse_script(script)
        try:
            self.execute_nodes(
                nodes,
                stream=stream,
                run_leaf=run_leaf,
                run_page_call=run_page_call,
                step_label=step_label,
                trace_scope=trace_scope,
            )
        except LoopControl:
            raise WiredError("Прервать/Продолжить вне цикла") from None

    def execute_nodes(
        self,
        nodes: List[Node],
        *,
        stream: Any,
        run_leaf: LeafRunner,
        run_page_call: Optional[PageCallRunner] = None,
        step_label: str = "lang",
        trace_scope: Optional[TraceScope] = None,
    ) -> None:
        for node in nodes:
            self._exec_node(
                node,
                stream=stream,
                run_leaf=run_leaf,
                run_page_call=run_page_call,
                step_label=step_label,
                trace_scope=trace_scope,
            )

    def _run_counted_iteration(
        self,
        *,
        locals_map: Dict[str, Any],
        title: str,
        body: List[Node],
        stream: Any,
        run_leaf: LeafRunner,
        run_page_call: Optional[PageCallRunner],
        step_label: str,
        trace_scope: Optional[TraceScope],
    ) -> Optional[str]:
        stream.push_locals(locals_map)
        signal = None
        try:
            with _trace_scope(trace_scope, "iteration", title):
                try:
                    self.execute_nodes(
                        body,
                        stream=stream,
                        run_leaf=run_leaf,
                        run_page_call=run_page_call,
                        step_label=step_label,
                        trace_scope=trace_scope,
                    )
                except ContinueSignal:
                    signal = "continue"
                except BreakSignal:
                    signal = "break"
        finally:
            stream.pop_locals()
        return signal

    def _exec_if(
        self,
        node: IfNode,
        *,
        stream: Any,
        run_leaf: LeafRunner,
        run_page_call: Optional[PageCallRunner],
        step_label: str,
        trace_scope: Optional[TraceScope],
    ) -> None:
        for branch in node.branches:
            if branch.condition is None or self.eval_condition(branch.condition, stream):
                title = (
                    "Иначе"
                    if branch.condition is None
                    else f"Если {branch.condition}"
                )
                with _trace_scope(trace_scope, "if", title):
                    self.execute_nodes(
                        branch.body,
                        stream=stream,
                        run_leaf=run_leaf,
                        run_page_call=run_page_call,
                        step_label=step_label,
                        trace_scope=trace_scope,
                    )
                return

    def _exec_loop(
        self,
        node: LoopNode,
        *,
        stream: Any,
        run_leaf: LeafRunner,
        run_page_call: Optional[PageCallRunner],
        step_label: str,
        trace_scope: Optional[TraceScope],
    ) -> None:
        count = self._eval_count(node.count, stream)
        with _trace_scope(trace_scope, "loop", f"Цикл {node.count}"):
            for i in range(count):
                signal = self._run_counted_iteration(
                    locals_map={"_i": i},
                    title=f"Итерация {i + 1}/{count}",
                    body=node.body,
                    stream=stream,
                    run_leaf=run_leaf,
                    run_page_call=run_page_call,
                    step_label=f"{step_label}/i{i}",
                    trace_scope=trace_scope,
                )
                if signal == "continue":
                    continue
                if signal == "break":
                    break

    def _exec_while(
        self,
        node: WhileNode,
        *,
        stream: Any,
        run_leaf: LeafRunner,
        run_page_call: Optional[PageCallRunner],
        step_label: str,
        trace_scope: Optional[TraceScope],
    ) -> None:
        n = 0
        with _trace_scope(trace_scope, "while", f"Пока {node.condition}"):
            while self.eval_condition(node.condition, stream):
                if n >= node.max_iterations:
                    raise WiredError(
                        f"Пока: превышен max_iterations={node.max_iterations}"
                    )
                signal = self._run_counted_iteration(
                    locals_map={"_i": n},
                    title=f"Итерация {n + 1}",
                    body=node.body,
                    stream=stream,
                    run_leaf=run_leaf,
                    run_page_call=run_page_call,
                    step_label=f"{step_label}/w{n}",
                    trace_scope=trace_scope,
                )
                if signal == "break":
                    break
                n += 1

    def _exec_node(
        self,
        node: Node,
        *,
        stream: Any,
        run_leaf: LeafRunner,
        run_page_call: Optional[PageCallRunner],
        step_label: str,
        trace_scope: Optional[TraceScope],
    ) -> None:
        if isinstance(node, ActionNode):
            run_leaf(node)
            return
        if isinstance(node, BreakNode):
            raise BreakSignal()
        if isinstance(node, ContinueNode):
            raise ContinueSignal()
        if isinstance(node, PageCallNode):
            if run_page_call is None:
                raise WiredError(
                    f"page_call {node.page}.{node.action}: нет PageResolver/runner"
                )
            run_page_call(node)
            return
        dispatch = {
            IfNode: self._exec_if,
            LoopNode: self._exec_loop,
            ForeachNode: self._exec_foreach,
            WhileNode: self._exec_while,
            TryNode: self._exec_try,
        }
        handler = dispatch.get(type(node))
        if handler is not None:
            handler(
                node,
                stream=stream,
                run_leaf=run_leaf,
                run_page_call=run_page_call,
                step_label=step_label,
                trace_scope=trace_scope,
            )
            return
        if isinstance(node, GroupNode):
            with _trace_scope(trace_scope, "group", node.title or "Группа"):
                self.execute_nodes(
                    node.body,
                    stream=stream,
                    run_leaf=run_leaf,
                    run_page_call=run_page_call,
                    step_label=step_label,
                    trace_scope=trace_scope,
                )
            return
        raise WiredError(f"Неизвестный AST-узел: {type(node)!r}")

    def _exec_try(
        self,
        node: TryNode,
        *,
        stream: Any,
        run_leaf: LeafRunner,
        run_page_call: Optional[PageCallRunner],
        step_label: str,
        trace_scope: Optional[TraceScope],
    ) -> None:
        try:
            with _trace_scope(
                trace_scope, "try", _branch_title("Попробовать", node.try_body)
            ):
                self.execute_nodes(
                    node.try_body,
                    stream=stream,
                    run_leaf=run_leaf,
                    run_page_call=run_page_call,
                    step_label=step_label,
                    trace_scope=trace_scope,
                )
        except LoopControl:
            raise
        except WiredError:
            raise
        except Exception as exc:
            logger.warning("Try/Перехватить: %s", exc)
            if node.catch_body:
                with _trace_scope(
                    trace_scope,
                    "catch",
                    _branch_title("Перехватить", node.catch_body),
                ):
                    self.execute_nodes(
                        node.catch_body,
                        stream=stream,
                        run_leaf=run_leaf,
                        run_page_call=run_page_call,
                        step_label=f"{step_label}/catch",
                        trace_scope=trace_scope,
                    )
            else:
                raise
        finally:
            if node.finally_body:
                with _trace_scope(
                    trace_scope,
                    "finally",
                    _branch_title("Финализировать", node.finally_body),
                ):
                    self.execute_nodes(
                        node.finally_body,
                        stream=stream,
                        run_leaf=run_leaf,
                        run_page_call=run_page_call,
                        step_label=f"{step_label}/finally",
                        trace_scope=trace_scope,
                    )

    def _run_foreach_iteration(
        self,
        *,
        locals_map: Dict[str, Any],
        index: int,
        node: ForeachNode,
        stream: Any,
        run_leaf: LeafRunner,
        run_page_call: Optional[PageCallRunner],
        step_label: str,
        trace_scope: Optional[TraceScope],
    ) -> Optional[str]:
        stream.push_locals(locals_map)
        signal = None
        try:
            with _trace_scope(trace_scope, "iteration", f"Итерация {index + 1}"):
                try:
                    self.execute_nodes(
                        node.body,
                        stream=stream,
                        run_leaf=run_leaf,
                        run_page_call=run_page_call,
                        step_label=step_label,
                        trace_scope=trace_scope,
                    )
                except ContinueSignal:
                    signal = "continue"
                except BreakSignal:
                    signal = "break"
        finally:
            stream.pop_locals()
        return signal

    def _foreach_title(self, node: ForeachNode) -> str:
        title = f"ДляКаждого {node.item}"
        if node.item2:
            title += f", {node.item2}"
        return title + f" В {node.iterable}"

    def _exec_foreach_map(
        self,
        node: ForeachNode,
        *,
        iterable_val: Any,
        key_name: str,
        loop_title: str,
        iter_kw: Dict[str, Any],
    ) -> None:
        if not isinstance(iterable_val, dict):
            raise WiredError("ДляКаждого k,v: ожидался Словарь/объект")
        if map_kind(iterable_val) != "dict":
            raise WiredError(
                "ДляКаждого ${k}, ${v}: только Словарь (kind=dict), не Объект"
            )
        val_name = _binder_name(node.item2 or "")
        with _trace_scope(iter_kw["trace_scope"], "foreach", loop_title):
            for i, (k, v) in enumerate(iterable_val.items()):
                signal = self._run_foreach_iteration(
                    locals_map={key_name: k, val_name: v, "_i": i},
                    index=i,
                    **iter_kw,
                )
                if signal == "break":
                    break

    def _exec_foreach_list(
        self,
        *,
        iterable_val: Any,
        item_name: str,
        loop_title: str,
        iter_kw: Dict[str, Any],
    ) -> None:
        if isinstance(iterable_val, dict):
            raise WiredError(
                "ДляКаждого одного binder: нужен Список "
                "(для карты — ДляКаждого ${k}, ${v} В ${map})"
            )
        if not isinstance(iterable_val, (list, tuple)):
            raise WiredError(
                f"ДляКаждого: ожидался список, получено {type(iterable_val)}"
            )
        with _trace_scope(iter_kw["trace_scope"], "foreach", loop_title):
            for i, item in enumerate(iterable_val):
                signal = self._run_foreach_iteration(
                    locals_map={item_name: item, "_i": i},
                    index=i,
                    **iter_kw,
                )
                if signal == "break":
                    break

    def _exec_foreach(
        self,
        node: ForeachNode,
        *,
        stream: Any,
        run_leaf: LeafRunner,
        run_page_call: Optional[PageCallRunner],
        step_label: str,
        trace_scope: Optional[TraceScope],
    ) -> None:
        iterable_val = self._resolve_operand(node.iterable, stream)
        item_name = _binder_name(node.item)
        loop_title = self._foreach_title(node)
        iter_kw = dict(
            node=node,
            stream=stream,
            run_leaf=run_leaf,
            run_page_call=run_page_call,
            step_label=step_label,
            trace_scope=trace_scope,
        )
        if node.item2:
            self._exec_foreach_map(
                node,
                iterable_val=iterable_val,
                key_name=item_name,
                loop_title=loop_title,
                iter_kw=iter_kw,
            )
            return
        self._exec_foreach_list(
            iterable_val=iterable_val,
            item_name=item_name,
            loop_title=loop_title,
            iter_kw=iter_kw,
        )

    def _eval_count(self, count_expr: str, stream: Any) -> int:
        raw = (count_expr or "").strip()
        val = self._resolve_operand(raw, stream)
        try:
            n = int(val)
        except (TypeError, ValueError) as exc:
            raise WiredError(f"Цикл: нечисловой счётчик {count_expr!r}") from exc
        if n < 0:
            raise WiredError(f"Цикл: отрицательный счётчик {n}")
        return n

    def eval_condition(self, condition: str, stream: Any) -> bool:
        """Оценить условие Если/Пока (И/Или/Не, операторы, дефолт ==)."""
        text = (condition or "").strip()
        if not text:
            raise WiredError("Пустое условие")
        return self._eval_or(text, stream)

    def _eval_or(self, text: str, stream: Any) -> bool:
        parts = _split_top_logic(text, "Или")
        if len(parts) == 1:
            return self._eval_and(parts[0], stream)
        return any(self._eval_and(p, stream) for p in parts)

    def _eval_and(self, text: str, stream: Any) -> bool:
        parts = _split_top_logic(text, "И")
        if len(parts) == 1:
            return self._eval_atom(parts[0], stream)
        return all(self._eval_atom(p, stream) for p in parts)

    def _eval_predicate_call(self, s: str, stream: Any) -> Optional[bool]:
        low = s.lower()
        if low.startswith("пусто(") and s.endswith(")"):
            inner = s[s.find("(") + 1 : -1].strip()
            val = self._resolve_operand(inner, stream)
            return val in (None, "", [], {})
        if low.startswith("существует(") and s.endswith(")"):
            inner = s[s.find("(") + 1 : -1].strip()
            path = strip_ref(inner) or inner
            try:
                stream.get_path(path)
                return True
            except WiredError:
                return False
        return None

    def _eval_binary_op(self, s: str, stream: Any) -> Optional[bool]:
        m = _OP_RE.match(s)
        if not m:
            return None
        left = self._resolve_operand(m.group("left").strip(), stream)
        right = self._resolve_operand(m.group("right").strip(), stream)
        op = m.group("op").lower()
        word_ops = {
            "содержит": lambda: _contains(left, right),
            "совпадает": lambda: str(left) == str(right),
            "рег": lambda: _match_re(left, right),
            "начинается": lambda: str(left).startswith(str(right)),
            "заканчивается": lambda: str(left).endswith(str(right)),
        }
        if op in word_ops:
            return bool(word_ops[op]())
        fn = _OPS.get(m.group("op"))
        if fn is None:
            raise WiredError(f"Неизвестный оператор: {m.group('op')}")
        try:
            return bool(fn(left, right))
        except TypeError:
            return bool(fn(str(left), str(right)))

    def _eval_atom(self, text: str, stream: Any) -> bool:
        s = text.strip()
        if s.startswith("(") and s.endswith(")"):
            return self.eval_condition(s[1:-1], stream)
        if s.startswith("Не ") or s.startswith("не "):
            return not self._eval_atom(s[3:].strip(), stream)
        pred = self._eval_predicate_call(s, stream)
        if pred is not None:
            return pred
        binary = self._eval_binary_op(s, stream)
        if binary is not None:
            return binary
        # Дефолт == : `${status} 200`
        m2 = _IMPLICIT_EQ.match(s)
        if m2:
            left = self._resolve_operand(m2.group("left").strip(), stream)
            right = self._resolve_operand(m2.group("right").strip(), stream)
            return left == right
        return bool(self._resolve_operand(s, stream))

    def _resolve_operand(self, token: str, stream: Any) -> Any:
        token = token.strip()
        if not token:
            return ""
        try:
            return parse_value_or_arith(token, stream.get_path)
        except WiredError:
            # мягко: несуществующий ref → строка как есть (как resolve soft)
            # арифметику со строками/дырами не смягчаем — только простой operand
            from core.expr import has_sum_diff_ops

            if has_sum_diff_ops(token):
                raise
            inner = strip_ref(token)
            if inner is not None:
                return stream.resolve(token)
            return parse_value(token, lambda p: stream.resolve("$" + p))


def _binder_name(token: str) -> str:
    inner = strip_ref(token.strip())
    if inner is not None:
        if "." in inner or "[" in inner:
            raise WiredError(
                f"ДляКаждого: binder должен быть простым $name, не path: {token}"
            )
        return inner
    name = token.strip()
    if not name.isidentifier():
        raise WiredError(f"ДляКаждого: некорректный binder {token!r}")
    return name


def _contains(haystack: Any, needle: Any) -> bool:
    if isinstance(haystack, (list, tuple, set, dict, str)):
        return needle in haystack
    return str(needle) in str(haystack)


@lru_cache(maxsize=128)
def _compile_condition_re(pat: str) -> re.Pattern[str]:
    return re.compile(pat)


def _match_re(text: Any, pattern: Any) -> bool:
    """Условие «рег»: re.search(pattern, str(text))."""
    pat = "" if pattern is None else str(pattern)
    try:
        rx = _compile_condition_re(pat)
    except re.error as exc:
        raise WiredError(f"Битый regex {pat!r}: {exc}") from exc
    return rx.search("" if text is None else str(text)) is not None


def _advance_logic_scan(
    text: str,
    i: int,
    *,
    depth: int,
    in_str: bool,
    quote: str,
    buf: List[str],
    word: str,
    parts: List[str],
) -> tuple[int, int, bool, str]:
    n = len(text)
    ch = text[i]
    if in_str:
        buf.append(ch)
        if ch == "\\" and i + 1 < n:
            buf.append(text[i + 1])
            return i + 2, depth, True, quote
        if ch == quote:
            return i + 1, depth, False, quote
        return i + 1, depth, True, quote
    if ch in ('"', "'"):
        buf.append(ch)
        return i + 1, depth, True, ch
    if ch == "(":
        buf.append(ch)
        return i + 1, depth + 1, False, quote
    if ch == ")":
        buf.append(ch)
        return i + 1, depth - 1, False, quote
    if depth == 0 and text.startswith(word, i):
        before_ok = i == 0 or text[i - 1].isspace()
        after = i + len(word)
        after_ok = after >= n or text[after].isspace()
        if before_ok and after_ok:
            parts.append("".join(buf).strip())
            buf.clear()
            return after, depth, False, quote
    buf.append(ch)
    return i + 1, depth, False, quote


def _split_top_logic(text: str, word: str) -> List[str]:
    """Режет по И / Или вне скобок и строк."""
    parts: List[str] = []
    buf: List[str] = []
    i = 0
    depth = 0
    in_str = False
    quote = ""
    n = len(text)
    while i < n:
        i, depth, in_str, quote = _advance_logic_scan(
            text,
            i,
            depth=depth,
            in_str=in_str,
            quote=quote,
            buf=buf,
            word=word,
            parts=parts,
        )
    parts.append("".join(buf).strip())
    return [p for p in parts if p]


def _split_recover_body(body: str) -> List[str]:
    """Разделить recover-тело — по строкам; одна строка = один constructor."""
    body = body.strip()
    if not body:
        return []
    if "\n" in body:
        return [
            ln.strip()
            for ln in body.splitlines()
            if ln.strip() and not ln.strip().startswith("#")
        ]
    return [body]
