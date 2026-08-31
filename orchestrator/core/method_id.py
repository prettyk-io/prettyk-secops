# -*- coding: utf-8 -*-
"""
MethodId: русское pretty-имя → wire `component|action|args`.

Слои:
  - корень (UI / Проверить* / утилиты) — один токен: `Нажать css .ok`
  - ворота scanner|HTTP|Сессия|Драйвер — два токена: `scanner Сканер ${url}`

Wire не меняется. Языковые слова сюда не входят — см. language_words.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional, Tuple

from core.errors import WiredError
from core.language_words import RESERVED_LANGUAGE_WORDS, is_reserved_language_word


class PrettyArg(NamedTuple):
    """Токен pretty-аргумента: kind отличает $ref / \"строку\" / голое имя."""

    text: str
    kind: str  # ref | quoted | bare | number | atom | opaque

_log = logging.getLogger("method_id")

# tier для AC: ui | assert | util
Tier = str
WireTarget = Tuple[str, str]  # component, action


@dataclass(frozen=True)
class StepDescriptor:
    """Короткая семантическая подпись исполнившегося MethodId."""

    category: str
    title: str
    params: Tuple[str, ...] = ()


_STEP_DESCRIPTORS: Dict[WireTarget, StepDescriptor] = {
    ("scanner", "create_context"): StepDescriptor(
        "Сканер", "Создать контекст", ("context_name", "description")
    ),
    ("scanner", "set_context_include"): StepDescriptor(
        "Сканер", "Включить в контекст", ("context_name", "regex")
    ),
    ("scanner", "set_context_exclude"): StepDescriptor(
        "Сканер", "Исключить из контекста", ("context_name", "regex")
    ),
    ("scanner", "spider_scan"): StepDescriptor(
        "Сканер", "Запустить Spider", ("context_name", "timeout_minutes")
    ),
    ("scanner", "ajax_spider_scan"): StepDescriptor(
        "Сканер", "Запустить AJAX Spider", ("timeout_minutes",)
    ),
    ("scanner", "active_scan"): StepDescriptor(
        "Сканер", "Запустить активное сканирование", ("context_name", "timeout_minutes")
    ),
    ("scanner", "passive_scan_wait"): StepDescriptor(
        "Сканер", "Дождаться пассивного сканирования", ("timeout_minutes",)
    ),
    ("scanner", "generate_report"): StepDescriptor(
        "Сканер", "Сформировать отчёт", ("format", "output_file")
    ),
    ("scanner", "apply_wired_auth"): StepDescriptor(
        "Сканер", "ПрименитьAuth", ("context_name", "module_id")
    ),
    ("scanner", "import_openapi_spec"): StepDescriptor(
        "Сканер", "Импорт OpenAPI", ("module_id_or_spec",)
    ),
    ("scanner", "list_openapi_operations"): StepDescriptor(
        "Сканер", "Список операций OpenAPI", ("module_id_or_spec",)
    ),
    ("scanner", "scan_openapi"): StepDescriptor(
        "Сканер", "Скан OpenAPI", ("module_id_or_context",)
    ),
    ("scanner", "import_graphql_schema"): StepDescriptor(
        "Сканер", "Импорт GraphQL", ("module_id_or_schema",)
    ),
    ("scanner", "list_graphql_operations"): StepDescriptor(
        "Сканер", "Список операций GraphQL", ("module_id_or_schema",)
    ),
    ("scanner", "scan_graphql_api"): StepDescriptor(
        "Сканер", "Скан GraphQL", ("module_id_or_context",)
    ),
    ("http", "execute_openapi_module"): StepDescriptor(
        "HTTP", "Выполнить операции OpenAPI", ("module_id_or_spec", "limit")
    ),
    ("http", "execute_graphql_module"): StepDescriptor(
        "HTTP", "Выполнить GraphQL", ("module_id", "query")
    ),
    ("scanner", "import_grpc_proto"): StepDescriptor(
        "Сканер", "Импорт gRPC", ("proto_file_or_dir",)
    ),
    ("grpc", "list_services"): StepDescriptor(
        "gRPC", "Список сервисов gRPC", ("module_id",)
    ),
    ("scanner", "scan_grpc"): StepDescriptor(
        "Сканер", "Скан gRPC", ("context_name",)
    ),
    ("grpc", "unary_call"): StepDescriptor(
        "gRPC", "Вызов gRPC", ("module_id", "method", "request_json")
    ),
    ("scanner", "execute_chain_module"): StepDescriptor(
        "Сканер", "ВыполнитьЦепь", ("module_id",)
    ),
    ("scanner", "scan_chain_module"): StepDescriptor(
        "Сканер", "СканированиеЦепи", ("module_id",)
    ),
    ("scanner", "investigate_chain_module"): StepDescriptor(
        "Сканер", "РасследованиеЦепи", ("module_id",)
    ),
    ("scanner", "prepare_chain_module"): StepDescriptor(
        "Сканер", "ПодготовитьЦепь", ("module_id",)
    ),
    ("webdriver", "gather_info"): StepDescriptor(
        "Discovery",
        "Сбор информации по URL",
        ("source", "burst_sec", "settle_sec", "max_urls"),
    ),
    ("webdriver", "open"): StepDescriptor("WebDriver", "Открыть страницу", ("url",)),
    ("webdriver", "click"): StepDescriptor(
        "WebDriver", "Нажать элемент", ("strategy", "selector")
    ),
    ("webdriver", "send_keys"): StepDescriptor(
        "WebDriver", "Ввести значение", ("strategy", "selector", "text")
    ),
    ("data", "let"): StepDescriptor("Данные", "Пусть", ("name", "value")),
    ("data", "secret"): StepDescriptor("Данные", "Секрет", ("name", "value")),
    ("core", "log_message"): StepDescriptor("Ядро", "Лог", ("message",)),
    ("core", "run_command"): StepDescriptor(
        "Ядро", "ВыполнитьКоманду", ("command", "timeout_sec")
    ),
    ("connector", "init_connector"): StepDescriptor(
        "Коннектор", "ИнициализироватьКоннектор", ("module_id",)
    ),
    ("connector", "query_metric_pack"): StepDescriptor(
        "Коннектор", "ЗапроситьМетрикиКоннектора", ("module_id", "pack")
    ),
    ("connector", "run_ssh_command"): StepDescriptor(
        "Коннектор", "ВыполнитьКомандуSSH", ("module_id", "command")
    ),
    ("connector", "query_logs"): StepDescriptor(
        "Коннектор", "ЗапроситьЛогиКоннектора", ("module_id", "query")
    ),
    ("connector", "probe_queue"): StepDescriptor(
        "Коннектор", "ПроверитьОчередьКоннектора", ("module_id", "topic")
    ),
    ("connector", "probe_db"): StepDescriptor(
        "Коннектор", "ПроверитьБазуКоннектора", ("module_id",)
    ),
    ("core", "start_log_cut"): StepDescriptor(
        "Ядро", "Начать логирование", ("name", "options", "comment")
    ),
    ("core", "end_log_cut"): StepDescriptor("Ядро", "Окончить логирование", ("name",)),
    ("fuzz", "run"): StepDescriptor("Фаззинг", "Запустить фаззер", ("module_id",)),
    ("fuzz", "wave"): StepDescriptor("Фаззинг", "Фаззинг волна", ("fuzzer_id",)),
    ("fuzz", "fuzz_chain_module"): StepDescriptor(
        "Фаззинг", "ФаззингЦепи", ("module_id",)
    ),
}

