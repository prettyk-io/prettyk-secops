"""BrowserAdapter — управление состоянием браузера.
DSL-B6: убраны 20+ cdp_* методов. Оставлен cdp_command как escape hatch.
Было 757 строк, стало ≤200."""
import json
import logging
from pathlib import Path
from selenium.common.exceptions import (
    InvalidCookieDomainException, JavascriptException,
    UnableToSetCookieException, WebDriverException,
)

logger = logging.getLogger("orchestrator")


class BrowserAdapter:
    def __init__(self, webdriver_adapter):
        self.webdriver_adapter = webdriver_adapter

    @property
    def driver(self):
        return self.webdriver_adapter.driver if self.webdriver_adapter else None

    def _err(self, t, e): logger.warning("BrowserAdapter %s: %s", t, e)

    # ── CDP ESCAPE HATCH ──
    def cdp_command(self, cmd, params=None):
        """Сырая CDP-команда через Selenium execute_cdp_cmd."""
        d = self.driver
        if not d: return None
        if not hasattr(d, "execute_cdp_cmd"):
            bt = d.capabilities.get("browserName", "unknown") if d.capabilities else "?"
            logger.warning("BrowserAdapter CDP: unavailable for %s", bt)
            return None
        p = params or {}
        if isinstance(p, str):
            p = json.loads(p) if p.strip() else {}
        try:
            return d.execute_cdp_cmd(cmd, p)
        except WebDriverException as e:
            self._err("CDPCommandError", e)
            raise

    # ── COOKIES ──
    def get_cookie(self, n):
        try: return self.driver.get_cookie(n)
        except WebDriverException as e: self._err("get_cookie", e); return None

    def set_cookie(self, n, v, path="/", domain=None):
        c = {"name": n, "value": v, "path": path}; domain and c.update({"domain": domain})
        try: self.driver.add_cookie(c); return True
        except WebDriverException as e: self._err("set_cookie", e); return False

    def delete_cookie(self, n):
        try: self.driver.delete_cookie(n); return True
        except WebDriverException as e: self._err("delete_cookie", e); return False

    def clear_cookies(self):
        try: self.driver.delete_all_cookies(); return True
        except WebDriverException as e: self._err("clear_cookies", e); return False

    def get_all_cookies(self):
        try: return self.driver.get_cookies()
        except WebDriverException as e: self._err("get_cookies", e); return []

    def get_cookie_value(self, n):
        c = self.get_cookie(n); return c.get("value") if c else None

    def cookie_exists(self, n): return self.get_cookie(n) is not None

    def get_cookies_count(self): return len(self.get_all_cookies())

    def get_cookies_for_domain(self, domain):
        return [c for c in self.get_all_cookies() if c.get("domain") == domain]

    def add_cookie_full(self, n, v, path="/", domain=None,
                        secure=False, http_only=False, same_site=None):
        c = {"name": n, "value": v, "path": path, "secure": secure, "httpOnly": http_only}
        domain and c.update({"domain": domain})
        same_site and c.update({"sameSite": same_site})
        try: self.driver.add_cookie(c); return True
        except WebDriverException as e: self._err("add_cookie_full", e); return False

    def export_cookies_to_json(self, fn="cookies.json"):
        try: Path(fn).write_text(json.dumps(self.get_all_cookies(), indent=2), encoding="utf-8"); return fn
        except IOError as e: self._err("export_cookies", e); return None

    def import_cookies_from_json(self, fn="cookies.json"):
        try:
            for c in json.loads(Path(fn).read_text(encoding="utf-8")):
                c.get("expiry") and c.update({"expiry": int(c["expiry"])})
                try: self.driver.add_cookie(c)
                except Exception: continue
            return True
        except (IOError, json.JSONDecodeError) as e: self._err("import_cookies", e); return False

    # ── SESSION ──
    def get_session_id(self):
        try: return self.driver.session_id
        except WebDriverException: return None

    def get_session_capabilities(self):
        try: return self.driver.capabilities
        except WebDriverException: return {}

    def set_session_timeouts(self, implicit=10, page_load=30, script=30):
        d = self.driver; d.implicitly_wait(implicit)
        d.set_page_load_timeout(page_load); d.set_script_timeout(script); return True

    def get_session_timeouts(self):
        try: return self.driver.timeouts
        except (AttributeError, WebDriverException): return {}

    # ── STORAGE ──
    def _js(self, script, *args):
        try: return self.driver.execute_script(script, *args)
        except WebDriverException: return None

    def get_local_storage_item(self, k): return self._js(f"return localStorage.getItem('{k}');")
    def set_local_storage_item(self, k, v): return self._js(f"localStorage.setItem('{k}', '{v}');")
    def remove_local_storage_item(self, k): return self._js(f"localStorage.removeItem('{k}');")
    def clear_local_storage(self): return self._js("localStorage.clear();")
    def get_session_storage_item(self, k): return self._js(f"return sessionStorage.getItem('{k}');")
    def set_session_storage_item(self, k, v): return self._js(f"sessionStorage.setItem('{k}', '{v}');")
    def remove_session_storage_item(self, k): return self._js(f"sessionStorage.removeItem('{k}');")
    def clear_session_storage(self): return self._js("sessionStorage.clear();")

    def clear_state(self):
        try: self.driver.delete_all_cookies()
        except WebDriverException: pass
        self.clear_local_storage(); self.clear_session_storage(); return True

    # ── NETWORK CONDITIONS ──
    def set_network_conditions(self, offline=False, latency=0,
                               download_throughput=-1, upload_throughput=-1):
        d = self.driver
        if not d or not hasattr(d, "set_network_conditions"): return False
        try:
            d.set_network_conditions(offline=bool(offline), latency=int(latency),
                                     download_throughput=int(download_throughput),
                                     upload_throughput=int(upload_throughput))
            return True
        except WebDriverException: return False

    def get_network_conditions(self):
        d = self.driver
        if not d or not hasattr(d, "get_network_conditions"): return None
        try: return d.get_network_conditions()
        except WebDriverException: return None

    # ── BROWSER LOGS ──
    def get_browser_logs(self):
        if not self.driver: return []
        try: return list(self.driver.get_log("browser"))
        except WebDriverException: return []

    def get_console_errors(self):
        return [e for e in self.get_browser_logs()
                if str(e.get("level", "")).upper() in {"SEVERE", "ERROR"}
                or "error" in str(e.get("message", "")).lower()]

    def get_performance_logs(self):
        if not self.driver: return []
        try: return list(self.driver.get_log("performance"))
        except WebDriverException: return []