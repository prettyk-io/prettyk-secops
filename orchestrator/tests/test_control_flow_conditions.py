# -*- coding: utf-8 -*-
"""Контроль потока: обёртка тел (много шагов), И/Или/Не, вложенные Если."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.data_stream import DataStream
from core.language_engine import LanguageEngine
from core.language_parse import parse_script
from core.lang_ast import IfNode, LoopNode, TryNode
from adapters.data_adapter import DataAdapter
from core.action_factory import ActionFactory


def _engine_with_data(stream: DataStream):
    data = DataAdapter()
    data.bind(stream)
    factory = ActionFactory()
    for name in (
        "let",
        "list_append",
        "size",
        "concat",
        "contains",
        "substring",
        "replace",
        "split",
        "trim",
        "match_re",
        "replace_re",
        "extract_re",
        "extract_re_all",
        "split_re",
        "starts_with",
        "ends_with",
        "upper",
        "lower",
        "fetch_left",
        "fetch_right",
        "remove_str",
    ):
        factory.register("data", name, getattr(data, name))

    eng = LanguageEngine()

    def run_leaf(node):
        parts = node.constructor.split("|")
        assert parts[0] == "data", node.constructor
        action, args = parts[1], parts[2:]
        method = getattr(data, action)
        import inspect

        names = [
            n
            for n, p in inspect.signature(method).parameters.items()
            if n != "self"
        ]
        params = {n: a for n, a in zip(names, args)}
        for k, v in list(params.items()):
            if isinstance(v, str):
                params[k] = stream.resolve(v)
        result = method(**params)
        if node.save_as:
            stream.set(node.save_as, result)
        return result

    return eng, run_leaf


# --- parse: тело с несколькими шагами ---


def test_parse_if_body_multiple_statements():
    nodes = parse_script(
        "Если ${n} 1 {\n"
        "  Пусть ${a} = 1\n"
        "  Пусть ${b} = 2\n"
        "  Пусть ${c} = 3\n"
        "} Иначе {\n"
        "  Пусть ${a} = 0\n"
        "  Пусть ${b} = 0\n"
        "}\n"
    )
    assert isinstance(nodes[0], IfNode)
    assert len(nodes[0].branches) == 2
    assert len(nodes[0].branches[0].body) == 3
    assert len(nodes[0].branches[1].body) == 2


def test_parse_nested_if():
    nodes = parse_script(
        "Если ${outer} 1 {\n"
        "  Если ${inner} 2 {\n"
        "    Пусть ${hit} = 1\n"
        "  } Иначе {\n"
        "    Пусть ${hit} = 2\n"
        "  }\n"
        "}\n"
    )
    outer = nodes[0]
    assert isinstance(outer, IfNode)
    assert len(outer.branches[0].body) == 1
    inner = outer.branches[0].body[0]
    assert isinstance(inner, IfNode)
    assert len(inner.branches) == 2


def test_parse_loop_and_try_multi_body():
    loop = parse_script(
        "Цикл 2 {\n"
        "  Пусть ${x} = 1\n"
        "  Пусть ${y} = 2\n"
        "}\n"
    )[0]
    assert isinstance(loop, LoopNode)
    assert len(loop.body) == 2

    try_n = parse_script(
        "Попробовать {\n"
        "  Пусть ${a} = 1\n"
        "  Пусть ${b} = 2\n"
        "} Перехватить {\n"
        "  Пусть ${e} = 1\n"
        "  Пусть ${f} = 2\n"
        "} Финализировать {\n"
        "  Пусть ${z} = 9\n"
        "}\n"
    )[0]
    assert isinstance(try_n, TryNode)
    assert len(try_n.try_body) == 2
    assert len(try_n.catch_body) == 2
    assert len(try_n.finally_body) == 1


# --- execute: обёртка и ветки ---


def test_exec_if_multi_step_then_else():
    stream = DataStream({"n": 1})
    eng, run = _engine_with_data(stream)
    eng.execute_script(
        "Если ${n} 1 {\n"
        "  Пусть ${a} = 10\n"
        "  Пусть ${b} = 20\n"
        "} Иначе {\n"
        "  Пусть ${a} = 0\n"
        "  Пусть ${b} = 0\n"
        "}\n",
        stream=stream,
        run_leaf=run,
    )
    assert stream.get("a") == 10
    assert stream.get("b") == 20

    stream2 = DataStream({"n": 9})
    eng2, run2 = _engine_with_data(stream2)
    eng2.execute_script(
        "Если ${n} 1 {\n"
        "  Пусть ${a} = 10\n"
        "  Пусть ${b} = 20\n"
        "} Иначе {\n"
        "  Пусть ${a} = 7\n"
        "  Пусть ${b} = 8\n"
        "}\n",
        stream=stream2,
        run_leaf=run2,
    )
    assert stream2.get("a") == 7
    assert stream2.get("b") == 8


def test_exec_elseif_chain():
    stream = DataStream({"n": 2})
    eng, run = _engine_with_data(stream)
    eng.execute_script(
        "Если ${n} 1 {\n"
        '  Пусть ${branch} = "one"\n'
        "} ИначеЕсли ${n} 2 {\n"
        '  Пусть ${branch} = "two"\n'
        "  Пусть ${extra} = 1\n"
        "} Иначе {\n"
        '  Пусть ${branch} = "else"\n'
        "}\n",
        stream=stream,
        run_leaf=run,
    )
    assert stream.get("branch") == "two"
    assert stream.get("extra") == 1


def test_exec_nested_if():
    stream = DataStream({"outer": 1, "inner": 2})
    eng, run = _engine_with_data(stream)
    eng.execute_script(
        "Если ${outer} 1 {\n"
        "  Если ${inner} 2 {\n"
        '    Пусть ${hit} = "deep"\n'
        "  } Иначе {\n"
        '    Пусть ${hit} = "inner-else"\n'
        "  }\n"
        "} Иначе {\n"
        '  Пусть ${hit} = "outer-else"\n'
        "}\n",
        stream=stream,
        run_leaf=run,
    )
    assert stream.get("hit") == "deep"

    stream2 = DataStream({"outer": 1, "inner": 9})
    eng2, run2 = _engine_with_data(stream2)
    eng2.execute_script(
        "Если ${outer} 1 {\n"
        "  Если ${inner} 2 {\n"
        '    Пусть ${hit} = "deep"\n'
        "  } Иначе {\n"
        '    Пусть ${hit} = "inner-else"\n'
        "  }\n"
        "}\n",
        stream=stream2,
        run_leaf=run2,
    )
    assert stream2.get("hit") == "inner-else"


def test_exec_loop_multi_step_and_foreach():
    stream = DataStream()
    eng, run = _engine_with_data(stream)
    eng.execute_script(
        'Пусть ${acc} = []\n'
        "Цикл 2 {\n"
        '  Добавить "a" в ${acc}\n'
        '  Добавить "b" в ${acc}\n'
        "}\n",
        stream=stream,
        run_leaf=run,
    )
    assert stream.get("acc") == ["a", "b", "a", "b"]

    stream2 = DataStream()
    eng2, run2 = _engine_with_data(stream2)
    eng2.execute_script(
        'Пусть ${names} = ["x", "y"]\n'
        'Пусть ${out} = []\n'
        "ДляКаждого ${item} В ${names} {\n"
        "  Пусть ${tmp} = ${item}\n"
        "  Добавить ${tmp} в ${out}\n"
        "}\n",
        stream=stream2,
        run_leaf=run2,
    )
    assert stream2.get("out") == ["x", "y"]


def test_exec_try_multi_step_catch():
    stream = DataStream()
    calls = []
    eng = LanguageEngine()

    def run_leaf(node):
        calls.append(node.constructor)
        if node.constructor == "core|boom":
            raise RuntimeError("boom")
        return True

    eng.execute_script(
        "Попробовать {\n"
        "  core|ok1\n"
        "  core|boom\n"
        "  core|never\n"
        "} Перехватить {\n"
        "  core|c1\n"
        "  core|c2\n"
        "} Финализировать {\n"
        "  core|f1\n"
        "}\n",
        stream=stream,
        run_leaf=run_leaf,
    )
    assert calls == ["core|ok1", "core|boom", "core|c1", "core|c2", "core|f1"]


# --- условия: И / Или / Не / скобки ---


def test_eval_and_or_not_parens():
    stream = DataStream({"a": 1, "b": 2, "s": "hello"})
    eng = LanguageEngine()

    assert eng.eval_condition("${a} 1 И ${b} 2", stream) is True
    assert eng.eval_condition("${a} 1 И ${b} 9", stream) is False
    assert eng.eval_condition("${a} 9 Или ${b} 2", stream) is True
    assert eng.eval_condition("${a} 9 Или ${b} 9", stream) is False
    assert eng.eval_condition("Не ${a} 9", stream) is True
    assert eng.eval_condition("Не (${a} 1)", stream) is False

    # Или слабее И: a==1 И b==9 Или b==2  →  (a==1 И b==9) Или (b==2) → True
    assert eng.eval_condition("${a} 1 И ${b} 9 Или ${b} 2", stream) is True
    # скобки меняют: a==1 И (b==9 Или b==2) → True; a==9 И (…) → False
    assert eng.eval_condition("${a} 1 И (${b} 9 Или ${b} 2)", stream) is True
    assert eng.eval_condition("${a} 9 И (${b} 9 Или ${b} 2)", stream) is False

    assert eng.eval_condition('${s} содержит "ell" И ${a} == 1', stream) is True
    assert eng.eval_condition('${s} содержит "И" Или ${a} 1', stream) is True


def test_exec_if_with_or_and():
    stream = DataStream({"status": 200, "role": "admin"})
    eng, run = _engine_with_data(stream)
    eng.execute_script(
        'Если ${status} 200 Или ${status} 201 {\n'
        '  Пусть ${ok} = "by-status"\n'
        "}\n"
        'Если ${status} 200 И ${role} совпадает "admin" {\n'
        '  Пусть ${admin} = true\n'
        "}\n",
        stream=stream,
        run_leaf=run,
    )
    assert stream.get("ok") == "by-status"
    assert stream.get("admin") is True

    stream2 = DataStream({"status": 404, "role": "guest"})
    eng2, run2 = _engine_with_data(stream2)
    eng2.execute_script(
        'Если ${status} 200 Или ${status} 201 {\n'
        '  Пусть ${ok} = "hit"\n'
        "} Иначе {\n"
        '  Пусть ${ok} = "miss"\n'
        "}\n",
        stream=stream2,
        run_leaf=run2,
    )
    assert stream2.get("ok") == "miss"


def test_condition_ops_catalog_smoke():
    stream = DataStream({"n": 5, "t": "abc", "empty": "", "xs": [1, 2]})
    eng = LanguageEngine()
    assert eng.eval_condition("${n} > 3", stream) is True
    assert eng.eval_condition("${n} >= 5", stream) is True
    assert eng.eval_condition("${n} < 3", stream) is False
    assert eng.eval_condition("${n} != 4", stream) is True
    assert eng.eval_condition('${t} начинается "ab"', stream) is True
    assert eng.eval_condition('${t} заканчивается "bc"', stream) is True
    assert eng.eval_condition("${xs} содержит 2", stream) is True
    assert eng.eval_condition("пусто(${empty})", stream) is True
    assert eng.eval_condition("пусто(${t})", stream) is False
    assert eng.eval_condition("существует(n)", stream) is True
    assert eng.eval_condition("существует(missing)", stream) is False
