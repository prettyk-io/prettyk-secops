# -*- coding: utf-8 -*-
"""Арифметика + / − в Пусть и Если."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.data_stream import DataStream
from core.errors import WiredError
from core.expr import eval_sum_diff, has_sum_diff_ops, parse_value_or_arith
from core.language_engine import LanguageEngine
from tools.data_playground import eval_script


def test_has_sum_diff_ops():
    assert has_sum_diff_ops("${a} + 1")
    assert has_sum_diff_ops("${hi} - ${lo}")
    assert has_sum_diff_ops("1+-2")
    assert not has_sum_diff_ops("-1")
    assert not has_sum_diff_ops("${a}")
    assert not has_sum_diff_ops('"1 + 2"')
    assert not has_sum_diff_ops("")


def test_eval_sum_diff_basic():
    stream = DataStream({"a": 2, "hi": 10, "lo": 3})
    assert eval_sum_diff("${a} + 1", stream.get_path) == 3
    assert eval_sum_diff("${hi} - ${lo}", stream.get_path) == 7
    assert eval_sum_diff("1 + 2 + 3", stream.get_path) == 6
    assert eval_sum_diff("10 - 1 - 2", stream.get_path) == 7
    assert eval_sum_diff("1 + -2", stream.get_path) == -1
    assert eval_sum_diff("-1 + 5", stream.get_path) == 4


def test_eval_sum_diff_rejects_strings():
    stream = DataStream({"a": "x", "b": "y"})
    with pytest.raises(WiredError, match="Склеить"):
        eval_sum_diff("${a} + ${b}", stream.get_path)


def test_parse_value_or_arith_quoted_untouched():
    stream = DataStream()
    assert parse_value_or_arith('"1 + 2"', stream.get_path) == "1 + 2"


def test_let_increment():
    out = eval_script("Пусть ${i} = 1\nПусть ${next_i} = ${i} + 1\n")
    assert out["ok"] is True
    assert out["variables"]["next_i"] == 2


def test_condition_with_arith():
    eng = LanguageEngine()
    stream = DataStream({"a": 2, "base": 100, "status": 250})
    assert eng.eval_condition("${a} + 1 == 3", stream) is True
    assert eng.eval_condition("${status} >= ${base} + 100", stream) is True
    assert eng.eval_condition("${a} + 1 == 99", stream) is False


def test_eval_script_if_arith():
    out = eval_script(
        "Пусть ${n} = 1\n"
        "Пусть ${next_n} = ${n} + 1\n"
        'Если ${next_n} + 1 == 3 {\n  Лог "arithmetic true"\n} Иначе {\n  Лог "arithmetic false"\n}\n'
    )
    assert out["ok"] is True
    assert out["variables"]["next_n"] == 2
