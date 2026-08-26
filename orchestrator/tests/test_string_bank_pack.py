# -*- coding: utf-8 -*-
"""Банк-пакет строк: ИзвлечьРег*, РазделитьРег, starts/ends, case, fetch, Убрать + условия."""
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

_BANK = (
    "ИзвлечьРег",
    "ИзвлечьРегВсе",
    "РазделитьРег",
    "Начинается",
    "Заканчивается",
    "Верхний",
    "Нижний",
    "ВзятьДо",
    "ВзятьПосле",
    "Убрать",
)


def test_reserved_bank_words():
    for w in _BANK:
        assert is_reserved_language_word(w)


def test_pretty_bank_wires():
    cases = [
        ('Пусть ${c} = ИзвлечьРег ${s} "(\\d+)"', "data|extract_re|", "c"),
        ('Пусть ${n} = ИзвлечьРегВсе ${s} "\\d+"', "data|extract_re_all|", "n"),
        ('Пусть ${p} = РазделитьРег ${s} "\\s+"', "data|split_re|", "p"),
        ('Пусть ${ok} = Начинается ${s} "https"', 'data|starts_with|${s}|"https"', "ok"),
        ('Пусть ${ok} = Заканчивается ${s} ".com"', 'data|ends_with|${s}|".com"', "ok"),
        ("Пусть ${u} = Верхний ${s}", "data|upper|${s}", "u"),
        ("Пусть ${l} = Нижний ${s}", "data|lower|${s}", "l"),
        ('Пусть ${a} = ВзятьДо ${s} "@"', 'data|fetch_left|${s}|"@"', "a"),
        ('Пусть ${b} = ВзятьПосле ${s} "@"', 'data|fetch_right|${s}|"@"', "b"),
        ('Пусть ${t} = Убрать ${s} "x"', 'data|remove_str|${s}|"x"', "t"),
    ]
    for pretty, wire, save in cases:
        w, s = pretty_line_to_wire(pretty)
        assert s == save
        assert w.startswith(wire) if wire.endswith("|") else w == wire
        if "extract_re" in wire or "split_re" in wire:
            assert "d+" in w or "s+" in w


def test_eval_bank_pack():
    out = eval_script(
        'Пусть ${digits} = "id=42;id=7"\n'
        'Пусть ${code} = ИзвлечьРег ${digits} "(\\d+)"\n'
        'Пусть ${nums} = ИзвлечьРегВсе ${digits} "\\d+"\n'
        'Пусть ${parts} = РазделитьРег "a  b  c" "\\s+"\n'
        'Пусть ${hi} = Верхний "ok"\n'
        'Пусть ${lo} = Нижний "OK"\n'
        'Пусть ${email} = "user@test.local"\n'
        'Пусть ${left} = ВзятьДо ${email} "@"\n'
        'Пусть ${right} = ВзятьПосле ${email} "@"\n'
        'Пусть ${clean} = Убрать "axaxa" "x"\n'
        'Пусть ${sw} = Начинается ${email} "user"\n'
        'Пусть ${ew} = Заканчивается ${email} ".local"\n'
        'Если ${email} начинается "user" {\n'
        '  Пусть ${flag} = 1\n'
        "}\n"
        'Если ${email} заканчивается ".local" {\n'
        '  Пусть ${flag2} = 1\n'
        "}\n"
    )
    assert out["ok"] is True, out
    v = out["variables"]
    assert v["code"] == "42"
    assert v["nums"] == ["42", "7"]
    assert v["parts"] == ["a", "b", "c"]
    assert v["hi"] == "OK"
    assert v["lo"] == "ok"
    assert v["left"] == "user"
    assert v["right"] == "test.local"
    assert v["clean"] == "aaa"
    assert v["sw"] is True
    assert v["ew"] is True
    assert v["flag"] == 1
    assert v["flag2"] == 1


def test_extract_re_no_match_errors():
    with pytest.raises(WiredError, match="ИзвлечьРег"):
        eval_script('Пусть ${x} = ИзвлечьРег "abc" "\\d+"')


def test_fetch_missing_delim_errors():
    with pytest.raises(WiredError, match="ВзятьДо"):
        pretty_line_to_wire('Пусть ${x} = ВзятьДо ${s}')
    with pytest.raises(WiredError, match="ВзятьДо"):
        eval_script('Пусть ${x} = ВзятьДо "abc" "@"')
