# -*- coding: utf-8 -*-
"""Regex v1: условие рег + СовпадаетРег / ЗаменитьРег."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.data_stream import DataStream
from core.errors import WiredError
from core.language_engine import LanguageEngine
from core.language_words import is_reserved_language_word
from core.pretty_data import pretty_line_to_wire
from tools.data_playground import eval_script


def test_reserved_regex_words():
    assert is_reserved_language_word("СовпадаетРег")
    assert is_reserved_language_word("ЗаменитьРег")


def test_pretty_match_replace_re():
    w, s = pretty_line_to_wire(r'Пусть ${ok} = СовпадаетРег ${s} "^\d+$"')
    assert s == "ok"
    assert w.startswith("data|match_re|${s}|")
    assert "\\d" in w or "d+" in w

    w2, s2 = pretty_line_to_wire(r'Пусть ${t} = ЗаменитьРег ${s} "\s+" " "')
    assert s2 == "t"
    assert w2.startswith("data|replace_re|")


def test_condition_reg():
    eng = LanguageEngine()
    stream = DataStream({"s": "1234", "pan": "4111"})
    assert eng.eval_condition(r'${s} рег "^\d{4}$"', stream) is True
    assert eng.eval_condition(r'${s} рег "^[a-z]+$"', stream) is False
    assert eng.eval_condition(r'${pan} рег "^4"', stream) is True
    assert eng.eval_condition(r'Не (${pan} рег "^5")', stream) is True


def test_condition_reg_bad_pattern():
    eng = LanguageEngine()
    stream = DataStream({"s": "x"})
    with pytest.raises(WiredError, match="Битый regex"):
        eng.eval_condition(r'${s} рег "["', stream)


def test_eval_match_and_replace_re():
    out = eval_script(
        'Пусть ${digits} = "id=42"\n'
        r'Пусть ${isNum} = СовпадаетРег ${digits} "\d+"' + "\n"
        r'Пусть ${clean} = ЗаменитьРег ${digits} "\D+" ""' + "\n"
        r'Пусть ${spaced} = ЗаменитьРег "a   b" "\s+" " "' + "\n"
    )
    assert out["ok"] is True
    assert out["variables"]["isNum"] is True
    assert out["variables"]["clean"] == "42"
    assert out["variables"]["spaced"] == "a b"


def test_совпадает_still_exact():
    eng = LanguageEngine()
    stream = DataStream({"s": "ab"})
    assert eng.eval_condition('${s} совпадает "ab"', stream) is True
    assert eng.eval_condition(r'${s} совпадает "a."', stream) is False
