# -*- coding: utf-8 -*-
"""Волна 2: parse/execute Если/Цикл/ДляКаждого/Пока/try + Controller."""
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.data_stream import DataStream
from core.errors import WiredError
from core.expr import KindDict
from core.language_engine import LanguageEngine
from core.language_parse import is_language_script, parse_script
from core.lang_ast import (
    BreakNode,
    ContinueNode,
    ForeachNode,
    IfNode,
    LoopNode,
    TryNode,
    WhileNode,
)
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


def test_is_language_script_detects_blocks():
    assert is_language_script("Если ${x} 1 { data|let|y|2 }")
    assert is_language_script("? data|let|a|1 > data|let|a|2")
    assert not is_language_script("webdriver|click|css|.x")


def test_parse_if_loop_foreach_while_try():
    nodes = parse_script(
        'Если ${status} 200 { data|let|ok|"yes" } Иначе { data|let|ok|"no" }'
    )
    assert isinstance(nodes[0], IfNode)
    assert nodes[0].branches[0].condition == "${status} 200"

    # top-level split не рвёт на ИначеЕсли (хелпер _continues_after_closed_brace)
    nodes = parse_script(
        'Если ${x} 1 { data|let|b|"a" } '
        'ИначеЕсли ${x} 2 { data|let|b|"b" } '
        'Иначе { data|let|b|"c" }'
    )
    assert isinstance(nodes[0], IfNode)
    assert len(nodes[0].branches) == 3

    nodes = parse_script("Цикл 3 { data|let|n|1 }")
    assert isinstance(nodes[0], LoopNode)
    assert nodes[0].count == "3"

    nodes = parse_script("ДляКаждого ${item} В ${names} { data|let|last|${item} }")
    assert isinstance(nodes[0], ForeachNode)

    nodes = parse_script("Пока ${i} < 3 { data|let|i|${i} }")
    assert isinstance(nodes[0], WhileNode)

    nodes = parse_script("? data|let|a|1 > data|let|a|2 >! data|let|done|1")
    assert isinstance(nodes[0], TryNode)
    assert len(nodes[0].try_body) == 1
    assert len(nodes[0].catch_body) == 1
    assert len(nodes[0].finally_body) == 1

    nodes = parse_script(
        "Попробовать { data|let|a|1 } Перехватить { data|let|a|0 } Финализировать { data|let|f|1 }"
    )
    assert isinstance(nodes[0], TryNode)

    # aliases старых имён
    nodes = parse_script(
        "Попробовать { data|let|a|1 } Поймать { data|let|a|0 } ВКонце { data|let|f|1 }"
    )
    assert isinstance(nodes[0], TryNode)

    nodes = parse_script(
        "? { data|let|a|1 } > { data|let|a|0 } >! { data|let|f|1 }"
    )
    assert isinstance(nodes[0], TryNode)
    assert len(nodes[0].try_body) == 1
    assert len(nodes[0].catch_body) == 1
    assert len(nodes[0].finally_body) == 1


def test_linear_try_does_not_swallow_next_line():
    nodes = parse_script(
        "? data|let|a|1 > data|let|a|2 >! data|let|done|1\n"
        "data|let|x|9"
    )
    assert len(nodes) == 2
    assert isinstance(nodes[0], TryNode)


def test_mirror_try_block_multiline():
    nodes = parse_script(
        "?\n"
        "{\n"
        "  data|let|a|1\n"
        "  data|let|b|2\n"
        "}\n"
        ">\n"
        "{\n"
        "  data|let|a|0\n"
        "}\n"
        ">!\n"
        "{\n"
        "  data|let|f|1\n"
        "}\n"
    )
    assert len(nodes) == 1
    assert isinstance(nodes[0], TryNode)
    assert len(nodes[0].try_body) == 2
    assert len(nodes[0].catch_body) == 1
    assert len(nodes[0].finally_body) == 1


def test_foreach_rejects_path_binder():
    with pytest.raises(WiredError, match="names.item"):
        parse_script("ДляКаждого ${names.item} В ${names} { data|let|x|1 }")


def test_exec_if_default_eq():
    stream = DataStream({"status": 200})
    eng, run = _engine_with_data(stream)
    eng.execute_script(
        'Если ${status} 200 { Пусть ${ok} = "yes" } Иначе { Пусть ${ok} = "no" }',
        stream=stream,
        run_leaf=run,
    )
    assert stream.get("ok") == "yes"


