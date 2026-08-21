# -*- coding: utf-8 -*-
"""Вычисляемый RHS на core: генераторы данных и время."""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.constructor_validate import validate_constructor
from core.errors import WiredError
from core.pretty_data import pretty_line_to_wire
from tools.data_playground import eval_script


@pytest.mark.parametrize(
    "line,wire,save_as",
    [
        ("Пусть ${email} = СлучайныйEmail", "core|generate_random_email", "email"),
        (
            'Пусть ${email} = СлучайныйEmail "juice.sh"',
            "core|generate_random_email|juice.sh",
            "email",
        ),
        ("Пусть ${id} = UUID", "core|generate_uuid", "id"),
        ("Пусть ${pin} = СлучайныеЦифры 4", "core|generate_random_digits|4", "pin"),
        ("Пусть ${n} = СлучайноеЧисло 1 100", "core|generate_random_int|1|100", "n"),
        ("Пусть ${ts} = Таймстамп", "core|current_timestamp", "ts"),
        ('Пусть ${d} = Сейчас "%d.%m.%Y"', "core|current_datetime|%d.%m.%Y", "d"),
    ],
)
def test_pretty_core_rhs(line, wire, save_as):
    assert pretty_line_to_wire(line) == (wire, save_as)


def test_plain_assignment_not_captured_by_core_rhs():
    assert pretty_line_to_wire('Пусть ${role} = "admin"') == ("data|let|role|\"admin\"", None)
    assert pretty_line_to_wire("Пусть ${copy} = ${role}") == ("data|let|copy|${role}", None)


def test_core_rhs_arity_and_secret_errors():
    with pytest.raises(WiredError, match="СлучайноеЧисло"):
        pretty_line_to_wire("Пусть ${n} = СлучайноеЧисло 1")
    with pytest.raises(WiredError, match="ПоШаблону"):
        pretty_line_to_wire("Пусть ${x} = ПоШаблону")
    with pytest.raises(WiredError, match="нельзя пометить секретом"):
        pretty_line_to_wire("Секрет ${p} = СлучайнаяСтрока 12")


def test_core_rhs_validates_inside_language_script():
    script = "Пусть ${email} = СлучайныйEmail\nЛог ${email}"
    assert [d for d in validate_constructor(script) if d["severity"] == "error"] == []


def test_eval_core_rhs_gives_real_values():
    out = eval_script(
        "Пусть ${email} = СлучайныйEmail\n"
        'Пусть ${corp} = СлучайныйEmail "juice.sh"\n'
        "Пусть ${pin} = СлучайныеЦифры 4\n"
        "Пусть ${n} = СлучайноеЧисло 5 5\n"
        "Пусть ${id} = UUID\n"
        'Пусть ${day} = Сейчас "%Y"\n'
        "Пусть ${ts} = Таймстамп\n"
    )
    assert out["ok"] is True
    v = out["variables"]
    assert "@example.com" in v["email"]
    assert v["corp"].endswith("@juice.sh")
    assert re.fullmatch(r"\d{4}", v["pin"])
    assert int(v["n"]) == 5
    assert re.fullmatch(r"[0-9a-f-]{36}", v["id"])
    assert re.fullmatch(r"\d{4}", v["day"])
    assert int(v["ts"]) > 1_700_000_000


def test_format_datetime_accepts_string_from_stream():
    """`Сейчас` кладёт в стрим строку — ФорматДаты не должен падать на strftime."""
    out = eval_script(
        'Пусть ${now} = Сейчас\n'
        'Пусть ${day} = ФорматДаты ${now} "%d.%m.%Y"\n'
        'Пусть ${dt} = РазобратьДату "2026-08-03 01:15:00"\n'
        'Пусть ${hm} = ФорматДаты ${dt} "%H:%M"\n'
    )
    assert out["ok"] is True
    v = out["variables"]
    assert re.fullmatch(r"\d{2}\.\d{2}\.\d{4}", v["day"])
    assert v["hm"] == "01:15"


def test_format_datetime_on_garbage_says_what_it_wanted():
    from adapters.data_processor import DataProcessor

    with pytest.raises(ValueError, match="не разобрал дату"):
        DataProcessor.format_datetime("не дата", "%d.%m.%Y")


def test_generated_email_is_unique_per_call():
    out = eval_script(
        "Пусть ${a} = СлучайныйEmail\nПусть ${b} = СлучайныйEmail\n"
    )
    assert out["variables"]["a"] != out["variables"]["b"]
