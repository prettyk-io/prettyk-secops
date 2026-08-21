# -*- coding: utf-8 -*-
"""
Инспектор: ассерты для данных/коллекций (runtime).

Канон авторства — MethodId `Проверить*` (часть мапится сюда, часть на webdriver).
Wire `inspector|…` — legacy: validate/runtime принимают, в AC/keywords surface не светим (G-09).

Все методы — статические.
"""
import logging

logger = logging.getLogger("orchestrator")


class Inspector:
    """Статический класс для проверок, логирования и сбора информации."""

    # ========== АССЕРТЫ ==========

    @staticmethod
    def assert_equals(expected, actual, message=None):
        if expected != actual:
            raise AssertionError(message or f"Expected '{expected}', got '{actual}'")
        return True

    @staticmethod
    def assert_not_equals(expected, actual, message=None):
        if expected == actual:
            raise AssertionError(message or f"Values are equal: '{expected}'")
        return True

    @staticmethod
    def assert_true(condition, message=None):
        if not condition:
            raise AssertionError(message or "Condition is False")
        return True

    @staticmethod
    def assert_false(condition, message=None):
        if condition:
            raise AssertionError(message or "Condition is True")
        return True

    @staticmethod
    def assert_contains(string, substring, message=None):
        if substring not in string:
            raise AssertionError(message or f"'{substring}' not found in '{string}'")
        return True

    @staticmethod
    def assert_not_contains(string, substring, message=None):
        if substring in string:
            raise AssertionError(message or f"'{substring}' found in '{string}'")
        return True

    @staticmethod
    def assert_in(item, collection, message=None):
        if item not in collection:
            raise AssertionError(message or f"{item} not in {collection}")
        return True

    @staticmethod
    def assert_not_in(item, collection, message=None):
        if item in collection:
            raise AssertionError(message or f"{item} found in {collection}")
        return True

    @staticmethod
    def assert_greater(a, b, message=None):
        if a <= b:
            raise AssertionError(message or f"{a} <= {b}")
        return True

    @staticmethod
    def assert_less(a, b, message=None):
        if a >= b:
            raise AssertionError(message or f"{a} >= {b}")
        return True

    @staticmethod
    def assert_between(value, low, high, message=None):
        if not (low <= value <= high):
            raise AssertionError(message or f"{value} not between {low} and {high}")
        return True

    @staticmethod
    def assert_length(collection, expected_length, message=None):
        if len(collection) != expected_length:
            raise AssertionError(message or f"Length {len(collection)} != {expected_length}")
        return True

    @staticmethod
    def assert_is_empty(collection, message=None):
        if len(collection) > 0:
            raise AssertionError(message or f"Collection is not empty: {collection}")
        return True

    @staticmethod
    def assert_is_not_empty(collection, message=None):
        if len(collection) == 0:
            raise AssertionError(message or "Collection is empty")
        return True


"""
================================================================================
Файл: adapters/inspector.py
Дата создания: 27.07.2026
Версия: 1.0

Методы (рабочие):
- assert_equals(expected, actual, message=None)
- assert_not_equals(expected, actual, message=None)
- assert_true(condition, message=None)
- assert_false(condition, message=None)
- assert_contains(string, substring, message=None)   # ключевые параметры: string, substring
- assert_not_contains(string, substring, message=None)
- assert_in(item, collection, message=None)
- assert_not_in(item, collection, message=None)
- assert_greater(a, b, message=None)
- assert_less(a, b, message=None)
- assert_between(value, low, high, message=None)
- assert_length(collection, expected_length, message=None)
- assert_is_empty(collection, message=None)
- assert_is_not_empty(collection, message=None)
- log_message(message, level="INFO")
- log_variable(name, value)

Все методы статические, принимают именованные параметры согласно ТЗ.
Для assert_contains параметры: string и substring (не expected/actual).
================================================================================
"""
