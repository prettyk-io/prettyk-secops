# -*- coding: utf-8 -*-
"""Волна 1: pretty path/kind/Добавить, маркеры >?/>@, LanguageEngine."""
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.errors import WiredError
from core.expr import KindDict, map_kind
from core.language_engine import LanguageEngine, ParsedLeaf
from core.language_words import RESERVED_LANGUAGE_WORDS, is_reserved_language_word
from core.pretty_data import pretty_line_to_wire, script_to_steps
from core.data_stream import DataStream
from adapters.data_adapter import DataAdapter
from tools.data_playground import eval_script


def test_reserved_language_words():
    assert is_reserved_language_word("Цикл")
    assert is_reserved_language_word("Если")
    assert is_reserved_language_word("Пусть")
    assert "НажатьКнопку" not in RESERVED_LANGUAGE_WORDS


def test_pretty_path_let_and_add():
    assert pretty_line_to_wire('Пусть ${user.role} = "user"') == (
        'data|let|user.role|"user"',
        None,
    )
    assert pretty_line_to_wire('Добавить "carol" в ${names}') == (
        'data|list_append|names|"carol"',
        None,
    )
    wire, save = pretty_line_to_wire("Пусть ${names_len} = Размер ${names}")
    assert wire == "data|size|names"
    assert save == "names_len"
    wire2, save2 = pretty_line_to_wire("Пусть $n = Размер $data_module")
    assert wire2 == "data|size|data_module"
    assert save2 == "n"


def test_pretty_size_requires_dollar_ref():
    """Голое «Размер data_module» — не канон; validate-only должен падать рано."""
    from core.errors import WiredError
    import pytest

    with pytest.raises(WiredError, match=r"Размер: нужна ссылка"):
        pretty_line_to_wire("Пусть $n = Размер data_module")


def test_pretty_bare_name_rejected_quoted_dollar_ok():
    """$… = var; \"$…\" = строка; голое имя — ошибка."""
    from core.errors import WiredError
    import pytest

    with pytest.raises(WiredError, match=r"голое имя"):
        pretty_line_to_wire('Пусть $x = Склеить a "/x"')
    with pytest.raises(WiredError, match=r"голое имя"):
        pretty_line_to_wire("Пусть $var = var")
    wire, _ = pretty_line_to_wire('Пусть $x = Склеить "$notavar" "ok"')
    assert "$notavar" in wire or '"$notavar"' in wire
    wire_let, _ = pretty_line_to_wire('Пусть $var = "var"')
    assert "data|let|var|" in wire_let
    with pytest.raises(WiredError, match=r"Добавить: нужна ссылка"):
        pretty_line_to_wire('Добавить "carol" в names')


def test_duplicate_let_rejected_in_script():
    from core.constructor_validate import validate_language_script

    diags = validate_language_script(
        'Пусть $var = "a"\nПусть $var = "b"\n'
    )
    errs = [d for d in diags if d.get("severity") == "error"]
    assert any("уже объявлена" in (d.get("message") or "") for d in errs), errs


def test_pretty_concat_and_contains():
    wire, save = pretty_line_to_wire('Пусть ${url} = Склеить ${base} "/login" ${q}')
    assert save == "url"
    assert wire.startswith("data|concat|")
    assert "${base}" in wire and "/login" in wire and "${q}" in wire
    wire2, save2 = pretty_line_to_wire('Пусть ${ok} = Содержит ${hay} "x"')
    assert save2 == "ok"
    assert wire2 == 'data|contains|${hay}|"x"'


def test_eval_concat_contains_and_quoted_interp():
    out = eval_script(
        'Пусть ${base} = "https://ex.com"\n'
        'Пусть ${q} = "?a=1"\n'
        'Пусть ${url} = Склеить ${base} "/login" ${q}\n'
        'Пусть ${hay} = "hello world"\n'
        'Пусть ${ok} = Содержит ${hay} "world"\n'
        'Пусть ${id} = "42"\n'
        'Пусть ${msg} = "user=${id}"\n'
    )
    assert out["ok"] is True
    assert out["variables"]["url"] == "https://ex.com/login?a=1"
    assert out["variables"]["ok"] is True
    assert out["variables"]["msg"] == "user=42"


def test_kind_object_vs_dict():
    stream = DataStream()
    data = DataAdapter()
    data.bind(stream)
    data.let("user", 'Объект { email: "a@b.c" }')
    data.let("rules", 'Словарь { par1: "v1" }')
    data.let("bare", '{ x: 1 }')
    assert map_kind(stream.get("user")) == "object"
    assert map_kind(stream.get("rules")) == "dict"
    assert map_kind(stream.get("bare")) == "object"
    assert isinstance(stream.get("rules"), KindDict)
    masked = stream.mask_for_log(stream.get("rules"))
    assert isinstance(masked, KindDict)
    assert masked.kind == "dict"


