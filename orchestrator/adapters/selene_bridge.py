# -*- coding: utf-8 -*-
"""
Мост KDT ↔ Selene (питоний порт Selenide).

Создание драйвера (local/Selenoid/ZAP-proxy) остаётся на Selenium.
Все ожидания и действия с элементами — через Selene: lazy-локаторы,
встроенный wait/retry до timeout, как в банковском Java-Selenide.
"""
from __future__ import annotations

from selene import browser, by, be, have, query, command
from selenium.webdriver.remote.webdriver import WebDriver


def bind_driver(driver: WebDriver | None, timeout: float) -> None:
    """Подключить уже созданный WebDriver к shared `browser` Selene."""
    browser.config.timeout = float(timeout)
    # Жизненный цикл сессии ведёт KDT (Controller.shutdown), не atexit Selene.
    browser.config.hold_driver_at_exit = True
    # Как Selenide: не кликать, пока поверх элемента другой слой (Material/CDK).
    browser.config.wait_for_no_overlap_found_by_js = True
    browser.config.driver = driver


def unbind_driver() -> None:
    """Отвязать драйвер без quit — quit делает адаптер сам."""
    try:
        browser.config.hold_driver_at_exit = True
        browser.config.driver = None
    except Exception:
        pass


def to_locator(selector_type: str, selector_value: str):
    """
    KDT (selector_type, selector_value) → локатор Selene.

    Те же типы, что понимал WebDriverAdapter._get_by: css/xpath/id/name/class/
    tag/link/partial_link/text/contains_text.
    """
    kind = (selector_type or "").strip().lower()
    value = selector_value
    if kind == "css":
        return by.css(value)
    if kind == "xpath":
        return by.xpath(value)
    if kind == "id":
        return by.id(value)
    if kind == "name":
        return by.name(value)
    if kind in ("class", "class_name"):
        return by.class_name(value)
    if kind in ("tag", "tag_name"):
        # Selene by не экспонирует tag_name напрямую — css по тегу.
        return by.css(value)
    if kind in ("link", "link_text"):
        return by.link_text(value)
    if kind in ("partial_link", "partial_link_text"):
        return by.partial_link_text(value)
    if kind == "text":
        return by.text(value)
    if kind in ("contains_text", "text_contains"):
        return by.partial_text(value)
    # Как раньше: xpath-подобные строки → xpath, иначе css.
    if value.startswith(("/", "(", "./")):
        return by.xpath(value)
    return by.css(value)


def element(selector_type: str, selector_value: str):
    return browser.element(to_locator(selector_type, selector_value))


def collection(selector_type: str, selector_value: str):
    return browser.all(to_locator(selector_type, selector_value))


def with_timeout(seconds: float | None):
    """Временный timeout для одного действия (контекст Selene `with_`)."""
    if seconds is None or seconds == "":
        return browser
    return browser.with_(timeout=float(seconds))
