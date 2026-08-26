# -*- coding: utf-8 -*-
"""Волна B: Подстрока / Заменить / Разделить / Обрезать."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.errors import WiredError
from core.language_words import is_reserved_language_word
from core.pretty_data import pretty_line_to_wire
from tools.data_playground import eval_script


def test_reserved_wave_b():
    for w in ("Подстрока", "Заменить", "Разделить", "Обрезать"):
        assert is_reserved_language_word(w)


def test_pretty_substring_replace_split_trim():
    w, s = pretty_line_to_wire("Пусть ${part} = Подстрока ${s} 0 5")
    assert s == "part"
    assert w == "data|substring|${s}|0|5"

    w2, s2 = pretty_line_to_wire("Пусть ${part} = Подстрока ${s} 2")
    assert s2 == "part"
    assert w2 == "data|substring|${s}|2"

    w3, s3 = pretty_line_to_wire('Пусть ${t} = Заменить ${s} "old" "new"')
    assert s3 == "t"
    assert w3 == 'data|replace|${s}|"old"|"new"'

    w4, s4 = pretty_line_to_wire('Пусть ${parts} = Разделить ${s} ","')
    assert s4 == "parts"
    assert w4 == 'data|split|${s}|","'

    w5, s5 = pretty_line_to_wire("Пусть ${t} = Обрезать ${s}")
    assert s5 == "t"
    assert w5 == "data|trim|${s}"


def test_pretty_arg_count_errors():
    with pytest.raises(WiredError, match="Подстрока"):
        pretty_line_to_wire("Пусть ${x} = Подстрока ${s}")
    with pytest.raises(WiredError, match="Заменить"):
        pretty_line_to_wire('Пусть ${x} = Заменить ${s} "a"')
    with pytest.raises(WiredError, match="Разделить"):
        pretty_line_to_wire("Пусть ${x} = Разделить ${s}")
    with pytest.raises(WiredError, match="Обрезать"):
        pretty_line_to_wire("Пусть ${x} = Обрезать")


def test_eval_string_ops_b():
    out = eval_script(
        'Пусть ${s} = "hello world"\n'
        "Пусть ${part} = Подстрока ${s} 0 5\n"
        "Пусть ${tail} = Подстрока ${s} 6\n"
        "Пусть ${neg} = Подстрока ${s} -5\n"
        'Пусть ${t} = Заменить ${s} "world" "bank"\n'
        'Пусть ${parts} = Разделить ${s} " "\n'
        'Пусть ${trim} = Обрезать "  x  "\n'
        'Пусть ${all} = Заменить "aaa" "a" "b"\n'
    )
    assert out["ok"] is True
    v = out["variables"]
    assert v["part"] == "hello"
    assert v["tail"] == "world"
    assert v["neg"] == "world"
    assert v["t"] == "hello bank"
    assert v["parts"] == ["hello", "world"]
    assert v["trim"] == "x"
    assert v["all"] == "bbb"


def test_eval_substring_oob_like_python():
    out = eval_script('Пусть ${s} = "ab"\nПусть ${p} = Подстрока ${s} 10 20\n')
    assert out["variables"]["p"] == ""
