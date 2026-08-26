# -*- coding: utf-8 -*-
from core.constructor_validate import (
    _locate_in_script,
    _token_span_in_text,
    validate_constructor,
)


def test_locate_in_script_line_column():
    script = 'Пауза 1\nЛогАтаки "x"\nПауза 2'
    start, end, line, col = _locate_in_script(script, 'ЛогАтаки "x"')
    assert line == 2
    assert col == 1
    assert script[start:end] == 'ЛогАтаки "x"'


def test_locate_sequential_skips_earlier_duplicate():
    script = "Пауза 1\nПауза 1\nНеизвестныйМетод abc"
    start, end, line, col = _locate_in_script(script, "Пауза 1", from_pos=0)
    assert line == 1
    start2, end2, line2, col2 = _locate_in_script(script, "Пауза 1", from_pos=end)
    assert line2 == 2
    assert start2 > start


def test_validate_unknown_method_has_line():
    script = "Пауза 1\nНеизвестныйМетод abc\nПауза 2"
    diags = [d for d in validate_constructor(script) if d["severity"] == "error"]
    assert diags
    assert diags[0].get("line") == 2
    assert diags[0].get("column") == 1
    assert diags[0]["start"] > 0


def test_validate_second_duplicate_leaf_line():
    script = "Пауза 1\nПауза 1\nНеизвестныйМетод abc"
    diags = [d for d in validate_constructor(script) if d["severity"] == "error"]
    assert diags
    assert diags[0].get("line") == 3


def test_validate_nested_body_line():
    script = "Цикл 1 {\n  Пауза 1\n  НеизвестныйМетод abc\n}"
    diags = [d for d in validate_constructor(script) if d["severity"] == "error"]
    assert diags
    assert diags[0].get("line") == 3


def test_token_span_points_inside_line():
    text = 'Пусть $bad-name = "x"'
    msg = "Некорректный сегмент пути 'bad-name' в 'bad-name'."
    start, end = _token_span_in_text(text, msg)
    assert text[start:end] == "bad-name"
    assert start > 0


def test_validate_bad_let_name_column():
    script = 'Пауза 1\nПусть $bad-name = "x"\nПауза 2'
    diags = [d for d in validate_constructor(script) if d["severity"] == "error"]
    assert diags
    d0 = diags[0]
    assert d0.get("line") == 2
    assert d0.get("column", 1) > 1
    assert "bad-name" in script[d0["start"] : d0["end"]] or d0["column"] > 1


def test_validate_unclosed_string_not_at_1_1():
    """Посаженная битая кавычка — line/column на ней, не 1:1."""
    script = 'Пусть $username = СлучайныйEmail\nЛог "broken\nПауза 1'
    diags = [d for d in validate_constructor(script) if d["severity"] == "error"]
    assert diags
    d0 = diags[0]
    assert "незакрытая строка" in d0["message"]
    assert d0.get("line") == 2
    assert d0.get("column", 1) >= 4  # «Лог "…»
    assert d0["start"] > 0