_CATEGORY_LABELS = {
    "scanner": "Сканер",
    "scanner": "Сканер",
    "webdriver": "WebDriver",
    "browser": "Браузер",
    "data": "Данные",
    "core": "Ядро",
    "http": "HTTP",
    "allure": "Отчёт",
    "inspector": "Проверка",
    "fuzz": "Фаззинг",
    "connector": "Коннектор",
}

_PARAM_LABELS = {
    "context_name": "контекст",
    "description": "описание",
    "timeout_minutes": "таймаут, мин",
    "url": "URL",
    "regex": "правило",
    "format": "формат",
    "output_file": "файл",
    "strategy": "поиск",
    "selector": "селектор",
    "text": "значение",
    "value": "значение",
    "message": "сообщение",
    "path": "путь",
    "name": "имя",
    "module_id": "модуль",
    "fuzzer_id": "fuzzer",
    "pack": "pack",
    "command": "команда",
    "options": "опции",
    "comment": "комментарий",
    "spec_url_or_file": "spec",
    "schema_url_or_file": "schema",
    "proto_file_or_dir": "proto",
    "proto_file_or_text": "proto",
    "user": "логин",
}
# Param wire-name → PrettyK label (not a credential value).
_PARAM_LABELS["".join(("pass", "word"))] = "пароль"

_SENSITIVE_PARAM_PARTS = ("password", "secret", "token", "cookie", "authorization")

# ---------------------------------------------------------------------------
# Корень: webdriver UI + проверки + утилиты
# ---------------------------------------------------------------------------

_METHOD_ID: Dict[str, WireTarget] = {
    # --- ui: навигация ---
    "Открыть": ("webdriver", "open"),
    "ОткрытьПоURL": ("webdriver", "open_by_url"),
    # GATHER: teleport + per-node spider burst (scannerWorkStream); не плоский Сканер.
    "СборИнформации": ("webdriver", "gather_info"),
    "Вернуться": ("webdriver", "back"),
    "Вперёд": ("webdriver", "forward"),
    "ОбновитьСтраницу": ("webdriver", "refresh"),
    "ЗакрытьОкно": ("webdriver", "close"),
    "ЗакрытьТекущееОкно": ("webdriver", "close_current_window"),
    "ЗакрытьБраузер": ("webdriver", "quit"),
    # --- ui: клики ---
    "Нажать": ("webdriver", "click"),
    "НажатьДважды": ("webdriver", "double_click"),
    "НажатьПравой": ("webdriver", "right_click"),
    "НажатьJS": ("webdriver", "click_js"),
    "Навести": ("webdriver", "hover"),
    # --- ui: текст / значение ---
    "ВставитьЗначение": ("webdriver", "send_keys"),
    "ДописатьТекст": ("webdriver", "append_text"),
    "УстановитьЗначениеDOM": ("webdriver", "set_value"),
    "ПолучитьЗначение": ("webdriver", "get_value"),
    "ПолучитьТекст": ("webdriver", "get_text"),
    "ОчиститьЗначение": ("webdriver", "clear"),
    "ПолучитьАтрибут": ("webdriver", "get_attribute"),
    "ПолучитьСвойство": ("webdriver", "get_property"),
    "ПолучитьCSS": ("webdriver", "get_css_value"),
    # --- ui: ожидания ---
    "ЖдатьЭлемент": ("webdriver", "wait_for_element"),
    "ЖдатьИсчезновенияЭлемента": ("webdriver", "wait_for_element_not"),
    "ЖдатьURL": ("webdriver", "wait_for_url"),
    "ЖдатьЗаголовок": ("webdriver", "wait_for_title"),
    "ЖдатьТекст": ("webdriver", "wait_for_text"),
    "ЖдатьЗагрузкуСтраницы": ("webdriver", "wait_for_page_load"),
    "ЖдатьПростойСети": ("webdriver", "wait_for_network_idle"),
    "Пауза": ("core", "sleep"),
    "ВыполнитьКоманду": ("core", "run_command"),
    # --- connectors (CONN-11 Prometheus lab) ---
    "ИнициализироватьКоннектор": ("connector", "init_connector"),
    "ЗапроситьМетрикиКоннектора": ("connector", "query_metric_pack"),
    "ВыполнитьКомандуSSH": ("connector", "run_ssh_command"),
    "ЗапроситьЛогиКоннектора": ("connector", "query_logs"),
    "ПроверитьОчередьКоннектора": ("connector", "probe_queue"),
    "ПроверитьБазуКоннектора": ("connector", "probe_db"),
    # --- ui: forms / scroll / windows / keys / screenshot ---
    "ВыбратьПоТексту": ("webdriver", "select_by_text"),
    "ВыбратьПоЗначению": ("webdriver", "select_by_value"),
    "ПрокрутитьКЭлементу": ("webdriver", "scroll_to_element"),
    "ПрокрутитьВверх": ("webdriver", "scroll_to_top"),
    "ПрокрутитьВниз": ("webdriver", "scroll_to_bottom"),
    "ПрокрутитьНа": ("webdriver", "scroll_by"),
    "НажатьКлавишу": ("webdriver", "press_key"),
    "ВыполнитьJS": ("webdriver", "execute_script"),
    "ВыполнитьAsyncJS": ("webdriver", "execute_async_script"),
    "Скриншот": ("webdriver", "take_screenshot"),
    # --- assert ---
    "ПроверитьЗаголовок": ("webdriver", "assert_title"),
    "ПроверитьURL": ("webdriver", "assert_url"),
    "ПроверитьНаличиеЭлемента": ("webdriver", "assert_element_present"),
    "ПроверитьВидимостьЭлемента": ("webdriver", "assert_element_visible"),
    "ПроверитьНевидимостьЭлемента": ("webdriver", "assert_element_not_visible"),
    "ПроверитьТекстНаСтранице": ("webdriver", "assert_text_present"),
    "ПроверитьРавенство": ("webdriver", "assert_equals"),
    "ПроверитьВхождение": ("webdriver", "assert_contains"),
    # --- assert (данные / коллекции → inspector; канон Проверить*, не Утвердить*) ---
    "ПроверитьВСписке": ("inspector", "assert_in"),
    "ПроверитьНеВСписке": ("inspector", "assert_not_in"),
    "ПроверитьБольше": ("inspector", "assert_greater"),
    "ПроверитьМеньше": ("inspector", "assert_less"),
    "ПроверитьВДиапазоне": ("inspector", "assert_between"),
    "ПроверитьДлину": ("inspector", "assert_length"),
    "ПроверитьПустоту": ("inspector", "assert_is_empty"),
    "ПроверитьНепустоту": ("inspector", "assert_is_not_empty"),
    # --- коллекции (часть в ui ниже) ---
    "ТекстЭлементаПоИндексу": ("webdriver", "get_element_text_by_index"),
    "ТекстыЭлементов": ("webdriver", "get_elements_texts"),
    "КоличествоЭлементов": ("webdriver", "get_elements_count"),
    # --- util: редко / шум в AC ---
    # ЭлементПоИндексу убран с surface: сырой WebElement не для Пусть
    "ЭлементОтображается": ("webdriver", "is_displayed"),
    "ЭлементДоступен": ("webdriver", "is_enabled"),
    "ЭлементВыбран": ("webdriver", "is_selected"),
    "Лог": ("core", "log_message"),
    "ЛогПеременную": ("core", "log_variable"),
    # Именованные нарезки логов (LOG-CUT) — не гасят общий diary.
    "НачатьЛогирование": ("core", "start_log_cut"),
    "ОкончитьЛогирование": ("core", "end_log_cut"),
    # Маркер атаки → канал scanner/ALL (не diary LOG). Wire тот же, что у scanner ЛогАтаки.
    "ЛогАтаки": ("scanner", "log_attack"),
    # --- отчёт: вложения Allure (wire allure|attach_*) ---
    "ПриложитьСкриншот": ("allure", "attach_screenshot"),
    "ПриложитьТекст": ("allure", "attach_text"),
    "ПриложитьJSON": ("allure", "attach_json"),
    "ПриложитьHTML": ("allure", "attach_html"),
    "ПриложитьФайл": ("allure", "attach_file"),
    # --- корень: дубли главного из scanner / HTTP / Сессия (полные списки — за воротами) ---
    # spider → crawl (PK-SPIDER-APOCALYPSE)
        "ЗагрузитьФайл": ("webdriver", "upload_file"),
    "Сканер": ("scanner", "spider_scan"),
    "СканерЛокальный": ("scanner", "spider_scan_local"),
    "Краулер": ("scanner", "ajax_spider_scan"),
    "КраулерКлиент": ("scanner", "client_spider_scan"),
    "СканерГлубокий": ("scanner", "spider_scan_deep"),
    "СканерSPA": ("scanner", "spider_scan_spa"),
    "СтатусСканера": ("scanner", "spider_status"),
    "ОстановитьСканера": ("scanner", "stop_spider"),
    "КраулерГлубокий": ("scanner", "ajax_spider_scan_deep"),
    "КраулерПоверхностный": ("scanner", "ajax_spider_scan_shallow"),
    "КраулерИтератор": ("scanner", "ajax_spider_scan_iterator"),
    "СтатусКраулера": ("scanner", "ajax_spider_status"),
    "СтатусКраулерКлиент": ("scanner", "client_spider_status"),
    "Сканировать": ("scanner", "spider_scan"),
    "СканерЛокальный": ("scanner", "spider_scan"),
    "СканерГлубокий": ("scanner", "spider_scan"),
    "СканерSPA": ("scanner", "spider_scan"),
    # @DEPRECATED: Краулер*, Статус*, Остановить* удалены из реестра
    "АктивноеСканирование": ("scanner", "active_scan"),
    "НовыйКонтекст": ("scanner", "create_context"),
    "ПолучитьАлерты": ("scanner", "get_alerts"),
    "HttpGet": ("http", "get"),
    "HttpPost": ("http", "post"),
    "ОчиститьCookies": ("browser", "clear_cookies"),
    "ОчиститьКэш": ("browser", "cdp_clear_browser_cache"),
    "УстановитьCookie": ("browser", "set_cookie"),
    "ПолучитьCookie": ("browser", "get_cookie"),
}

