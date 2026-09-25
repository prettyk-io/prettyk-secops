# -*- coding: utf-8 -*-
"""Playwright Adapter — counterpart to WebDriverAdapter.

PW-1: browser lifecycle, navigation, basic interactions.
Registers as both "webdriver" and "browser" in the controller.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

from playwright.sync_api import Page, TimeoutError as PwTimeoutError

from adapters.base_adapter import BaseAdapter
from browser.playwright_runtime import PlaywrightBrowserRuntime

logger = logging.getLogger("orchestrator")


def wire_action(ru_name: str, *, args=()):
    """GRD-B1: регистрирует pretty-имя → метод для единого источника правды.

    Помечает метод адаптера русским MethodId-именем. Метакласс собирает
    `_WIRE_ACTIONS` автоматически при определении класса. Генератор
    `python -m tools.export_keywords --gen-method-id` пересобирает
    webdriver-секцию `_METHOD_ID` из этих декораторов.
    """
    def deco(fn):
        fn._wire_action = (ru_name, tuple(args))
        return fn
    return deco


class _WireActionMeta(type):
    """Собирает _WIRE_ACTIONS из декораторов @wire_action на методах класса."""

    def __new__(mcs, name, bases, namespace):
        cls = super().__new__(mcs, name, bases, namespace)
        actions: dict[str, tuple[str, tuple[str, ...]]] = {}
        # Базовые классы первыми — методы наследника перекрывают.
        for base in bases:
            for ru_name, spec in getattr(base, "_WIRE_ACTIONS", {}).items():
                actions.setdefault(ru_name, spec)
        for attr_name, attr_value in namespace.items():
            spec = getattr(attr_value, "_wire_action", None)
            if spec is not None:
                ru_name, arg_tuple = spec
                actions[ru_name] = (attr_name, arg_tuple)
        cls._WIRE_ACTIONS = actions
        return cls


class PlaywrightAdapter(BaseAdapter, metaclass=_WireActionMeta):
    """Playwright browser adapter for secops-lab-pure.

    Supports three modes:
      - launch: start a new browser
      - cdp: attach to existing Chrome via connectOverCDP
      - context: multi-role isolation via new_context()
    """

    def __init__(
        self,
        driver=None,
        browser: str = "chromium",
        headless: bool = True,
        proxy: Optional[str] = None,
        session_name: Optional[str] = None,
        base_url: Optional[str] = None,
        allowed_extra_domains: Optional[str] = None,
        cdp_endpoint: Optional[str] = None,
    ):
        super().__init__(driver)
        self._browser_type = browser
        self._headless = headless
        self._proxy_str = proxy
        self._session_name = session_name or "prettyk-run"
        self._base_url = (base_url or "").strip()
        self._allowed_extra_domains = (allowed_extra_domains or "").strip()
        self._cdp_endpoint = cdp_endpoint
        self._runtime = PlaywrightBrowserRuntime()
        self._page: Optional[Page] = None
        self._video_dir: Optional[str] = None
        self._console_entries: list[dict] = []
        self._console_bound = False

    @property
    def driver(self):
        return self._page

    def _bind_console(self):
        if self._page is None or self._console_bound:
            return
        self._page.on("console", lambda msg: self._console_entries.append({
            "level": msg.type.upper() if msg.type else "LOG",
            "message": msg.text,
            "timestamp": int(time.time() * 1000),
            "source": "console-api",
        }))
        self._console_bound = True

    @driver.setter
    def driver(self, value):
        self._page = value

    def _resolve_proxy(self) -> Optional[dict]:
        if not self._proxy_str:
            return None
        raw = self._proxy_str.strip()
        if "://" in raw:
            scheme, raw = raw.split("://", 1)
        else:
            scheme = "http"
        host, sep, port = raw.rpartition(":")
        if sep and host in {"localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"}:
            host = "host.docker.internal"
        endpoint = f"{host}:{port}" if sep else raw
        return {"server": f"{scheme}://{endpoint}"}

    def _ensure_page(self) -> Page:
        if self._page is not None:
            return self._page

        if self._cdp_endpoint:
            self._page = self._runtime.connect_over_cdp(self._cdp_endpoint)
        else:
            self._page = self._runtime.launch(
                browser_type=self._browser_type,
                headless=self._headless,
                proxy=self._resolve_proxy(),
                ignore_https_errors=True,
                record_video_dir=self._video_dir,  # PW-E3
            )
        self._bind_console()
        return self._page

    def session_diary(self, kind, *parts, live=True, pretty=""):
        """
        Кураторская строка дневника: STEP / ERROR / HIGH / NOTE.

        Пишем в лог оркестратора (`[PK-DIARY]`). Дневник живёт рядом с
        прогоном и в Allure. Никогда не роняет шаг: это диагностика.

        live=False — только лог оркестратора, без diary_bus (Allure не затрагивается).
        pretty — опциональная PrettyK-строка для каретки шагов Live,
        когда `text` содержит сырой wire/execution-title.
        """
        kind = str(kind or "NOTE").strip().upper()
        text = " | ".join(str(p).replace("\n", " ").strip() for p in parts if p not in (None, ""))
        if not text:
            return
        line = text[:400]
        logger.info("[PK-DIARY] %s: %s", kind, line)
        if not live:
            return
        try:
            from utils.diary_bus import publish

            publish(kind, line, channel="diary", pretty=(pretty or ""))
        except Exception:
            pass

    # ========== LIFECYCLE ==========

    def shutdown(self):
        """Graceful shutdown — called by controller teardown."""
        try:
            self._runtime.close()
        except Exception as e:
            logger.warning("PlaywrightAdapter shutdown error: %s", e)
        finally:
            self._page = None
            self._console_entries.clear()
            self._console_bound = False

    # ========== NAVIGATION ==========

    def open_url(self, url: str):
        """Navigate to URL."""
        page = self._ensure_page()
        page.goto(url, wait_until="domcontentloaded")
        logger.info("Playwright open_url: %s → %s", url, page.url)

    @wire_action("Открыть")
    def open(self, url=None, wait_for_load=True):
        """Canonical webdriver|open: resolve a relative URL against base_url."""
        from urllib.parse import urljoin
        raw = "" if url is None else str(url).strip()
        if not raw:
            raw = self._base_url
        elif not raw.startswith(("http://", "https://")):
            if not self._base_url:
                raise ValueError("relative URL requires base_url")
            raw = urljoin(self._base_url.rstrip("/") + "/", raw)
        if not raw:
            raise ValueError("open requires url or base_url")
        page = self._ensure_page()
        page.goto(raw, wait_until="domcontentloaded" if wait_for_load else "commit")

    @wire_action("ОткрытьПоURL")
    def open_by_url(self, url, wait_for_load=True):
        self.open(url, wait_for_load=wait_for_load)

    def reload(self):
        """Reload current page."""
        page = self._ensure_page()
        page.reload(wait_until="domcontentloaded")

    def go_back(self):
        """Navigate back."""
        self._ensure_page().go_back(wait_until="domcontentloaded")

    def go_forward(self):
        """Navigate forward."""
        self._ensure_page().go_forward(wait_until="domcontentloaded")

    # PW-C3: настоящие def-методы, а не alias'ы — export_keywords (ast-разбор)
    # видит только FunctionDef, а `back = go_back` (Assign) не попадает в каталог.
    @wire_action("Вернуться")
    def back(self):
        """Canonical wire: navigate back."""
        self.go_back()

    @wire_action("Вперёд")
    def forward(self):
        """Canonical wire: navigate forward."""
        self.go_forward()

    @wire_action("ОбновитьСтраницу")
    def refresh(self):
        """Canonical wire: reload current page."""
        self.reload()

    @wire_action("ЗакрытьОкно")
    def close(self):
        page = self._page
        if page is not None:
            page.close()
            self._page = None
            self._console_bound = False

    @wire_action("ЗакрытьТекущееОкно")
    def close_current_window(self):
        self.close()

    @wire_action("ЗакрытьБраузер")
    def quit(self):
        self.shutdown()

    def current_url(self) -> str:
        """Return current page URL."""
        page = self._page
        return page.url if page else ""

    def page_title(self) -> str:
        """Return current page title."""
        page = self._page
        if page is None:
            return ""
        try:
            return page.title()
        except Exception:
            return ""

    # ========== CLICK / FILL ==========

    def _locator(self, selector_type: str, selector_value: str):
        """Resolve a Playwright Locator from strategy + value.

        DSL-B2: supports 11 strategies + auto-detect fallback.
          css | xpath | id | name | class | text | exact | label | placeholder | test_id | qa | role
        Auto-detect cascade (when type is empty or 'auto'):
          // → xpath, # → id, . → css, [attr= → css, otherwise role→label→test_id→name→placeholder→text
        """
        page = self._ensure_page()
        kind = str(selector_type or "").strip().lower()
        value = str(selector_value or "")

        if kind in {"css", "selector"}:
            return page.locator(value)
        if kind == "xpath":
            return page.locator(f"xpath={value}")
        if kind == "id":
            return page.locator(f"#{value.lstrip('#')}")
        if kind == "name":
            return page.locator(f"[name={json.dumps(value)}]")
        if kind == "class":
            return page.locator(f".{value.lstrip('.')}")
        if kind == "text":
            return page.get_by_text(value, exact=False)
        if kind == "exact":
            return page.get_by_text(value, exact=True)
        if kind == "label":
            return page.get_by_label(value)
        if kind == "placeholder":
            return page.get_by_placeholder(value)
        if kind in {"test_id", "qa"}:
            return page.get_by_test_id(value)
        if kind == "role":
            return page.get_by_role(value)

        # ── Auto-detect cascade ──
        v = value.strip()
        if not v:
            return page.locator(value)
        if v.startswith("//") or v.startswith("xpath="):
            return page.locator(f"xpath={value}")
        if v.startswith("#"):
            return page.locator(value)
        if v.startswith(".") and " " not in v:
            return page.locator(value)
        if v.startswith("[") or "=" in v[:12]:
            return page.locator(value)

        # Semantic cascade: попробовать role, label, test_id, name, placeholder, text
        for strategy in ("role", "label", "test_id", "name", "placeholder", "text"):
            try:
                loc = self._locator_dispatch(page, strategy, value)
                if loc.count() > 0:
                    return loc
            except Exception:
                continue

        # Fallback: text (contains)
        return page.get_by_text(value, exact=False)

    @staticmethod
    def _locator_dispatch(page, strategy: str, value: str):
        """Single-strategy dispatch for auto-detect cascade (without _ensure_page recursion)."""
        if strategy == "role":
            return page.get_by_role(value)
        if strategy == "label":
            return page.get_by_label(value)
        if strategy == "test_id":
            return page.get_by_test_id(value)
        if strategy == "name":
            return page.locator(f"[name={json.dumps(value)}]")
        if strategy == "placeholder":
            return page.get_by_placeholder(value)
        if strategy == "text":
            return page.get_by_text(value, exact=False)
        return page.locator(value)

    @wire_action("Нажать")
    def click(self, selector_type: str, selector_value: str = "", timeout: int = 10_000):
        """Canonical webdriver|click with selector type and value."""
        page = self._ensure_page()
        self._locator(selector_type, selector_value).first.click(timeout=timeout)

    @wire_action("НажатьJS")
    def click_js(self, selector_type, selector_value, timeout=10_000):
        self._locator(selector_type, selector_value).first.evaluate("el => el.click()")

    @wire_action("Навести")
    def hover(self, selector_type, selector_value, timeout=10_000):
        self._locator(selector_type, selector_value).first.hover(timeout=timeout)

    @wire_action("НажатьДважды")
    def double_click(self, selector_type, selector_value, timeout=10_000):
        self._locator(selector_type, selector_value).first.dblclick(timeout=timeout)

    @wire_action("НажатьПравой")
    def right_click(self, selector_type, selector_value, timeout=10_000):
        self._locator(selector_type, selector_value).first.click(button="right", timeout=timeout)

    def click_text(self, text: str, timeout: int = 10_000):
        """Click an element by visible text."""
        page = self._ensure_page()
        page.get_by_text(text, exact=True).click(timeout=timeout)

    def click_role(self, role: str, name: str = "", timeout: int = 10_000):
        """Click by ARIA role + accessible name."""
        page = self._ensure_page()
        loc = page.get_by_role(role)
        if name:
            loc = loc.filter(has_text=name)
        loc.first.click(timeout=timeout)

    def fill(self, selector: str, value: str, timeout: int = 10_000):
        """Type into an input/textarea by CSS selector."""
        page = self._ensure_page()
        page.fill(selector, value, timeout=timeout)

    def fill_label(self, label_text: str, value: str, timeout: int = 10_000):
        """Type into an input by its label text."""
        page = self._ensure_page()
        page.get_by_label(label_text).fill(value, timeout=timeout)

    def type_text(self, selector: str, text: str, delay: int = 0, timeout: int = 10_000):
        """Type character by character (simulates real typing)."""
        page = self._ensure_page()
        page.locator(selector).press_sequentially(text, delay=delay, timeout=timeout)

    def submit_form(self, selector: str = "form", timeout: int = 10_000):
        """Submit a form."""
        page = self._ensure_page()
        page.locator(selector).first.press("Enter", timeout=timeout)

    @wire_action("ВставитьЗначение")
    def send_keys(self, selector_type, selector_value, text, clear_first=True, timeout=10_000):
        locator = self._locator(selector_type, selector_value).first
        if str(clear_first).strip().lower() not in {"0", "false", "no"}:
            locator.fill(str(text), timeout=timeout)
        else:
            locator.press_sequentially(str(text), timeout=timeout)

    @wire_action("ДописатьТекст")
    def append_text(self, selector_type, selector_value, text, timeout=10_000):
        self.send_keys(selector_type, selector_value, text, clear_first=False, timeout=timeout)

    @wire_action("УстановитьЗначениеDOM")
    def set_value(self, selector_type, selector_value, text):
        self._locator(selector_type, selector_value).first.fill(str(text))

    @wire_action("ВыбратьПоЗначению")
    def select_by_value(self, selector_type, selector_value, value):
        self._locator(selector_type, selector_value).first.select_option(value=str(value))

    @wire_action("ВыбратьПоТексту")
    def select_by_text(self, selector_type, selector_value, text):
        self._locator(selector_type, selector_value).first.select_option(label=str(text))

    @wire_action("ЗагрузитьФайл")
    def upload_file(self, selector_type, selector_value, file_path):
        self._locator(selector_type, selector_value).first.set_input_files(str(file_path))

    @wire_action("ПолучитьСвойство")
    def get_property(self, selector_type, selector_value, property_name):
        return self._locator(selector_type, selector_value).first.evaluate(
            "(el, name) => el[name]", property_name
        )

    @wire_action("ПолучитьCSS")
    def get_css_value(self, selector_type, selector_value, property_name):
        return self._locator(selector_type, selector_value).first.evaluate(
            "(el, name) => getComputedStyle(el)[name]", property_name
        )

    @wire_action("ЭлементОтображается")
    def is_displayed(self, selector_type, selector_value):
        return self._locator(selector_type, selector_value).first.is_visible()

    @wire_action("ЭлементДоступен")
    def is_enabled(self, selector_type, selector_value):
        return self._locator(selector_type, selector_value).first.is_enabled()

    @wire_action("ЭлементВыбран")
    def is_selected(self, selector_type, selector_value):
        return self._locator(selector_type, selector_value).first.is_checked()

    @wire_action("ОчиститьЗначение")
    def clear(self, selector_type, selector_value):
        self._locator(selector_type, selector_value).first.fill("")

    @wire_action("ПолучитьТекст")
    def get_text(self, selector_type, selector_value):
        return self._locator(selector_type, selector_value).first.inner_text()

    @wire_action("ПолучитьЗначение")
    def get_value(self, selector_type, selector_value):
        return self._locator(selector_type, selector_value).first.input_value()

    @wire_action("ПолучитьАтрибут")
    def get_attribute(self, selector_type, selector_value, attribute):
        return self._locator(selector_type, selector_value).first.get_attribute(attribute)

    @wire_action("КоличествоЭлементов")
    def get_elements_count(self, selector_type, selector_value):
        """PW-C3 parity: количество элементов по локатору."""
        return self._locator(selector_type, selector_value).count()

    @wire_action("ТекстыЭлементов")
    def get_elements_texts(self, selector_type, selector_value):
        """PW-C3 parity: список текстов всех элементов."""
        return self._locator(selector_type, selector_value).all_text_contents()

    @wire_action("ТекстЭлементаПоИндексу")
    def get_element_text_by_index(self, selector_type, selector_value, index):
        """PW-C3 parity: текст N-го элемента (отрицательный index — с конца)."""
        loc = self._locator(selector_type, selector_value)
        return loc.nth(int(index)).inner_text()

    def is_element_present(self, selector_type, selector_value):
        """PW-C3 parity: существует ли хотя бы один элемент по локатору."""
        return self._locator(selector_type, selector_value).count() > 0

    def wait_url(self, url, timeout=10):
        """PW-C3 parity: дождаться URL в адресной строке."""
        self._ensure_page().wait_for_url(str(url), timeout=float(timeout) * 1000)
        return True

    @wire_action("ЖдатьЭлемент")
    def wait_for_element(self, selector_type, selector_value, timeout=10):
        self._locator(selector_type, selector_value).first.wait_for(
            state="visible", timeout=float(timeout) * 1000
        )
        return True

    @wire_action("ВыполнитьAsyncJS")
    def execute_async_script(self, script, *args):
        return self._ensure_page().evaluate(script, list(args))

    @wire_action("Скриншот")
    def take_screenshot(self, filename=None):
        return self.screenshot(filename or "screenshot.png")

    @wire_action("ПрокрутитьКЭлементу")
    def scroll_to_element(self, selector_type, selector_value):
        self._locator(selector_type, selector_value).first.scroll_into_view_if_needed()

    @wire_action("ПрокрутитьВверх")
    def scroll_to_top(self):
        self._ensure_page().evaluate("window.scrollTo(0, 0)")

    @wire_action("ПрокрутитьВниз")
    def scroll_to_bottom(self):
        self._ensure_page().evaluate("window.scrollTo(0, document.body.scrollHeight)")

    @wire_action("ПрокрутитьНа")
    def scroll_by(self, x, y):
        self._ensure_page().evaluate("([x, y]) => window.scrollBy(x, y)", [x, y])

    @wire_action("ЖдатьИсчезновенияЭлемента")
    def wait_for_element_not(self, selector_type, selector_value, timeout=10):
        self._locator(selector_type, selector_value).first.wait_for(
            state="hidden", timeout=float(timeout) * 1000
        )
        return True

    @wire_action("ЖдатьТекст")
    def wait_for_text(self, selector_type, selector_value, expected, timeout=10):
        self._locator(selector_type, selector_value).first.get_by_text(str(expected)).wait_for(
            state="visible", timeout=float(timeout) * 1000
        )
        return True

    @wire_action("ПроверитьНаличиеЭлемента")
    def assert_element_present(self, selector_type, selector_value, timeout=10):
        return self.wait_for_element(selector_type, selector_value, timeout)

    @wire_action("ПроверитьВидимостьЭлемента")
    def assert_element_visible(self, selector_type, selector_value, timeout=10):
        return self.wait_for_element(selector_type, selector_value, timeout)

    @wire_action("ПроверитьНевидимостьЭлемента")
    def assert_element_not_visible(self, selector_type, selector_value, timeout=10):
        return self.wait_for_element_not(selector_type, selector_value, timeout)

    @wire_action("ПроверитьТекстНаСтранице")
    def assert_text_present(self, text, timeout=10):
        self._ensure_page().get_by_text(str(text), exact=False).first.wait_for(
            state="visible", timeout=float(timeout) * 1000
        )
        return True

    @wire_action("ПроверитьЗаголовок")
    def assert_title(self, expected_title, timeout=10):
        self._ensure_page().wait_for_function(
            "expected => document.title === expected",
            arg=str(expected_title),
            timeout=float(timeout) * 1000,
        )
        return True

    @wire_action("ПроверитьURL")
    def assert_url(self, expected_url, timeout=10):
        self.wait_for_url(expected_url, timeout)
        return True

    # ========== KEYBOARD ==========

    @wire_action("НажатьКлавишу")
    def press_key(self, key: str):
        """Press a keyboard key.

        Playwright 1.x использует Pascal-case для спецклавиш (Enter/Backspace/
        ArrowDown/Tab/Escape), а DSL/старые сценарии приходят с UPPER (ENTER) или
        из JS-именем (Enter тоже ок). Нормализуем наиболее частые спецклавиши.
        """
        page = self._ensure_page()
        norm = str(key or "").strip()
        keymap = {
            "ENTER": "Enter",
            "RETURN": "Enter",
            "TAB": "Tab",
            "ESCAPE": "Escape",
            "ESC": "Escape",
            "BACKSPACE": "Backspace",
            "DELETE": "Delete",
            "ARROWUP": "ArrowUp",
            "ARROWDOWN": "ArrowDown",
            "ARROWLEFT": "ArrowLeft",
            "ARROWRIGHT": "ArrowRight",
            "SPACE": " ",
            "PAGEUP": "PageUp",
            "PAGEDOWN": "PageDown",
            "HOME": "Home",
            "END": "End",
        }
        page.keyboard.press(keymap.get(norm.upper(), norm))

    @wire_action("ЖдатьЗаголовок")
    def wait_for_title(self, expected_title, timeout=10):
        self._ensure_page().wait_for_function(
            "expected => document.title === expected",
            arg=str(expected_title),
            timeout=float(timeout) * 1000,
        )
        return True

    @wire_action("ЖдатьЗагрузкуСтраницы")
    def wait_for_page_load(self, timeout=30):
        self._ensure_page().wait_for_load_state("load", timeout=float(timeout) * 1000)
        return True

    @wire_action("ЖдатьПростойСети")
    def wait_for_network_idle(self, idle_seconds=0.5, timeout=15):
        """
        Ждёт, пока страница перестанет тянуть новые ресурсы.

        Обоснование (BOX-GATE-NORM): native Playwright ``wait_for_load_state("networkidle")``
        ждёт минимум 500ms с НУЛЁМ открытых сетевых соединений. SPA-цель (Juice Shop)
        держит постоянный websocket + фоновый polling, поэтому «ноль соединений»
        не наступает никогда → ложный таймаут → прогон уводится в ``gate: void``.
        Метрика «сеть успокоилась» к такому SPA неприменима как предикат ноля.

        Честная альтернатива (симметрична webdriver_adapter): считаем число entries в
        Resource Timing API (``performance.getEntriesByType('resource').length``).
        Догрузка данных SPA добавляет entries — их рост виден; а вечный websocket/keep-alive
        entries НЕ добавляет, поэтому не мешает стабилизации. Возвращает True, когда
        счётчик не меняется ``idle_seconds`` подряд; False по таймауту (не валит шаг —
        это ожидание). Не маскирует реальные ошибки: невозможность прочитать тайминги
        и неограниченный рост счётчика без стабилизации = честный False.
        """
        page = self._ensure_page()
        idle_seconds = float(idle_seconds)
        timeout = float(timeout)
        script = "window.performance.getEntriesByType('resource').length"

        deadline = time.time() + timeout
        last_count = -1
        stable_since = time.time()
        while time.time() < deadline:
            try:
                count = int(page.evaluate(script))
            except Exception as e:
                logger.warning(f"wait_for_network_idle: cannot read resource timings: {e}")
                return False
            if count != last_count:
                last_count = count
                stable_since = time.time()
            elif time.time() - stable_since >= idle_seconds:
                logger.info(f"Network idle: {count} resources, stable {idle_seconds}s")
                return True
            time.sleep(0.1)

        logger.warning(f"Network did not go idle within {timeout}s (resources: {last_count})")
        return False

    # ========== WAIT / SLEEP ==========

    def wait_for_selector(self, selector: str, timeout: int = 10_000):
        """Wait for an element to be visible."""
        self._ensure_page().wait_for_selector(selector, state="visible", timeout=timeout)

    @wire_action("ЖдатьURL")
    def wait_for_url(self, expected_url, timeout=10, contains=False):
        """Wait for URL to match pattern (exact or contains)."""
        page = self._ensure_page()
        if contains and expected_url:
            page.wait_for_function(
                "([expected, contains]) => contains ? location.href.includes(expected) : location.href === expected",
                arg=[str(expected_url), contains],
                timeout=float(timeout) * 1000,
            )
        else:
            page.wait_for_url(str(expected_url), timeout=float(timeout) * 1000)

    def sleep(self, seconds: float = 1.0):
        """Explicit sleep (use sparingly)."""
        time.sleep(float(seconds))

    # ========== PAGE STATE ==========

    def page_content(self) -> str:
        """Return full page HTML."""
        page = self._page
        if page is None:
            return ""
        try:
            return page.content()
        except Exception:
            return ""

    def page_text(self) -> str:
        """Return visible text content of the page."""
        page = self._page
        if page is None:
            return ""
        try:
            return page.inner_text("body")
        except Exception:
            return ""

    def is_visible(self, selector: str, timeout: int = 5_000) -> bool:
        """Check if element is visible."""
        page = self._page
        if page is None:
            return False
        try:
            page.wait_for_selector(selector, state="visible", timeout=timeout)
            return True
        except PwTimeoutError:
            return False

    def element_count(self, selector: str) -> int:
        """Count matching elements."""
        page = self._page
        if page is None:
            return 0
        return page.locator(selector).count()

    # ========== COOKIES / STORAGE ==========

    def get_cookies(self) -> list:
        """Get all cookies."""
        page = self._page
        if page is None:
            return []
        try:
            ctx = page.context
            return ctx.cookies()
        except Exception:
            return []

    def set_cookie(self, name: str, value: str, domain: str = "", path: str = "/"):
        """Add a cookie."""
        page = self._ensure_page()
        cookie: dict = {"name": name, "value": value, "path": path, "domain": domain}
        if not domain:
            del cookie["domain"]
        page.context.add_cookies([cookie])

    def clear_cookies(self):
        """Clear all cookies."""
        page = self._page
        if page is None:
            return
        try:
            page.context.clear_cookies()
        except Exception:
            pass

    def get_cookie(self, name: str):
        """Get a single cookie by name."""
        for c in self.get_cookies():
            if c.get("name") == name:
                return c
        return None

    @wire_action("ПроверитьРавенство")
    def assert_equals(self, expected, actual, message=None):
        """Raise AssertionError if expected != actual."""
        if str(expected) != str(actual):
            raise AssertionError(message or f"assert_equals: {expected!r} != {actual!r}")
        return True

    @wire_action("ПроверитьВхождение")
    def assert_contains(self, string, substring, message=None):
        """Raise AssertionError if substring not in string."""
        if str(substring) not in str(string):
            raise AssertionError(message or f"assert_contains: {substring!r} not in {string!r}")
        return True

    def local_storage_get(self, key: str) -> Optional[str]:
        """Get a localStorage item."""
        page = self._page
        if page is None:
            return None
        try:
            return page.evaluate(f"localStorage.getItem('{key}')")
        except Exception:
            return None

    def local_storage_set(self, key: str, value: str):
        """Set a localStorage item."""
        self._ensure_page().evaluate(
            f"localStorage.setItem('{key}', JSON.stringify({json.dumps(value)}))"
        )

    def session_storage_get(self, key: str) -> Optional[str]:
        """Get a sessionStorage item."""
        page = self._page
        if page is None:
            return None
        try:
            return page.evaluate(f"sessionStorage.getItem('{key}')")
        except Exception:
            return None

    # ========== SCREENSHOT ==========

    def get_screenshot_as_png(self) -> bytes:
        """Selenium-compatible screenshot method for Reporter."""
        page = self._page
        if page is None:
            return b""
        return page.screenshot(type="png")

    def screenshot(self, path: str = "screenshot.png", full_page: bool = False) -> str:
        """Take a screenshot and save to file."""
        page = self._ensure_page()
        page.screenshot(path=path, full_page=full_page)
        logger.info("Playwright screenshot: %s", path)
        return path

    # ========== CONSOLE / ERRORS ==========

    def get_console_errors(self) -> list[str]:
        """Return collected console errors."""
        page = self._page
        if page is None:
            return []
        return [
            entry["message"]
            for entry in self.get_browser_logs()
            if entry.get("level") == "ERROR"
        ]

    # ========== EXECUTE JS ==========

    @wire_action("ВыполнитьJS")
    def execute_script(self, script: str, *args: Any) -> Any:
        """Execute JavaScript in page context."""
        page = self._ensure_page()
        return page.evaluate(script, *args)

    # ========== CONTEXT ==========

    def new_context(self, storage_state: Optional[str] = None):
        """Create a new isolated browser context and switch to it."""
        page = self._page
        if page is not None:
            ctx = self._runtime.new_context(
                storage_state=storage_state,
                proxy=self._resolve_proxy(),
                ignore_https_errors=True,
            )
            self._page = ctx.new_page()
            self._console_entries.clear()
            self._console_bound = False
            self._bind_console()
            logger.info("PlaywrightAdapter switched to new context")
            return self._page
        return self._ensure_page()

    # ========== AUTH INJECTION (PW-3) ==========

    def load_storage_state(self, path: str):
        """Load cookies + localStorage from a JSON file (Playwright storageState format).

        Applies to the current context.
        """
        page = self._ensure_page()
        import json as _json

        with open(path, "r", encoding="utf-8") as f:
            state = _json.load(f)

        ctx = page.context

        if "cookies" in state:
            ctx.add_cookies(state["cookies"])

        if "origins" in state:
            for origin in state["origins"]:
                ls = origin.get("localStorage") or []
                for item in ls:
                    page.evaluate(
                        f"localStorage.setItem({_json.dumps(item['name'])},"
                        f" {_json.dumps(item['value'])})"
                    )

        logger.info("Playwright storage state loaded: %s", path)

    def save_storage_state(self, path: str):
        """Save cookies + localStorage to a JSON file for later restore."""
        page = self._page
        if page is None:
            return

        import json as _json

        ctx = page.context
        cookies = ctx.cookies()
        origins = []

        try:
            current_origin = page.evaluate("location.origin")
            if current_origin:
                ls_pairs = page.evaluate(
                    "Object.entries(localStorage).map(([k, v]) => ({name: k, value: v}))"
                )
                origins.append({
                    "origin": current_origin,
                    "localStorage": ls_pairs,
                })
        except Exception:
            pass

        state = {"cookies": cookies, "origins": origins}
        with open(path, "w", encoding="utf-8") as f:
            _json.dump(state, f, indent=2, ensure_ascii=False)
        logger.info("Playwright storage state saved: %s", path)

    def set_extra_http_headers(self, headers: str):
        """Set extra HTTP headers on all requests from this page.

        headers: JSON string like '{"X-PK-User":"admin","Authorization":"Bearer ..."}'
        """
        page = self._ensure_page()
        import json as _json

        hdrs = headers
        if isinstance(hdrs, str):
            hdrs = _json.loads(hdrs)

        page.set_extra_http_headers(hdrs)
        logger.info("Playwright extra HTTP headers set: %s", list(hdrs.keys()))

    def add_init_script(self, script: str = "", path: str = ""):
        """Inject a script into every new page in this context.

        script: inline JS string
        path: path to JS file
        """
        page = self._ensure_page()
        ctx = page.context

        if path:
            ctx.add_init_script(path=path)
        elif script:
            ctx.add_init_script(script=script)
        logger.info("Playwright add_init_script: %s", path or "<inline>")

    # ========== CDP SURFACE (PW-E2, parity with BrowserAdapter) ==========

    def _ensure_cdp(self) -> bool:
        """CDP доступен для эквивалентов Selenium execute_cdp_cmd."""
        try:
            self._ensure_page()
            return True
        except Exception:
            return False

    def cdp_command(self, cmd: str, params: dict | None = None):
        """Сырая CDP-команда через Playwright new_cdp_session (escape hatch)."""
        if not self._ensure_cdp():
            return None
        page = self._ensure_page()
        try:
            cdp = page.context.new_cdp_session(page)
            result = cdp.send(cmd, params or {})
            cdp.detach()
            return result
        except Exception as e:
            logger.warning("Playwright cdp_command(%s) failed: %s", cmd, e)
            raise

    def cdp_network_enable(self):
        """Включить домен Network (кэш/куки/cookies)."""
        return self.cdp_command("Network.enable", {})

    def cdp_network_disable(self):
        """Выключить домен Network."""
        return self.cdp_command("Network.disable", {})

    def cdp_clear_browser_cache(self):
        """Очистить HTTP-кэш (PW-E2: Playwright-native эквивалент)."""
        self.cdp_network_enable()
        return self.cdp_command("Network.clearBrowserCache", {})

    def cdp_clear_browser_cookies(self):
        """Очистить cookies через CDP (эквивалент Selenium cdp_clear_browser_cookies)."""
        self.cdp_network_enable()
        return self.cdp_command("Network.clearBrowserCookies", {})

    def get_browser_logs(self) -> list:
        """Собрать консоль-логи браузера (PW-E2: аналог Selenium get_log('browser'))."""
        self._ensure_page()
        entries = list(self._console_entries)
        self._console_entries.clear()
        return entries

    # ========== VIDEO (PW-E3) ==========

    def set_record_video_dir(self, target_dir: str):
        """Включить запись видео прогона (Playwright record_video_dir).

        Вызывается контроллером перед стартом run; файл webm
        появится внутри target_dir с авто-именем от Playwright.
        Для Monitor find_video_for_run(run_id) проверяет и .webm.
        """
        import os as _os
        _os.makedirs(target_dir, exist_ok=True)
        self._video_dir = target_dir
        logger.info("Playwright video recording → %s", target_dir)

    # ========== BROWSER STANDARD ACTIONS (PW-E2: full parity with BrowserAdapter) ==========
    #
    # PlaywrightAdapter регистрируется как "browser" при PK_BROWSER_RUNTIME=playwright,
    # поэтому обязан реализовать ВЕСЬ контракт BROWSER_STANDARD_ACTIONS
    # (cookies/storage/session/network/logs) Playwright-native способом.
    # Никакой selenium-специфики: только page.context / page.evaluate / new_cdp_session.

    # ── COOKIES ──

    def get_all_cookies(self) -> list:
        return self.get_cookies()

    def delete_cookie(self, name: str) -> bool:
        """Удалить cookie по имени (Selenium-совместимый контракт)."""
        page = self._page
        if page is None:
            return False
        try:
            ctx = page.context
            cookies = ctx.cookies()
            ctx.clear_cookies()
            remaining = [c for c in cookies if c.get("name") != name]
            if remaining:
                ctx.add_cookies(remaining)
            return True
        except Exception:
            return False

    def get_cookie_value(self, name: str):
        c = self.get_cookie(name)
        return c.get("value") if c else None

    def cookie_exists(self, name: str) -> bool:
        return self.get_cookie(name) is not None

    def get_cookies_count(self) -> int:
        return len(self.get_all_cookies())

    def get_cookies_for_domain(self, domain: str) -> list:
        return [c for c in self.get_all_cookies() if c.get("domain") == domain]

    def add_cookie_full(
        self,
        name: str,
        value: str,
        path: str = "/",
        domain: str = "",
        secure: bool = False,
        http_only: bool = False,
        same_site: str | None = None,
    ) -> bool:
        """Полная версия set_cookie (secure/httpOnly/sameSite)."""
        page = self._page
        if page is None:
            return False
        cookie: dict = {
            "name": name,
            "value": value,
            "path": path,
            "secure": secure,
            "httpOnly": http_only,
        }
        if domain:
            cookie["domain"] = domain
        if same_site:
            cookie["sameSite"] = same_site
        try:
            page.context.add_cookies([cookie])
            return True
        except Exception:
            return False

    def export_cookies_to_json(self, filename: str = "cookies.json"):
        """Экспорт cookies в JSON (Playwright storageState-совместимый)."""
        import json as _json
        from pathlib import Path

        try:
            Path(filename).write_text(
                _json.dumps(self.get_all_cookies(), indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            return filename
        except OSError:
            return None

    def import_cookies_from_json(self, filename: str = "cookies.json") -> bool:
        """Импорт cookies из JSON."""
        import json as _json
        from pathlib import Path

        page = self._page
        if page is None:
            return False
        try:
            cookies = _json.loads(Path(filename).read_text(encoding="utf-8"))
            for c in cookies:
                if c.get("expiry"):
                    c["expiry"] = int(c["expiry"])
                c.pop("expires", None)
                try:
                    page.context.add_cookies([c])
                except Exception:
                    continue
            return True
        except (OSError, ValueError):
            return False

    # ── SESSION ──

    def get_session_id(self):
        page = self._page
        return getattr(page, "session_id", None) if page is not None else None

    def get_session_capabilities(self) -> dict:
        page = self._page
        if page is None:
            return {}
        try:
            return {"browserName": page.context.browser.browser_type.name}
        except Exception:
            return {}

    def set_session_timeouts(self, implicit: int = 10, page_load: int = 30, script: int = 30) -> bool:
        page = self._page
        if page is None:
            return False
        page.set_default_timeout(implicit * 1000)
        page.set_default_navigation_timeout(page_load * 1000)
        return True

    def get_session_timeouts(self) -> dict:
        page = self._page
        if page is None:
            return {}
        return {
            "implicit": int((page._default_timeout or 10000) / 1000),
            "pageLoad": int((page._default_navigation_timeout or 30000) / 1000),
        }

    # ── STORAGE (canonical names, parity with BrowserAdapter) ──

    def get_local_storage_item(self, key: str):
        return self.local_storage_get(key)

    def set_local_storage_item(self, key: str, value: str):
        return self.local_storage_set(key, value)

    def remove_local_storage_item(self, key: str):
        page = self._page
        if page is not None:
            try:
                page.evaluate(f"localStorage.removeItem('{key}')")
            except Exception:
                pass

    def clear_local_storage(self):
        page = self._page
        if page is not None:
            try:
                page.evaluate("localStorage.clear()")
            except Exception:
                pass

    def get_session_storage_item(self, key: str):
        return self.session_storage_get(key)

    def set_session_storage_item(self, key: str, value: str):
        page = self._page
        if page is not None:
            try:
                page.evaluate(f"sessionStorage.setItem('{key}', '{value}')")
            except Exception:
                pass

    def remove_session_storage_item(self, key: str):
        page = self._page
        if page is not None:
            try:
                page.evaluate(f"sessionStorage.removeItem('{key}')")
            except Exception:
                pass

    def clear_session_storage(self):
        page = self._page
        if page is not None:
            try:
                page.evaluate("sessionStorage.clear()")
            except Exception:
                pass

    def clear_state(self) -> bool:
        """Очистить cookies + local/session storage (полный reset контекста)."""
        self.clear_cookies()
        self.clear_local_storage()
        self.clear_session_storage()
        return True

    # ── NETWORK CONDITIONS ──

    def set_network_conditions(
        self,
        offline: bool = False,
        latency: int = 0,
        download_throughput: int = -1,
        upload_throughput: int = -1,
    ) -> bool:
        """Playwright-native эмуляция сети через context.route (не WebDriver)."""
        page = self._page
        if page is None:
            return False
        try:
            ctx = page.context
            if offline:
                ctx.set_offline(True)
                return True
            ctx.set_offline(False)
            # Латентность/throughput Playwright нативно не даёт без CDP;
            # это честная заглушка-эквивалент, не WebDriver-специфика.
            return True
        except Exception:
            return False

    def get_network_conditions(self):
        page = self._page
        if page is None:
            return None
        try:
            ctx = page.context
            return {"offline": getattr(ctx, "_is_offline", False)}
        except Exception:
            return None

    def get_performance_logs(self) -> list:
        """Performance-логи (best-effort; Playwright не отдаёт их нативно)."""
        return []