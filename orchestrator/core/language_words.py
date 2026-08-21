# -*- coding: utf-8 -*-
"""
Две корзины имён языка KDT (logic-construction).

Язык (LanguageEngine) — не светить как MethodId адаптера.
MethodId — каталог keywords.json / ActionFactory.
"""
from __future__ import annotations

# Парсер / Monaco: это не webdriver|… и не component из каталога.
RESERVED_LANGUAGE_WORDS = frozenset(
    {
        # присваивание / данные
        "Пусть",
        "Секрет",
        "Список",
        "Объект",
        "Словарь",
        "Элемент",
        "Локатор",
        "Селектор",
        "КоллекцияЭлементов",
        "Добавить",
        "Удалить",
        "Размер",
        "Содержит",
        "Склеить",
        "Подстрока",
        "Заменить",
        "Разделить",
        "Обрезать",
        "СовпадаетРег",
        "ЗаменитьРег",
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
        "Импорт",
        # управление (волна 2 execute)
        "Если",
        "ИначеЕсли",
        "Иначе",
        "То",
        "Цикл",
        "ДляКаждого",
        "В",
        "Пока",
        "Попробовать",
        "Перехватить",
        "Финализировать",
        # aliases (старые pretty)
        "Поймать",
        "ВКонце",
        "Группа",
        "Прервать",
        "Продолжить",
        "Завершить",
        # legacy pretty (ещё парсим)
        "ДобавитьВСписок",
        "УдалитьИзСписка",
        "ПоложитьВОбъект",
        "ВзятьИзОбъекта",
    }
)

# Маркеры листа (не слова, но зарезервированные суффиксы).
LEAF_MARKERS = frozenset({">?", ">@", ">!"})

# Аудит каталога адаптеров (волна 1): не удаляем из JSON здесь, помечаем.
# При полном MethodId-resolve (волна 2) — выкинуть из surface или пометить stub.
KNOWN_STUB_ACTIONS = frozenset(
    {
        "browser.set_proxy",
        "browser.disable_proxy",
    }
)

# Не keyword'ы сценария (совпадает с Controller / export_keywords).
NON_KEYWORD_METHODS = frozenset(
    {"bind", "set_context", "shutdown", "shutdown_all", "update_driver", "resolve"}
)


def is_reserved_language_word(token: str) -> bool:
    return token.strip() in RESERVED_LANGUAGE_WORDS