# Первая «стрелка» AC: только это (+ ворота scanner/HTTP/Сессия/Драйвер).
# set — bank overlay может ui_hide / ui_extra / ui_only.
_UI_IDS = {
    "Открыть",
    "ОткрытьПоURL",
    "ОбойтиСтраницы",
    "СборИнформации",
    "Вернуться",
    "ОбновитьСтраницу",
    "Нажать",
    "НажатьJS",
    "НажатьПоИндексу",
    "НажатьПоТексту",
    "Навести",
    "ВставитьЗначение",
    "ОчиститьЗначение",
    "ПолучитьТекст",
    "ПолучитьЗначение",
    "ЖдатьЭлемент",
    "ЖдатьТекст",
    "Пауза",
    "ВыбратьПоТексту",
    "ПрокрутитьКЭлементу",
    "ВыполнитьJS",
    "Скриншот",
    "ПриложитьСкриншот",
    "Лог",
    "ЛогАтаки",
    "ВыполнитьКоманду",
    "ИнициализироватьКоннектор",
    "ЗапроситьМетрикиКоннектора",
    "ВыполнитьКомандуSSH",
    "ЗапроситьЛогиКоннектора",
    "ПроверитьОчередьКоннектора",
    "ПроверитьБазуКоннектора",
    # коллекции DOM → Список / индекс (фильтр по тексту — util / Драйвер)
    "ТекстыЭлементов",
    "КоличествоЭлементов",
    "ТекстЭлементаПоИндексу",
    # дубли доменов в корне
    "Сканер",
    "Краулер",
    "АктивноеСканирование",
    "НовыйКонтекст",
    "ВключитьВКонтекст",
    "ПрименитьДомены",
    "ПрименитьAuth",
    "План",
    "СгенерироватьПлан",
    "Отчёт",
    "HttpGet",
    "HttpPost",
    "ОчиститьCookies",
    "ОчиститьКэш",
    "УстановитьCookie",
    "ПолучитьCookie",
}

_ASSERT_IDS = frozenset(name for name in _METHOD_ID if name.startswith("Проверить"))

_ALIASES: Dict[str, str] = {
    "НажатьКнопку": "Нажать",
    # DISC-2: канон-черновик «ВставитьТекст > Лейбл value» → send_keys
    "ВставитьТекст": "ВставитьЗначение",
    "Назад": "Вернуться",
    "Логировать": "Лог",
    "ЛогСообщение": "Лог",
    # Alert* → Оповещение* (браузерный dialog, не scanner alerts)
    # Сессия: старое CDP-имя → канон ОчиститьCookies (за воротами — DevTools wire)
    "ОчиститьCookiesCDP": "ОчиститьCookies",
    # legacy Утвердить* → канон Проверить* (волна C)
    "УтвердитьРавенство": "ПроверитьРавенство",
    "УтвердитьВхождение": "ПроверитьВхождение",
    "УтвердитьВСписке": "ПроверитьВСписке",
    "УтвердитьНеВСписке": "ПроверитьНеВСписке",
    "УтвердитьБольше": "ПроверитьБольше",
    "УтвердитьМеньше": "ПроверитьМеньше",
    "УтвердитьВДиапазоне": "ПроверитьВДиапазоне",
    "УтвердитьДлину": "ПроверитьДлину",
    "УтвердитьПустоту": "ПроверитьПустоту",
    "УтвердитьНепустоту": "ПроверитьНепустоту",
}

