# -*- coding: utf-8 -*-
"""MethodId RU → wire."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.errors import WiredError
from core.language_parse import parse_script
from core.lang_ast import ActionNode, LoopNode
from core.method_id import (
    ensure_wire,
    facade_names,
    lookup_facade_method,
    lookup_method_id,
    method_tier,
    resolve_call,
    resolve_line,
    split_pretty_args,
)
from core.language_words import RESERVED_LANGUAGE_WORDS


def test_catalog_no_overlap_with_language():
    assert lookup_method_id("Нажать") == ("webdriver", "click")
    assert lookup_method_id("НажатьКнопку") == ("webdriver", "click")
    assert lookup_method_id("Назад") == ("webdriver", "back")
    assert lookup_method_id("Если") is None
    assert "Нажать" not in RESERVED_LANGUAGE_WORDS


def test_root_promotes_domain_essentials():
    assert lookup_method_id("Сканер") == ("scanner", "spider_scan")
    assert lookup_method_id("СканерЛокальный") == ("scanner", "spider_scan_local")
    assert lookup_method_id("Паук") is None
    assert lookup_method_id("Краулер") == ("scanner", "ajax_spider_scan")
    assert lookup_method_id("АктивноеСканирование") == ("scanner", "active_scan")
    assert lookup_method_id("HttpGet") == ("http", "get")
    assert lookup_method_id("ОчиститьКэш") == ("browser", "cdp_clear_browser_cache")
    assert method_tier("Сканер") == "ui"
    assert method_tier("СканерЛокальный") == "util"
    assert method_tier("ПолучитьАлерты") == "util"
    assert lookup_method_id("Отчётscanner") is None  # только scanner Отчёт
    assert method_tier("ТекстыЭлементовСТекстом") == "util"
    assert method_tier("НажатьJS") == "ui"
    assert method_tier("Лог") == "ui"
    assert method_tier("ЛогСообщение") == "ui"  # alias
    assert method_tier("Логировать") == "ui"  # alias
    assert method_tier("НажатьДважды") == "util"
    assert method_tier("МеткаВДневнике") == "util"
    assert method_tier("ПроверитьURL") == "assert"


def test_facade_gates():
    assert set(facade_names()) == {"HTTP", "Сканер", "Драйвер", "Сессия"}
    assert lookup_facade_method("scanner", "Сканер") == ("scanner", "spider_scan")
    assert lookup_facade_method("Сканер", "Сканер") == ("scanner", "spider_scan")
    assert lookup_facade_method("scanner", "Паук") is None
    assert lookup_facade_method("scanner", "ПолучитьАлерты") == ("scanner", "get_alerts")
    assert lookup_facade_method("scanner", "Отчёт") == ("scanner", "generate_report")
    assert lookup_facade_method("scanner", "ЗапросЧерезscanner") == ("scanner", "scanner_http_request")
    assert lookup_facade_method("scanner", "HttpЧерезscanner") == ("scanner", "scanner_http_request")
    assert lookup_facade_method("scanner", "HttpSender") == ("scanner", "install_mask_http_sender")
    assert lookup_facade_method("scanner", "ПодменаHttpSender") == (
        "scanner",
        "install_mask_http_sender",
    )
    assert lookup_facade_method("Сессия", "ОчиститьCookies") == (
        "browser",
        "cdp_clear_browser_cookies",
    )
    assert lookup_facade_method("Сессия", "ОчиститьCookiesCDP") == (
        "browser",
        "cdp_clear_browser_cookies",
    )
    assert lookup_method_id("ОчиститьCookies") == ("browser", "clear_cookies")
    assert resolve_call("scanner Сканер https://x") == "scanner|spider_scan|https://x"
    assert resolve_call("Сканер https://x") == "scanner|spider_scan|https://x"
    assert resolve_call("HTTP GET https://x") == "http|get|https://x"
    assert resolve_call("Сессия ОчиститьКэш") == "browser|cdp_clear_browser_cache"
    assert resolve_call("CDP ОчиститьКэш") == "browser|cdp_clear_browser_cache"
    assert resolve_call("Драйвер Нажать css .ok") == "webdriver|click|css|.ok"
    assert resolve_call("Браузер Нажать css .ok") == "webdriver|click|css|.ok"
    assert resolve_call("WD Нажать css .ok") == "webdriver|click|css|.ok"


def test_linear_try_resolves_nazad():
    nodes = parse_script(
        '? Нажать css .payment-form-submit > Скриншот "ошибка формы" >! Назад'
    )
    try_node = nodes[0]
    assert try_node.finally_body[0].constructor == "webdriver|back"


def test_resolve_call_label_discovery():
    """DISC-2A: Нажать > Лейбл / ВставитьТекст > Лейбл value."""
    from core.method_id import wire_to_pretty_line

    assert resolve_call("Нажать > Войти") == "webdriver|click|label|Войти"
    assert resolve_call("Нажать > Log in") == "webdriver|click|label|Log in"
    assert resolve_call("ВставитьТекст > Логин ivan@lab.test") == (
        "webdriver|send_keys|label|Логин|ivan@lab.test"
    )
    assert resolve_call("ВставитьЗначение > Email a@b.c") == (
        "webdriver|send_keys|label|Email|a@b.c"
    )
    assert resolve_call("Драйвер Нажать > Войти") == "webdriver|click|label|Войти"
    # css child `a > b` — не label-mode (rest не начинается с `>`)
    assert resolve_call("Нажать css a > b") == "webdriver|click|css|a|>|b"
    assert resolve_line("Нажать > Войти >?") == "webdriver|click|label|Войти >?"
    assert wire_to_pretty_line("webdriver|click|label|Войти") == "Нажать > Войти"
    assert resolve_call("ВставитьТекст > Логин x") == (
        "webdriver|send_keys|label|Логин|x"
    )


def test_resolve_call_basic():
    assert resolve_call("Открыть https://example.com") == (
        "webdriver|open|https://example.com"
    )
    assert resolve_call("Нажать css .ok") == "webdriver|click|css|.ok"
    assert resolve_call('ВставитьЗначение css #email "a@b.c"') == (
        "webdriver|send_keys|css|#email|a@b.c"
    )
    assert resolve_call("Пауза 1") == "core|sleep|1"
    assert resolve_call("Лог hello") == "core|log_message|hello"
    assert resolve_call("ЛогСообщение hello") == "core|log_message|hello"
    assert resolve_call("Логировать hello") == "core|log_message|hello"
    assert resolve_call('ЛогАтаки "Замена: payload:\'x\'"') == (
        "scanner|log_attack|Замена: payload:'x'"
    )
    assert resolve_call('scanner ЛогАтаки "Замена: payload:\'x\'"') == (
        "scanner|log_attack|Замена: payload:'x'"
    )
    assert resolve_call("АктивноеСканирование ${base}") == (
        "scanner|active_scan|${base}"
    )
    assert resolve_call("scanner АктивноеСканирование ${base}") == (
        "scanner|active_scan|${base}"
    )
    assert resolve_call("webdriver|click|css|.x") is None


def test_resolve_line_markers():
    assert resolve_line("Нажать css .x >?") == "webdriver|click|css|.x >?"
    assert resolve_line(
        "Нажать css .submit >@ { Нажать css .confirm }"
    ) == "webdriver|click|css|.submit >@ { webdriver|click|css|.confirm }"


def test_split_args_refs_and_pipe():
    assert split_pretty_args("css .login") == ["css", ".login"]
    assert split_pretty_args("${login.email} ${email}") == [
        "${login.email}",
        "${email}",
    ]
    assert split_pretty_args("css|.ok|text") == ["css", ".ok", "text"]


def test_parse_script_resolves_method_id():
    nodes = parse_script("Цикл 1 {\n  Нажать css .ok\n}")
    assert isinstance(nodes[0], LoopNode)
    leaf = nodes[0].body[0]
    assert isinstance(leaf, ActionNode)
    assert leaf.constructor == "webdriver|click|css|.ok"


def test_linear_try_resolves_method_id():
    nodes = parse_script(
        '? Нажать css .pay > Скриншот fail.png >! Вернуться'
    )
    try_n = nodes[0]
    assert try_n.try_body[0].constructor == "webdriver|click|css|.pay"
    assert try_n.catch_body[0].constructor == "webdriver|take_screenshot|fail.png"
    assert try_n.finally_body[0].constructor == "webdriver|back"


def test_ensure_wire_passthrough():
    assert ensure_wire("webdriver|click|css|.x") == "webdriver|click|css|.x"
    assert ensure_wire("Нажать css .x") == "webdriver|click|css|.x"
