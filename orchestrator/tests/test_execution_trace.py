# -*- coding: utf-8 -*-
"""Semantic trace: actions and control-flow remain a tree outside Allure."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.data_stream import DataStream
from core.execution_trace import ExecutionTrace
from core.language_engine import LanguageEngine
from core.method_id import render_execution_title


def _trace_scope(trace):
    def scope(kind, title):
        return trace.span(kind=kind, category="Управление", title=title)

    return scope


def _leaf_runner(trace):
    def run(node):
        with trace.span(
            kind="action",
            category="Тест",
            title=node.source_line or node.constructor,
        ):
            if node.source_line == "упасть":
                raise RuntimeError("ожидаемая ошибка")

    return run


def test_try_catch_finally_are_sibling_trace_blocks():
    trace = ExecutionTrace()
    LanguageEngine().execute_script(
        """
Попробовать {
  упасть
} Перехватить {
  восстановить
} Финализировать {
  закрыть
}
""",
        stream=DataStream(),
        run_leaf=_leaf_runner(trace),
        trace_scope=_trace_scope(trace),
    )

    assert [node.title for node in trace.roots] == [
        "Попробовать упасть",
        "Перехватить восстановить",
        "Финализировать закрыть",
    ]
    assert trace.roots[0].status == "failed"
    assert trace.roots[0].children[0].status == "failed"
    assert trace.roots[1].children[0].title == "восстановить"
    assert trace.roots[2].children[0].title == "закрыть"


def test_loop_keeps_iterations_and_nested_try_tree():
    trace = ExecutionTrace()
    LanguageEngine().execute_script(
        """
Цикл 2 {
  Попробовать {
    сделать
  } Финализировать {
    закрыть
  }
}
""",
        stream=DataStream(),
        run_leaf=_leaf_runner(trace),
        trace_scope=_trace_scope(trace),
    )

    loop = trace.roots[0]
    assert loop.title == "Цикл 2"
    assert [node.title for node in loop.children] == ["Итерация 1/2", "Итерация 2/2"]
    assert [node.title for node in loop.children[0].children] == [
        "Попробовать сделать",
        "Финализировать закрыть",
    ]


def test_method_descriptor_uses_resolved_named_parameters():
    title = render_execution_title(
        "zap",
        "spider_scan",
        {"context_name": "juice_ctx", "timeout_minutes": 0.5},
    )

    assert title == "ZAP: Запустить Spider — контекст: juice_ctx, таймаут, мин: 0.5"


def test_scan_descriptor_normalizes_pre_adapter_pretty_slots():
    title = render_execution_title(
        "zap",
        "spider_scan",
        {"url": "juice_ctx", "context_name": "0.5", "timeout_minutes": None},
    )
    ajax_title = render_execution_title(
        "zap",
        "ajax_spider_scan",
        {"url": "1", "timeout_minutes": None},
    )

    assert title == "ZAP: Запустить Spider — контекст: juice_ctx, таймаут, мин: 0.5"
    assert ajax_title == "ZAP: Запустить AJAX Spider — таймаут, мин: 1"