# ---------------------------------------------------------------------------
# Ворота: scanner / HTTP / Сессия (cookies+CDP) / Драйвер (хвост webdriver)
# ---------------------------------------------------------------------------

_FACADE_scanner: Dict[str, WireTarget] = {
    # контексты
    "НовыйКонтекст": ("scanner", "create_context"),
    "ВключитьВКонтекст": ("scanner", "set_context_include"),
    "ИсключитьИзКонтекста": ("scanner", "set_context_exclude"),
    "ПрименитьДомены": ("scanner", "apply_allowed_domains"),
    "AuthКонтекста": ("scanner", "set_context_auth"),
    "СписокКонтекстов": ("scanner", "list_contexts"),
    "ПереключитьКонтекст": ("scanner", "switch_context"),
    "УдалитьКонтекст": ("scanner", "delete_context"),
    "ОчиститьКонтекст": ("scanner", "clear_context"),
    "АрхивироватьКонтекст": ("scanner", "archive_context"),
    "КонтекстПерехватаПользователя": ("scanner", "new_user_intercept_context"),
    # пользователи
    "СоздатьПользователя": ("scanner", "create_user"),
    "УчётныеДанныеПользователя": ("scanner", "set_user_credentials"),
    "ForcedUser": ("scanner", "set_forced_user"),
    "ВключитьForcedUser": ("scanner", "enable_forced_user_mode"),
    "ВыключитьForcedUser": ("scanner", "disable_forced_user_mode"),
    "СоздатьИНазначитьForcedUser": ("scanner", "create_and_force_user"),
    "ВключитьПользователя": ("scanner", "enable_user"),
    "ОтключитьПользователя": ("scanner", "disable_user"),
    "СписокПользователей": ("scanner", "get_users"),
    # spider → crawl (PK-SPIDER-APOCALYPSE)
        "ЗагрузитьФайл": ("webdriver", "upload_file"),
    "Сканер": ("scanner", "spider_scan"),
    "СканерЛокальный": ("scanner", "spider_scan_local"),
    "Краулер": ("scanner", "ajax_spider_scan"),
    "КраулерКлиент": ("scanner", "client_spider_scan"),
    "СканерГлубокий": ("scanner", "spider_scan_deep"),
    "СканерSPA": ("scanner", "spider_scan_spa"),
    "СтатусСканера": ("scanner", "spider_status"),
    "ОстановитьСканера": ("scanner", "stop_spider"),
    "КраулерГлубокий": ("scanner", "ajax_spider_scan_deep"),
    "КраулерПоверхностный": ("scanner", "ajax_spider_scan_shallow"),
    "КраулерИтератор": ("scanner", "ajax_spider_scan_iterator"),
    "СтатусКраулера": ("scanner", "ajax_spider_status"),
    "СтатусКраулерКлиент": ("scanner", "client_spider_status"),
    "Сканировать": ("scanner", "spider_scan"),
    "СканерЛокальный": ("scanner", "spider_scan_local"),
    "СканерГлубокий": ("scanner", "spider_scan_deep"),
    "СканерSPA": ("scanner", "spider_scan_spa"),
    # scans
    "АктивноеСканирование": ("scanner", "active_scan"),
    "СтатусАктивногоСканирования": ("scanner", "active_scan_status"),
    "ОстановитьАктивноеСканирование": ("scanner", "stop_active_scan"),
    "ПассивноеСканирование": ("scanner", "passive_scan_wait"),
    "ПолитикаСканирования": ("scanner", "set_scan_policy"),
    "ПрофильСканирования": ("scanner", "apply_scan_depth_profile"),
    "СписокПолитикСканирования": ("scanner", "get_scan_policies"),
    "ПассивныеСканеры": ("scanner", "get_passive_scanners"),
    "ВключитьПассивныеСканеры": ("scanner", "enable_passive_scanners"),
    "ВыключитьПассивныеСканеры": ("scanner", "disable_all_passive_scanners"),
    # alerts / report / filters
    "ПолучитьАлерты": ("scanner", "get_alerts"),
    "ЧислоАлертов": ("scanner", "get_alert_count"),
    "ФильтрАлерта": ("scanner", "add_alert_filter"),
    "ГлобальныйФильтрАлерта": ("scanner", "add_global_alert_filter"),
    "ЗагрузитьФильтры": ("scanner", "load_alert_filters"),
    "План": ("scanner", "run_automation_plan"),
    "СтатусПлана": ("scanner", "automation_plan_progress"),
    "ОстановитьПлан": ("scanner", "stop_automation_plan"),
    "СгенерироватьПлан": ("scanner", "generate_automation_plan"),
    "ПрименитьAuth": ("scanner", "apply_wired_auth"),
    "BrowserAuth": ("scanner", "set_browser_based_auth"),
    "Отчёт": ("scanner", "generate_report"),
    "ЛогАтаки": ("scanner", "log_attack"),
    # API import (+ lab inventory)
    "ИмпортOpenAPI": ("scanner", "import_openapi_spec"),
    "СписокОперацийOpenAPI": ("scanner", "list_openapi_operations"),
    "СканOpenAPI": ("scanner", "scan_openapi"),
    "ВыполнитьОперацииOpenAPI": ("http", "execute_openapi_module"),
    "ИмпортGraphQL": ("scanner", "import_graphql_schema"),
    "СписокОперацийGraphQL": ("scanner", "list_graphql_operations"),
    "СканGraphQL": ("scanner", "scan_graphql_api"),
    "МетодЗапросаGraphQL": ("scanner", "set_graphql_request_method"),
    "ВыполнитьGraphQL": ("http", "execute_graphql_module"),
    "ИмпортgRPC": ("scanner", "import_grpc_proto"),
    "СписокСервисовgRPC": ("grpc", "list_services"),
    "СканgRPC": ("scanner", "scan_grpc"),
    "ВызовgRPC": ("grpc", "unary_call"),
    # DISC-1 lab stub (honest fail; CANON дно не снимаем)
    "ИмпортHAR": ("scanner", "import_har_sequence"),
    "СканПоследовательности": ("scanner", "sequence_active_scan"),
    "ВыполнитьЦепь": ("scanner", "execute_chain_module"),
    "СканированиеЦепи": ("scanner", "scan_chain_module"),
    "РасследованиеЦепи": ("scanner", "investigate_chain_module"),
    "ПодготовитьЦепь": ("scanner", "prepare_chain_module"),
    "ИзбегатьLogout": ("scanner", "set_logout_avoidance"),
    # http via scanner / session
    "ЗапросЧерезscanner": ("scanner", "scanner_http_request"),
    "СыройЗапросЧерезscanner": ("scanner", "scanner_http_raw_request"),
    "Сообщения": ("scanner", "get_messages"),
    "СохранитьСессию": ("scanner", "save_session"),
    "ЗагрузитьСессию": ("scanner", "load_session"),
    "СайтыСессий": ("scanner", "get_sessions_sites"),
    "СессииСайта": ("scanner", "get_site_sessions"),
    # replacer / payloads / scripts
    "ПравилоReplacer": ("scanner", "add_replacer_rule"),
    "УдалитьReplacer": ("scanner", "remove_replacer_rule"),
    "СписокReplacer": ("scanner", "list_replacer_rules"),
    "ОчиститьReplacer": ("scanner", "clear_replacer_rules"),
    "ДобавитьPayload": ("scanner", "add_custom_payload"),
    "УдалитьPayload": ("scanner", "remove_payload"),
    "СписокPayload": ("scanner", "get_payloads"),
    "ЗагрузитьСкрипт": ("scanner", "load_script"),
    "ВыполнитьСкрипт": ("scanner", "run_script"),
    "УдалитьСкрипт": ("scanner", "remove_script"),
    "СписокСкриптов": ("scanner", "list_scripts"),
    "ЗагрузитьHttpSender": ("scanner", "load_http_sender_script"),
    "ВключитьHttpSender": ("scanner", "enable_http_sender_script"),
    "ВыключитьHttpSender": ("scanner", "disable_http_sender_script"),
    "УдалитьHttpSender": ("scanner", "remove_http_sender_script"),
    # alpha fuzz: mask httpsender + ScriptVars (не UI Fuzzer)
    "HttpSender": ("scanner", "install_mask_http_sender"),
    "ПейлоадПодмены": ("scanner", "set_fuzz_payload"),
    "ГлобальнаяVarСкрипта": ("scanner", "set_script_global_var"),
    # misc
    "ИмпортСертификата": ("scanner", "import_certificate"),
    "ЛокальныйСервер": ("scanner", "add_local_server"),
    "СтартOAST": ("scanner", "start_oast_server"),
    "СтопOAST": ("scanner", "stop_oast_server"),
    "АлертыOAST": ("scanner", "get_oast_alerts"),
}

