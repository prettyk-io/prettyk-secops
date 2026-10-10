# -*- coding: utf-8 -*-
from utils.env_dual import pk_env
"""
Адаптер браузера: Selenium (сессия) + Selene (действия с элементами).

Слои:
  * Selenium WebDriver — создание драйвера (local / Grid Remote), proxy→scanner,
    alerts/frames/windows, ActionChains-дыры, Resource Timing, React set_value.
  * Selene (yashaka/selene, питоний порт Selenide) — lazy-локаторы, wait/retry,
    click/type/assert/collection. Паттерн как у банковского Java-Selenide из Nexus.

Поддерживает два режима исполнения:
  * remote — браузер в Selenium Grid (node Chrome/Firefox), драйвер подключается
             к хабу по WebDriver (поведение по умолчанию при поднятом стенде);
  * local  — драйвер и браузер на хосте раннера (airgap / без Docker);
             PK_WEBDRIVER_MODE=local.

Режим берётся из переменных окружения, а не из манифеста: JSON-схема манифеста
(docs/Wired.json) — контракт с фронтендом, и поле infrastructure.webdriver_mode
будет добавлено в неё отдельной задачей, согласованно с UI-формой. До этого момента
переменные окружения дают CI-раннеру полный контроль над режимом, не ломая контракт;
по умолчанию — remote (Grid на http://127.0.0.1:4444).

Переменные окружения:
  PK_WEBDRIVER_MODE            local | remote (по умолчанию remote)
  PK_SELENIUM_URL              адрес Grid (по умолчанию http://127.0.0.1:4444);
                                устаревший алиас: PK_SELENOID_URL
  PK_PROXY_HOST_FROM_CONTAINER чем заменить loopback в адресе прокси в remote-режиме
                                (по умолчанию host.docker.internal)
  PK_SELENIUM_VIDEO            se:recordVideo (по умолчанию вкл.; 0 — выкл.);
                                устаревший алиас: PK_SELENOID_VIDEO
  PK_ELEMENT_TIMEOUT           дедлайн ожиданий Selene (по умолчанию 10 с)

Подробности: docs/basis-services.md (Selenium Grid).
"""

import os
import re
import time
import datetime
import logging
from selenium import webdriver
from selenium.webdriver import Remote
from selenium.webdriver import ActionChains, Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    ElementClickInterceptedException,
    ElementNotInteractableException,
    TimeoutException,
)
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.file_detector import LocalFileDetector
from selene import be, have, query, command
from .base_adapter import BaseAdapter
from . import selene_bridge as sb

logger = logging.getLogger("orchestrator")

MODE_LOCAL = "local"
MODE_REMOTE = "remote"
SUPPORTED_MODES = (MODE_LOCAL, MODE_REMOTE)

DEFAULT_SELENIUM_URL = "http://127.0.0.1:4444"
DEFAULT_CONTAINER_HOST = "host.docker.internal"

# Адреса, которые внутри контейнера браузера означают сам контейнер, а не хост с scanner.
LOOPBACK_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]")


def _env_flag(name, default=False):
    base = name[3:] if name.startswith("PK_") else name
    raw = os.getenv(f"PK_{base}")
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _artifact_slug(name):
    """Имя сессии → безопасное имя файла артефакта (кириллица и пробелы отбрасываются)."""
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", name or "").strip("-.")
    return slug or "session"