def test_playground_preserves_dict_kind():
    out = eval_script('Пусть ${rules} = Словарь { par1: "v1" }')
    assert out["variables"]["rules"]["$kind"] == "Словарь"
    assert out["variables"]["rules"]["par1"] == "v1"


def test_path_assign_runtime():
    stream = DataStream()
    data = DataAdapter()
    data.bind(stream)
    data.let("user", 'Объект { role: "admin" }')
    data.let("user.role", '"user"')
    assert stream.get_path("user.role") == "user"


def test_eval_add_and_size_canon():
    out = eval_script(
        'Пусть ${names} = ["alice", "bob"]\n'
        'Добавить "carol" в ${names}\n'
        "Пусть ${names_len} = Размер ${names}\n"
    )
    assert out["ok"] is True
    assert out["variables"]["names"] == ["alice", "bob", "carol"]
    assert out["variables"]["names_len"] == 3


def test_marker_failsafe_parse():
    leaf = LanguageEngine.parse_leaf("webdriver|click|css|.login >?")
    assert leaf.failsafe is True
    assert leaf.constructor == "webdriver|click|css|.login"
    assert leaf.recover_constructors == []


def test_marker_label_hint_with_failsafe():
    leaf = LanguageEngine.parse_leaf("webdriver|click|id|x >#Log in >?")
    assert leaf.failsafe is True
    assert leaf.label_hint == "Log in"
    assert leaf.constructor == "webdriver|click|id|x"


def test_marker_label_hint_alone():
    leaf = LanguageEngine.parse_leaf("webdriver|click|id|broken >#Email")
    assert leaf.failsafe is False
    assert leaf.label_hint == "Email"
    assert leaf.constructor == "webdriver|click|id|broken"


def test_marker_recover_parse():
    leaf = LanguageEngine.parse_leaf(
        "webdriver|click|css|.submit >@ { webdriver|click|css|.confirm }"
    )
    assert leaf.retry_self == 1
    assert leaf.constructor == "webdriver|click|css|.submit"
    assert leaf.recover_constructors == ["webdriver|click|css|.confirm"]


def test_marker_combo_forbidden():
    with pytest.raises(WiredError, match="совмещать"):
        LanguageEngine.parse_leaf("webdriver|click|css|.x >? >@ { webdriver|click|css|.y }")


def test_data_script_rejects_failsafe_marker():
    with pytest.raises(WiredError, match="Маркеры"):
        script_to_steps('Пусть ${n} = 10 >?')


def test_validate_constructor_strips_failsafe():
    from core.constructor_validate import validate_constructor

    assert validate_constructor("webdriver|click|css|.x >?") == []


def test_validate_data_script_path_let():
    from core.constructor_validate import validate_data_script

    diags = validate_data_script('Пусть ${user.role} = "x"')
    # let с path — валидный data|let|user.role|"x"
    assert diags == []


def test_validate_language_catches_dead_catch_garbage():
    """Catch с мусором виден в diagnostics; прогон не abort'ится заранее (как Controller)."""
    from core.constructor_validate import validate_data_script, validate_language_script

    script = "? Нажать css .ok > ХУЙ >! Назад"
    diags = validate_language_script(script)
    assert any("ХУЙ" in d["message"] for d in diags)
    assert validate_data_script(script)  # language path
    out = eval_script(script)
    assert out["ok"] is False
    assert any("ХУЙ" in d["message"] for d in out["diagnostics"])
    # primary/finally отработали (dry-run), catch не вызывался
    assert len(out["steps"]) >= 2


def test_validate_language_ok_try_catch():
    from core.constructor_validate import validate_language_script

    assert validate_language_script("? Нажать css .ok > Скриншот >! Назад") == []