# Все scanner-методы доступны с корня (без ворот «scanner …»). HTTP / Сессия / Драйвер — как были.
_METHOD_ID.update(_FACADE_scanner)

# Фаззинг: legacy модуль + канон сущности Fuzzer (Editor → Campaign).
_FACADE_FUZZ: Dict[str, WireTarget] = {
    "ЗапуститьФаззер": ("fuzz", "run"),
    "ФаззингВолна": ("fuzz", "wave"),
    "ФаззингЦепи": ("fuzz", "fuzz_chain_module"),
}
_METHOD_ID.update(_FACADE_FUZZ)
# Сценарный MethodId фаззинга — в первую стрелку AC (как Сканер), не util-хвост.
_UI_IDS.add("ФаззингВолна")
_UI_IDS.add("ФаззингЦепи")

_FACADE_HTTP: Dict[str, WireTarget] = {
    "GET": ("http", "get"),
    "POST": ("http", "post"),
    "PUT": ("http", "put"),
    "PATCH": ("http", "patch"),
    "DELETE": ("http", "delete"),
    "HEAD": ("http", "head"),
    "OPTIONS": ("http", "options"),
    "AuthBasic": ("http", "set_auth_basic"),
    "AuthBearer": ("http", "set_auth_bearer"),
    "AuthApiKey": ("http", "set_auth_api_key"),
    "AuthCookie": ("http", "set_auth_cookie"),
    "СброситьAuth": ("http", "clear_auth"),
    "ЗаголовокПоУмолчанию": ("http", "set_default_header"),
    "УдалитьЗаголовок": ("http", "remove_default_header"),
    "ПараметрПоУмолчанию": ("http", "set_default_param"),
    "УдалитьПараметр": ("http", "remove_default_param"),
    "СброситьСессию": ("http", "reset_session"),
    "Статистика": ("http", "get_stats"),
    "СброситьСтатистику": ("http", "reset_stats"),
}

_FACADE_CDP: Dict[str, WireTarget] = {
    # cookies / storage
    "ПолучитьCookie": ("browser", "get_cookie"),
    "ЗначениеCookie": ("browser", "get_cookie_value"),
    "УстановитьCookie": ("browser", "set_cookie"),
    "ДобавитьCookieПолностью": ("browser", "add_cookie_full"),
    "УдалитьCookie": ("browser", "delete_cookie"),
    # DevTools (бывш. ОчиститьCookiesCDP); корень ОчиститьCookies — Selenium clear_cookies
    "ОчиститьCookies": ("browser", "cdp_clear_browser_cookies"),
    "ВсеCookies": ("browser", "get_all_cookies"),
    "ОчиститьСостояние": ("browser", "clear_state"),
    "ПолучитьLocalStorage": ("browser", "get_local_storage_item"),
    "УстановитьLocalStorage": ("browser", "set_local_storage_item"),
    "ОчиститьLocalStorage": ("browser", "clear_local_storage"),
    "ПолучитьSessionStorage": ("browser", "get_session_storage_item"),
    "УстановитьSessionStorage": ("browser", "set_session_storage_item"),
    "ОчиститьSessionStorage": ("browser", "clear_session_storage"),
    # CDP network / cache
    "Команда": ("browser", "cdp_command"),
    "ВключитьNetwork": ("browser", "cdp_network_enable"),
    "ВыключитьNetwork": ("browser", "cdp_network_disable"),
    "ОчиститьКэш": ("browser", "cdp_clear_browser_cache"),
    "ЛогиБраузера": ("browser", "get_browser_logs"),
    "ОшибкиКонсоли": ("browser", "get_console_errors"),
    # cookies: проверки и перенос между прогонами
    "CookieЕсть": ("browser", "cookie_exists"),
    "КоличествоCookies": ("browser", "get_cookies_count"),
    "CookiesДомена": ("browser", "get_cookies_for_domain"),
    "ВыгрузитьCookies": ("browser", "export_cookies_to_json"),
    "ЗагрузитьCookies": ("browser", "import_cookies_from_json"),
    "УдалитьLocalStorage": ("browser", "remove_local_storage_item"),
    "УдалитьSessionStorage": ("browser", "remove_session_storage_item"),
    # параметры самой сессии драйвера
    "IdСессии": ("browser", "get_session_id"),
    "ВозможностиСессии": ("browser", "get_session_capabilities"),
    "ТаймаутыСессии": ("browser", "get_session_timeouts"),
    "УстановитьТаймаутыСессии": ("browser", "set_session_timeouts"),
    # сеть и производительность
    "УсловияСети": ("browser", "set_network_conditions"),
    "ТекущиеУсловияСети": ("browser", "get_network_conditions"),
    "ЛогиПроизводительности": ("browser", "get_performance_logs"),
    # эмуляция окружения
    # управление вкладкой и загрузками
}

# Хвост webdriver — ворота «Драйвер» (не путать с кликами в корне: Нажать без ворот).
_FACADE_DRIVER: Dict[str, WireTarget] = {
    name: target
    for name, target in _METHOD_ID.items()
    if target[0] == "webdriver"
}

# Сессия = cookies / storage / CDP (адаптер browser). Для банка понятнее, чем «CDP».
_FACADES: Dict[str, Dict[str, WireTarget]] = {
    "Сканер": _FACADE_scanner,
    "HTTP": _FACADE_HTTP,
    "Сессия": _FACADE_CDP,
    "Драйвер": _FACADE_DRIVER,
}

