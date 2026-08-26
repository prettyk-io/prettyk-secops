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

    @property
    def driver(self):
        return self._page

    @driver.setter
    def driver(self, value):
        self._page = value

    def _resolve_proxy(self) -> Optional[dict]:
        if not self._proxy_str:
            return None
        raw = self._proxy_str.strip()
        return {"server": f"http://{raw}"}

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
            )
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

    # ========== NAVIGATION ==========

    def open_url(self, url: str):
        """Navigate to URL."""
        page = self._ensure_page()
        page.goto(url, wait_until="domcontentloaded")
        logger.info("Playwright open_url: %s → %s", url, page.url)

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

    def click(self, selector: str, timeout: int = 10_000):
        """Click an element by CSS selector."""
        page = self._ensure_page()
        page.click(selector, timeout=timeout)

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

    # ========== KEYBOARD ==========

    def press_key(self, key: str):
        """Press a keyboard key."""
        self._ensure_page().keyboard.press(key)

    # ========== WAIT / SLEEP ==========

    def wait_for_selector(self, selector: str, timeout: int = 10_000):
        """Wait for an element to be visible."""
        self._ensure_page().wait_for_selector(selector, state="visible", timeout=timeout)

    def wait_for_url(self, pattern: str, timeout: int = 15_000):
        """Wait for URL to match pattern (glob or regex)."""
        self._ensure_page().wait_for_url(pattern, timeout=timeout)

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
        errors: list[str] = []
        try:
            page.on("console", lambda msg: (
                errors.append(msg.text) if msg.type == "error" else None
            ))
        except Exception:
            pass
        return errors

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