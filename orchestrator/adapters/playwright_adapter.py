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


class PlaywrightAdapter(BaseAdapter):
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

    # Canonical wire names retained while the implementation is Playwright-native.
    back = go_back
    forward = go_forward
    refresh = reload

    def close(self):
        page = self._page
        if page is not None:
            page.close()
            self._page = None
            self._console_bound = False

    def close_current_window(self):
        self.close()

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

    def click(self, selector_type: str, selector_value: str = "", timeout: int = 10_000):
        """Canonical webdriver|click with selector type and value."""
        page = self._ensure_page()
        self._locator(selector_type, selector_value).first.click(timeout=timeout)

    def click_js(self, selector_type, selector_value, timeout=10_000):
        self._locator(selector_type, selector_value).first.evaluate("el => el.click()")

    def hover(self, selector_type, selector_value, timeout=10_000):
        self._locator(selector_type, selector_value).first.hover(timeout=timeout)

    def double_click(self, selector_type, selector_value, timeout=10_000):
        self._locator(selector_type, selector_value).first.dblclick(timeout=timeout)

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

    def send_keys(self, selector_type, selector_value, text, clear_first=True, timeout=10_000):
        locator = self._locator(selector_type, selector_value).first
        if str(clear_first).strip().lower() not in {"0", "false", "no"}:
            locator.fill(str(text), timeout=timeout)
        else:
            locator.press_sequentially(str(text), timeout=timeout)

    def append_text(self, selector_type, selector_value, text, timeout=10_000):
        self.send_keys(selector_type, selector_value, text, clear_first=False, timeout=timeout)

    def set_value(self, selector_type, selector_value, text):
        self._locator(selector_type, selector_value).first.fill(str(text))

    def select_by_value(self, selector_type, selector_value, value):
        self._locator(selector_type, selector_value).first.select_option(value=str(value))

    def select_by_text(self, selector_type, selector_value, text):
        self._locator(selector_type, selector_value).first.select_option(label=str(text))

    def upload_file(self, selector_type, selector_value, file_path):
        self._locator(selector_type, selector_value).first.set_input_files(str(file_path))

    def get_property(self, selector_type, selector_value, property_name):
        return self._locator(selector_type, selector_value).first.evaluate(
            "(el, name) => el[name]", property_name
        )

    def get_css_value(self, selector_type, selector_value, property_name):
        return self._locator(selector_type, selector_value).first.evaluate(
            "(el, name) => getComputedStyle(el)[name]", property_name
        )

    def is_displayed(self, selector_type, selector_value):
        return self._locator(selector_type, selector_value).first.is_visible()

    def is_enabled(self, selector_type, selector_value):
        return self._locator(selector_type, selector_value).first.is_enabled()

    def is_selected(self, selector_type, selector_value):
        return self._locator(selector_type, selector_value).first.is_checked()

    def clear(self, selector_type, selector_value):
        self._locator(selector_type, selector_value).first.fill("")

    def get_text(self, selector_type, selector_value):
        return self._locator(selector_type, selector_value).first.inner_text()

    def get_value(self, selector_type, selector_value):
        return self._locator(selector_type, selector_value).first.input_value()

    def get_attribute(self, selector_type, selector_value, attribute):
        return self._locator(selector_type, selector_value).first.get_attribute(attribute)

    def wait_for_element(self, selector_type, selector_value, timeout=10):
        self._locator(selector_type, selector_value).first.wait_for(
            state="visible", timeout=float(timeout) * 1000
        )
        return True

    def execute_async_script(self, script, *args):
        return self._ensure_page().evaluate(script, list(args))

    def take_screenshot(self, filename=None):
        return self.screenshot(filename or "screenshot.png")

    def scroll_to_element(self, selector_type, selector_value):
        self._locator(selector_type, selector_value).first.scroll_into_view_if_needed()

    def scroll_to_top(self):
        self._ensure_page().evaluate("window.scrollTo(0, 0)")

    def scroll_to_bottom(self):
        self._ensure_page().evaluate("window.scrollTo(0, document.body.scrollHeight)")

    def scroll_by(self, x, y):
        self._ensure_page().evaluate("([x, y]) => window.scrollBy(x, y)", [x, y])

    def wait_for_element_not(self, selector_type, selector_value, timeout=10):
        self._locator(selector_type, selector_value).first.wait_for(
            state="hidden", timeout=float(timeout) * 1000
        )
        return True

    def wait_for_text(self, selector_type, selector_value, expected, timeout=10):
        self._locator(selector_type, selector_value).first.get_by_text(str(expected)).wait_for(
            state="visible", timeout=float(timeout) * 1000
        )
        return True

    def assert_element_present(self, selector_type, selector_value, timeout=10):
        return self.wait_for_element(selector_type, selector_value, timeout)

    def assert_element_visible(self, selector_type, selector_value, timeout=10):
        return self.wait_for_element(selector_type, selector_value, timeout)

    def assert_element_not_visible(self, selector_type, selector_value, timeout=10):
        return self.wait_for_element_not(selector_type, selector_value, timeout)

    def assert_text_present(self, text, timeout=10):
        self._ensure_page().get_by_text(str(text), exact=False).first.wait_for(
            state="visible", timeout=float(timeout) * 1000
        )
        return True

    def assert_title(self, expected_title, timeout=10):
        self._ensure_page().wait_for_function(
            "expected => document.title === expected", str(expected_title),
            timeout=float(timeout) * 1000,
        )
        return True

    def assert_url(self, expected_url, timeout=10):
        self.wait_for_url(expected_url, timeout)
        return True

    # ========== KEYBOARD ==========

    def press_key(self, key: str):
        """Press a keyboard key."""
        self._ensure_page().keyboard.press(key)

    def wait_for_title(self, expected_title, timeout=10):
        self._ensure_page().wait_for_function(
            "expected => document.title === expected", str(expected_title),
            timeout=float(timeout) * 1000,
        )
        return True

    def wait_for_page_load(self, timeout=30):
        self._ensure_page().wait_for_load_state("load", timeout=float(timeout) * 1000)
        return True

    def wait_for_network_idle(self, idle_seconds=0.5, timeout=15):
        self._ensure_page().wait_for_load_state("networkidle", timeout=float(timeout) * 1000)
        return True

    # ========== WAIT / SLEEP ==========

    def wait_for_selector(self, selector: str, timeout: int = 10_000):
        """Wait for an element to be visible."""
        self._ensure_page().wait_for_selector(selector, state="visible", timeout=timeout)

    def wait_for_url(self, expected_url, timeout=10, contains=False):
        """Wait for URL to match pattern (exact or contains)."""
        page = self._ensure_page()
        if contains and expected_url:
            page.wait_for_function(
                "([expected, contains]) => contains ? location.href.includes(expected) : location.href === expected",
                [str(expected_url), contains],
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

    def assert_equals(self, expected, actual, message=None):
        """Raise AssertionError if expected != actual."""
        if str(expected) != str(actual):
            raise AssertionError(message or f"assert_equals: {expected!r} != {actual!r}")
        return True

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