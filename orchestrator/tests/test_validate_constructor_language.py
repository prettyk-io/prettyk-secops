# -*- coding: utf-8 -*-
"""validate_constructor: language (? / Пусть) не режется как wire."""

from core.constructor_validate import validate_constructor
from core.language_parse import is_language_script


def test_is_language_try_and_let():
    assert is_language_script("? Нажать css .ok > Лог e >! Назад")
    assert is_language_script("? {\n  Пауза 1\n} > {\n  Лог e\n} >! {\n  Пауза 1\n}")
    assert is_language_script("? {\n\n} > {\n\n} >! {\n\n}")
    assert is_language_script("? {")  # черновик — всё равно language, не wire
    assert is_language_script('Пусть ${role} = "admin"')
    assert is_language_script('Лог "x"')
    assert is_language_script('Лог "x"\nLogin.Войти')
    assert is_language_script("Login.Войти")
    assert not is_language_script("webdriver|open|https://x")


def test_validate_constructor_accepts_linear_try():
    diags = validate_constructor("? Нажать css .ok > Лог e >! Назад")
    errors = [d for d in diags if d.get("severity") == "error"]
    assert errors == [], errors


def test_validate_constructor_accepts_empty_block_try():
    """Скелет ? { } > { } >! { } — не «компонент|действие»."""
    src = "? {\n\n} > {\n\n} >! {\n\n}"
    assert is_language_script(src)
    errors = [d for d in validate_constructor(src) if d.get("severity") == "error"]
    assert errors == [], errors


def test_validate_constructor_accepts_methodid_and_page_call():
    """S2: MethodId + page.action — не wire component|action."""
    src = 'Лог "role=${role} q=${payload.q} n=${payload.n}"\nLogin.Войти'
    assert is_language_script(src)
    errors = [d for d in validate_constructor(src) if d.get("severity") == "error"]
    assert errors == [], errors
    assert validate_constructor('Лог "hi"') == []
    assert validate_constructor('ЛогСообщение "legacy"') == []  # alias
    assert validate_constructor('Логировать "legacy"') == []  # alias


def test_validate_constructor_accepts_let():
    diags = validate_constructor('Пусть ${role} = "admin"')
    errors = [d for d in diags if d.get("severity") == "error"]
    assert errors == [], errors
