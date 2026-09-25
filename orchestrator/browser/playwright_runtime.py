# -*- coding: utf-8 -*-
"""Playwright Browser Runtime — low-level browser lifecycle.

PW-1: launch, connectOverCDP, new_context, proxy, ignore_https_errors.
"""
from __future__ import annotations

import logging
from typing import Optional

from playwright.sync_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    sync_playwright,
)

logger = logging.getLogger("orchestrator")


class PlaywrightBrowserRuntime:
    """Manages a Playwright browser instance lifecycle."""

    def __init__(self):
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._launched = False

    @property
    def page(self) -> Optional[Page]:
        return self._page

    @property
    def browser(self) -> Optional[Browser]:
        return self._browser

    @property
    def context(self) -> Optional[BrowserContext]:
        return self._context

    def launch(
        self,
        browser_type: str = "chromium",
        headless: bool = True,
        proxy: Optional[dict] = None,
        proxy_bypass: Optional[str] = None,
        ignore_https_errors: bool = True,
        viewport_width: int = 1920,
        viewport_height: int = 1080,
        locale: str = "ru-RU",
        record_video_dir: Optional[str] = None,
    ) -> Page:
        """Launch a new browser and create a fresh context + page.

        Returns the active Page.
        """
        if self._launched:
            return self._page

        try:
            self._playwright = sync_playwright().start()

            # PW-C1: wired browser_type приходит в Selenium-именах ("chrome"/"firefox"),
            # Playwright ждёт "chromium"/"firefox"/"webkit". Одна точка маппинга —
            # чтобы боевой wired не требовал переписывания при cutover.
            _SELENIUM_TO_PW = {"chrome": "chromium", "firefox": "firefox", "webkit": "webkit"}
            browser_type = _SELENIUM_TO_PW.get(browser_type, browser_type)

            browser_launcher = getattr(self._playwright, browser_type, None)
            if browser_launcher is None:
                supported = ["chromium", "firefox", "webkit"]
                raise ValueError(
                    f"Unsupported browser_type={browser_type!r}. "
                    f"Supported: {supported}"
                )

            self._browser = browser_launcher.launch(
                headless=headless,
            )
            logger.info(
                "Playwright browser launched: %s (headless=%s)",
                browser_type,
                headless,
            )

            ctx_kwargs: dict = {
                "viewport": {"width": viewport_width, "height": viewport_height},
                "locale": locale,
            }

            if ignore_https_errors:
                ctx_kwargs["ignore_https_errors"] = True

            if proxy:
                ctx_kwargs["proxy"] = proxy
                if proxy_bypass:
                    ctx_kwargs["proxy"]["bypass"] = proxy_bypass
                logger.info("Playwright context proxy: %s", proxy.get("server", "?"))

            # PW-E3: видео прогона через record_video_dir
            if record_video_dir:
                import os as _os
                _os.makedirs(record_video_dir, exist_ok=True)
                ctx_kwargs["record_video_dir"] = record_video_dir
                ctx_kwargs["record_video_size"] = {"width": viewport_width, "height": viewport_height}
                logger.info("Playwright video recording → %s", record_video_dir)

            self._context = self._browser.new_context(**ctx_kwargs)
            self._page = self._context.new_page()
            self._launched = True
        except Exception:
            # PW-RUNTIME-LAUNCH-LEAK: sync_playwright().start() поднимает
            # greenlet-loop в ТЕКУЩЕМ потоке; падение launch/new_context без
            # закрытия runtime оставляет loop «выполняющимся» (в процессе не
            # стартует ни один asyncio.Runner) и течёт Playwright-драйвером.
            # Гасим и пробрасываем — симметрично connect_over_cdp.
            self.close()
            raise

        logger.info(
            "Playwright context + page ready (viewport %sx%s)",
            viewport_width,
            viewport_height,
        )
        return self._page

    def connect_over_cdp(
        self,
        endpoint: str,
        viewport_width: int = 1920,
        viewport_height: int = 1080,
    ) -> Page:
        """Attach to an existing Chrome via CDP endpoint.

        endpoint: e.g. "http://127.0.0.1:9222"
        """
        if self._launched:
            return self._page

        try:
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.connect_over_cdp(endpoint)
        except Exception:
            # BE-TEST-LOOP-ISOLATION: sync_playwright().start() поднимает
            # greenlet-loop в ТЕКУЩЕМ потоке; если connect падает и runtime не
            # закрыть, loop остаётся «выполняющимся» в thread-local — после
            # этого в процессе не стартует ни один asyncio.Runner (все async-
            # тесты падают с «cannot be called from a running event loop»),
            # а Playwright-драйвер течёт. Гасим и пробрасываем.
            self.close()
            raise
        logger.info("Playwright connected over CDP: %s", endpoint)

        contexts = self._browser.contexts
        if contexts:
            self._context = contexts[0]
            pages = self._context.pages
            if pages:
                self._page = pages[0]
                if viewport_width and viewport_height:
                    try:
                        self._page.set_viewport_size({
                            "width": viewport_width,
                            "height": viewport_height,
                        })
                    except Exception as e:
                        logger.debug("CDP set_viewport_size skipped: %s", e)
            else:
                self._page = self._context.new_page()
        else:
            self._context = self._browser.new_context(
                viewport={"width": viewport_width, "height": viewport_height},
            )
            self._page = self._context.new_page()

        self._launched = True
        logger.info(
            "Playwright CDP page ready: %s",
            self._page.url if self._page else "—",
        )
        return self._page

    def new_context(
        self,
        storage_state: Optional[str] = None,
        proxy: Optional[dict] = None,
        ignore_https_errors: bool = True,
    ) -> BrowserContext:
        """Create an additional isolated context (multi-role / fuzz isolation)."""
        if not self._browser:
            raise RuntimeError("Browser not launched; call launch() or connect_over_cdp() first")

        ctx_kwargs: dict = {}
        if ignore_https_errors:
            ctx_kwargs["ignore_https_errors"] = True
        if proxy:
            ctx_kwargs["proxy"] = proxy
        if storage_state:
            ctx_kwargs["storage_state"] = storage_state

        ctx = self._browser.new_context(**ctx_kwargs)
        logger.info("Playwright new_context created (storage=%s)", bool(storage_state))
        return ctx

    def close(self) -> None:
        """Graceful shutdown: close context → browser → playwright."""
        try:
            if self._context:
                self._context.close()
                self._context = None
        except Exception as e:
            logger.debug("Playwright context close: %s", e)

        try:
            if self._browser:
                self._browser.close()
                self._browser = None
        except Exception as e:
            logger.debug("Playwright browser close: %s", e)

        try:
            if self._playwright:
                self._playwright.stop()
                self._playwright = None
        except Exception as e:
            logger.debug("Playwright stop: %s", e)

        self._page = None
        self._launched = False
        logger.info("Playwright runtime closed")