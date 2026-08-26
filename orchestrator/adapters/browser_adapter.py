"""
Адаптер для управления состоянием браузера:
куки, сессия, localStorage, sessionStorage, прокси,
а также Chrome DevTools Protocol (Selenium execute_cdp_cmd) и browser logs.
"""
import base64
import json
import logging
import os
import time
from pathlib import Path

from selenium.common.exceptions import (
    InvalidCookieDomainException,
    JavascriptException,
    NoSuchElementException,
    TimeoutException,
    UnableToSetCookieException,
    WebDriverException,
)

logger = logging.getLogger("orchestrator")


class BrowserAdapter:
    def __init__(self, webdriver_adapter):
        """
        Принимает WebDriverAdapter, чтобы использовать его драйвер.
        """
        self.webdriver_adapter = webdriver_adapter

    @property
    def driver(self):
        """Возвращает текущий драйвер из WebDriverAdapter."""
        if self.webdriver_adapter:
            return self.webdriver_adapter.driver
        return None

    # ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========

    def _get_browser_type(self):
        """Определяет тип браузера по capabilities."""
        if not self.driver:
            return None
        caps = self.driver.capabilities
        if 'browserName' in caps:
            return caps['browserName'].lower()
        return None

    def _safe_execute(self, func, default=None, *args, **kwargs):
        try:
            return func(*args, **kwargs)
        except (NoSuchElementException, TimeoutException, WebDriverException) as e:
            logger.debug(f"BrowserAdapter _safe_execute: {e}")
            return default
        except Exception as e:
            logger.warning(f"BrowserAdapter unexpected error: {e}")
            return default

    def _log_error(self, exc_type, exc):
        logger.warning(f"BrowserAdapter {exc_type}: {exc}")

    def _retry_on_exception(self, func, retries=3, delay=1, *args, **kwargs):
        last_exception = None
        for attempt in range(retries):
            try:
                return func(*args, **kwargs)
            except (NoSuchElementException, TimeoutException, WebDriverException) as e:
                last_exception = e
                if attempt < retries - 1:
                    time.sleep(delay)
                    continue
                raise
        raise last_exception

    # ========== ПРОКСИ (заглушки — не используются) ==========

    def set_proxy(self, host, port):
        """Заглушка: прокси устанавливается при старте драйвера."""
        logger.warning("set_proxy is not used; proxy is set at driver initialization")

    def disable_proxy(self):
        """Заглушка: прокси отключается только перезапуском драйвера."""
        logger.warning("disable_proxy is not used; proxy is set at driver initialization")

    # ========== КУКИ ==========

    def get_cookie(self, name):
        try:
            return self.driver.get_cookie(name)
        except WebDriverException as e:
            self._log_error("WebDriverException", e)
            return None

    def set_cookie(self, name, value, path="/", domain=None):
        cookie = {"name": name, "value": value, "path": path}
        if domain:
            cookie["domain"] = domain
        try:
            self.driver.add_cookie(cookie)
            return True
        except InvalidCookieDomainException as e:
            self._log_error("InvalidCookieDomainException", e)
            return False
        except UnableToSetCookieException as e:
            self._log_error("UnableToSetCookieException", e)
            return False
        except WebDriverException as e:
            self._log_error("WebDriverException", e)
            return False

    def delete_cookie(self, name):
        try:
            self.driver.delete_cookie(name)
            return True
        except WebDriverException as e:
            self._log_error("WebDriverException", e)
            return False

    def clear_cookies(self):
        try:
            self.driver.delete_all_cookies()
            return True
        except WebDriverException as e:
            self._log_error("WebDriverException", e)
            return False

    def get_all_cookies(self):
        try:
            return self.driver.get_cookies()
        except WebDriverException as e:
            self._log_error("WebDriverException", e)
            return []

    def get_cookie_value(self, name):
        cookie = self.get_cookie(name)
        return cookie.get("value") if cookie else None

    def cookie_exists(self, name):
        return self.get_cookie(name) is not None

    def get_cookies_count(self):
        cookies = self.get_all_cookies()
        return len(cookies) if cookies else 0

    def get_cookies_for_domain(self, domain):
        all_cookies = self.get_all_cookies()
        if not all_cookies:
            return []
        return [c for c in all_cookies if c.get("domain") == domain]

    def add_cookie_full(self, name, value, path="/", domain=None,
                        secure=False, http_only=False, same_site=None):
        cookie = {
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
            self.driver.add_cookie(cookie)
            return True
        except (InvalidCookieDomainException, UnableToSetCookieException, WebDriverException) as e:
            self._log_error("CookieError", e)
            return False

    def export_cookies_to_json(self, filename="cookies.json"):
        cookies = self.get_all_cookies()
        if not cookies:
            return None
        try:
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(cookies, f, indent=2)
            return filename
        except IOError as e:
            self._log_error("IOError", e)
            return None

    def import_cookies_from_json(self, filename="cookies.json"):
        try:
            with open(filename, "r", encoding="utf-8") as f:
                cookies = json.load(f)
            for cookie in cookies:
                if "expiry" in cookie:
                    cookie["expiry"] = int(cookie["expiry"])
                try:
                    self.driver.add_cookie(cookie)
                except Exception as e:
                    self._log_error("CookieImportError", e)
                    continue
            return True
        except (IOError, json.JSONDecodeError) as e:
            self._log_error("ImportError", e)
            return False

    # ========== СЕССИЯ ==========

    def get_session_id(self):
        try:
            return self.driver.session_id
        except WebDriverException as e:
            self._log_error("WebDriverException", e)
            return None

    def get_session_capabilities(self):
        try:
            return self.driver.capabilities
        except WebDriverException as e:
            self._log_error("WebDriverException", e)
            return {}

    def set_session_timeouts(self, implicit=10, page_load=30, script=30):
        try:
            self.driver.implicitly_wait(implicit)
            self.driver.set_page_load_timeout(page_load)
            self.driver.set_script_timeout(script)
            return True
        except WebDriverException as e:
            self._log_error("WebDriverException", e)
            return False

    def get_session_timeouts(self):
        try:
            return self.driver.timeouts
        except AttributeError:
            return {"implicit": 10, "page_load": 30, "script": 30}
        except WebDriverException as e:
            self._log_error("WebDriverException", e)
            return {}

    # ========== STORAGE ==========

    def _execute_script(self, script, *args):
        try:
            return self.driver.execute_script(script, *args)
        except JavascriptException as e:
            self._log_error("JavascriptException", e)
            return None
        except WebDriverException as e:
            self._log_error("WebDriverException", e)
            return None

    def get_local_storage_item(self, key):
        return self._execute_script(f"return localStorage.getItem('{key}');")

    def set_local_storage_item(self, key, value):
        return self._execute_script(f"localStorage.setItem('{key}', '{value}');")

    def remove_local_storage_item(self, key):
        return self._execute_script(f"localStorage.removeItem('{key}');")

    def clear_local_storage(self):
        return self._execute_script("localStorage.clear();")

    def get_local_storage_entries(self):
        """``Object.entries(localStorage)`` → list of [key, value] (S-1 replay)."""
        return self._execute_script("return Object.entries(localStorage);") or []

    def get_session_storage_item(self, key):
        return self._execute_script(f"return sessionStorage.getItem('{key}');")

    def set_session_storage_item(self, key, value):
        return self._execute_script(f"sessionStorage.setItem('{key}', '{value}');")

    def remove_session_storage_item(self, key):
        return self._execute_script(f"sessionStorage.removeItem('{key}');")

    def clear_session_storage(self):
        return self._execute_script("sessionStorage.clear();")

    def get_session_storage_entries(self):
        """``Object.entries(sessionStorage)`` → list of [key, value] (S-1 replay)."""
        return self._execute_script("return Object.entries(sessionStorage);") or []

    # ========== СОХРАНЕНИЕ/ВОССТАНОВЛЕНИЕ СОСТОЯНИЯ ==========

    def save_state(self, filename="browser_state.json"):
        """
        Сохраняет состояние браузера: куки, storage (если доступны), URL.
        Для data: и about: страниц storage не читаем.
        """
        try:
            current_url = self.driver.current_url
        except Exception:
            current_url = ""

        state = {
            "cookies": self.get_all_cookies(),
            "url": current_url,
        }

        # Читаем storage только для обычных страниц, не data: или about:
        if current_url and not current_url.startswith(("data:", "about:", "chrome://")):
            try:
                state["localStorage"] = self._execute_script("return Object.entries(localStorage);") or []
            except Exception:
                state["localStorage"] = []
            try:
                state["sessionStorage"] = self._execute_script("return Object.entries(sessionStorage);") or []
            except Exception:
                state["sessionStorage"] = []
        else:
            state["localStorage"] = []
            state["sessionStorage"] = []

        try:
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2)
            return filename
        except IOError as e:
            self._log_error("IOError", e)
            return None

    def _restore_cookies(self, cookies) -> None:
        self.clear_cookies()
        for cookie in cookies or []:
            if "expiry" in cookie:
                cookie["expiry"] = int(cookie["expiry"])
            try:
                self.driver.add_cookie(cookie)
            except Exception as e:
                self._log_error("CookieRestoreError", e)

    def _restore_navigation_url(self, url) -> str | None:
        if url and not url.startswith(("data:", "about:", "chrome://")):
            try:
                self.driver.get(url)
                return url
            except Exception as e:
                self._log_error("NavigateError", e)
                return None
        return None

    def _ensure_storage_origin(self, url) -> None:
        if url and not url.startswith(("data:", "about:", "chrome://")):
            return
        try:
            self.driver.get("about:blank")
        except Exception:
            pass

    def _restore_web_storage(self, state) -> None:
        for key, value in state.get("localStorage", []):
            self.set_local_storage_item(key, value)
        for key, value in state.get("sessionStorage", []):
            self.set_session_storage_item(key, value)

    def restore_state(self, filename="browser_state.json"):
        """
        Восстанавливает состояние браузера: куки, storage, URL.
        Перед восстановлением storage переходит на сохранённый URL,
        если он не data: или about:.
        """
        try:
            with open(filename, "r", encoding="utf-8") as f:
                state = json.load(f)
        except (IOError, json.JSONDecodeError) as e:
            self._log_error("RestoreError", e)
            return False

        self._restore_cookies(state.get("cookies", []))
        url = self._restore_navigation_url(state.get("url"))
        self._ensure_storage_origin(url)
        self._restore_web_storage(state)
        return True

    def clear_state(self):
        self.clear_cookies()
        self.clear_local_storage()
        self.clear_session_storage()

    # ========== DEVTOOLS / CDP (Selenium execute_cdp_cmd, Chromium) ==========
    #
    # Официальный путь Selenium 4: driver.execute_cdp_cmd(cmd, params).
    # Работает в Chrome/Edge (и Chromium в Selenoid). Firefox — не поддерживает CDP.
    # Событийный BiDi (async/trio) в PK не тянем: для сценариев хватает sync-команд
    # + get_log('browser') для консоли.

    def _parse_json_arg(self, value, default=None):
        """Конструктор передаёт аргументы строками — dict/list принимаем как JSON."""
        if value is None or value == "":
            return default if default is not None else {}
        if isinstance(value, (dict, list)):
            return value
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return default if default is not None else {}
            return json.loads(text)
        return value

    def _as_bool(self, value, default=False):
        if value is None or value == "":
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    def _as_number(self, value, default=0):
        if value is None or value == "":
            return default
        return float(value) if "." in str(value) else int(value)

    def _ensure_cdp(self):
        if not self.driver:
            logger.warning("BrowserAdapter CDP: driver is not initialized")
            return False
        if not hasattr(self.driver, "execute_cdp_cmd"):
            browser = self._get_browser_type() or "unknown"
            logger.warning(
                "BrowserAdapter CDP: execute_cdp_cmd unavailable for browser=%s "
                "(нужен Chromium/Chrome/Edge)",
                browser,
            )
            return False
        return True

    def cdp_command(self, cmd, params=None):
        """Сырая CDP-команда: Domain.method + JSON-параметры (escape hatch)."""
        if not self._ensure_cdp():
            return None
        payload = self._parse_json_arg(params, default={})
        if not isinstance(payload, dict):
            raise ValueError("cdp_command params must be a JSON object")
        try:
            return self.driver.execute_cdp_cmd(cmd, payload)
        except WebDriverException as e:
            self._log_error("CDPCommandError", e)
            raise

    def cdp_network_enable(self):
        """Включить домен Network (нужен перед частью network-команд)."""
        return self.cdp_command("Network.enable", {})

    def cdp_network_disable(self):
        """Выключить домен Network."""
        return self.cdp_command("Network.disable", {})

    def cdp_set_extra_headers(self, headers):
        """
        Доп. HTTP-заголовки ко всем запросам страницы.
        headers: JSON-объект, например {"Authorization":"Bearer …"}.
        """
        hdrs = self._parse_json_arg(headers, default={})
        if not isinstance(hdrs, dict):
            raise ValueError("headers must be a JSON object")
        self.cdp_network_enable()
        return self.cdp_command("Network.setExtraHTTPHeaders", {"headers": hdrs})

    def cdp_clear_extra_headers(self):
        """Сбросить доп. HTTP-заголовки."""
        self.cdp_network_enable()
        return self.cdp_command("Network.setExtraHTTPHeaders", {"headers": {}})

    def cdp_set_blocked_urls(self, urls):
        """
        Блокировать URL по glob-паттернам.
        urls: JSON-массив или строка через запятую (`*.png,*/analytics/*`).
        """
        if isinstance(urls, str) and not urls.strip().startswith("["):
            patterns = [u.strip() for u in urls.split(",") if u.strip()]
        else:
            patterns = self._parse_json_arg(urls, default=[])
        if not isinstance(patterns, list):
            raise ValueError("urls must be a JSON array or comma-separated string")
        self.cdp_network_enable()
        return self.cdp_command("Network.setBlockedURLs", {"urls": patterns})

    def cdp_clear_blocked_urls(self):
        """Снять блокировку URL."""
        self.cdp_network_enable()
        return self.cdp_command("Network.setBlockedURLs", {"urls": []})

    def cdp_set_cache_disabled(self, disabled=True):
        """Отключить/включить HTTP-кэш браузера."""
        self.cdp_network_enable()
        return self.cdp_command(
            "Network.setCacheDisabled",
            {"cacheDisabled": self._as_bool(disabled, True)},
        )

    def cdp_clear_browser_cache(self):
        """Очистить HTTP-кэш браузера через CDP."""
        self.cdp_network_enable()
        return self.cdp_command("Network.clearBrowserCache", {})

    def cdp_clear_browser_cookies(self):
        """Очистить cookies через CDP (все домены профиля)."""
        self.cdp_network_enable()
        return self.cdp_command("Network.clearBrowserCookies", {})

    def cdp_emulate_network(
        self,
        offline=False,
        latency=0,
        download_throughput=-1,
        upload_throughput=-1,
    ):
        """
        Эмуляция сети (Network.emulateNetworkConditions).
        throughput в байтах/сек; -1 = не ограничивать.
        """
        self.cdp_network_enable()
        return self.cdp_command(
            "Network.emulateNetworkConditions",
            {
                "offline": self._as_bool(offline, False),
                "latency": self._as_number(latency, 0),
                "downloadThroughput": self._as_number(download_throughput, -1),
                "uploadThroughput": self._as_number(upload_throughput, -1),
            },
        )

    def cdp_reset_network_conditions(self):
        """Сбросить эмуляцию сети к «онлайн без троттлинга»."""
        return self.cdp_emulate_network(
            offline=False,
            latency=0,
            download_throughput=-1,
            upload_throughput=-1,
        )

    def set_network_conditions(
        self,
        offline=False,
        latency=0,
        download_throughput=-1,
        upload_throughput=-1,
    ):
        """
        Эмуляция сети через ChromiumDriver.set_network_conditions
        (официальный Selenium API, если доступен).
        """
        if not self.driver:
            logger.warning("set_network_conditions: driver is not initialized")
            return False
        if not hasattr(self.driver, "set_network_conditions"):
            return self.cdp_emulate_network(
                offline, latency, download_throughput, upload_throughput
            )
        try:
            self.driver.set_network_conditions(
                offline=self._as_bool(offline, False),
                latency=self._as_number(latency, 0),
                download_throughput=self._as_number(download_throughput, -1),
                upload_throughput=self._as_number(upload_throughput, -1),
            )
            return True
        except WebDriverException as e:
            self._log_error("SetNetworkConditionsError", e)
            return False

    def get_network_conditions(self):
        """Текущие условия сети ChromiumDriver (если поддерживается)."""
        if not self.driver or not hasattr(self.driver, "get_network_conditions"):
            return None
        try:
            return self.driver.get_network_conditions()
        except WebDriverException as e:
            self._log_error("GetNetworkConditionsError", e)
            return None

    def cdp_set_user_agent(self, user_agent):
        """Подменить User-Agent (Network.setUserAgentOverride)."""
        self.cdp_network_enable()
        return self.cdp_command(
            "Network.setUserAgentOverride",
            {"userAgent": str(user_agent)},
        )

    def cdp_set_geolocation(self, latitude, longitude, accuracy=100):
        """Эмуляция геолокации."""
        return self.cdp_command(
            "Emulation.setGeolocationOverride",
            {
                "latitude": self._as_number(latitude, 0),
                "longitude": self._as_number(longitude, 0),
                "accuracy": self._as_number(accuracy, 100),
            },
        )

    def cdp_clear_geolocation(self):
        """Сбросить эмуляцию геолокации."""
        return self.cdp_command("Emulation.clearGeolocationOverride", {})

    def cdp_set_device_metrics(
        self,
        width,
        height,
        device_scale_factor=1,
        mobile=False,
    ):
        """Эмуляция viewport/device metrics (мобильный/десктопный размер)."""
        return self.cdp_command(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": int(self._as_number(width, 0)),
                "height": int(self._as_number(height, 0)),
                "deviceScaleFactor": self._as_number(device_scale_factor, 1),
                "mobile": self._as_bool(mobile, False),
            },
        )

    def cdp_clear_device_metrics(self):
        """Сбросить эмуляцию device metrics."""
        return self.cdp_command("Emulation.clearDeviceMetricsOverride", {})

    def cdp_set_timezone(self, timezone_id):
        """Эмуляция таймзоны (например Europe/Moscow)."""
        return self.cdp_command(
            "Emulation.setTimezoneOverride",
            {"timezoneId": str(timezone_id)},
        )

    def cdp_set_locale(self, locale):
        """Эмуляция locale (например ru-RU)."""
        return self.cdp_command(
            "Emulation.setLocaleOverride",
            {"locale": str(locale)},
        )

    def cdp_set_touch_emulation(self, enabled=True, max_touch_points=1):
        """Включить/выключить эмуляцию touch."""
        return self.cdp_command(
            "Emulation.setTouchEmulationEnabled",
            {
                "enabled": self._as_bool(enabled, True),
                "maxTouchPoints": int(self._as_number(max_touch_points, 1)),
            },
        )

    def cdp_add_init_script(self, script):
        """Скрипт, выполняемый до скриптов страницы на каждом новом документе."""
        return self.cdp_command(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": str(script)},
        )

    def cdp_reload(self, ignore_cache=False):
        """Перезагрузка страницы через CDP (опционально без кэша)."""
        return self.cdp_command(
            "Page.reload",
            {"ignoreCache": self._as_bool(ignore_cache, False)},
        )

    def cdp_stop_loading(self):
        """Остановить загрузку страницы."""
        return self.cdp_command("Page.stopLoading", {})

    def cdp_bring_to_front(self):
        """Вывести вкладку на передний план."""
        return self.cdp_command("Page.bringToFront", {})

    def cdp_set_download_behavior(self, behavior="allow", download_path=None):
        """
        Поведение загрузок: allow / deny / default.
        Для allow можно указать download_path.
        """
        params = {"behavior": str(behavior)}
        if download_path:
            path = str(Path(download_path).resolve())
            params["downloadPath"] = path
            os.makedirs(path, exist_ok=True)
        return self.cdp_command("Page.setDownloadBehavior", params)

    def cdp_capture_screenshot(self, filename="cdp_screenshot.png", full_page=False):
        """Скриншот через Page.captureScreenshot; возвращает путь к файлу."""
        params = {"format": "png", "fromSurface": True}
        if self._as_bool(full_page, False):
            params["captureBeyondViewport"] = True
        result = self.cdp_command("Page.captureScreenshot", params) or {}
        data = result.get("data")
        if not data:
            return None
        out = Path(filename)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(base64.b64decode(data))
        return str(out)

    def cdp_performance_enable(self):
        """Включить домен Performance."""
        return self.cdp_command("Performance.enable", {})

    def cdp_performance_disable(self):
        """Выключить домен Performance."""
        return self.cdp_command("Performance.disable", {})

    def cdp_get_performance_metrics(self):
        """Снять performance-метрики (dict name→value)."""
        self.cdp_performance_enable()
        result = self.cdp_command("Performance.getMetrics", {}) or {}
        metrics = result.get("metrics") or []
        return {item.get("name"): item.get("value") for item in metrics if "name" in item}

    def cdp_ignore_certificate_errors(self, ignore=True):
        """Игнорировать ошибки сертификатов на уровне CDP Security."""
        return self.cdp_command(
            "Security.setIgnoreCertificateErrors",
            {"ignore": self._as_bool(ignore, True)},
        )

    def cdp_evaluate(self, expression, return_by_value=True):
        """Выполнить JS через Runtime.evaluate; вернуть result.value при возможности."""
        self.cdp_command("Runtime.enable", {})
        result = self.cdp_command(
            "Runtime.evaluate",
            {
                "expression": str(expression),
                "returnByValue": self._as_bool(return_by_value, True),
                "awaitPromise": True,
            },
        ) or {}
        remote = result.get("result") or {}
        if "value" in remote:
            return remote["value"]
        return remote

    def get_browser_logs(self):
        """
        Логи консоли браузера через Selenium get_log('browser').
        Требует goog:loggingPrefs при старте Chrome (включается в WebDriverAdapter).
        """
        if not self.driver:
            return []
        try:
            return list(self.driver.get_log("browser"))
        except WebDriverException as e:
            self._log_error("BrowserLogsError", e)
            return []

    def get_console_errors(self):
        """Только записи уровня SEVERE/ERROR из browser log."""
        logs = self.get_browser_logs()
        errors = []
        for entry in logs:
            level = str(entry.get("level", "")).upper()
            message = str(entry.get("message", ""))
            if level in {"SEVERE", "ERROR"} or "error" in message.lower():
                errors.append(entry)
        return errors

    def get_performance_logs(self):
        """Performance log Selenium (если включён goog:loggingPrefs.performance)."""
        if not self.driver:
            return []
        try:
            return list(self.driver.get_log("performance"))
        except WebDriverException as e:
            self._log_error("PerformanceLogsError", e)
            return []