def test_exec_loop_and_foreach():
    stream = DataStream()
    eng, run = _engine_with_data(stream)
    eng.execute_script(
        'Пусть ${acc} = []\n'
        'Пусть ${names} = ["a", "b"]\n'
        "ДляКаждого ${item} В ${names} {\n"
        '  Добавить ${item} в ${acc}\n'
        "}\n",
        stream=stream,
        run_leaf=run,
    )
    assert stream.get("acc") == ["a", "b"]

    stream2 = DataStream()
    eng2, run2 = _engine_with_data(stream2)
    eng2.execute_script(
        'Пусть ${hits} = []\n'
        "Цикл 3 {\n"
        '  Добавить "x" в ${hits}\n'
        "}\n",
        stream=stream2,
        run_leaf=run2,
    )
    assert stream2.get("hits") == ["x", "x", "x"]


def test_foreach_dict_kind():
    stream = DataStream()
    stream.set("map", KindDict({"a": 1, "b": 2}, kind="dict"))
    eng, run = _engine_with_data(stream)
    eng.execute_script(
        'Пусть ${keys} = []\n'
        "ДляКаждого ${k}, ${v} В ${map} {\n"
        "  Добавить ${k} в ${keys}\n"
        "}\n",
        stream=stream,
        run_leaf=run,
    )
    assert sorted(stream.get("keys")) == ["a", "b"]


def test_foreach_object_rejected_for_kv():
    stream = DataStream()
    stream.set("obj", KindDict({"a": 1}, kind="object"))
    eng, run = _engine_with_data(stream)
    with pytest.raises(WiredError, match="Словарь"):
        eng.execute_script(
            "ДляКаждого ${k}, ${v} В ${obj} { Пусть ${x} = 1 }",
            stream=stream,
            run_leaf=run,
        )


def test_while_max_and_condition():
    stream = DataStream({"i": 0})
    data = DataAdapter()
    data.bind(stream)
    eng = LanguageEngine()

    def run_leaf(node):
        # data|let|i|N — инкремент вручную через side channel
        if node.constructor.startswith("data|let|i|"):
            stream.set("i", stream.get("i") + 1)
            return stream.get("i")
        raise AssertionError(node.constructor)

    eng.execute_script(
        "Пока ${i} < 3 { data|let|i|1 }",
        stream=stream,
        run_leaf=run_leaf,
    )
    assert stream.get("i") == 3


def test_linear_try_catch_finally():
    stream = DataStream()
    calls = []

    eng = LanguageEngine()

    def run_leaf(node):
        calls.append(node.constructor)
        if node.constructor == "core|boom":
            raise RuntimeError("boom")
        return True

    eng.execute_script(
        "? core|boom > core|catch >! core|fin",
        stream=stream,
        run_leaf=run_leaf,
    )
    assert calls == ["core|boom", "core|catch", "core|fin"]


def test_parse_break_continue():
    nodes = parse_script("Цикл 1 { Прервать }")
    assert isinstance(nodes[0].body[0], BreakNode)
    nodes = parse_script("Цикл 1 { Продолжить }")
    assert isinstance(nodes[0].body[0], ContinueNode)


def test_loop_break_continue_and_i():
    stream = DataStream()
    eng, run = _engine_with_data(stream)
    eng.execute_script(
        'Пусть ${hits} = []\n'
        "Цикл 5 {\n"
        "  Если ${_i} == 2 { Прервать }\n"
        "  Добавить ${_i} в ${hits}\n"
        "}\n",
        stream=stream,
        run_leaf=run,
    )
    assert stream.get("hits") == [0, 1]

    stream2 = DataStream()
    eng2, run2 = _engine_with_data(stream2)
    eng2.execute_script(
        'Пусть ${hits} = []\n'
        "Цикл 5 {\n"
        "  Если ${_i} == 2 { Продолжить }\n"
        "  Добавить ${_i} в ${hits}\n"
        "}\n",
        stream=stream2,
        run_leaf=run2,
    )
    assert stream2.get("hits") == [0, 1, 3, 4]


def test_foreach_break_and_i():
    stream = DataStream()
    eng, run = _engine_with_data(stream)
    eng.execute_script(
        'Пусть ${names} = ["a", "b", "c"]\n'
        'Пусть ${hits} = []\n'
        "ДляКаждого ${item} В ${names} {\n"
        "  Если ${_i} == 1 { Прервать }\n"
        "  Добавить ${item} в ${hits}\n"
        "}\n",
        stream=stream,
        run_leaf=run,
    )
    assert stream.get("hits") == ["a"]
    assert "item" not in stream


def test_break_outside_loop_errors():
    stream = DataStream()
    eng, run = _engine_with_data(stream)
    with pytest.raises(WiredError, match="вне цикла"):
        eng.execute_script("Прервать", stream=stream, run_leaf=run)


