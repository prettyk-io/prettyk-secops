# -*- coding: utf-8 -*-
"""
MethodId: русское pretty-имя → wire `component|action|args`.

Слои:
  - корень (UI / Проверить* / утилиты) — один токен: `Нажать css .ok`
  - ворота ZAP|HTTP|Сессия|Драйвер — два токена: `ZAP Сканер ${url}`

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
    ("zap", "create_context"): StepDescriptor(
        "Сканер", "Создать контекст", ("context_name", "description")
    ),
    ("zap", "set_context_include"): StepDescriptor(
        "Сканер", "Включить в контекст", ("context_name", "regex")
    ),
    ("zap", "set_context_exclude"): StepDescriptor(
        "Сканер", "Исключить из контекста", ("context_name", "regex")
    ),
    ("zap", "spider_scan"): StepDescriptor(
        "Сканер", "Запустить Spider", ("context_name", "timeout_minutes")
    ),
    ("zap", "ajax_spider_scan"): StepDescriptor(
        "Сканер", "Запустить AJAX Spider", ("timeout_minutes",)
    ),
    ("zap", "active_scan"): StepDescriptor(
        "Сканер", "Запустить активное сканирование", ("context_name", "timeout_minutes")
    ),
    ("zap", "passive_scan_wait"): StepDescriptor(
        "Сканер", "Дождаться пассивного сканирования", ("timeout_minutes",)
    ),
    ("zap", "generate_report"): StepDescriptor(
        "Сканер", "Сформировать отчёт", ("format", "output_file")
    ),
    ("zap", "apply_manifest_auth"): StepDescriptor(
        "Сканер", "ПрименитьAuth", ("context_name", "module_id")
    ),
    ("zap", "import_openapi_spec"): StepDescriptor(
        "Сканер", "Импорт OpenAPI", ("module_id_or_spec",)
    ),
    ("zap", "list_openapi_operations"): StepDescriptor(
        "Сканер", "Список операций OpenAPI", ("module_id_or_spec",)
    ),
    ("zap", "scan_openapi"): StepDescriptor(
        "Сканер", "Скан OpenAPI", ("module_id_or_context",)
    ),
    ("zap", "import_graphql_schema"): StepDescriptor(
        "Сканер", "Импорт GraphQL", ("module_id_or_schema",)
    ),
    ("zap", "list_graphql_operations"): StepDescriptor(
        "Сканер", "Список операций GraphQL", ("module_id_or_schema",)
    ),
    ("zap", "scan_graphql_api"): StepDescriptor(
        "Сканер", "Скан GraphQL", ("module_id_or_context",)
    ),
    ("http", "execute_openapi_module"): StepDescriptor(
        "HTTP", "Выполнить операции OpenAPI", ("module_id_or_spec", "limit")
    ),
    ("http", "execute_graphql_module"): StepDescriptor(
        "HTTP", "Выполнить GraphQL", ("module_id", "query")
    ),
    ("zap", "import_grpc_proto"): StepDescriptor(
        "Сканер", "Импорт gRPC", ("proto_file_or_dir",)
    ),
    ("grpc", "list_services"): StepDescriptor(
        "gRPC", "Список сервисов gRPC", ("module_id",)
    ),
    ("zap", "scan_grpc"): StepDescriptor(
        "Сканер", "Скан gRPC", ("context_name",)
    ),
    ("grpc", "unary_call"): StepDescriptor(
        "gRPC", "Вызов gRPC", ("module_id", "method", "request_json")
    ),
    ("webdriver", "auto_authorize_discovery"): StepDescriptor(
        "WebDriver", "АвтоАвторизоваться", ("url", "user", "password")
    ),
    ("zap", "execute_chain_module"): StepDescriptor(
        "Сканер", "ВыполнитьЦепь", ("module_id",)
    ),
    ("zap", "scan_chain_module"): StepDescriptor(
        "Сканер", "СканированиеЦепи", ("module_id",)
    ),
    ("zap", "investigate_chain_module"): StepDescriptor(
        "Сканер", "РасследованиеЦепи", ("module_id",)
    ),
    ("zap", "prepare_chain_module"): StepDescriptor(
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
    "zap": "Сканер",
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
    "ОбойтиСтраницы": ("webdriver", "crawl_urls"),
    # GATHER: teleport + per-node spider burst (ZapWorkStream); не плоский Сканер.
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
    "НажатьУдерживая": ("webdriver", "hold_click"),
    "НажатьJS": ("webdriver", "click_js"),
    "НажатьПоИндексу": ("webdriver", "click_element_by_index"),
    "НажатьПоТексту": ("webdriver", "click_element_by_text"),
    "ЗажатьКнопкуМыши": ("webdriver", "click_and_hold"),
    "ОтпуститьКнопкуМыши": ("webdriver", "release"),
    "Навести": ("webdriver", "hover"),
    "Перетащить": ("webdriver", "drag_and_drop"),
    "ПеретащитьСоСмещением": ("webdriver", "drag_and_drop_by_offset"),
    "ПереместитьКЭлементу": ("webdriver", "move_to_element"),
    "СместитьКурсор": ("webdriver", "move_by_offset"),
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
    "ВыбратьПоИндексу": ("webdriver", "select_by_index"),
    "ЭлементыСписка": ("webdriver", "get_list_items"),
    "ТекстЯчейкиТаблицы": ("webdriver", "get_table_cell_text"),
    "ЧислоСтрокТаблицы": ("webdriver", "get_table_row_count"),
    "ОтправитьФорму": ("webdriver", "submit"),
    "ЗагрузитьФайл": ("webdriver", "upload_file"),
    "ПрокрутитьКЭлементу": ("webdriver", "scroll_to_element"),
    "ПрокрутитьВверх": ("webdriver", "scroll_to_top"),
    "ПрокрутитьВниз": ("webdriver", "scroll_to_bottom"),
    "ПрокрутитьНа": ("webdriver", "scroll_by"),
    "ПереключитьФрейм": ("webdriver", "switch_to_frame"),
    "ПереключитьОкно": ("webdriver", "switch_to_window"),
    "ВернутьсяВОсновнойКонтент": ("webdriver", "switch_to_default"),
    "СписокОкон": ("webdriver", "get_window_handles"),
    "ТекущееОкно": ("webdriver", "get_current_window_handle"),
    "ПринятьОповещение": ("webdriver", "accept_alert"),
    "ОтклонитьОповещение": ("webdriver", "dismiss_alert"),
    "ПолучитьТекстОповещения": ("webdriver", "get_alert_text"),
    "ВвестиВОповещение": ("webdriver", "send_keys_to_alert"),
    "НажатьКлавишу": ("webdriver", "press_key"),
    "НажатьКомбинацию": ("webdriver", "key_combination"),
    "ЗажатьКлавишу": ("webdriver", "key_down"),
    "ОтпуститьКлавишу": ("webdriver", "key_up"),
    "ВыполнитьJS": ("webdriver", "execute_script"),
    "ВыполнитьAsyncJS": ("webdriver", "execute_async_script"),
    "Скриншот": ("webdriver", "take_screenshot"),
    "СкриншотЭлемента": ("webdriver", "take_element_screenshot"),
    # --- assert ---
    "ПроверитьЗаголовок": ("webdriver", "assert_title"),
    "ПроверитьURL": ("webdriver", "assert_url"),
    "ПроверитьНаличиеЭлемента": ("webdriver", "assert_element_present"),
    "ПроверитьВидимостьЭлемента": ("webdriver", "assert_element_visible"),
    "ПроверитьНевидимостьЭлемента": ("webdriver", "assert_element_not_visible"),
    "ПроверитьТекстНаСтранице": ("webdriver", "assert_text_present"),
    "ПроверитьРавенство": ("webdriver", "assert_equals"),
    "ПроверитьНеравенство": ("webdriver", "assert_not_equals"),
    "ПроверитьВхождение": ("webdriver", "assert_contains"),
    "ПроверитьОтсутствиеВхождения": ("webdriver", "assert_not_contains"),
    "ПроверитьИстину": ("webdriver", "assert_true"),
    "ПроверитьЛожь": ("webdriver", "assert_false"),
    "ПроверитьЧекбокс": ("webdriver", "assert_checkbox_checked"),
    "ПроверитьТекстОповещения": ("webdriver", "assert_alert_text"),
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
    "АтрибутЭлементаПоИндексу": ("webdriver", "get_element_attribute_by_index"),
    "ТекстыЭлементов": ("webdriver", "get_elements_texts"),
    "КоличествоЭлементов": ("webdriver", "get_elements_count"),
    "ТекстыЭлементовСТекстом": ("webdriver", "filter_elements_by_text"),
    # --- util: редко / шум в AC ---
    "МеткаВДневнике": ("webdriver", "log_marker"),
    # ЭлементПоИндексу убран с surface: сырой WebElement не для Пусть
    "ЭлементОтображается": ("webdriver", "is_displayed"),
    "ЭлементДоступен": ("webdriver", "is_enabled"),
    "ЭлементВыбран": ("webdriver", "is_selected"),
    "ПолучитьКоординаты": ("webdriver", "get_location"),
    "ПолучитьРазмер": ("webdriver", "get_size"),
    "Лог": ("core", "log_message"),
    "ЛогПеременную": ("core", "log_variable"),
    # Именованные нарезки логов (LOG-CUT) — не гасят общий diary.
    "НачатьЛогирование": ("core", "start_log_cut"),
    "ОкончитьЛогирование": ("core", "end_log_cut"),
    # Маркер атаки → канал zap/ALL (не diary LOG). Wire тот же, что у ZAP ЛогАтаки.
    "ЛогАтаки": ("zap", "log_attack"),
    # --- отчёт: вложения Allure (wire allure|attach_*) ---
    "ПриложитьСкриншот": ("allure", "attach_screenshot"),
    "ПриложитьТекст": ("allure", "attach_text"),
    "ПриложитьJSON": ("allure", "attach_json"),
    "ПриложитьHTML": ("allure", "attach_html"),
    "ПриложитьФайл": ("allure", "attach_file"),
    # --- корень: дубли главного из ZAP / HTTP / Сессия (полные списки — за воротами) ---
    "Сканер": ("zap", "spider_scan"),
    "СканерЛокальный": ("zap", "spider_scan_local"),  # util / за ZAP
    "Краулер": ("zap", "ajax_spider_scan"),
    "КраулерКлиент": ("zap", "client_spider_scan"),
    # остальные Сканер*/Краулер* — util (и за ZAP)
    "СканерГлубокий": ("zap", "spider_scan_deep"),
    "СканерSPA": ("zap", "spider_scan_spa"),
    "СтатусСканера": ("zap", "spider_status"),
    "ОстановитьСканера": ("zap", "stop_spider"),
    "КраулерГлубокий": ("zap", "ajax_spider_scan_deep"),
    "КраулерПоверхностный": ("zap", "ajax_spider_scan_shallow"),
    "КраулерИтератор": ("zap", "ajax_spider_scan_iterator"),
    "СтатусКраулера": ("zap", "ajax_spider_status"),
    "СтатусКраулерКлиент": ("zap", "client_spider_status"),
    "АктивноеСканирование": ("zap", "active_scan"),
    "НовыйКонтекст": ("zap", "create_context"),
    "ПолучитьАлерты": ("zap", "get_alerts"),
    "HttpGet": ("http", "get"),
    "HttpPost": ("http", "post"),
    "ОчиститьCookies": ("browser", "clear_cookies"),
    "ОчиститьКэш": ("browser", "cdp_clear_browser_cache"),
    "УстановитьCookie": ("browser", "set_cookie"),
    "ПолучитьCookie": ("browser", "get_cookie"),
}

# Первая «стрелка» AC: только это (+ ворота ZAP/HTTP/Сессия/Драйвер).
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
    "ФильтрЭлементовПоТексту": "ТекстыЭлементовСТекстом",
    "Логировать": "Лог",
    "ЛогСообщение": "Лог",
    # Alert* → Оповещение* (браузерный dialog, не ZAP alerts)
    "ПринятьAlert": "ПринятьОповещение",
    "ОтклонитьAlert": "ОтклонитьОповещение",
    "ПолучитьТекстAlert": "ПолучитьТекстОповещения",
    "ВвестиВAlert": "ВвестиВОповещение",
    "ПроверитьТекстAlert": "ПроверитьТекстОповещения",
    # Сессия: старое CDP-имя → канон ОчиститьCookies (за воротами — DevTools wire)
    "ОчиститьCookiesCDP": "ОчиститьCookies",
    # legacy Утвердить* → канон Проверить* (волна C)
    "УтвердитьРавенство": "ПроверитьРавенство",
    "УтвердитьНеравенство": "ПроверитьНеравенство",
    "УтвердитьВхождение": "ПроверитьВхождение",
    "УтвердитьОтсутствие": "ПроверитьОтсутствиеВхождения",
    "УтвердитьВСписке": "ПроверитьВСписке",
    "УтвердитьНеВСписке": "ПроверитьНеВСписке",
    "УтвердитьИстину": "ПроверитьИстину",
    "УтвердитьЛожь": "ПроверитьЛожь",
    "УтвердитьБольше": "ПроверитьБольше",
    "УтвердитьМеньше": "ПроверитьМеньше",
    "УтвердитьВДиапазоне": "ПроверитьВДиапазоне",
    "УтвердитьДлину": "ПроверитьДлину",
    "УтвердитьПустоту": "ПроверитьПустоту",
    "УтвердитьНепустоту": "ПроверитьНепустоту",
}

# ---------------------------------------------------------------------------
# Ворота: ZAP / HTTP / Сессия (cookies+CDP) / Драйвер (хвост webdriver)
# ---------------------------------------------------------------------------

_FACADE_ZAP: Dict[str, WireTarget] = {
    # контексты
    "НовыйКонтекст": ("zap", "create_context"),
    "ВключитьВКонтекст": ("zap", "set_context_include"),
    "ИсключитьИзКонтекста": ("zap", "set_context_exclude"),
    "ПрименитьДомены": ("zap", "apply_allowed_domains"),
    "AuthКонтекста": ("zap", "set_context_auth"),
    "СписокКонтекстов": ("zap", "list_contexts"),
    "ПереключитьКонтекст": ("zap", "switch_context"),
    "УдалитьКонтекст": ("zap", "delete_context"),
    "ОчиститьКонтекст": ("zap", "clear_context"),
    "АрхивироватьКонтекст": ("zap", "archive_context"),
    "КонтекстПерехватаПользователя": ("zap", "new_user_intercept_context"),
    # пользователи
    "СоздатьПользователя": ("zap", "create_user"),
    "УчётныеДанныеПользователя": ("zap", "set_user_credentials"),
    "ForcedUser": ("zap", "set_forced_user"),
    "ВключитьForcedUser": ("zap", "enable_forced_user_mode"),
    "ВыключитьForcedUser": ("zap", "disable_forced_user_mode"),
    "СоздатьИНазначитьForcedUser": ("zap", "create_and_force_user"),
    "ВключитьПользователя": ("zap", "enable_user"),
    "ОтключитьПользователя": ("zap", "disable_user"),
    "СписокПользователей": ("zap", "get_users"),
    # spider → Сканер*
    "Сканер": ("zap", "spider_scan"),
    "СканерЛокальный": ("zap", "spider_scan_local"),
    "СканерГлубокий": ("zap", "spider_scan_deep"),
    "СканерSPA": ("zap", "spider_scan_spa"),
    "СтатусСканера": ("zap", "spider_status"),
    "ОстановитьСканера": ("zap", "stop_spider"),
    # ajax spider → Краулер*
    "Краулер": ("zap", "ajax_spider_scan"),
    "КраулерКлиент": ("zap", "client_spider_scan"),
    "КраулерГлубокий": ("zap", "ajax_spider_scan_deep"),
    "КраулерПоверхностный": ("zap", "ajax_spider_scan_shallow"),
    "КраулерИтератор": ("zap", "ajax_spider_scan_iterator"),
    "СтатусКраулера": ("zap", "ajax_spider_status"),
    "СтатусКраулерКлиент": ("zap", "client_spider_status"),
    # scans
    "АктивноеСканирование": ("zap", "active_scan"),
    "СтатусАктивногоСканирования": ("zap", "active_scan_status"),
    "ОстановитьАктивноеСканирование": ("zap", "stop_active_scan"),
    "ПассивноеСканирование": ("zap", "passive_scan_wait"),
    "ПолитикаСканирования": ("zap", "set_scan_policy"),
    "ПрофильСканирования": ("zap", "apply_scan_depth_profile"),
    "СписокПолитикСканирования": ("zap", "get_scan_policies"),
    "ПассивныеСканеры": ("zap", "get_passive_scanners"),
    "ВключитьПассивныеСканеры": ("zap", "enable_passive_scanners"),
    "ВыключитьПассивныеСканеры": ("zap", "disable_all_passive_scanners"),
    # alerts / report / filters
    "ПолучитьАлерты": ("zap", "get_alerts"),
    "ЧислоАлертов": ("zap", "get_alert_count"),
    "ФильтрАлерта": ("zap", "add_alert_filter"),
    "ГлобальныйФильтрАлерта": ("zap", "add_global_alert_filter"),
    "ЗагрузитьФильтры": ("zap", "load_alert_filters"),
    "План": ("zap", "run_automation_plan"),
    "СтатусПлана": ("zap", "automation_plan_progress"),
    "ОстановитьПлан": ("zap", "stop_automation_plan"),
    "СгенерироватьПлан": ("zap", "generate_automation_plan"),
    "ПрименитьAuth": ("zap", "apply_manifest_auth"),
    "BrowserAuth": ("zap", "set_browser_based_auth"),
    "Отчёт": ("zap", "generate_report"),
    "ЛогАтаки": ("zap", "log_attack"),
    # API import (+ lab inventory)
    "ИмпортOpenAPI": ("zap", "import_openapi_spec"),
    "СписокОперацийOpenAPI": ("zap", "list_openapi_operations"),
    "СканOpenAPI": ("zap", "scan_openapi"),
    "ВыполнитьОперацииOpenAPI": ("http", "execute_openapi_module"),
    "ИмпортGraphQL": ("zap", "import_graphql_schema"),
    "СписокОперацийGraphQL": ("zap", "list_graphql_operations"),
    "СканGraphQL": ("zap", "scan_graphql_api"),
    "МетодЗапросаGraphQL": ("zap", "set_graphql_request_method"),
    "ВыполнитьGraphQL": ("http", "execute_graphql_module"),
    "ИмпортgRPC": ("zap", "import_grpc_proto"),
    "СписокСервисовgRPC": ("grpc", "list_services"),
    "СканgRPC": ("zap", "scan_grpc"),
    "ВызовgRPC": ("grpc", "unary_call"),
    # DISC-1 lab stub (honest fail; CANON дно не снимаем)
    "АвтоАвторизоваться": ("webdriver", "auto_authorize_discovery"),
    "ИмпортHAR": ("zap", "import_har_sequence"),
    "СканПоследовательности": ("zap", "sequence_active_scan"),
    "ВыполнитьЦепь": ("zap", "execute_chain_module"),
    "СканированиеЦепи": ("zap", "scan_chain_module"),
    "РасследованиеЦепи": ("zap", "investigate_chain_module"),
    "ПодготовитьЦепь": ("zap", "prepare_chain_module"),
    "ИзбегатьLogout": ("zap", "set_logout_avoidance"),
    # http via zap / session
    "ЗапросЧерезZAP": ("zap", "zap_http_request"),
    "СыройЗапросЧерезZAP": ("zap", "zap_http_raw_request"),
    "Сообщения": ("zap", "get_messages"),
    "СохранитьСессию": ("zap", "save_session"),
    "ЗагрузитьСессию": ("zap", "load_session"),
    "СайтыСессий": ("zap", "get_sessions_sites"),
    "СессииСайта": ("zap", "get_site_sessions"),
    # replacer / payloads / scripts
    "ПравилоReplacer": ("zap", "add_replacer_rule"),
    "УдалитьReplacer": ("zap", "remove_replacer_rule"),
    "СписокReplacer": ("zap", "list_replacer_rules"),
    "ОчиститьReplacer": ("zap", "clear_replacer_rules"),
    "ДобавитьPayload": ("zap", "add_custom_payload"),
    "УдалитьPayload": ("zap", "remove_payload"),
    "СписокPayload": ("zap", "get_payloads"),
    "ЗагрузитьСкрипт": ("zap", "load_script"),
    "ВыполнитьСкрипт": ("zap", "run_script"),
    "УдалитьСкрипт": ("zap", "remove_script"),
    "СписокСкриптов": ("zap", "list_scripts"),
    "ЗагрузитьHttpSender": ("zap", "load_http_sender_script"),
    "ВключитьHttpSender": ("zap", "enable_http_sender_script"),
    "ВыключитьHttpSender": ("zap", "disable_http_sender_script"),
    "УдалитьHttpSender": ("zap", "remove_http_sender_script"),
    # alpha fuzz: mask httpsender + ScriptVars (не UI Fuzzer)
    "HttpSender": ("zap", "install_mask_http_sender"),
    "ПейлоадПодмены": ("zap", "set_fuzz_payload"),
    "ГлобальнаяVarСкрипта": ("zap", "set_script_global_var"),
    # misc
    "ИмпортСертификата": ("zap", "import_certificate"),
    "ЛокальныйСервер": ("zap", "add_local_server"),
    "СтартOAST": ("zap", "start_oast_server"),
    "СтопOAST": ("zap", "stop_oast_server"),
    "АлертыOAST": ("zap", "get_oast_alerts"),
}

# Все ZAP-методы доступны с корня (без ворот «ZAP …»). HTTP / Сессия / Драйвер — как были.
_METHOD_ID.update(_FACADE_ZAP)

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
    "СохранитьСостояние": ("browser", "save_state"),
    "ВосстановитьСостояние": ("browser", "restore_state"),
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
    "ДопЗаголовки": ("browser", "cdp_set_extra_headers"),
    "СброситьДопЗаголовки": ("browser", "cdp_clear_extra_headers"),
    "БлокироватьURL": ("browser", "cdp_set_blocked_urls"),
    "СнятьБлокировкуURL": ("browser", "cdp_clear_blocked_urls"),
    "ОтключитьКэш": ("browser", "cdp_set_cache_disabled"),
    "ОчиститьКэш": ("browser", "cdp_clear_browser_cache"),
    "ЭмуляцияСети": ("browser", "cdp_emulate_network"),
    "СброситьЭмуляциюСети": ("browser", "cdp_reset_network_conditions"),
    "ПодменитьАгентПользователя": ("browser", "cdp_set_user_agent"),
    "Геолокация": ("browser", "cdp_set_geolocation"),
    "РазмерУстройства": ("browser", "cdp_set_device_metrics"),
    "InitСкрипт": ("browser", "cdp_add_init_script"),
    "Перезагрузить": ("browser", "cdp_reload"),
    "Скриншот": ("browser", "cdp_capture_screenshot"),
    "Выполнить": ("browser", "cdp_evaluate"),
    "ИгнорСертификатов": ("browser", "cdp_ignore_certificate_errors"),
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
    "ВключитьМетрики": ("browser", "cdp_performance_enable"),
    "ВыключитьМетрики": ("browser", "cdp_performance_disable"),
    "Метрики": ("browser", "cdp_get_performance_metrics"),
    # эмуляция окружения
    "Локаль": ("browser", "cdp_set_locale"),
    "Таймзона": ("browser", "cdp_set_timezone"),
    "ЭмуляцияTouch": ("browser", "cdp_set_touch_emulation"),
    "СброситьГеолокацию": ("browser", "cdp_clear_geolocation"),
    "СброситьРазмерУстройства": ("browser", "cdp_clear_device_metrics"),
    # управление вкладкой и загрузками
    "ОстановитьЗагрузкуСтраницы": ("browser", "cdp_stop_loading"),
    "НаПереднийПлан": ("browser", "cdp_bring_to_front"),
    "ПоведениеЗагрузок": ("browser", "cdp_set_download_behavior"),
}

# Хвост webdriver — ворота «Драйвер» (не путать с кликами в корне: Нажать без ворот).
_FACADE_DRIVER: Dict[str, WireTarget] = {
    name: target
    for name, target in _METHOD_ID.items()
    if target[0] == "webdriver"
}

# Сессия = cookies / storage / CDP (адаптер browser). Для банка понятнее, чем «CDP».
_FACADES: Dict[str, Dict[str, WireTarget]] = {
    "Сканер": _FACADE_ZAP,
    "HTTP": _FACADE_HTTP,
    "Сессия": _FACADE_CDP,
    "Драйвер": _FACADE_DRIVER,
}

# Старые ярлыки ворот (ещё резолвим).
_FACADE_ALIASES: Dict[str, str] = {
    "ZAP": "Сканер",
    "CDP": "Сессия",
    "WD": "Драйвер",
    "Браузер": "Драйвер",
}

# Alias методов за воротами (канон не в корневом _METHOD_ID).
_FACADE_METHOD_ALIASES: Dict[str, str] = {
    "HttpЧерезZAP": "ЗапросЧерезZAP",
    "СыройHttpЧерезZAP": "СыройЗапросЧерезZAP",
    "ПодменаHttpSender": "HttpSender",
    "ПодменитьUserAgent": "ПодменитьАгентПользователя",
}

_WIRE_COMPONENTS = frozenset(
    {
        "webdriver",
        "browser",
        "zap",
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
    `ZAP Сканер ${url}` → `zap|spider_scan|${url}`
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
            return None
        m2 = re.match(r"^(\S+)(?:\s+(.*))?$", rest, re.DOTALL)
        if not m2:
            return None
        method_name, args_rest = m2.group(1), m2.group(2) or ""
        label_wire = _label_discovery_wire(method_name, args_rest)
        if label_wire is not None:
            # Драйвер Нажать > Войти — facade + label mode
            target = lookup_facade_method(name, method_name)
            if target is not None and label_wire.startswith("webdriver|"):
                return label_wire
        target = lookup_facade_method(name, method_name)
        if target is None:
            return None
        return _wire_from_target(target, args_rest)

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
    category = descriptor.category if descriptor else _CATEGORY_LABELS.get(comp, comp or "KDT")
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
    ``url, context_name`` и нормализует его перед запросом ZAP. Trace обязан
    показывать авторский смысл, а не промежуточное расположение аргументов.
    """
    normalized = dict(params)
    if component != "zap":
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

    Путь: env KDT_METHOD_OVERLAY или orchestrator/config/bank_method_overlay.json.
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