class WebDriverAdapter(BaseAdapter):
    DEFAULT_TIMEOUT = 10

    # Имена клавиш из манифеста: общая карта для press_key / key_down / key_up /
    # key_combination, иначе комбинации и одиночные нажатия разъезжаются.
    KEY_MAP = {
        "ENTER": Keys.ENTER,
        "TAB": Keys.TAB,
        "ESCAPE": Keys.ESCAPE,
        "ESC": Keys.ESCAPE,
        "SPACE": Keys.SPACE,
        "BACKSPACE": Keys.BACKSPACE,
        "DELETE": Keys.DELETE,
        "RETURN": Keys.RETURN,
        "UP": Keys.ARROW_UP,
        "DOWN": Keys.ARROW_DOWN,
        "LEFT": Keys.ARROW_LEFT,
        "RIGHT": Keys.ARROW_RIGHT,
        "PAGE_UP": Keys.PAGE_UP,
        "PAGE_DOWN": Keys.PAGE_DOWN,
        "HOME": Keys.HOME,
        "END": Keys.END,
        "SHIFT": Keys.SHIFT,
        "CONTROL": Keys.CONTROL,
        "CTRL": Keys.CONTROL,
        "ALT": Keys.ALT,
        "COMMAND": Keys.COMMAND,
        "META": Keys.META,
    }

    @classmethod
    def _resolve_key(cls, key):
        """Имя клавиши → Keys.*; одиночный символ ('a') отдаётся как есть."""
        return cls.KEY_MAP.get(str(key).strip().upper(), key)

    @staticmethod
    def _as_bool(value, default=True):
        """Аргументы из манифеста приходят строками: 'false' должно быть False."""
        if isinstance(value, bool):
            return value
        if value is None or value == "":
            return default
        return str(value).strip().lower() in ("1", "true", "yes", "on", "да")

    def __init__(
        self,
        driver=None,
        browser="firefox",
        headless=True,
        proxy=None,
        session_name=None,
        base_url=None,
        allowed_extra_domains=None,
    ):
        # Общий дедлайн ожиданий для всех действий; на медленных стендах поднимается
        # переменной окружения, без правки манифестов.
        self.default_timeout = float(pk_env("ELEMENT_TIMEOUT", self.DEFAULT_TIMEOUT))
        self.mode = self._resolve_mode()
        self.session_name = session_name or "prettyk-run"
        # base_url_override из манифеста — для ОбойтиСтраницы / относительных URL.
        self.base_url = (base_url or "").strip()
        self.allowed_extra_domains = (allowed_extra_domains or "").strip()
        self.headless = bool(headless)
        if driver is None:
            driver = self._create_driver(browser, headless, proxy)
        super().__init__(driver)
        self._bind_driver(driver)

    # ========== ИНИЦИАЛИЗАЦИЯ ДРАЙВЕРА ==========

    @staticmethod
    def _resolve_mode():
        mode = (pk_env("WEBDRIVER_MODE") or MODE_REMOTE).strip().lower()
        if mode not in SUPPORTED_MODES:
            raise ValueError(
                f"PK_WEBDRIVER_MODE must be one of {SUPPORTED_MODES}, got: {mode!r}"
            )
        return mode

    def _bind_driver(self, driver):
        """Общая для обоих режимов обвязка над драйвером + shared browser Selene."""
        self.driver = driver
        self.wait = WebDriverWait(driver, self.default_timeout) if driver is not None else None
        self.actions = ActionChains(driver) if driver is not None else None
        sb.bind_driver(driver, self.default_timeout)

    def _release_driver(self):
        sb.unbind_driver()
        self.driver = None
        self.wait = None
        self.actions = None

    def _create_driver(self, browser, headless, proxy):
        resolved_proxy = self._resolve_proxy(proxy)
        options = self._build_options(browser, headless, resolved_proxy)
        if self.mode == MODE_REMOTE:
            driver = self._create_remote_driver(browser, headless, options)
        else:
            driver = self._create_local_driver(browser, options)
        self._ensure_desktop_viewport(driver)
        return driver

    def _ensure_desktop_viewport(self, driver) -> None:
        """
        Headless часто ~800px; Material hide-lt-md прячет desktop-nav (Account и т.п.)
        ниже md → ElementNotInteractable при клике. maximize в headless часто no-op
        → явный 1920×1080.
        """
        if driver is None:
            return
        try:
            driver.set_window_size(1920, 1080)
            logger.info("WebDriver viewport 1920x1080 (headless=%s)", self.headless)
        except Exception as e:
            logger.warning("set_window_size failed (continue): %s", e)

    def _create_local_driver(self, browser, options):
        name = browser.lower()
        logger.info(f"Starting local WebDriver: {name}")
        if name == "firefox":
            return webdriver.Firefox(options=options)
        if name == "chrome":
            return webdriver.Chrome(options=options)
        raise ValueError(f"Unsupported browser: {browser}")

    @staticmethod
    def _resolve_selenium_url():
        """PK_SELENIUM_URL предпочтителен; PK_SELENOID_URL — совместимый алиас."""
        return (
            pk_env("SELENIUM_URL")
            or pk_env("SELENOID_URL")
            or DEFAULT_SELENIUM_URL
        ).strip()

    @staticmethod
    def _video_enabled():
        """По умолчанию запись вкл.; явный 0/false на PK_SELENIUM_VIDEO (или legacy) — выкл.

        RUNTIME-UN-CUTOVER-GRID-WEBM: видео снова штатное (Grid sidecar).
        ВАЖНО: pk_env возвращает "" при отсутствии ключа (не None) — проверяем
        окружение напрямую, иначе запись молча выключалась бы всегда.
        """
        for key in ("PK_SELENIUM_VIDEO", "PK_SELENOID_VIDEO"):
            raw = os.getenv(key)
            if raw is not None:
                return raw.strip().lower() in ("1", "true", "yes", "on")
        return True

    def _create_remote_driver(self, browser, headless, options):
        hub_url = self._resolve_selenium_url()
        self._apply_grid_capabilities(options, headless)
        logger.info(f"Starting remote WebDriver: {browser.lower()} at {hub_url}")
        driver = Remote(command_executor=hub_url, options=options)
        # Без этого upload_file шлёт путь как есть, и контейнер браузера ищет файл
        # у себя. LocalFileDetector заливает файл с раннера в сессию.
        driver.file_detector = LocalFileDetector()
        self._log_remote_live_view_hint(browser, headless, driver)
        return driver

    def _log_remote_live_view_hint(self, browser, headless, driver):
        """
        Нода Grid сама отдаёт se:vnc / se:noVncPort; UI вкладки session экран не
        встраивает (в отличие от Selenoid). Живой просмотр — noVNC на :7900/:7901.
        """
        caps = getattr(driver, "capabilities", None) or {}
        vnc = caps.get("se:vnc")
        novnc_port = caps.get("se:noVncPort") or (7900 if browser.lower() == "chrome" else 7901)
        novnc_url = f"http://127.0.0.1:{novnc_port}/?autoconnect=1&resize=scale"
        try:
            from utils.diary_bus import set_meta

            set_meta(novnc_url=novnc_url, browser_type=browser, session_name=self.session_name)
        except Exception as e:
            logger.warning("PrettyK Live meta novnc_url not set: %s", e)
        if headless:
            logger.info(
                "Remote session is headless: noVNC %s shows an empty "
                "desktop. Use browser_type without -headless to watch the run "
                "(Grid session tab is not a live screen).",
                novnc_url,
            )
            return
        live_hint = ""
        try:
            from utils.live_server import live_enabled, live_url

            if live_enabled():
                live_hint = f"; PrettyK Live (VNC+diary): {live_url()}"
        except Exception:
            pass
        logger.info(
            "Watch live browser via noVNC: %s "
            "(Grid session tab does not embed the screen)%s%s",
            novnc_url,
            f"; se:vnc={vnc}" if vnc else "",
            live_hint,
        )

    def _apply_grid_capabilities(self, options, headless):
        """
        Selenium Grid 4: se:name в UI, se:recordVideo при включённом video-сервисе.
        Видео выключено по умолчанию — нужен sidecar chrome-video в compose.
        MON-5: run_id префиксом в имени видео → файл находим по ?run_id= для replay.
        """
        options.set_capability("se:name", self.session_name)
        enable_video = self._video_enabled()
        if enable_video:
            options.set_capability("se:recordVideo", True)
            stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            slug = _artifact_slug(self.session_name)
            run_id = (pk_env("RUN_ID") or "").strip()
            if run_id:
                video_name = f"{run_id}_{slug}_{stamp}.mp4"
            else:
                video_name = f"{slug}_{stamp}.mp4"
            options.set_capability("se:videoName", video_name)
            logger.info(f"Grid video requested, expected artifact name: {video_name}")
            if headless:
                logger.warning(
                    "Video recording is enabled for a headless browser: the node records "
                    "the container display, so the video may be blank. Use a non-headless "
                    "browser_type in the wired for meaningful video."
                )
        if _env_flag("PK_SELENOID_VERBOSE") or _env_flag("PK_SELENIUM_VERBOSE"):
            logger.info(
                "Verbose chromedriver dump requested; Grid nodes do not mirror "
                "Selenoid VERBOSE env — use node container logs if needed"
            )

    # ========== ПРОКСИ И ОПЦИИ БРАУЗЕРА ==========

    @staticmethod
    def _split_proxy(proxy):
        """Разбирает host:port, допуская схему в начале (http://host:port)."""
        raw = proxy.strip()
        if "://" in raw:
            raw = raw.split("://", 1)[1]
        raw = raw.rstrip("/")
        host, sep, port = raw.rpartition(":")
        if not sep or not host:
            raise ValueError(f"Proxy must be in host:port format, got: {proxy!r}")
        return host, int(port)

    def _resolve_proxy(self, proxy):
        """
        Приводит адрес прокси к виду, достижимому оттуда, где реально работает браузер.

        Controller описывает прокси с точки зрения хоста-раннера (localhost:proxy_port),
        потому что там же он поднимает scanner. Внутри контейнера браузера loopback — это сам
        контейнер, поэтому в remote-режиме подменяем его на адрес хоста: host.docker.internal
        прописан в extra_hosts node-сервисов в docker-compose.yml.
        """
        if not proxy:
            return None
        host, port = self._split_proxy(proxy)
        if self.mode != MODE_REMOTE:
            return f"{host}:{port}"
        if host.lower() not in LOOPBACK_HOSTS:
            logger.info(f"Proxy resolved for remote mode as is (not loopback): {host}:{port}")
            return f"{host}:{port}"
        container_host = pk_env("PROXY_HOST_FROM_CONTAINER", DEFAULT_CONTAINER_HOST)
        logger.info(
            f"Proxy rewritten for remote mode: {host}:{port} -> {container_host}:{port} "
            f"(loopback is unreachable from the browser container; "
            f"override via PK_PROXY_HOST_FROM_CONTAINER)"
        )
        return f"{container_host}:{port}"

    def _build_options(self, browser, headless, proxy):
        """Опции браузера, одинаковые для локального и удалённого режимов."""
        name = browser.lower()
        if name == "firefox":
            options = self._firefox_options(headless, proxy)
        elif name == "chrome":
            options = self._chrome_options(headless, proxy)
        else:
            raise ValueError(f"Unsupported browser: {browser}")
        # scanner — MITM со своим CA, который в браузер не установлен: без acceptInsecureCerts
        # любая HTTPS-цель через прокси упадёт на проверке сертификата.
        options.accept_insecure_certs = True
        return options

    def _firefox_options(self, headless, proxy):
        options = webdriver.FirefoxOptions()
        if headless:
            options.add_argument("--headless")
            options.add_argument("--width=1920")
            options.add_argument("--height=1080")
        if proxy:
            host, port = self._split_proxy(proxy)
            options.set_preference("network.proxy.type", 1)
            options.set_preference("network.proxy.http", host)
            options.set_preference("network.proxy.http_port", port)
            options.set_preference("network.proxy.ssl", host)
            options.set_preference("network.proxy.ssl_port", port)
            # Firefox по умолчанию не проксирует loopback, а цель на localhost — типовой
            # кейс для CI-раннера: без этих двух настроек её трафик молча минует scanner.
            options.set_preference("network.proxy.no_proxies_on", "")
            options.set_preference("network.proxy.allow_hijacking_localhost", True)
        return options

    def _chrome_options(self, headless, proxy):
        options = webdriver.ChromeOptions()
        if headless:
            options.add_argument("--headless")
            # Иначе headless ~800px: hide-lt-md прячет Account в navbar.
            options.add_argument("--window-size=1920,1080")
        if proxy:
            options.add_argument(f"--proxy-server={proxy}")
            # Тот же loopback-обход, что и у Firefox: <-loopback> снимает встроенное
            # исключение localhost/127.0.0.1 из проксирования.
            options.add_argument("--proxy-bypass-list=<-loopback>")
        options.add_argument("--ignore-certificate-errors")
        options.add_argument("--allow-insecure-localhost")
        # Нужно для browser|get_browser_logs / get_console_errors (Selenium get_log).
        options.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})
        return options

    # ========== ЖИЗНЕННЫЙ ЦИКЛ СЕССИИ ==========

    def _ensure_driver(self):
        if self.driver is None:
            logger.warning("WebDriver is not initialized. Action will be simulated.")
            return False
        return True

    def shutdown(self):
        """
        Идемпотентное завершение сессии для teardown прогона: закрывает браузер
        (в remote-режиме — сессию на Grid) и никогда не бросает исключение,
        чтобы не подменять исходную ошибку прогона.
        Возвращает True, если сессия была закрыта этим вызовом.
        """
        if self.driver is None:
            logger.debug("WebDriver teardown: no active session")
            return False
        try:
            self.driver.quit()
            logger.info(f"WebDriver session closed ({self.mode} mode)")
            return True
        except Exception as e:
            logger.warning(f"Failed to close WebDriver session cleanly: {e}")
            return False
        finally:
            self._release_driver()

    def update_driver(self, new_driver):
        self._bind_driver(new_driver)
        logger.info("WebDriver updated with new driver instance")

    # ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ (Selene) ==========

    def _el(self, selector_type, selector_value, timeout=None):
        """Lazy-элемент Selene; опциональный timeout на одно действие."""
        element = sb.element(selector_type, selector_value)
        if timeout is not None and timeout != "":
            element = element.with_(timeout=float(timeout))
        return element

    def _all(self, selector_type, selector_value, timeout=None):
        """Коллекция Selene по локатору манифеста."""
        collection = sb.collection(selector_type, selector_value)
        if timeout is not None and timeout != "":
            collection = collection.with_(timeout=float(timeout))
        return collection

    def _indexed_el(self, selector_type, selector_value, index, timeout=None):
        """Элемент коллекции по индексу; отрицательный — с конца (как раньше)."""
        index = int(index)
        collection = self._all(selector_type, selector_value, timeout)
        if index < 0:
            size = collection.get(query.size)
            index = size + index
            if index < 0:
                raise IndexError(f"Index out of range (found {size})")
        return collection.element(index)

    def _remember_located(self, element, selector_type, selector_value) -> None:
        if element is None:
            return
        try:
            from utils.locator_heal_runtime import (
                fingerprint_from_web_element,
                remember_fingerprint,
            )

            remember_fingerprint(
                fingerprint_from_web_element(
                    element,
                    locator_type=str(selector_type or ""),
                    locator_value=str(selector_value or ""),
                )
            )
        except Exception:
            pass

    def _locate_with_heal(self, selector_type, selector_value, timeout=None):
        """
        Locate element; on miss under heal gate try fingerprint score (HEAL-B).
        Returns (element, effective_type, effective_value).
        """
        if not self._ensure_driver():
            return None, selector_type, selector_value
        try:
            target = self._el(selector_type, selector_value, timeout)
            if hasattr(target, "should"):
                target = target.should(be.present)
            element = target.locate() if hasattr(target, "locate") else target
            self._remember_located(element, selector_type, selector_value)
            return element, selector_type, selector_value
        except Exception as primary:
            try:
                from utils.locator_heal_runtime import try_resolve_healed_locator

                healed = try_resolve_healed_locator(
                    self.driver, str(selector_type or ""), str(selector_value or "")
                )
            except Exception:
                healed = None
            if not healed:
                # HEAL_MISS already logged if gate was on; escalate to failsafe/hard.
                raise primary
            new_type, new_value, _score = healed
            try:
                target = self._el(new_type, new_value, timeout)
                if hasattr(target, "should"):
                    target = target.should(be.present)
                element = target.locate() if hasattr(target, "locate") else target
            except Exception as secondary:
                # Healed locator still dead → ERROR path (soft may still absorb above).
                logger.error(
                    "locator heal OK but re-locate failed | %s %s → %s %s: %s",
                    selector_type,
                    selector_value,
                    new_type,
                    new_value,
                    secondary,
                )
                raise secondary
            self._remember_located(element, new_type, new_value)
            return element, new_type, new_value

    def _find_element(self, selector_type, selector_value, timeout=None):
        """WebElement через Selene (для Selenium-дыр: Select, таблицы, upload)."""
        element, _t, _v = self._locate_with_heal(
            selector_type, selector_value, timeout=timeout
        )
        return element

    def _find_elements(self, selector_type, selector_value, timeout=None):
        if not self._ensure_driver():
            return []
        return list(self._all(selector_type, selector_value, timeout).locate())

    def wait_for_page_load(self, timeout=30):
        # Selene не покрывает readyState — остаётся Selenium Wait.
        if not self._ensure_driver():
            return
        WebDriverWait(self.driver, float(timeout)).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )

    # ========== НАВИГАЦИЯ ==========

    def _resolve_open_relative(self, url=None) -> str:
        """Открыть: пусто → base; relative → join; http(s) запрещены."""
        from urllib.parse import urljoin

        from core.errors import WiredError

        raw = "" if url is None else str(url).strip()
        if not raw:
            if not self.base_url:
                raise WiredError(
                    "Открыть: нужен security_configuration.base_url_override"
                )
            return self.base_url
        if raw.startswith(("http://", "https://")):
            raise WiredError(
                "Открыть принимает только относительный путь; "
                "для абсолютного URL используйте ОткрытьПоURL"
            )
        if not self.base_url:
            raise WiredError(
                f"относительный URL {raw!r}: нужен security_configuration.base_url_override"
            )
        base = self.base_url if self.base_url.endswith("/") else self.base_url + "/"
        return urljoin(base, raw)

    def _resolve_open_by_url(self, url) -> str:
        """ОткрытьПоURL: только absolute + allowlist."""
        from core.errors import WiredError
        from utils.allowed_urls import ALLOWED_URL_DENY_MSG, url_allowed

        raw = "" if url is None else str(url).strip()
        if not raw.startswith(("http://", "https://")):
            raise WiredError("ОткрытьПоURL: нужен абсолютный http(s) URL")
        if not url_allowed(raw, self.allowed_extra_domains):
            raise WiredError(ALLOWED_URL_DENY_MSG)
        return raw

    def _navigate(self, url, wait_for_load=True):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] open({url})")
            return
        logger.info(f"Opening URL: {url}")
        try:
            # Широкий viewport до get: hide-lt-md / desktop-nav (maximize в headless пустой).
            try:
                if self.headless:
                    self.driver.set_window_size(1920, 1080)
                else:
                    self.driver.maximize_window()
            except Exception as e:
                logger.warning("viewport adjust failed (continue): %s", e)
            self.driver.get(url)
            logger.info(f"After driver.get, current_url: {self.driver.current_url}")
            if wait_for_load:
                self.wait_for_page_load()
                logger.info(
                    f"After wait_for_page_load, current_url: {self.driver.current_url}"
                )
            try:
                page_source_len = len(self.driver.page_source)
                logger.info(f"Page source length: {page_source_len}")
            except Exception:
                logger.warning("Could not get page source")
        except Exception as e:
            logger.error(f"Failed to open {url}: {e}")
            raise

    def open(self, url=None, wait_for_load=True):
        target = self._resolve_open_relative(url)
        self._navigate(target, wait_for_load)

    def open_by_url(self, url, wait_for_load=True):
        target = self._resolve_open_by_url(url)
        self._navigate(target, wait_for_load)

    def auto_authorize_discovery(self, url=None, user=None, password=None):
        """
        АвтоАвторизоваться — lab stub (IMP-AD / DISC-1).
        Не угадывает DOM-форму; honest applied=false + notes.
        Не поднимает CANON discovery-heal.
        """
        from utils.auth_discovery_bridge import (
            discovery_login_result,
            live_discovery_fail_clue,
        )

        notes = [
            "АвтоАвторизоваться: lab stub — DOM discovery не реализован (DISC-1)",
        ]
        if url:
            notes.append(f"url={url}")
        if user:
            notes.append("user передан (не используется stub'ом)")
        if password:
            notes.append("password передан (не логируем значение)")
        result = discovery_login_result(ok=False, notes=notes)
        clue = live_discovery_fail_clue(result)
        self._last_auth_discovery = result
        self._last_auth_discovery_clue = clue
        logger.info("auto_authorize_discovery stub: %s", result["notes"])
        try:
            from utils.diary_bus import publish

            publish(
                "AUTH",
                clue.get("diary_line") or "auth-discovery fail",
                channel="diary",
            )
        except Exception:
            pass
        return result

    def gather_info(
        self,
        source,
        burst_sec=None,
        settle_sec=None,
        max_urls=None,
        pscan_timeout_sec=None,
        wall_sec=None,
    ):
        """
        СборИнформации: per-URL navigate → spider burst → pscan cap.
        Runtime: Controller registers bound `_kw_gather_info` (WD+scanner).
        """
        raise RuntimeError(
            "gather_info requires Controller runtime (webdriver + scanner scannerWorkStream)"
        )

    def crawl_urls(self, source, pause_seconds=3):
        """
        ОбойтиСтраницы: для каждого URL — navigate → sleep.
        source: list[str] | multiline str (после resolve_arg — уже значение из stream).
        G-65 export уже отдаёт absolute (base+path); relative — join здесь.
        Не через open()/open_by_url: open режет http(s), open_by_url — allowlist
        (base_url приложения туда не обязан входить).
        pause после open: SPA/hash (#/…) успевает отрисоваться, scanner — увидеть трафик.
        """
        from urllib.parse import urljoin

        urls = self._normalize_url_source(source)
        pause = float(pause_seconds) if pause_seconds not in (None, "") else 3.0
        base = (self.base_url or "").strip()
        for raw in urls:
            row = str(raw).strip()
            if not row:
                continue
            if row.startswith(("http://", "https://")):
                url = row
            else:
                if not base:
                    raise ValueError(
                        f"относительный URL {row!r}: задайте base_url_override "
                        f"или передайте абсолютный адрес"
                    )
                url = urljoin(base if base.endswith("/") else base + "/", row)
            self._navigate(url)
            time.sleep(pause)
        return len(urls)

    @staticmethod
    def _normalize_url_source(source):
        if source is None:
            return []
        if isinstance(source, (list, tuple)):
            return [str(x).strip() for x in source if str(x).strip()]
        text = str(source).replace("\\n", "\n")
        out = []
        for line in text.splitlines():
            s = line.strip()
            if s and not s.startswith("#"):
                out.append(s)
        if not out and text.strip():
            out = [text.strip()]
        return out

    def back(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] back()")
            return
        self.driver.back()
        self.wait_for_page_load()

    def forward(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] forward()")
            return
        self.driver.forward()
        self.wait_for_page_load()

    def refresh(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] refresh()")
            return
        self.driver.refresh()
        self.wait_for_page_load()

    def close(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] close()")
            return
        self.driver.close()

    def quit(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] quit()")
            return
        self.driver.quit()
        # Сессии больше нет: отпускаем драйвер, чтобы teardown прогона не пытался
        # закрыть её повторно.
        self._release_driver()

    # ========== ДЕЙСТВИЯ С ЭЛЕМЕНТАМИ (Selene) ==========

    def click(self, selector_type, selector_value, timeout=None):
        if str(selector_type or "").strip().lower() == "label":
            from utils.label_resolve import perform_label_action
            from utils.locator_heal_runtime import heal_gate_active

            if not self._ensure_driver():
                logger.info(f"[SIMULATED] click(label, {selector_value})")
                return
            perform_label_action(
                self,
                action="click",
                label=str(selector_value or ""),
                soft=heal_gate_active(),
                timeout=timeout,
            )
            return
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] click({selector_type}, {selector_value})")
            return
        _, st, sv = self._locate_with_heal(
            selector_type, selector_value, timeout=timeout
        )
        try:
            # Полный wait Selene (present → visible → enabled → no-overlap),
            # а не сырой WebElement.click(), который не ждёт отрисовку.
            self._el(st, sv, timeout).click()
        except (ElementClickInterceptedException, ElementNotInteractableException):
            # Material/CDK: Selene уже ждал no-overlap, но native всё равно ловят —
            # как Selenide, уходим в JS без отдельного keyword.
            self._el(st, sv, timeout).perform(command.js.click)

    def double_click(self, selector_type, selector_value, timeout=None):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] double_click({selector_type}, {selector_value})")
            return
        self._el(selector_type, selector_value, timeout).double_click()

    def right_click(self, selector_type, selector_value, timeout=None):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] right_click({selector_type}, {selector_value})")
            return
        self._el(selector_type, selector_value, timeout).context_click()

    def click_js(self, selector_type, selector_value, timeout=None):
        """Клик через JavaScript — обходит перекрытие элемента другими слоями."""
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] click_js({selector_type}, {selector_value})")
            return
        self._el(selector_type, selector_value, timeout).perform(command.js.click)

    def hold_click(self, selector_type, selector_value, seconds=1):
        """Зажать ЛКМ на элементе, подождать seconds, отпустить (ActionChains — дыра Selene)."""
        if not self._ensure_driver():
            logger.info(
                f"[SIMULATED] hold_click({selector_type}, {selector_value}, {seconds})"
            )
            return
        element = self._find_element(selector_type, selector_value)
        ActionChains(self.driver).click_and_hold(element).perform()
        time.sleep(float(seconds))
        ActionChains(self.driver).release().perform()

    def send_keys(self, selector_type, selector_value, text, clear_first=True, timeout=None):
        """
        Ввод текста как с клавиатуры (Selene set_value / type).

        Keyword: webdriver|send_keys|<selector_type>|<selector_value>|<text>[|<clear_first>]
        DISC-2: webdriver|send_keys|label|<Лейбл>|<text>
        """
        if str(selector_type or "").strip().lower() == "label":
            from utils.label_resolve import perform_label_action
            from utils.locator_heal_runtime import heal_gate_active

            if not self._ensure_driver():
                logger.info(
                    f"[SIMULATED] send_keys(label, {selector_value}, {text})"
                )
                return
            perform_label_action(
                self,
                action="send_keys",
                label=str(selector_value or ""),
                text=str(text or ""),
                soft=heal_gate_active(),
                timeout=timeout,
            )
            return
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] send_keys({selector_type}, {selector_value}, {text})")
            return
        try:
            _el, selector_type, selector_value = self._locate_with_heal(
                selector_type, selector_value, timeout=timeout
            )
        except Exception:
            pass
        element = self._el(selector_type, selector_value, timeout)
        if self._as_bool(clear_first, default=True):
            element.set_value(text)
        else:
            element.type(text)

    def append_text(self, selector_type, selector_value, text):
        """
        Дописывает текст, не очищая поле.

        Keyword: webdriver|append_text|<selector_type>|<selector_value>|<text>
        """
        return self.send_keys(selector_type, selector_value, text, clear_first=False)

    # Прямая запись el.value не видна React: он читает значение через нативный сеттер
    # прототипа и сравнивает со своим внутренним. Пишем через сеттер и сами шлём события.
    # Selene command.js.set_value этого не делает — дыра, остаётся наш скрипт.
    _SET_VALUE_SCRIPT = """
        const el = arguments[0];
        const value = arguments[1];
        const proto = el instanceof window.HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(el, value);
        } else {
            el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    """

    def set_value(self, selector_type, selector_value, text):
        """
        Быстрая установка значения через DOM (React-friendly), не посимвольный ввод.

        Keyword: webdriver|set_value|<selector_type>|<selector_value>|<text>
        """
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] set_value({selector_type}, {selector_value}, {text})")
            return
        element = self._el(selector_type, selector_value).should(be.visible)
        self.driver.execute_script(self._SET_VALUE_SCRIPT, element.locate(), text)
        logger.info(f"Value set via DOM: {selector_type}={selector_value}")

    def clear(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] clear({selector_type}, {selector_value})")
            return
        self._el(selector_type, selector_value).clear()

    def submit(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] submit({selector_type}, {selector_value})")
            return
        self._find_element(selector_type, selector_value).submit()

    def hover(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] hover({selector_type}, {selector_value})")
            return
        self._el(selector_type, selector_value).hover()

    def drag_and_drop(self, source_type, source_value, target_type, target_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] drag_and_drop({source_type}, {source_value}, {target_type}, {target_value})")
            return
        target = self._el(target_type, target_value)
        self._el(source_type, source_value).perform(command.drag_and_drop_to(target))

    # ========== РАБОТА С SELECT (Selenium Select — дыра Selene) ==========
    def select_by_index(self, selector_type, selector_value, index):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] select_by_index({selector_type}, {selector_value}, {index})")
            return
        from selenium.webdriver.support.ui import Select
        Select(self._el(selector_type, selector_value).should(be.visible).locate()).select_by_index(int(index))

    def select_by_value(self, selector_type, selector_value, value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] select_by_value({selector_type}, {selector_value}, {value})")
            return
        from selenium.webdriver.support.ui import Select
        Select(self._el(selector_type, selector_value).should(be.visible).locate()).select_by_value(value)

    def select_by_text(self, selector_type, selector_value, text):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] select_by_text({selector_type}, {selector_value}, {text})")
            return
        from selenium.webdriver.support.ui import Select
        Select(self._el(selector_type, selector_value).should(be.visible).locate()).select_by_visible_text(text)

    # ========== ПОЛУЧЕНИЕ ИНФОРМАЦИИ (Selene query) ==========
    def get_text(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] get_text({selector_type}, {selector_value}) -> 'dummy text'")
            return "dummy text"
        return self._el(selector_type, selector_value).get(query.text)

    def get_attribute(self, selector_type, selector_value, attribute):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] get_attribute({selector_type}, {selector_value}, {attribute}) -> None")
            return None
        return self._el(selector_type, selector_value).get(query.attribute(attribute))

    def get_property(self, selector_type, selector_value, property_name):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] get_property({selector_type}, {selector_value}, {property_name}) -> None")
            return None
        return self._el(selector_type, selector_value).get(query.js_property(property_name))

    def get_value(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] get_value({selector_type}, {selector_value}) -> ''")
            return ""
        return self._el(selector_type, selector_value).get(query.value)

    def get_css_value(self, selector_type, selector_value, property_name):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] get_css_value({selector_type}, {selector_value}, {property_name}) -> None")
            return None
        return self._el(selector_type, selector_value).get(query.css_property(property_name))

    # ========== ПРОВЕРКИ СОСТОЯНИЯ ==========
    def is_displayed(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] is_displayed({selector_type}, {selector_value}) -> True")
            return True
        # matching — без ожидания: «сейчас видно?»
        return self._el(selector_type, selector_value).matching(be.visible)

    def is_enabled(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] is_enabled({selector_type}, {selector_value}) -> True")
            return True
        return self._el(selector_type, selector_value).matching(be.enabled)

    def is_selected(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] is_selected({selector_type}, {selector_value}) -> False")
            return False
        return self._el(selector_type, selector_value).matching(be.selected)

    def get_location(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] get_location({selector_type}, {selector_value}) -> {{'x':0,'y':0}}")
            return {"x": 0, "y": 0}
        loc = self._el(selector_type, selector_value).get(query.location)
        return {"x": loc["x"], "y": loc["y"]}

    def get_size(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] get_size({selector_type}, {selector_value}) -> {{'width':0,'height':0}}")
            return {"width": 0, "height": 0}
        size = self._el(selector_type, selector_value).get(query.size)
        return {"width": size["width"], "height": size["height"]}

    # ========== ОЖИДАНИЯ (Selene wait_until / should) ==========
    def wait_for_element(self, selector_type, selector_value, timeout=10):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] wait_for_element({selector_type}, {selector_value}) -> True")
            return True
        return self._el(selector_type, selector_value, timeout).wait_until(be.present)

    def wait_for_element_not(self, selector_type, selector_value, timeout=10):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] wait_for_element_not({selector_type}, {selector_value}) -> True")
            return True
        return self._el(selector_type, selector_value, timeout).wait_until(be.hidden)

    def wait_for_text(self, selector_type, selector_value, expected, timeout=10):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] wait_for_text({selector_type}, {selector_value}, {expected}) -> True")
            return True
        return self._el(selector_type, selector_value, timeout).wait_until(have.text(expected))

    def wait_for_url(self, expected_url, timeout=10, contains=False):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] wait_for_url({expected_url}, {timeout}, {contains}) -> True")
            return True
        condition = have.url_containing(expected_url) if self._as_bool(contains, default=False) else have.url(expected_url)
        return sb.with_timeout(timeout).wait_until(condition)

    def wait_for_title(self, expected_title, timeout=10):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] wait_for_title({expected_title}) -> True")
            return True
        return sb.with_timeout(timeout).wait_until(have.title(expected_title))

    def log_marker(self, text):
        """Keyword: webdriver|log_marker|<текст> — дневник + Live side-panel."""
        self.session_diary("NOTE", text)
        try:
            from utils.diary_bus import publish

            publish("LOG", str(text), channel="scanner")
        except Exception:
            pass

    def session_diary(self, kind, *parts, live=True, pretty=""):
        """
        Кураторская строка дневника: STEP / ERROR / HIGH / NOTE.

        Пишем в лог оркестратора (`[PK-DIARY]`), не в docker logs ноды Grid.
        Дневник живёт рядом с прогоном и в Allure.

        live=False — только лог оркестратора, без diary_bus (Allure не затрагивается).
        Никогда не роняет шаг: это диагностика.

        pretty — опциональная PrettyK-строка для каретки шагов Live
        (например `Нажать css "…"`), когда `text` содержит сырой wire/execution-title.
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

    def wait_for_network_idle(self, idle_seconds=0.5, timeout=15):
        """
        Ждёт, пока браузер перестанет тянуть ресурсы.

        Считает записи Resource Timing API: как только их число не меняется
        idle_seconds подряд — считаем, что XHR/fetch догрузились. В отличие от
        wait_for_page_load ловит догрузку данных в SPA, где readyState давно complete.
        Возвращает True при простое, False по таймауту (шаг не валим — это ожидание).

        Keyword: webdriver|wait_for_network_idle[|<idle_seconds>|<timeout>]
        """
        if not self._ensure_driver():
            logger.info("[SIMULATED] wait_for_network_idle()")
            return True

        idle_seconds = float(idle_seconds)
        timeout = float(timeout)
        script = "return window.performance.getEntriesByType('resource').length;"

        deadline = time.time() + timeout
        last_count = -1
        stable_since = time.time()
        while time.time() < deadline:
            try:
                count = int(self.driver.execute_script(script))
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

    # ========== ОКНА И ФРЕЙМЫ ==========
    def switch_to_window(self, window_identifier):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] switch_to_window({window_identifier})")
            return
        if isinstance(window_identifier, int):
            handles = self.driver.window_handles
            if window_identifier < len(handles):
                self.driver.switch_to.window(handles[window_identifier])
        else:
            self.driver.switch_to.window(window_identifier)

    def switch_to_frame(self, identifier, selector_type=None, selector_value=None):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] switch_to_frame({identifier}, {selector_type}, {selector_value})")
            return
        if selector_type and selector_value:
            element = self._find_element(selector_type, selector_value)
            self.driver.switch_to.frame(element)
        elif isinstance(identifier, int):
            self.driver.switch_to.frame(identifier)
        else:
            self.driver.switch_to.frame(identifier)

    def switch_to_default(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] switch_to_default()")
            return
        self.driver.switch_to.default_content()

    def get_window_handles(self):
        if not self._ensure_driver():
            return []
        return self.driver.window_handles

    def get_current_window_handle(self):
        if not self._ensure_driver():
            return "simulated_handle"
        return self.driver.current_window_handle

    def close_current_window(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] close_current_window()")
            return
        self.driver.close()

    # ========== ALERT ==========
    def accept_alert(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] accept_alert()")
            return
        self.driver.switch_to.alert.accept()

    def dismiss_alert(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] dismiss_alert()")
            return
        self.driver.switch_to.alert.dismiss()

    def get_alert_text(self):
        if not self._ensure_driver():
            return "simulated alert text"
        return self.driver.switch_to.alert.text

    def send_keys_to_alert(self, text):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] send_keys_to_alert({text})")
            return
        self.driver.switch_to.alert.send_keys(text)

    # ========== JAVASCRIPT ==========
    def execute_script(self, script, *args):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] execute_script({script})")
            return None
        return self.driver.execute_script(script, *args)

    def execute_async_script(self, script, *args):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] execute_async_script({script})")
            return None
        return self.driver.execute_async_script(script, *args)

    # ========== СКРИНШОТЫ ==========
    def take_screenshot(self, filename=None):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] take_screenshot({filename}) -> screenshot.png")
            return "screenshot_simulated.png"
        if not filename:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"screenshot_{timestamp}.png"
        self.driver.save_screenshot(filename)
        return filename

    def take_element_screenshot(self, selector_type, selector_value, filename=None):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] take_element_screenshot({selector_type}, {selector_value}) -> element_screenshot.png")
            return "element_screenshot_simulated.png"
        element = self._find_element(selector_type, selector_value)
        if not filename:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"element_{timestamp}.png"
        element.screenshot(filename)
        return filename

    # ========== ПРОКРУТКА ==========
    def scroll_to_element(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] scroll_to_element({selector_type}, {selector_value})")
            return
        self._el(selector_type, selector_value).perform(command.js.scroll_into_view)

    def scroll_to_top(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] scroll_to_top()")
            return
        self.driver.execute_script("window.scrollTo(0, 0);")

    def scroll_to_bottom(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] scroll_to_bottom()")
            return
        self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")

    def scroll_by(self, x, y):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] scroll_by({x}, {y})")
            return
        self.driver.execute_script(f"window.scrollBy({x}, {y});")

    # ========== МЫШЬ (ActionChains — дыры Selene) ==========
    def move_to_element(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] move_to_element({selector_type}, {selector_value})")
            return
        self._el(selector_type, selector_value).hover()

    def move_by_offset(self, x_offset, y_offset):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] move_by_offset({x_offset}, {y_offset})")
            return
        self.actions.move_by_offset(int(x_offset), int(y_offset)).perform()

    def click_and_hold(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] click_and_hold({selector_type}, {selector_value})")
            return
        ActionChains(self.driver).click_and_hold(
            self._find_element(selector_type, selector_value)
        ).perform()

    def release(self):
        if not self._ensure_driver():
            logger.info("[SIMULATED] release()")
            return
        self.actions.release().perform()

    # ========== КЛАВИШИ (ActionChains — дыра Selene) ==========
    def press_key(self, key):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] press_key({key})")
            return
        self.actions.send_keys(self._resolve_key(key)).perform()

    def key_down(self, key):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] key_down({key})")
            return
        self.actions.key_down(self._resolve_key(key)).perform()

    def key_up(self, key):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] key_up({key})")
            return
        self.actions.key_up(self._resolve_key(key)).perform()

    def key_combination(self, keys, selector_type=None, selector_value=None):
        """
        Комбинация клавиш через '+': "CONTROL+a", "CONTROL+SHIFT+k".
        Последний элемент — обычная клавиша, всё до него — модификаторы.
        Если передан локатор, комбинация уходит в этот элемент.

        Keyword: webdriver|key_combination|CONTROL+a[|<selector_type>|<selector_value>]
        """
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] key_combination({keys})")
            return
        parts = [p for p in str(keys).split("+") if p]
        if not parts:
            raise ValueError(f"Empty key combination: {keys!r}")
        modifiers, main_key = parts[:-1], parts[-1]

        chain = ActionChains(self.driver)
        if selector_type and selector_value:
            chain = chain.move_to_element(self._find_element(selector_type, selector_value))
        for modifier in modifiers:
            chain = chain.key_down(self._resolve_key(modifier))
        chain = chain.send_keys(self._resolve_key(main_key))
        for modifier in reversed(modifiers):
            chain = chain.key_up(self._resolve_key(modifier))
        chain.perform()
        logger.info(f"Key combination sent: {keys}")

    def drag_and_drop_by_offset(self, selector_type, selector_value, x_offset, y_offset):
        """
        Перетаскивание элемента на смещение (когда цели-элемента нет: слайдеры, канвас).

        Keyword: webdriver|drag_and_drop_by_offset|<selector_type>|<selector_value>|<x>|<y>
        """
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] drag_and_drop_by_offset({selector_type}, {selector_value})")
            return
        self._el(selector_type, selector_value).perform(
            command.drag_and_drop_by_offset(int(x_offset), int(y_offset))
        )

    # ========== КОЛЛЕКЦИИ ЭЛЕМЕНТОВ (Selene Collection) ==========
    def get_elements_count(self, selector_type, selector_value):
        """Возвращает количество элементов, найденных по локатору."""
        if not self._ensure_driver():
            return 0
        return self._all(selector_type, selector_value).get(query.size)

    def get_elements_texts(self, selector_type, selector_value):
        """Возвращает список текстов всех элементов."""
        if not self._ensure_driver():
            return []
        # Selene query.texts нет — читаем тексты с уже дожданной коллекции.
        return [el.text for el in self._all(selector_type, selector_value).locate()]

    def click_element_by_index(self, selector_type, selector_value, index, timeout=None):
        """
        Кликает по элементу с указанным индексом в коллекции.
        Индекс приходит строкой из манифеста; отрицательный отсчитывается с конца (-1 — последний).
        """
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] click_element_by_index({selector_type}, {selector_value}, {index})")
            return
        element = self._indexed_el(selector_type, selector_value, index, timeout)
        try:
            element.click()
        except (ElementClickInterceptedException, ElementNotInteractableException):
            self._indexed_el(selector_type, selector_value, index, timeout).perform(command.js.click)

    def get_element_text_by_index(self, selector_type, selector_value, index):
        """Возвращает текст элемента по индексу в коллекции."""
        if not self._ensure_driver():
            return "dummy text"
        return self._indexed_el(selector_type, selector_value, index).get(query.text)

    def get_element_attribute_by_index(self, selector_type, selector_value, index, attribute):
        """Получает атрибут элемента по индексу."""
        if not self._ensure_driver():
            return None
        return self._indexed_el(selector_type, selector_value, index).get(query.attribute(attribute))

    def filter_elements_by_text(self, selector_type, selector_value, expected_text):
        """
        Тексты элементов коллекции, содержащих expected_text (list[str] для Пусть).
        Не WebElement — в stream кладём только данные.
        """
        if not self._ensure_driver():
            return []
        needle = "" if expected_text is None else str(expected_text)
        elements = self._find_elements(selector_type, selector_value)
        return [el.text for el in elements if needle in (el.text or "")]

    def click_element_by_text(self, selector_type, selector_value, expected_text, timeout=None):
        """Клик первого элемента коллекции, чей текст содержит expected_text."""
        from core.errors import WiredError

        needle = "" if expected_text is None else str(expected_text)
        if not self._ensure_driver():
            logger.info(
                "[SIMULATED] click_element_by_text(%s, %s, %r)",
                selector_type,
                selector_value,
                needle,
            )
            return
        elements = self._all(selector_type, selector_value, timeout).locate()
        for el in elements:
            if needle in (el.text or ""):
                try:
                    el.click()
                except (ElementClickInterceptedException, ElementNotInteractableException):
                    self.driver.execute_script("arguments[0].click();", el)
                return
        raise WiredError(
            f"НажатьПоТексту: нет элемента с текстом содержащим {needle!r} "
            f"({selector_type}={selector_value!r})"
        )

    def get_element_by_index(self, selector_type, selector_value, index):
        """
        Сырой WebElement по индексу — только для внутренних/escape-hatch.
        Не MethodId / не Пусть (в stream не класть).
        """
        if not self._ensure_driver():
            return None
        return self._indexed_el(selector_type, selector_value, index).locate()

    # ========== ТАБЛИЦЫ И СПИСКИ ==========
    def get_table_row_count(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] get_table_row_count({selector_type}, {selector_value}) -> 0")
            return 0
        table = self._find_element(selector_type, selector_value)
        return len(table.find_elements(By.TAG_NAME, "tr"))

    def get_table_cell_text(self, selector_type, selector_value, row_index, col_index):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] get_table_cell_text({selector_type}, {selector_value}, {row_index}, {col_index}) -> ''")
            return ""
        table = self._find_element(selector_type, selector_value)
        rows = table.find_elements(By.TAG_NAME, "tr")
        if row_index >= len(rows):
            raise IndexError(f"Row {row_index} not found")
        cells = rows[row_index].find_elements(By.TAG_NAME, "td")
        if col_index >= len(cells):
            raise IndexError(f"Column {col_index} not found")
        return cells[col_index].text

    def get_list_items(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] get_list_items({selector_type}, {selector_value}) -> []")
            return []
        elements = self._find_elements(selector_type, selector_value)
        return [el.text for el in elements]

    # ========== ЗАГРУЗКА ФАЙЛОВ ==========
    def upload_file(self, selector_type, selector_value, file_path):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] upload_file({selector_type}, {selector_value}, {file_path})")
            return
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        # input[type=file] обычно скрыт — ждём present, шлём путь (LocalFileDetector в remote).
        self._el(selector_type, selector_value).should(be.present).type(os.path.abspath(file_path))

    # ========== АССЕРТЫ ==========
    def assert_equals(self, expected, actual, message=None):
        if expected != actual:
            raise AssertionError(message or f"{expected} != {actual}")
        return True

    def assert_not_equals(self, expected, actual, message=None):
        if expected == actual:
            raise AssertionError(message or f"{expected} == {actual}")
        return True

    def assert_true(self, condition, message=None):
        if not condition:
            raise AssertionError(message or "Condition is False")
        return True

    def assert_false(self, condition, message=None):
        if condition:
            raise AssertionError(message or "Condition is True")
        return True

    def assert_contains(self, string, substring, message=None):
        if substring not in string:
            raise AssertionError(message or f"{substring} not in {string}")
        return True

    def assert_not_contains(self, string, substring, message=None):
        if substring in string:
            raise AssertionError(message or f"{substring} found in {string}")
        return True

    def assert_element_present(self, selector_type, selector_value, timeout=10):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] assert_element_present({selector_type}, {selector_value}) -> True")
            return True
        self._el(selector_type, selector_value, timeout).should(be.present)

    def assert_element_visible(self, selector_type, selector_value, timeout=10):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] assert_element_visible({selector_type}, {selector_value}) -> True")
            return True
        self._el(selector_type, selector_value, timeout).should(be.visible)

    def assert_element_not_visible(self, selector_type, selector_value, timeout=10):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] assert_element_not_visible({selector_type}, {selector_value}) -> True")
            return True
        self._el(selector_type, selector_value, timeout).should(be.hidden)

    def assert_text_present(self, text, timeout=10):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] assert_text_present({text}) -> True")
            return True
        # page_source шире, чем by.partial_text (скрипты, скрытый HTML) — дыра Selene.
        try:
            WebDriverWait(self.driver, float(timeout)).until(lambda d: text in d.page_source)
        except TimeoutException:
            raise AssertionError(f"Text '{text}' not found on page")

    def assert_title(self, expected_title, timeout=10):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] assert_title({expected_title}) -> True")
            return True
        sb.with_timeout(timeout).should(have.title(expected_title))

    def assert_url(self, expected_url, timeout=10):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] assert_url({expected_url}) -> True")
            return True
        sb.with_timeout(timeout).should(have.url(expected_url))

    def assert_alert_text(self, expected_text, timeout=10):
        # Native alert — дыра Selene, остаётся Selenium EC.
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] assert_alert_text({expected_text}) -> True")
            return True
        try:
            WebDriverWait(self.driver, float(timeout)).until(EC.alert_is_present())
            actual = self.driver.switch_to.alert.text
            if expected_text != actual:
                raise AssertionError(f"Expected alert '{expected_text}', got '{actual}'")
        except TimeoutException:
            raise AssertionError("Alert not present")

    def assert_checkbox_checked(self, selector_type, selector_value):
        if not self._ensure_driver():
            logger.info(f"[SIMULATED] assert_checkbox_checked({selector_type}, {selector_value}) -> True")
            return True
        self._el(selector_type, selector_value).should(be.selected)
        return True

"""
# ========== ЗАКОММЕНТИРОВАННЫЕ МЕТОДЫ ДЛЯ РАСШИРЕНИЯ ==========
# def wait_for_frame_and_switch(self, frame_selector, timeout=10):
#    
#     Идея: ожидание появления фрейма и переключение на него за один вызов.
#     Полезно для iframe-авторизации, когда фрейм подгружается динамически.
#     Трудозатраты: 0.5 часа (обёртка над switch_to_frame + ожидание).
#    
#     pass
# def execute_script_with_retry(self, script, retries=3, delay=1, *args):
#   
#     Идея: выполнение JS-скрипта с повторными попытками при ошибке.
#     Полезно для динамически генерируемых элементов или сложных анимаций.
#     Трудозатраты: 1 час.
#     
#     pass
# def get_page_state(self):
#
#     Идея: получение текущего состояния страницы (readyState, URL, заголовок, количество элементов).
#     Полезно для диагностики и логирования перед выполнением критических шагов.
#     Трудозатраты: 0.5 часа.
# 
#     pass
# ========== ИДЕИ ДЛЯ БУДУЩИХ РЕЛИЗОВ ==========
# 1. Action-chain MFA — на Selenium / WebDriver+CDP (не Playwright).
# 2. Интеграция с Allure для автоматического прикрепления скриншотов к шагам.
# 3. Автоматическое восстановление сессии при падении браузера (reconnect).
# 4. Кастомные ожидания (например, ожидание исчезновения спиннера).