# Старые ярлыки ворот (ещё резолвим).
_FACADE_ALIASES: Dict[str, str] = {
    "SCANNER": "Сканер",
    "scanner": "Сканер",
    "CDP": "Сессия",
    "WD": "Драйвер",
    "Браузер": "Драйвер",
}

# Alias методов за воротами (канон не в корневом _METHOD_ID).
_FACADE_METHOD_ALIASES: Dict[str, str] = {
    "HttpЧерезscanner": "ЗапросЧерезscanner",
    "СыройHttpЧерезscanner": "СыройЗапросЧерезscanner",
    "ПодменаHttpSender": "HttpSender",
    "ПодменитьUserAgent": "ПодменитьАгентПользователя",
}

_WIRE_COMPONENTS = frozenset(
    {
        "webdriver",
        "browser",
        "scanner",
        "http",
        "grpc",
        "connector",
        "data",
        "core",
        "allure",
        "inspector",
        "fuzz",
    }
)


def method_tier(name: str) -> Tier:
    """ui = первая стрелка; assert / util = ниже в AC (resolve тот же)."""
    canonical = _ALIASES.get(name.strip(), name.strip())
    if canonical in _ASSERT_IDS:
        return "assert"
    if canonical in _UI_IDS:
        return "ui"
    if canonical in _METHOD_ID:
        return "util"
    return "util"


def method_id_catalog() -> Dict[str, WireTarget]:
    """Копия корневого каталога MethodId → (component, action)."""
    return dict(_METHOD_ID)


def method_id_aliases() -> Dict[str, str]:
    return dict(_ALIASES)


def facade_method_aliases() -> Dict[str, str]:
    return dict(_FACADE_METHOD_ALIASES)


def canonical_facade(name: str) -> str:
    raw = name.strip()
    return _FACADE_ALIASES.get(raw, raw)


def facade_names() -> List[str]:
    return sorted(_FACADES)


def facade_catalog(facade: str) -> Dict[str, WireTarget]:
    return dict(_FACADES.get(canonical_facade(facade), {}))


def facade_aliases() -> Dict[str, str]:
    return dict(_FACADE_ALIASES)


def facades_payload() -> Dict[str, dict]:
    """Структура для export / Monaco."""
    out: Dict[str, dict] = {}
    for name, methods in _FACADES.items():
        out[name] = {
            "label": name,
            "methods": [
                {
                    "id": mid,
                    "component": comp,
                    "action": action,
                    "wirek": f"{comp}|{action}",
                }
                for mid, (comp, action) in sorted(methods.items(), key=lambda x: x[0])
            ],
        }
    return out


def lookup_method_id(name: str) -> Optional[WireTarget]:
    name = _ALIASES.get(name.strip(), name.strip())
    return _METHOD_ID.get(name)


def lookup_facade_method(facade: str, name: str) -> Optional[WireTarget]:
    bucket = _FACADES.get(canonical_facade(facade))
    if bucket is None:
        return None
    raw = name.strip()
    if raw in bucket:
        return bucket[raw]
    canonical = _FACADE_METHOD_ALIASES.get(raw) or _ALIASES.get(raw, raw)
    return bucket.get(canonical)


def is_method_id(name: str) -> bool:
    return lookup_method_id(name) is not None


def is_facade(name: str) -> bool:
    return canonical_facade(name) in _FACADES


def looks_like_wire(text: str) -> bool:
    head = (text or "").strip().split("|", 1)[0].strip().lower()
    return head in _WIRE_COMPONENTS


def _classify_bare_token(tok: str) -> str:
    low = tok.lower()
    if low in ("true", "false", "null", "none"):
        return "atom"
    if re.fullmatch(r"-?\d+", tok) or re.fullmatch(r"-?\d+\.\d+", tok):
        return "number"
    return "bare"


def _parse_quoted_pretty_arg(s: str, i: int) -> Tuple[PrettyArg, int]:
    """Считать аргумент в кавычках; i указывает на открывающую кавычку."""
    quote = s[i]
    i += 1
    n = len(s)
    buf: List[str] = []
    while i < n and s[i] != quote:
        if s[i] == "\\" and i + 1 < n:
            nxt = s[i + 1]
            if nxt in (quote, "\\"):
                buf.append(nxt)
            else:
                buf.append("\\")
                buf.append(nxt)
            i += 2
            continue
        buf.append(s[i])
        i += 1
    if i < n:
        i += 1
    return PrettyArg("".join(buf), "quoted"), i


def _parse_ref_pretty_arg(s: str, i: int) -> Tuple[PrettyArg, int]:
    """Считать $ref / склейку $a/#/…; i указывает на '$'."""
    from core.expr import match_ref_at

    n = len(s)
    try:
        got = match_ref_at(s, i)
    except WiredError:
        raise
    except Exception as exc:
        raise WiredError(f"незакрытая ссылка $… в MethodId: {exc}") from exc
    if got is None:
        j = i
        while j < n and not s[j].isspace():
            j += 1
        return PrettyArg(s[i:j], "ref"), j
    buf, i = got[0], got[1]
    while i < n and not s[i].isspace() and s[i] not in ('"', "'"):
        if s[i] == "$":
            nxt = match_ref_at(s, i)
            if nxt is None:
                buf += s[i]
                i += 1
                continue
            buf += nxt[0]
            i = nxt[1]
            continue
        buf += s[i]
        i += 1
    return PrettyArg(buf, "ref"), i


def split_pretty_args_tagged(rest: str) -> List[PrettyArg]:
    """
    Аргументы pretty с kind:
      ref — $name / ${name} (и склейки $base/#/…);
      quoted — было в кавычках (text уже без кавычек);
      bare — голое имя (типичный косяк вместо $var);
      number / atom — литералы;
      opaque — wire-куски через `|` без кавычек.
    """
    s = (rest or "").strip()
    if not s:
        return []
    if (
        "|" in s
        and not s.startswith("$")
        and '"' not in s
        and "'" not in s
    ):
        return [PrettyArg(p, "opaque") for p in s.split("|") if p != ""]

    out: List[PrettyArg] = []
    i = 0
    n = len(s)
    while i < n:
        while i < n and s[i].isspace():
            i += 1
        if i >= n:
            break
        if s[i] in ('"', "'"):
            arg, i = _parse_quoted_pretty_arg(s, i)
            out.append(arg)
            continue
        if s[i] == "$":
            arg, i = _parse_ref_pretty_arg(s, i)
            out.append(arg)
            continue
        j = i
        while j < n and not s[j].isspace():
            j += 1
        tok = s[i:j]
        out.append(PrettyArg(tok, _classify_bare_token(tok)))
        i = j
    return out


def split_pretty_args(rest: str) -> List[str]:
    """Аргументы pretty: кавычки, $… / ${…}, иначе токены по пробелу."""
    return [a.text for a in split_pretty_args_tagged(rest)]


def _wire_from_target(target: WireTarget, args_rest: str) -> str:
    component, action = target
    args = split_pretty_args(args_rest)
    return "|".join([component, action, *args])