def test_comments_hash_midline_css_exception():
    """`#` mid-line comment; `css #id` жив; bare `#id` → явная ошибка."""
    from core.constructor_validate import validate_data_script, validate_language_script
    from core.language_parse import lint_bare_hash_selectors, parse_script
    from core.method_id import resolve_call

    script = (
        "# Data + language\n"
        'Пусть ${email} = "user#tag@test.local"  # trailing ok\n'
        "# Пусть ${dead} = 1\n"
        'Лог ${email}\n'
    )
    nodes = parse_script(script)
    assert len(nodes) == 2
    assert validate_data_script(script) == []

    css_id = "Нажать css #email"
    assert resolve_call(css_id) == "webdriver|click|css|#email"
    assert parse_script(css_id)[0].constructor == "webdriver|click|css|#email"
    assert validate_language_script(css_id) == []

    # trailing comment after css id
    assert parse_script("Нажать css #email  # click login")[0].constructor == (
        "webdriver|click|css|#email"
    )

    bare = 'Нажать xpath //form[@class="form-controller"]'
    wire = 'webdriver|click|xpath|//form[@class="form-controller"]'
    assert resolve_call(bare) == wire
    assert parse_script(bare)[0].constructor == wire

    bad = "Нажать #email"
    lint = lint_bare_hash_selectors(bad)
    assert len(lint) == 1
    assert "css #email" in lint[0]["message"]
    assert any("css #email" in d["message"] for d in validate_language_script(bad))


def test_open_hash_route_not_eaten_by_comment_or_split():
    """Открыть ${base_url}/#/register — hash не comment, URL один аргумент."""
    from core.language_parse import parse_script
    from core.method_id import resolve_call, split_pretty_args

    line = "Открыть ${base_url}/#/register"
    assert split_pretty_args("${base_url}/#/register") == ["${base_url}/#/register"]
    assert resolve_call(line) == "webdriver|open|${base_url}/#/register"
    assert parse_script(line)[0].constructor == "webdriver|open|${base_url}/#/register"
    assert parse_script("Открыть http://juice-shop:3000/#/login")[0].constructor == (
        "webdriver|open|http://juice-shop:3000/#/login"
    )


def test_controller_failsafe_marker(monkeypatch):
    """>? на constructor → soft skip без поля failsafe в манифесте."""
    from core.controller import Controller
    from models.wired import Wired

    # Минимальный манифест через объект-заглушку шага
    calls = {"n": 0}

    class BoomAdapter:
        def boom(self):
            calls["n"] += 1
            raise RuntimeError("boom")

    ctrl = Controller.__new__(Controller)
    ctrl.language_engine = LanguageEngine()
    ctrl.action_factory = type(
        "F",
        (),
        {
            "execute": staticmethod(
                lambda component, action, params, stream: (_ for _ in ()).throw(
                    RuntimeError("boom")
                )
            )
        },
    )()
    ctrl.adapters = {"data": None}
    ctrl._manifest_problems = []
    ctrl.last_zap_report = None

    def fake_parse(raw):
        return "core", "boom", {}

    ctrl._parse_constructor = fake_parse
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_manifest_error = lambda e, **k: e
    ctrl._diary_high_alerts = lambda: None

    step = SimpleNamespace(
        constructor="core|boom >?",
        retry=0,
        retry_delay=1,
        failsafe=False,
        continue_on_failure=False,
        save_as="",
        id="s1",
        description=None,
    )
    stream = DataStream()
    scenario = SimpleNamespace(id="sc", scenario_name="t")
    assert ctrl._run_step(step, stream, scenario, "boom") is False


def test_controller_recover_retry(monkeypatch):
    from core.controller import Controller

    state = {"primary": 0, "recover": 0}

    def execute(component, action, params, stream):
        if action == "primary":
            state["primary"] += 1
            if state["primary"] == 1:
                raise RuntimeError("need confirm")
            return "ok"
        if action == "recover":
            state["recover"] += 1
            return "r"
        raise AssertionError(action)

    ctrl = Controller.__new__(Controller)
    ctrl.language_engine = LanguageEngine()
    ctrl.action_factory = type("F", (), {"execute": staticmethod(execute)})()
    ctrl.adapters = {"data": None}
    ctrl._manifest_problems = []
    ctrl.last_zap_report = None

    def parse(raw):
        parts = raw.split("|")
        return parts[0], parts[1], {}

    ctrl._parse_constructor = parse
    ctrl._diary = lambda *a, **k: None
    ctrl._attach_call_details = lambda *a, **k: None
    ctrl._enrich_manifest_error = lambda e, **k: e
    ctrl._diary_high_alerts = lambda: None

    step = SimpleNamespace(
        constructor="core|primary >@ { core|recover }",
        retry=0,
        retry_delay=1,
        failsafe=False,
        continue_on_failure=False,
        save_as="",
        id="s1",
        description=None,
    )
    assert ctrl._run_step(step, DataStream(), SimpleNamespace(id="sc"), "pay") is True
    assert state["primary"] == 2
    assert state["recover"] == 1