#=================================================================================
# Файл: adapters/selenium_adapter.py
# Дата создания: 27.07.2026
# Версия: 1.0
# 
# Методы:
# 1. open(url, wait_for_load=True) — открывает URL, ждёт загрузки страницы.
# 2. back() — переход на предыдущую страницу.
# 3. forward() — переход на следующую страницу.
# 4. refresh() — перезагрузка страницы.
# 5. close() — закрытие текущего окна.
# 6. quit() — завершение сессии драйвера.
# 7. click(selector_type, selector_value) — клик по элементу.
# 8. double_click(selector_type, selector_value) — двойной клик.
# 9. right_click(selector_type, selector_value) — правый клик.
# 10. send_keys(selector_type, selector_value, text) — ввод текста.
# 11. clear(selector_type, selector_value) — очистка поля.
# 12. submit(selector_type, selector_value) — отправка формы.
# 13. hover(selector_type, selector_value) — наведение курсора.
# 14. drag_and_drop(source_type, source_value, target_type, target_value) — перетаскивание.
# 15. select_by_index / select_by_value / select_by_text — работа с выпадающими списками.
# 16. get_text / get_attribute / get_property / get_value / get_css_value — получение данных.
# 17. is_displayed / is_enabled / is_selected — проверки состояния.
# 18. get_location / get_size — координаты и размеры.
# 19. wait_for_element / wait_for_element_not / wait_for_text / wait_for_url / wait_for_title — ожидания.
# 20. sleep — снят; Пауза → core|sleep (DataProcessor).
# 21. switch_to_window / switch_to_frame / switch_to_default — переключение окон/фреймов.
# 22. accept_alert / dismiss_alert / get_alert_text / send_keys_to_alert — работа с alert.
# 23. execute_script / execute_async_script — выполнение JS.
# 24. take_screenshot / take_element_screenshot — скриншоты.
# 25. scroll_to_element / scroll_to_top / scroll_to_bottom / scroll_by — прокрутка.
# 26. move_to_element / move_by_offset / click_and_hold / release — действия с мышью.
# 27. press_key / key_down / key_up — работа с клавишами.
# 28. get_table_row_count / get_table_cell_text / get_list_items — работа с таблицами и списками.
# 29. upload_file — загрузка файлов.
# 30. assert_* — ассерты (обёртки для удобства).
# 
# Закомментированные методы (расширение):
# - wait_for_frame_and_switch — ожидание фрейма + переключение.
# - execute_script_with_retry — JS с повторными попытками.
# - get_page_state — получение состояния страницы для диагностики.
# 
# Трудозатраты на реализацию текущей версии: ~6 часов (написание обёрток, тестирование).
# Дальнейшая детализация: требуется реализация парсинга конструктора и интеграции с ActionFactory.
# ================================================================================
# ================================================================================
# Файл: adapters/selenium_adapter.py
# Дата создания: 27.07.2026
# Версия: 1.0 """
"""

================================================================================
Обновления в версии 1.1:
- Добавлены методы для работы с коллекциями элементов:
  - get_elements_count
  - get_elements_texts
  - click_element_by_index
  - get_element_text_by_index
  - get_element_attribute_by_index
  - filter_elements_by_text
  - get_element_by_index
- Импорт By вынесен в глобальную область.
- Все методы таблиц и списков используют правильный импорт By.
- Ассерты оставлены для удобства использования в PK.

================================================================================
Обновления в версии 1.2 (Selenoid):
- Единая инициализация вместо двух копий __init__: создание драйвера вынесено в
  _create_local_driver / _create_remote_driver, обвязка (wait, actions, таймаут) —
  в _bind_driver. Закомментированный дубль под Selenoid удалён.
- Режим (local/remote) и адрес хаба — из переменных окружения (см. модульный docstring),
  по умолчанию remote (Grid).
- _resolve_proxy: в remote-режиме loopback в адресе прокси заменяется на адрес,
  достижимый из контейнера браузера, с явной строкой в логе.
- accept_insecure_certs=True для обоих браузеров: scanner терминирует TLS своим CA.
- Проксирование loopback-целей: network.proxy.allow_hijacking_localhost у Firefox,
  --proxy-bypass-list=<-loopback> у Chrome.
- Убран --disable-web-security: к проксированию отношения не имеет, отключает
  same-origin policy и искажает поведение страницы (а без --user-data-dir Chrome его
  всё равно игнорирует).
- Grid: se:name / se:recordVideo (PK_SELENIUM_URL, PK_SELENIUM_VIDEO).
- shutdown(): идемпотентное завершение сессии для teardown прогона, не бросает исключения.
================================================================================
"""