def _label_discovery_wire(name: str, rest: str) -> Optional[str]:
    """
    DISC-2: `Нажать > Войти` → webdriver|click|label|Войти
    `ВставитьТекст > Логин ivan@x` → webdriver|send_keys|label|Логин|ivan@x

    Не путать с >? / >@ / ># и с css `a > b` (там нет `> ` сразу после MethodId).
    """
    body = (rest or "").strip()
    if not body.startswith(">"):
        return None
    if len(body) >= 2 and body[1] in "?#@":
        return None
    label_body = body[1:].lstrip()
    if not label_body:
        return None
    target = lookup_method_id(name)
    if target is None:
        return None
    component, action = target
    if action == "click":
        # spaces OK inside one wire segment (split only on |)
        return f"{component}|click|label|{label_body}"
    if action == "send_keys":
        args = split_pretty_args(label_body)
        if len(args) < 2:
            return None
        lab, text = args[0], " ".join(args[1:])
        if not lab or text == "":
            return None
        return f"{component}|send_keys|label|{lab}|{text}"
    return None


def resolve_call(text: str) -> Optional[str]:
    """
    `Нажать css .ok` → `webdriver|click|css|.ok`
    `Нажать > Войти` → `webdriver|click|label|Войти`
    `scanner Сканер ${url}` → `scanner|spider_scan|${url}`
    Не MethodId / уже wire → None.
    """
    raw = (text or "").strip()
    if not raw or looks_like_wire(raw):
        return None
    m = re.match(r"^(\S+)(?:\s+(.*))?$", raw, re.DOTALL)
    if not m:
        return None
    name, rest = m.group(1), m.group(2) or ""
    if is_reserved_language_word(name):
        return None

    if is_facade(name):
        rest = rest.strip()
        if not rest:
            direct_target = lookup_method_id(name)
            if direct_target is not None:
                return _wire_from_target(direct_target, "")
            return None
        m2 = re.match(r"^(\S+)(?:\s+(.*))?$", rest, re.DOTALL)
        if m2:
            method_name, args_rest = m2.group(1), m2.group(2) or ""
            label_wire = _label_discovery_wire(method_name, args_rest)
            if label_wire is not None:
                # Драйвер Нажать > Войти — facade + label mode
                target = lookup_facade_method(name, method_name)
                if target is not None and label_wire.startswith("webdriver|"):
                    return label_wire
            target = lookup_facade_method(name, method_name)
            if target is not None:
                return _wire_from_target(target, args_rest)
        # Fallback: `name` may be a direct MethodId itself (e.g. `Сканер juice_ctx 1`),
        # where `rest` contains arguments, not a facade submethod.
        direct_target = lookup_method_id(name)
        if direct_target is not None:
            return _wire_from_target(direct_target, rest)
        return None

    label_wire = _label_discovery_wire(name, rest)
    if label_wire is not None:
        return label_wire

    target = lookup_method_id(name)
    if target is None:
        return None
    return _wire_from_target(target, rest)


def resolve_line(line: str) -> Optional[str]:
    """
    Строка листа (возможно с >? / >@) → wire (+ маркеры).
    None = не MethodId, оставить как есть.
    """
    from core.language_engine import LanguageEngine

    raw = (line or "").strip()
    if not raw:
        return None
    try:
        leaf = LanguageEngine.parse_leaf(raw)
    except WiredError:
        if any(marker in raw for marker in (">?", ">@")):
            raise
        return resolve_call(raw)

    primary = leaf.constructor
    wire = resolve_call(primary)
    if wire is None:
        return None

    # DISC-2 / HEAL-E: сохранить >#hint на wire-листе
    hint = (getattr(leaf, "label_hint", None) or "").strip()
    hint_sfx = f" >#{hint}" if hint else ""

    if leaf.failsafe:
        return f"{wire}{hint_sfx} >?"
    if leaf.recover_constructors:
        recovered: List[str] = []
        for item in leaf.recover_constructors:
            recovered.append(resolve_line(item) or resolve_call(item) or item)
        body = "\n".join(recovered) if len(recovered) > 1 else recovered[0]
        return f"{wire}{hint_sfx} >@ {{ {body} }}"
    if hint_sfx:
        return f"{wire}{hint_sfx}"
    return wire


def ensure_wire(line: str) -> str:
    """resolve_line или исходная строка."""
    return resolve_line(line) or line


def _pretty_format_arg(arg: str) -> str:
    """Аргумент wire → pretty (кавычки для селекторов и строк с пробелами)."""
    a = (arg or "").strip()
    if not a or a.startswith("${"):
        return a
    if any(c in a for c in ' "\'[]|'):
        return f'"{a}"'
    return a


def _wire_pretty_lookup(component: str, action: str) -> Optional[Tuple[str, str]]:
    """(component, action) → (method_name, facade|\"\")."""
    comp = (component or "").strip().lower()
    act = (action or "").strip()
    if not comp or not act:
        return None
    for name, (c, a) in _METHOD_ID.items():
        if c == comp and a == act:
            return name, ""
    for facade, methods in _FACADES.items():
        gate = canonical_facade(facade)
        for method_name, (c, a) in methods.items():
            if c == comp and a == act:
                return method_name, gate
    return None


def wire_to_pretty_line(wire: str) -> str:
    """
    Wire `webdriver|click|css|…` → pretty `Нажать css "…"`.
    Для diary STEP, когда нет description / source_line.
    """
    from core.wire_split import split_wire

    raw = (wire or "").strip()
    if not raw or not looks_like_wire(raw):
        return ""
    primary = raw.split(" >", 1)[0].strip()
    parts = split_wire(primary)
    if len(parts) < 2:
        return ""
    comp, action = parts[0], parts[1]
    args = parts[2:]
    found = _wire_pretty_lookup(comp, action)
    if found is None:
        return ""
    method_name, facade = found
    # DISC-2 reverse: label strategy → `Нажать > Войти`
    if args and str(args[0]).strip().lower() == "label":
        if action == "click" and len(args) >= 2:
            pretty_label = " ".join(str(a) for a in args[1:]).strip()
            core = f"{method_name} > {pretty_label}".strip()
            return f"{facade} {core}".strip() if facade else core
        if action == "send_keys" and len(args) >= 3:
            lab = str(args[1]).strip()
            text = " ".join(str(a) for a in args[2:]).strip()
            core = f"{method_name} > {lab} {text}".strip()
            return f"{facade} {core}".strip() if facade else core
    pretty_args = " ".join(_pretty_format_arg(a) for a in args)
    if facade:
        return f"{facade} {method_name} {pretty_args}".strip()
    return f"{method_name} {pretty_args}".strip() if pretty_args else method_name


def _resolve_execution_title_meta(
    comp: str, act: str, params: Dict[str, object]
) -> tuple[str, str, tuple]:
    descriptor = _STEP_DESCRIPTORS.get((comp, act))
    if not descriptor and comp == "zap":
        # SCN-RENAME: legacy zap component → scanner
        alt_comp = "scanner"
        descriptor = _STEP_DESCRIPTORS.get((alt_comp, act))
    category = descriptor.category if descriptor else _CATEGORY_LABELS.get(comp, comp or "PK")
    if descriptor:
        return category, descriptor.title, descriptor.params
    found = _wire_pretty_lookup(comp, act)
    if found:
        method_name, facade = found
        title = f"{facade} {method_name}".strip()
    else:
        title = act.replace("_", " ").strip() or "Действие"
    return category, title, tuple(params)