def test_try_does_not_swallow_break():
    stream = DataStream()
    eng, run = _engine_with_data(stream)
    eng.execute_script(
        'Пусть ${hits} = []\n'
        'Пусть ${fins} = []\n'
        "Цикл 5 {\n"
        "  Попробовать {\n"
        "    Если ${_i} == 2 { Прервать }\n"
        "    Добавить ${_i} в ${hits}\n"
        "  } Финализировать {\n"
        '    Добавить "f" в ${fins}\n'
        "  }\n"
        "}\n",
        stream=stream,
        run_leaf=run,
    )
    assert stream.get("hits") == [0, 1]
    assert stream.get("fins") == ["f", "f", "f"]


def test_controller_language_if_step():
    from core.controller import Controller

    stream = DataStream({"status": 401})
    data = DataAdapter()
    data.bind(stream)

    ctrl = Controller.__new__(Controller)
    ctrl.language_engine = LanguageEngine()
    ctrl.adapters = {"data": data}
    ctrl._wired_problems = []
    ctrl.last_scanner_report = None
    factory = ActionFactory()
    factory.register("data", "let", data.let)
    ctrl.action_factory = factory

    def parse(raw):
        parts = raw.split("|")
        action, args = parts[1], parts[2:]
        import inspect

        names = [
            n
            for n, p in inspect.signature(data.let).parameters.items()
            if n != "self"
        ]
        params = {n: a for n, a in zip(names, args)}
        return "data", action, params

    ctrl._parse_constructor = parse
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_wired_error = lambda e, **k: e
    ctrl._diary_high_alerts = lambda: None

    step = SimpleNamespace(
        constructor=(
            'Если ${status} 200 { Пусть ${branch} = "ok" } '
            'Иначе { Пусть ${branch} = "auth" }'
        ),
        retry=0,
        retry_delay=1,
        failsafe=False,
        continue_on_failure=False,
        save_as="",
        id="s1",
        description=None,
    )
    assert ctrl._run_step(step, stream, SimpleNamespace(id="sc"), "if") is True
    assert stream.get("branch") == "auth"


def test_controller_run_step_loop_list_append():
    """Controller._run_step: Цикл + Добавить (бывший method_id_smoke)."""
    from adapters import data_processor
    from core.controller import Controller

    stream = DataStream()
    data = DataAdapter()
    data.bind(stream)
    ctrl = Controller.__new__(Controller)
    ctrl.language_engine = LanguageEngine()
    ctrl.page_resolver = None
    ctrl.adapters = {"data": data}
    ctrl._wired_problems = []
    ctrl.last_scanner_report = None
    factory = ActionFactory()
    factory.register("data", "let", data.let)
    factory.register("data", "list_append", data.list_append)
    factory.register("core", "log_message", data_processor.DataProcessor.log_message)
    ctrl.action_factory = factory

    def parse(raw):
        parts = raw.split("|")
        component, action, args = parts[0], parts[1], parts[2:]
        import inspect

        method = factory.get_method(component, action)
        names = [
            n
            for n, p in inspect.signature(method).parameters.items()
            if n != "self"
        ]
        return component, action, {n: a for n, a in zip(names, args)}

    ctrl._parse_constructor = parse
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_wired_error = lambda e, **k: e
    ctrl._diary_high_alerts = lambda: None

    step = SimpleNamespace(
        constructor=(
            'Пусть ${hits} = []\n'
            "Цикл 2 {\n"
            '  Добавить "x" в ${hits}\n'
            "  Лог tick\n"
            "}\n"
            'Пусть ${ok} = "done"\n'
        ),
        retry=0,
        retry_delay=1,
        failsafe=False,
        continue_on_failure=False,
        save_as="",
        id=None,
        description="loop MethodId",
    )
    assert ctrl._run_step(
        step, stream, SimpleNamespace(id="sc", scenario_name="loop"), "loop"
    )
    assert stream.get("hits") == ["x", "x"]
    assert stream.get("ok") == "done"


def test_controller_context_pretty():
    from core.controller import Controller

    stream = DataStream()
    data = DataAdapter()
    data.bind(stream)
    ctrl = Controller.__new__(Controller)
    ctrl.language_engine = LanguageEngine()
    ctrl.adapters = {"data": data}
    ctrl._wired_problems = []
    factory = ActionFactory()
    factory.register("data", "let", data.let)
    ctrl.action_factory = factory

    def parse(raw):
        parts = raw.split("|")
        action, args = parts[1], parts[2:]
        import inspect

        names = [
            n
            for n, p in inspect.signature(getattr(data, action)).parameters.items()
            if n != "self"
        ]
        return "data", action, {n: a for n, a in zip(names, args)}

    ctrl._parse_constructor = parse
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_wired_error = lambda e, **k: e

    ctx = SimpleNamespace(id="unused", constructor='Пусть ${email} = "a@b.c"')
    ctrl._apply_context_item(ctx, stream)
    assert stream.get("email") == "a@b.c"
