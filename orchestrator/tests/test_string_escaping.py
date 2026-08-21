# -*- coding: utf-8 -*-
"""
Отдельный смоук: кавычки, экранирование, пустые строки, интерполяция,
Склеить / Содержит на краях.

Не браузер — pretty + DataStream / eval_script.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.data_stream import DataStream
from core.errors import WiredError
from core.method_id import split_pretty_args
from core.pretty_data import pretty_line_to_wire
from core.wire_split import split_wire
from tools.data_playground import eval_script


# ---------------------------------------------------------------------------
# parse_value / кавычки
# ---------------------------------------------------------------------------


def test_parse_empty_and_escapes():
    stream = DataStream({"id": "42", "empty": ""})

    assert stream.parse_value('""') == ""
    assert stream.parse_value("''") == ""
    assert stream.parse_value(r'"say \"hi\""') == 'say "hi"'
    assert stream.parse_value(r"'it\'s'") == "it's"
    assert stream.parse_value(r'"a\\b"') == "a\\b"
    assert stream.parse_value('"user=${id}"') == "user=42"
    assert stream.parse_value('"${empty}"') == ""
    assert stream.parse_value('"${id}-${empty}-x"') == "42--x"


def test_parse_unclosed_quote_raises():
    stream = DataStream()
    with pytest.raises(WiredError):
        stream.parse_value('"no-end')


def test_split_pretty_args_empty_and_escaped():
    assert split_pretty_args('""') == [""]
    assert split_pretty_args('${a} ""') == ["${a}", ""]
    assert split_pretty_args(r'"a\"b" "c"') == ['a"b', "c"]
    assert split_pretty_args(r'"a\\b"') == ["a\\b"]
    assert split_pretty_args(r'"\d+"') == [r"\d+"]
    assert split_pretty_args('  "  x  "  ') == ["  x  "]


def test_split_wire_respects_quotes_and_refs():
    assert split_wire('data|concat|Список [${q}, "|", ${bs}]') == [
        "data",
        "concat",
        'Список [${q}, "|", ${bs}]',
    ]
    assert split_wire('data|let|x|"a|b"') == ["data", "let", "x", '"a|b"']
    assert split_wire("core|sleep|") == ["core", "sleep", ""]


# ---------------------------------------------------------------------------
# pretty → wire
# ---------------------------------------------------------------------------


def test_pretty_concat_empty_literal():
    wire, save = pretty_line_to_wire('Пусть ${x} = Склеить ""')
    assert save == "x"
    assert wire == 'data|concat|Список [""]'


def test_pretty_contains_empty_needle():
    wire, save = pretty_line_to_wire('Пусть ${ok} = Содержит ${hay} ""')
    assert save == "ok"
    assert wire == 'data|contains|${hay}|""'


def test_pretty_concat_bare_raises():
    with pytest.raises(WiredError, match="хотя бы один"):
        pretty_line_to_wire("Пусть ${x} = Склеить")


def test_pretty_concat_escaped_quote_chunk():
    wire, save = pretty_line_to_wire(r'Пусть ${s} = Склеить "a\"b" "c"')
    assert save == "s"
    assert 'a\\"b' in wire or 'a"b' in wire
    # wire должен быть валидным Список […] для parse_value
    stream = DataStream()
    from adapters.data_adapter import DataAdapter

    data = DataAdapter()
    data.bind(stream)
    parts = wire.split("|", 2)[2]
    assert data.concat(parts) == 'a"bc'


# ---------------------------------------------------------------------------
# runtime (eval_script)
# ---------------------------------------------------------------------------


def test_eval_empty_concat_contains():
    out = eval_script(
        'Пусть ${a} = ""\n'
        'Пусть ${b} = Склеить ${a} "x" ${a}\n'
        'Пусть ${only} = Склеить ""\n'
        'Пусть ${hay} = "ab"\n'
        'Пусть ${ok_empty_needle} = Содержит ${hay} ""\n'
        'Пусть ${ok_empty_hay} = Содержит ${a} ""\n'
        'Пусть ${no} = Содержит ${hay} "z"\n'
    )
    assert out["ok"] is True
    assert out["variables"]["b"] == "x"
    assert out["variables"]["only"] == ""
    assert out["variables"]["ok_empty_needle"] is True  # Python: "" in "ab"
    assert out["variables"]["ok_empty_hay"] is True
    assert out["variables"]["no"] is False


def test_eval_escape_quotes_and_backslash():
    out = eval_script(
        r'Пусть ${q} = "say \"hi\""' + "\n"
        r'Пусть ${bs} = "a\\b"' + "\n"
        r"Пусть ${sq} = 'it\'s'" + "\n"
        'Пусть ${id} = "7"\n'
        'Пусть ${msg} = "id=${id} q=${q}"\n'
        r'Пусть ${joined} = Склеить ${q} "|" ${bs}' + "\n"
    )
    assert out["ok"] is True
    assert out["variables"]["q"] == 'say "hi"'
    assert out["variables"]["bs"] == "a\\b"
    assert out["variables"]["sq"] == "it's"
    assert out["variables"]["msg"] == 'id=7 q=say "hi"'
    assert out["variables"]["joined"] == 'say "hi"|a\\b'


def test_eval_interp_missing_strict():
    with pytest.raises(WiredError):
        eval_script('Пусть ${msg} = "x=${missing}"')


def test_eval_spaces_inside_quoted_concat():
    out = eval_script('Пусть ${s} = Склеить "  a  " "b"')
    assert out["ok"] is True
    assert out["variables"]["s"] == "  a  b"