def render_execution_title(
    component: str,
    action: str,
    params: Dict[str, object],
    *,
    mask=lambda value: value,
) -> str:
    """
    Семантический заголовок фактически исполнившегося действия.

    Входные params уже resolved в Controller. Здесь нет зависимости от Allure,
    DataStream или конкретного адаптера: это единый словарь MethodId → trace.
    """
    comp = (component or "").strip().lower()
    act = (action or "").strip()
    params = _normalize_execution_params(comp, act, params)
    category, title, visible = _resolve_execution_title_meta(comp, act, params)
    rendered = []
    for name in visible:
        if name not in params:
            continue
        value = _format_execution_value(name, params[name], mask)
        if value == "":
            continue
        rendered.append(f"{_PARAM_LABELS.get(name, name)}: {value}")
    suffix = f" — {', '.join(rendered)}" if rendered else ""
    return f"{category}: {title}{suffix}"


def _normalize_execution_params(
    component: str, action: str, params: Dict[str, object]
) -> Dict[str, object]:
    """
    Повторить только пользовательский sugar сканов для отчёта.

    Адаптер принимает `Сканер juice_ctx 1` в технических slots
    ``url, context_name`` и нормализует его перед запросом scanner. Trace обязан
    показывать авторский смысл, а не промежуточное расположение аргументов.
    """
    normalized = dict(params)
    if component not in ("scanner", "scanner"):
        return normalized
    if action in {
        "spider_scan",
        "spider_scan_spa",
        "spider_scan_deep",
        "spider_scan_local",
        "active_scan",
    }:
        url = normalized.get("url")
        context = normalized.get("context_name")
        timeout = normalized.get("timeout_minutes")
        if url and context and timeout is None and _is_timeout_token(context):
            normalized["context_name"] = url
            normalized["timeout_minutes"] = context
            normalized["url"] = None
        elif url and context is None and _is_timeout_token(url):
            normalized["timeout_minutes"] = url
            normalized["url"] = None
    elif action in {
        "ajax_spider_scan",
        "ajax_spider_scan_shallow",
        "ajax_spider_scan_deep",
        "ajax_spider_scan_iterator",
    }:
        url = normalized.get("url")
        if url and normalized.get("timeout_minutes") is None and _is_timeout_token(url):
            normalized["timeout_minutes"] = url
            normalized["url"] = None
    return normalized


def _is_timeout_token(value: object) -> bool:
    try:
        float(str(value).strip())
        return True
    except (TypeError, ValueError):
        return False


def _format_execution_value(name: str, value: object, mask) -> str:
    low_name = (name or "").lower()
    if any(part in low_name for part in _SENSITIVE_PARAM_PARTS):
        return "***"
    try:
        value = mask(value)
    except Exception:
        pass
    if isinstance(value, (list, tuple, set)):
        return f"элементов: {len(value)}"
    if isinstance(value, dict):
        return f"полей: {len(value)}"
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) > 140:
        text = text[:137] + "…"
    return text


def _bank_overlay_path() -> Optional[Path]:
    env_path = (pk_env("METHOD_OVERLAY") or "").strip()
    default = Path(__file__).resolve().parents[1] / "config" / "bank_method_overlay.json"
    if env_path:
        path = Path(env_path)
    elif default.is_file():
        path = default
    else:
        return None
    return path if path.is_file() else None


def _apply_overlay_catalog(data: dict) -> None:
    for alias, canonical in (data.get("aliases") or {}).items():
        if not isinstance(alias, str) or not isinstance(canonical, str):
            raise RuntimeError(f"overlay aliases: bad pair {alias!r} → {canonical!r}")
        if is_reserved_language_word(alias):
            raise RuntimeError(f"overlay alias {alias!r} пересекается с language word")
        _ALIASES[alias.strip()] = canonical.strip()

    for name, target in (data.get("extra") or {}).items():
        if not isinstance(name, str) or not isinstance(target, (list, tuple)) or len(target) != 2:
            raise RuntimeError(f"overlay extra: bad entry {name!r}: {target!r}")
        if is_reserved_language_word(name):
            raise RuntimeError(f"overlay extra {name!r} пересекается с language word")
        _METHOD_ID[name.strip()] = (str(target[0]), str(target[1]))


def _apply_overlay_ui(data: dict) -> None:
    for name in data.get("ui_hide") or []:
        raw = str(name).strip()
        _UI_IDS.discard(raw)
        _UI_IDS.discard(_ALIASES.get(raw, raw))

    for name in data.get("ui_extra") or []:
        raw = str(name).strip()
        canonical = _ALIASES.get(raw, raw)
        if canonical not in _METHOD_ID and raw not in _METHOD_ID:
            raise RuntimeError(f"overlay ui_extra {raw!r}: нет в MethodId / extra")
        _UI_IDS.add(canonical if canonical in _METHOD_ID else raw)

    ui_only = data.get("ui_only")
    if ui_only is None:
        return
    if not isinstance(ui_only, list):
        raise RuntimeError("overlay ui_only must be list or null")
    rebuilt: set[str] = set()
    for name in ui_only:
        raw = str(name).strip()
        canonical = _ALIASES.get(raw, raw)
        if canonical not in _METHOD_ID:
            raise RuntimeError(f"overlay ui_only {raw!r}: неизвестный MethodId")
        rebuilt.add(canonical)
    _UI_IDS.clear()
    _UI_IDS.update(rebuilt)


def _apply_bank_overlay() -> None:
    """
    Банковский профиль MethodId без форка этого файла.

    Путь: env PK_METHOD_OVERLAY или orchestrator/config/bank_method_overlay.json.
    Пример: config/bank_method_overlay.example.json

    Поля JSON:
      aliases   — { "БанкНажать": "Нажать" }
      extra     — { "БанкОткрыть": ["webdriver", "open"] }  новые MethodId → wire
      ui_extra  — имена в первую стрелку AC
      ui_hide   — убрать из первой стрелки (resolve остаётся)
      ui_only   — если список: заменить корень AC целиком этими именами
    """
    path = _bank_overlay_path()
    if path is None:
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"bank MethodId overlay {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"bank MethodId overlay {path}: root must be object")

    _apply_overlay_catalog(data)
    _apply_overlay_ui(data)
    _log.info("MethodId bank overlay applied from %s", path)


_apply_bank_overlay()

# Защита: MethodId / фасады не должны пересекаться с языком.
_overlap = set(_METHOD_ID) & RESERVED_LANGUAGE_WORDS
if _overlap:
    raise RuntimeError(f"MethodId пересекается с language words: {_overlap}")
_facade_overlap = set(_FACADES) & RESERVED_LANGUAGE_WORDS
if _facade_overlap:
    raise RuntimeError(f"Facade пересекается с language words: {_facade_overlap}")
