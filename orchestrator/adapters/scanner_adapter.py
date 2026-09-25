"""
Адаптер для OWASP scanner API.
"""
from utils.env_dual import pk_env
import json
import logging
import os
import time
from pathlib import Path

import requests
from zapv2 import ZAPv2 as zapv2
from core.errors import WiredError, scannerApiError
from utils.paths import RUNS_DIR, scanner_report_path
from .base_adapter import BaseAdapter
from utils.reporter import attach_scanner_html, coerce_attach_flag

logger = logging.getLogger("orchestrator")

# STAB-2: zapv2 session.request/urlopen без timeout → hang. Env переопределяет.
DEFAULT_scanner_API_TIMEOUT_SEC = 60.0
# Host reports/runs mounted in scanner container (docker-compose.scanner.yml).
DEFAULT_scanner_HAR_CONTAINER_ROOT = "/scanner/wrk/pk-runs"


def scanner_api_timeout_seconds() -> float:
    raw = (pk_env("SCANNER_API_TIMEOUT") or "").strip()
    if not raw:
        return DEFAULT_scanner_API_TIMEOUT_SEC
    try:
        return max(1.0, float(raw))
    except (TypeError, ValueError):
        return DEFAULT_scanner_API_TIMEOUT_SEC


def har_sequence_live_enabled() -> bool:
    """IMP-HAR-4: live scanner importHar + sequence activeScan (opt-in)."""
    raw = (pk_env("HAR_SEQUENCE_LIVE") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


# SCAN-DEPTH: статик-мусор, который раздувает scope активного скана. SPA-рекурсия
# (`/assets/public/assets/public/…`), source-maps и node_modules дают тысячи узлов,
# на которых active scan тонет и не доходит до реальных injection-точек (например
# `/rest/products/search` на Juice Shop). Исключаем из контекста до атаки.
ACTIVE_SCAN_NOISE_EXCLUDES: tuple = (
    r".*\.(js|css|ico|png|jpe?g|gif|svg|woff2?|ttf|eot|map|webp|avif)(\?.*)?$",
    r".*/node_modules/.*",
    r".*/assets/.*",
    r".*/\.well-known/.*",
)


def scanner_har_file_for_api(host_path: str) -> str:
    """
    Map host HAR path under reports/runs to the path scanner Docker sees.

    Env ``PK_SCANNER_HAR_ROOT`` overrides container mount root (default
    ``/scanner/wrk/pk-runs``). Paths outside RUNS_DIR are returned unchanged.
    """
    raw = (host_path or "").strip()
    if not raw:
        return raw
    try:
        host = os.path.realpath(raw)
        runs_root = os.path.realpath(str(RUNS_DIR))
    except OSError:
        return raw
    if host == runs_root or host.startswith(runs_root + os.sep):
        rel = os.path.relpath(host, runs_root).replace("\\", "/")
        container_root = (
            pk_env("SCANNER_HAR_ROOT") or DEFAULT_scanner_HAR_CONTAINER_ROOT
        ).rstrip("/")
        return f"{container_root}/{rel}"
    return host


class ScannerAdapter(BaseAdapter):
    def __init__(
        self,
        host="127.0.0.1",
        port=8080,
        api_key=None,
        base_url=None,
        allowed_extra_domains=None,
    ):
        super().__init__(driver=None)
        self.host = host
        self.port = port
        self.api_key = api_key
        self.context_name = None
        self._scanner = None
        self._connected = False
        self.base_url = (base_url or "").strip()
        self.allowed_extra_domains = (allowed_extra_domains or "").strip()
        self._api_timeout = scanner_api_timeout_seconds()
        self._active_run_wired = None
        self._wired_dir = None

        self.spider_timeout = 10
        self.ajax_spider_timeout = 15
        self.client_spider_timeout = 15
        self.active_scan_timeout = 30
        # SCAN-EXPORT-GAP: честность таймаута — обрезанный скан не выдаётся за полный.
        self.active_scan_truncated = False
        # SCAN-DEPTH: aggressive depth (High/Low) применяется один раз на процесс.
        self._active_scan_hardened = False
        self._scope_excluded_contexts = set()
        # Если прогресс паука не меняется столько секунд — гасим (антизависание).
        self.spider_stall_seconds = 60

    @staticmethod
    def _as_timeout_minutes(value, default):
        """Таймаут в минутах: int или float (например 0.5 = 30 сек)."""
        if value is None or value == "":
            return float(default)
        return float(value)

    @staticmethod
    def _coerce_bool(value, default=False):
        if value is None or value == "":
            return bool(default)
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in ("1", "true", "yes", "да", "on"):
            return True
        if text in ("0", "false", "no", "нет", "off"):
            return False
        return bool(default)

    @staticmethod
    def _zap_private(instance, base_name, default=None):
        """Читает приватный атрибут zapv2-клиента по обоим вариантам name-mangling.

        Актуальный пакет: class ZAPv2 -> self.__proxies mangled в _ZAPv2__proxies.
        Старые форки были class zapv2 -> _zapv2__proxies. Живой объект (не мок) отдаёт
        только первый вариант; читаем оба, чтобы не ловить AttributeError на реальном клиенте.
        """
        for candidate in (f"_ZAPv2__{base_name}", f"_zapv2__{base_name}"):
            if hasattr(instance, candidate):
                return getattr(instance, candidate)
        return default

    @staticmethod
    def _install_api_timeouts(scanner, timeout: float) -> None:
        """Подставить timeout в zapv2._request_api / urlopen (без форка пакета)."""
        proxies = ScannerAdapter._zap_private(scanner, "proxies") or {}
        apikey = ScannerAdapter._zap_private(scanner, "apikey")
        validate = ScannerAdapter._zap_private(scanner, "validate_status_code", False)

        def _request_api(url, query=None, method="GET", body=None):
            # zapv2 шлёт API-URL с хостом `zap` (http://zap/JSON/...); legacy-форки — `scanner`.
            # Принимаем оба, чтобы timeout-патч был совместим с реальным пакетом.
            if not (url.startswith("http://zap/") or url.startswith("http://scanner/")):
                raise ValueError("A non scanner API url was specified " + url)
            with requests.Session() as session:
                if apikey is not None:
                    session.headers["X-ZAP-API-Key"] = apikey
                response = session.request(
                    method,
                    url,
                    params=query,
                    data=body,
                    proxies=proxies,
                    verify=False,
                    timeout=timeout,
                )
            if validate and 300 <= response.status_code < 500:
                raise scannerApiError(
                    "Non-successful status code returned from scanner, which indicates "
                    f"a bad request: {response.status_code} response: {response.text}"
                )
            if validate and response.status_code >= 500:
                raise scannerApiError(
                    "Non-successful status code returned from scanner, which indicates "
                    f"a scanner internal error: {response.status_code} response: {response.text}"
                )
            return response

        def _urlopen(url, *args, **kwargs):
            kwargs.setdefault("timeout", timeout)
            kwargs.setdefault("proxies", proxies)
            kwargs.setdefault("verify", False)
            return requests.get(url, *args, **kwargs).text

        scanner._request_api = _request_api
        scanner.urlopen = _urlopen

    def _ensure_connected(self):
        if self._connected:
            return
        if self._scanner is None:
            api = f"http://{self.host}:{self.port}"
            # zapv2: API-вызовы идут через proxies на сам scanner (не системный proxy ОС).
            self._scanner = zapv2(
                apikey=self.api_key,
                proxies={"http": api, "https": api},
            )
            self._api_timeout = scanner_api_timeout_seconds()
        # Идемпотентная подмена urlopen/_request_api с timeout. Падение установки
        # НЕ должно оставлять _scanner полу-битым (_connected=False при живом клиенте,
        # у которого urlopen остался без timeout). При ошибке сбрасываем клиент целиком.
        if self._scanner is not None and not getattr(self._scanner, "_pk_timeout_installed", False):
            try:
                self._install_api_timeouts(self._scanner, self._api_timeout)
            except Exception as e:
                self._scanner = None
                self._connected = False
                logger.error("scanner API timeout install failed: %s", e)
                raise
            self._scanner._pk_timeout_installed = True
            logger.debug("scanner API client timeout=%ss", self._api_timeout)
        try:
            self._scanner.core.version
            self._connected = True
            logger.info(f"Connected to scanner at {self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Failed to connect to scanner: {e}")
            raise
        # BOX-LIVE-4: свежая сессия на каждый прогон. Без сброса ZAP копит alerts между
        # run'ами (21 600+), и _fetch_alerts_paginated упирается в глубокий slice
        # `start=21600` → ProxyError → рестарт контейнера. Сброс строго один раз на процесс
        # (при reconnect-е посреди прогона НЕ сбрасываем: накопление внутри run валидно).
        if not getattr(self, "_alerts_reset_once", False):
            self.reset_alerts()
            self._alerts_reset_once = True

    # ========== LOCAL SERVERS (Network add-on) ==========

    def add_local_server(self, port, address="0.0.0.0"):
        """
        Поднимает дополнительный Local Server scanner (Network API addLocalServer)
        с API и Proxy на указанном порту.

        Main-порт раннера (по умолчанию 8080, для zapv2) не меняется.
        Штатный browser proxy — отдельный порт (по умолчанию 8099).

        Keyword: scanner|add_local_server|<port>[|<address>]
        """
        self._ensure_connected()
        port = int(port)
        address = address or "0.0.0.0"
        params = {
            "address": address,
            "port": str(port),
            "api": "true",
            "proxy": "true",
        }
        try:
            network = getattr(self._scanner, "network", None)
            if network is not None and hasattr(network, "add_local_server"):
                result = network.add_local_server(**params)
            else:
                from urllib.parse import urlencode

                result = self._scanner.urlopen(
                    f"http://scanner/JSON/network/action/addLocalServer/?{urlencode(params)}"
                )
        except Exception as e:
            # Повторный прогон / уже поднятый слушатель — не валим старт.
            msg = str(e).lower()
            if "already" in msg or "exist" in msg or "in use" in msg:
                logger.warning(
                    "scanner local server %s:%s already present (%s); continue",
                    address,
                    port,
                    e,
                )
                return {"address": address, "port": port, "api": True, "proxy": True, "result": "exists"}
            logger.error(
                "Failed to add local server %s:%s (api+proxy): %s",
                address,
                port,
                e,
            )
            raise
        logger.info("scanner local server added: %s:%s (api+proxy)", address, port)
        return {"address": address, "port": port, "api": True, "proxy": True, "result": result}

    # ========== УПРАВЛЕНИЕ КОНТЕКСТОМ ==========

    def create_context(self, context_name, description=""):
        self._ensure_connected()
        self._scanner.context.new_context(context_name)
        self.context_name = context_name
        return context_name

    def delete_context(self, context_name):
        self._ensure_connected()
        self._scanner.context.remove_context(context_name)
        if self.context_name == context_name:
            self.context_name = None

    def switch_context(self, context_name):
        self._ensure_connected()
        try:
            self._get_context_id(context_name)
        except ValueError:
            raise ValueError(f"Context '{context_name}' not found")
        self.context_name = context_name
        logger.info(f"Switched to context: {context_name}")

    def list_contexts(self):
        self._ensure_connected()
        contexts = self._scanner.context.context_list
        if contexts and isinstance(contexts[0], dict):
            return [ctx.get("name") for ctx in contexts]
        else:
            return contexts

    def archive_context(self, context_name):
        self._ensure_connected()
        self._scanner.context.remove_context(context_name)
        if self.context_name == context_name:
            self.context_name = None
        logger.info(f"Context '{context_name}' archived (removed)")

    def clear_context(self):
        self.context_name = None
        logger.info("Current context cleared")

    @staticmethod
    def _strip_include_regex_suffix(pattern: str) -> str:
        """http://host:3000.* → http://host:3000 для allowlist-проверки."""
        s = (pattern or "").strip()
        while s.endswith(".*"):
            s = s[:-2]
        while s.endswith("*"):
            s = s[:-1]
        return s.rstrip("/")

    def _context_include_allowed(self, url_pattern: str) -> bool:
        from utils.allowed_urls import url_allowed

        probe = self._strip_include_regex_suffix(url_pattern)
        if not probe.startswith(("http://", "https://")):
            return False
        allow = getattr(self, "allowed_extra_domains", "") or ""
        if url_allowed(probe, allow):
            return True
        base = (getattr(self, "base_url", "") or "").strip()
        if not base:
            return False
        if url_allowed(probe, base):
            return True
        bp = base.rstrip("/")
        return probe == bp or probe.startswith(bp + "/") or bp.startswith(probe)

    def set_context_include(self, context_name, regex=None):
        """
        ВключитьВКонтекст:
          • только context → include base_url;
          • http(s)… → allowlist (+ base_url как разрешённый origin);
          • иначе → ошибка формата.
        """
        raw = "" if regex is None else str(regex).strip()
        self._ensure_connected()
        if not raw:
            base = (self.base_url or "").strip()
            if not base:
                raise WiredError(
                    "ВключитьВКонтекст без URL: нужен security_configuration.base_url_override"
                )
            regexes = self.domains_csv_to_include_regexes(base)
            for rx in regexes:
                self._scanner.context.include_in_context(context_name, rx)
            logger.info(
                "Context %s include ← base_url (%s regex)",
                context_name,
                len(regexes),
            )
            return
        if not raw.startswith(("http://", "https://")):
            raise WiredError(
                "ВключитьВКонтекст: URL должен начинаться с http:// или https:// "
                "(или без URL — тогда base_url)"
            )
        from utils.allowed_urls import ALLOWED_URL_DENY_MSG

        if not self._context_include_allowed(raw):
            raise WiredError(ALLOWED_URL_DENY_MSG)
        self._scanner.context.include_in_context(context_name, raw)

    def set_context_exclude(self, context_name, regex):
        self._ensure_connected()
        self._scanner.context.exclude_from_context(context_name, regex)

    @staticmethod
    def domains_csv_to_include_regexes(domains_csv: str) -> list:
        """
        Домены/URL (`|` или `,`) → regex для include_in_context.
        ``*.internal.bank`` → https?:// host-wildcard; полный URL → escaped prefix.
        """
        import re

        from utils.allowed_urls import parse_allowed_url_tokens

        out = []
        for token in parse_allowed_url_tokens(domains_csv):
            if token.startswith("*.") and "://" not in token:
                # *.foo.bar → любой поддомен foo.bar
                base = token[2:]
                esc = re.escape(base).replace(r"\*", r"[^.]+")
                out.append(rf"https?://([^.]+\\.)*({esc})(:\\d+)?/.*")
                continue
            if "://" in token:
                # URL / prefix → regex с опциональным хвостом
                esc = re.escape(token.rstrip("/"))
                out.append(esc + r"(/.*)?")
                continue
            # bare host
            esc = re.escape(token)
            out.append(rf"https?://{esc}(:\\d+)?/.*")
        return out

    def apply_allowed_domains(self, context_name, domains_csv):
        """
        Явно применить CSV ``allowed_extra_domains`` (или любой CSV) в context include.
        Без авто из манифеста — только шаг / MethodId ``ПрименитьДомены``.
        """
        from utils.allowed_urls import ALLOWED_URL_DENY_MSG, parse_allowed_url_tokens, url_allowed

        allow = getattr(self, "allowed_extra_domains", "") or ""
        base = (getattr(self, "base_url", "") or "").strip()
        for token in parse_allowed_url_tokens(domains_csv):
            probe = token
            if probe.startswith("*.") and "://" not in probe:
                probe = f"https://probe.{probe[2:]}"
            elif "://" not in probe:
                probe = f"https://{probe}"
            if not url_allowed(probe, allow) and not url_allowed(probe, base):
                raise WiredError(ALLOWED_URL_DENY_MSG)
        regexes = self.domains_csv_to_include_regexes(domains_csv)
        self._ensure_connected()
        for rx in regexes:
            self._scanner.context.include_in_context(context_name, rx)
        logger.info(
            "Applied %s domain include(s) to context %s",
            len(regexes),
            context_name,
        )
        return len(regexes)

    def set_context_auth(self, context_name, login_url, login_post_data, logout_url=None, auth_method="formBasedAuthentication"):
        self._ensure_connected()
        self._scanner.authentication.set_authentication_method(
            context_name,
            auth_method,
            f"loginUrl={login_url}&loginRequestData={login_post_data}"
        )
        if logout_url:
            self._scanner.authentication.set_logout_url(context_name, logout_url)

    def set_http_authentication(self, context_name, hostname, realm="", port="80"):
        """Context auth method: HTTP Basic (Authentication API)."""
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        params = f"hostname={hostname}&realm={realm}&port={port}"
        self._scanner.authentication.set_authentication_method(
            context_id, "httpAuthentication", params
        )
        logger.info(
            "HTTP authentication set: context=%s host=%s port=%s",
            context_name,
            hostname,
            port,
        )

    def set_browser_based_auth(
        self,
        context_name,
        login_page_url,
        browser_id="firefox-headless",
        login_page_wait=5,
    ):
        """
        Authentication Helper: browser-based login (G-36).
        Требует add-on Authentication Helper в scanner.
        """
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        params = (
            f"loginPageUrl={login_page_url}"
            f"&loginPageWait={login_page_wait}"
            f"&browserId={browser_id}"
        )
        self._scanner.authentication.set_authentication_method(
            context_id, "browserBasedAuthentication", params
        )
        logger.info(
            "Browser-based auth: context=%s login=%s browser=%s",
            context_name,
            login_page_url,
            browser_id,
        )

    def set_auth_verification_autodetect(self, context_name):
        """Session verification = autodetect (Auth Helper)."""
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        # zapv2: set_authentication_verification(contextid, method, …)
        try:
            self._scanner.authentication.set_authentication_verification(
                context_id, "autodetect"
            )
        except TypeError:
            self._scanner.authentication.set_authentication_verification(
                contextid=context_id,
                method="autodetect",
            )
        logger.info("Auth verification=autodetect for %s", context_name)

    def set_session_management_autodetect(self, context_name):
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        try:
            self._scanner.sessionManagement.set_session_management_method(
                context_id, "autodetect", ""
            )
        except TypeError:
            self._scanner.sessionManagement.set_session_management_method(
                contextid=context_id,
                methodname="autodetect",
                methodconfigparams="",
            )
        logger.info("Session management=autodetect for %s", context_name)

    def _ensure_auth_context(self, context_name: str, base_url: str = "") -> None:
        try:
            self._get_context_id(context_name)
        except Exception:
            self.create_context(context_name)
            logger.info("Created context %s for ПрименитьAuth", context_name)
        if not (base_url or "").strip():
            return
        for rx in self.domains_csv_to_include_regexes(base_url.strip()):
            try:
                self.set_context_include(context_name, rx)
            except Exception as exc:
                logger.debug("include %s: %s", rx, exc)

    @staticmethod
    def _parse_auth_resolve_notes(auth_resolve_notes_json) -> list:
        import json

        if not (auth_resolve_notes_json or "").strip():
            return []
        try:
            parsed = json.loads(str(auth_resolve_notes_json))
            if isinstance(parsed, list):
                return [str(n) for n in parsed]
        except json.JSONDecodeError:
            pass
        return [str(auth_resolve_notes_json)]

    @staticmethod
    def _parse_auth_applications(auth_applications_json) -> list:
        import json

        if not (auth_applications_json or "").strip():
            return []
        try:
            parsed = json.loads(str(auth_applications_json))
        except json.JSONDecodeError as exc:
            raise WiredError(f"ПрименитьAuth: auth_applications_json: {exc}") from exc
        if not isinstance(parsed, list):
            return []
        return [a for a in parsed if isinstance(a, dict)]

    @staticmethod
    def _auth_details_from_json(auth_details_json) -> dict:
        import json

        if isinstance(auth_details_json, dict):
            return dict(auth_details_json)
        if auth_details_json in (None, ""):
            return {}
        return json.loads(str(auth_details_json))

    def _apply_wired_auth_compose(
        self, context_name, apps, resolve_notes, base_url=""
    ):
        from core.auth_bootstrap import apply_scanner_auth

        merged = {
            "applied": False,
            "auth_type": "compose",
            "notes": list(resolve_notes),
            "profiles": [],
            "context_name": context_name,
        }
        any_ok = False
        for app in apps:
            one = apply_scanner_auth(
                scanner_adapter=self,
                context_name=context_name,
                auth_type=app.get("auth_type") or "",
                auth_details=dict(app.get("auth_details") or {}),
                base_url=base_url or "",
            )
            per = {
                "auth_type": one.get("auth_type") or app.get("auth_type") or "",
                "applied": bool(one.get("applied")),
                "notes": list(one.get("notes") or []),
                "module_id": app.get("module_id") or "",
            }
            if one.get("error"):
                per["error"] = one["error"]
            merged["profiles"].append(per)
            merged["notes"].extend(per["notes"])
            if per["applied"]:
                any_ok = True
        merged["applied"] = any_ok
        if not any_ok and not merged["notes"]:
            merged["notes"].append("compose: ни один scanner-профиль не применён")
        soft = any("только шагами" in n for n in merged["notes"])
        err = next((p.get("error") for p in merged["profiles"] if p.get("error")), None)
        if err and not any_ok and not soft:
            raise WiredError(
                f"ПрименитьAuth: {err} ({'; '.join(merged['notes'])})"
            )
        return merged

    def apply_wired_auth(
        self,
        context_name,
        auth_type="",
        auth_details_json="",
        base_url="",
        module_id="",
        auth_applications_json="",
        auth_resolve_notes_json="",
    ):
        """
        Явный шаг G-36: security_configuration / auth-модуль → scanner.
        MethodId: ``scanner ПрименитьAuth <context> [module_id]``.
        Пустые auth_* обычно дополняет Controller (в т.ч. CSV/compose resolve).
        """
        from core.auth_bootstrap import apply_scanner_auth

        del module_id  # enrichment in Controller._enrich_scanner_manifest_params
        self._ensure_connected()
        self._ensure_auth_context(context_name, base_url)

        resolve_notes = self._parse_auth_resolve_notes(auth_resolve_notes_json)
        apps = self._parse_auth_applications(auth_applications_json)
        if apps:
            return self._apply_wired_auth_compose(
                context_name, apps, resolve_notes, base_url=base_url
            )

        if resolve_notes and not (auth_type or "").strip():
            return {
                "applied": False,
                "auth_type": "",
                "notes": resolve_notes,
                "context_name": context_name,
            }

        result = apply_scanner_auth(
            scanner_adapter=self,
            context_name=context_name,
            auth_type=auth_type,
            auth_details=self._auth_details_from_json(auth_details_json),
            base_url=base_url or "",
        )
        notes = resolve_notes + list(result.get("notes") or [])
        result["notes"] = notes
        # SSO/Helper skip — Honest Contract note, не WiredError.
        soft = any("только шагами" in n for n in notes)
        if result.get("error") and not result.get("applied") and not soft:
            raise WiredError(
                f"ПрименитьAuth: {result['error']} ({'; '.join(notes)})"
            )
        return result

    @staticmethod
    def _af_plan_overrides_from_make_wired(wired, base_url, scan_policy):
        sec = wired.get("security_configuration") or {}
        infra = wired.get("infrastructure") or {}
        if not (base_url or "").strip():
            base_url = str(
                (infra.get("base_url_override") if isinstance(infra, dict) else None)
                or (sec.get("base_url_override") if isinstance(sec, dict) else None)
                or ""
            ).strip()
        if not (scan_policy or "").strip() or scan_policy == "custom_policy":
            scan_policy = str(
                (sec.get("scan_policy") if isinstance(sec, dict) else None)
                or scan_policy
                or "custom_policy"
            )
        return base_url, scan_policy

    def generate_automation_plan(
        self,
        output_path,
        base_url="",
        context_name="pk_ctx",
        scan_policy="custom_policy",
        wired_json="",
        manifest_json="",
    ):
        """
        Записать AF YAML на диск (без runPlan). MethodId: СгенерироватьПлан.
        """
        from pathlib import Path
        from core.af_plan import write_af_plan

        path = Path(str(output_path))
        wired = None
        raw_json = wired_json or manifest_json
        if (raw_json or "").strip():
            try:
                wired = json.loads(raw_json)
            except json.JSONDecodeError as exc:
                raise WiredError(f"СгенерироватьПлан: wired_json: {exc}") from exc
            base_url, scan_policy = self._af_plan_overrides_from_make_wired(
                wired, base_url, scan_policy
            )

        if wired is None and not (base_url or "").strip():
            raise WiredError(
                "СгенерироватьПлан: нужен base_url (или infrastructure / wired_json)"
            )
        out = write_af_plan(
            path,
            base_url=(base_url or "").strip(),
            context_name=context_name or "pk_ctx",
            scan_policy=scan_policy or "custom_policy",
            report_file=path.stem,
            wired=wired,
        )
        logger.info("AF plan written: %s", out)
        return str(out)

    # ========== ВСПОМОГАТЕЛЬНЫЙ МЕТОД ДЛЯ ПОЛУЧЕНИЯ ID КОНТЕКСТА ==========

    def _get_context_id(self, context_name):
        """
        Возвращает ID контекста по его имени.
        Работает как со списком словарей, так и со списком строк.
        """
        self._ensure_connected()
        contexts = self._scanner.context.context_list

        if contexts and isinstance(contexts[0], dict):
            for ctx in contexts:
                if ctx.get("name") == context_name:
                    ctx_id = ctx.get("id")
                    logger.debug(f"Found context ID: {ctx_id} for {context_name}")
                    return ctx_id
        else:
            import requests
            url = f"http://{self.host}:{self.port}/JSON/context/view/context/"
            params = {"contextName": context_name}
            try:
                resp = requests.get(url, params=params, timeout=10)
                resp.raise_for_status()
                data = resp.json()
                context_obj = data.get("context")
                if context_obj:
                    ctx_id = context_obj.get("id")
                    logger.debug(f"Found context ID via API: {ctx_id} for {context_name}")
                    return ctx_id
            except Exception as e:
                logger.error(f"Failed to get context ID via API: {e}")
                raise ValueError(f"Context '{context_name}' not found")
        raise ValueError(f"Context '{context_name}' not found")

    # ========== HTTP REQUEST THROUGH scanner ==========

    @staticmethod
    def _build_har_request(method, url, headers=None, body=None) -> dict:
        request = {
            "method": (method or "GET").upper(),
            "url": url,
            "httpVersion": "HTTP/1.1",
            "headers": [{"name": k, "value": v} for k, v in (headers or {}).items()],
            "queryString": [],
            "cookies": [],
            "headersSize": -1,
            "bodySize": -1,
        }
        if body is not None and body != "":
            text = body if isinstance(body, str) else str(body)
            request["postData"] = {"mimeType": "application/json", "text": text}
            request["bodySize"] = len(text.encode("utf-8"))
        return request

    @staticmethod
    def _parse_send_har_payload(raw):
        if isinstance(raw, str):
            try:
                response_har = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise WiredError(
                    f"scanner sendHarRequest: не JSON ({exc}): {raw[:200]!r}"
                ) from exc
        elif isinstance(raw, dict):
            response_har = raw
        else:
            raise WiredError(
                f"scanner sendHarRequest: неожиданный тип {type(raw).__name__}"
            )
        if isinstance(response_har, dict) and response_har.get("code"):
            raise WiredError(
                f"scanner sendHarRequest: {response_har.get('code')} "
                f"{response_har.get('message') or ''}".strip()
            )
        return response_har

    @staticmethod
    def _decode_har_response_body(resp: dict) -> tuple[int, dict, str]:
        import base64

        status = int(resp.get("status") or 0)
        resp_headers = {
            h["name"]: h["value"] for h in (resp.get("headers") or []) if "name" in h
        }
        content = resp.get("content") or {}
        body_text = content.get("text") or ""
        if str(content.get("encoding") or "").lower() == "base64" and body_text:
            try:
                body_text = base64.b64decode(body_text).decode(
                    "utf-8", errors="replace"
                )
            except Exception:
                pass
        return status, resp_headers, body_text

    def scanner_http_request(self, method, url, headers=None, body=None, follow_redirects=True):
        """HTTP через scanner core.sendHarRequest (HAR entry JSON).

        scanner 2.17 ждёт строку JSON ``{"request":{...}}``, не плоский dict.
        Ответ — HAR log; тело часто ``encoding=base64``.
        """
        self._ensure_connected()
        request = self._build_har_request(method, url, headers=headers, body=body)
        follow = "true" if follow_redirects else "false"
        raw = self._scanner.core.send_har_request(json.dumps({"request": request}), follow)
        response_har = self._parse_send_har_payload(raw)
        try:
            entry = response_har["log"]["entries"][0]
            resp = entry["response"]
        except (KeyError, IndexError, TypeError) as exc:
            raise WiredError(
                f"scanner sendHarRequest: нет response в HAR: {str(response_har)[:200]}"
            ) from exc
        status, resp_headers, body_text = self._decode_har_response_body(resp)
        return {
            "status": status,
            "headers": resp_headers,
            "body": body_text,
            "raw": response_har,
        }

    def scanner_http_raw_request(self, raw_request, follow_redirects=True):
        self._ensure_connected()
        response_raw = self._scanner.core.send_request(raw_request, follow_redirects)
        lines = response_raw.splitlines()
        status_line = lines[0] if lines else ""
        headers = {}
        body_lines = []
        in_headers = True
        for line in lines[1:]:
            if in_headers and line.strip() == "":
                in_headers = False
                continue
            if in_headers:
                if ": " in line:
                    key, value = line.split(": ", 1)
                    headers[key] = value
            else:
                body_lines.append(line)
        return {
            "status": int(status_line.split(" ")[1]) if status_line else 0,
            "headers": headers,
            "body": "\n".join(body_lines),
            "raw": response_raw
        }

    # ========== HAR IMPORT ==========

    def import_har_sequence(self, name, har_file_path, assert_code=True, assert_length=None):
        """Импорт последовательности HAR: путь в API scanner, без полной загрузки файла в память."""
        self._ensure_connected()
        try:
            if not os.path.isfile(har_file_path):
                raise FileNotFoundError(har_file_path)
            scanner_path = scanner_har_file_for_api(har_file_path)
            payload = {
                "name": name,
                "harFile": scanner_path,
                "assertCode": "true" if assert_code else "false",
            }
            if assert_length is not None:
                payload["assertLength"] = str(assert_length)
            self._scanner.urlopen("https://scanner/json/sequence/action/importHar/", data=payload)
            logger.info(
                "Imported HAR sequence: %s (host=%s scanner=%s)",
                name,
                har_file_path,
                scanner_path,
            )
            return True
        except Exception as e:
            logger.error(f"Failed to import HAR sequence: {e}")
            return False

    def sequence_active_scan(
        self,
        name,
        context_name=None,
        policy="Sequence",
        timeout_minutes=None,
    ):
        """
        Активное сканирование импортированной последовательности HAR (G-47).
        MethodId: ``СканПоследовательности``.
        """
        self._ensure_connected()
        seq_name = str(name or "").strip()
        if not seq_name:
            raise WiredError("СканПоследовательности: пустое имя последовательности")
        ctx = (context_name or self.context_name or "pk_ctx").strip()
        scan_policy = str(policy or "Sequence").strip() or "Sequence"
        timeout_minutes = self._as_timeout_minutes(
            timeout_minutes, self.active_scan_timeout
        )

        # Прямой API (если add-on экспортирует endpoint).
        try:
            payload = {
                "sequenceName": seq_name,
                "scanPolicyName": scan_policy,
            }
            if context_name:
                payload["contextName"] = ctx
            self._scanner.urlopen(
                "https://scanner/json/sequence/action/activeScan/", data=payload
            )
            logger.info(
                "Sequence active scan started via API: %s policy=%s",
                seq_name,
                scan_policy,
            )
            return True
        except Exception as api_exc:
            logger.debug(
                "sequence/action/activeScan unavailable, AF mini-plan: %s",
                api_exc,
            )

        return self._sequence_active_scan_via_af(
            seq_name, ctx, scan_policy, timeout_minutes
        )

    def _sequence_active_scan_via_af(
        self, sequence_name, context_name, policy, timeout_minutes
    ):
        import os
        import tempfile

        from core.af_plan import _yaml_str

        yaml_text = (
            "env:\n"
            "  contexts:\n"
            f"    - name: {_yaml_str(context_name)}\n"
            "      urls: []\n"
            "jobs:\n"
            "  - type: sequence-activeScan\n"
            "    parameters:\n"
            f"      sequence: {_yaml_str(sequence_name)}\n"
            f"      context: {_yaml_str(context_name)}\n"
            f"      policy: {_yaml_str(policy)}\n"
        )
        fd, path = tempfile.mkstemp(prefix="pk-seq-ascan-", suffix=".yaml")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(yaml_text)
            plan_id = self.run_automation_plan(path, timeout_minutes=timeout_minutes)
            logger.info(
                "Sequence active scan via AF plan %s id=%s", path, plan_id
            )
            return plan_id
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

    # ========== LOGOUT AVOIDANCE (G-48) ==========

    def set_logout_avoidance(self, enabled=True, spider=True, ajax=True):
        """
        Logout Avoidance на traditional/Ajax spider (G-48).
        MethodId: ``ИзбегатьLogout``.
        Client Spider пока не поддерживает — только spider/ajax.
        """
        self._ensure_connected()
        flag = self._coerce_bool(enabled, True)
        use_spider = self._coerce_bool(spider, True)
        use_ajax = self._coerce_bool(ajax, True)
        if use_spider:
            self._set_spider_logout_avoidance(flag)
        if use_ajax:
            self._set_ajax_logout_avoidance(flag)
        logger.info(
            "Logout avoidance=%s spider=%s ajax=%s", flag, use_spider, use_ajax
        )
        return flag

    def _set_spider_logout_avoidance(self, enabled: bool) -> None:
        try:
            self._scanner.spider.set_option_logout_avoidance(enabled)
        except AttributeError:
            self._scanner.urlopen(
                "https://scanner/JSON/spider/action/setOptionLogoutAvoidance/",
                data={"Boolean": "true" if enabled else "false"},
            )

    def _set_ajax_logout_avoidance(self, enabled: bool) -> None:
        try:
            self._scanner.ajaxSpider.set_option_logout_avoidance(enabled)
        except AttributeError:
            self._scanner.urlopen(
                "https://scanner/JSON/ajaxSpider/action/setOptionLogoutAvoidance/",
                data={"Boolean": "true" if enabled else "false"},
            )

    def _maybe_apply_logout_avoidance(self, logout_avoidance):
        if logout_avoidance is None:
            return
        self.set_logout_avoidance(logout_avoidance, spider=True, ajax=True)

    def _probe_scanner_addon(self, component_names):
        """
        Честный probe scanner add-on API.
        → {"available": bool, "component": str|None, "notes": [str]}
        """
        names = [str(n).strip() for n in (component_names or []) if str(n).strip()]
        notes = []
        from utils.api_import_lab import api_lab_dry

        if api_lab_dry():
            return {
                "available": False,
                "component": names[0] if names else None,
                "notes": ["PK_API_LAB_DRY — scanner addon probe skipped"],
            }
        self._ensure_connected()
        for name in names:
            for path in (
                f"https://scanner/JSON/{name}/",
                f"https://scanner/json/{name}/",
                f"https://scanner/JSON/{name}/view/",
                f"https://scanner/json/{name}/view/",
            ):
                try:
                    self._scanner.urlopen(path)
                    return {"available": True, "component": name, "notes": notes}
                except Exception as exc:  # noqa: BLE001 — probe
                    notes.append(f"{path}: {exc}")
            # zapv2 attribute (graphql / grpc)
            attr = getattr(self._scanner, name, None)
            if attr is not None:
                return {
                    "available": True,
                    "component": name,
                    "notes": notes + [f"zapv2.{name} attribute present"],
                }
        return {
            "available": False,
            "component": names[0] if names else None,
            "notes": notes
            + [
                f"API дополнения scanner недоступен ({', '.join(names)}) — "
                "перечень операций в PK получен; импорт и скан в scanner недоступны"
            ],
        }

    @property
    def _run_make_wired(self):
        return getattr(self, "_active_run_wired", None)

    @_run_make_wired.setter
    def _run_make_wired(self, val):
        self._active_run_wired = val

    @property
    def _run_wired(self):
        return getattr(self, "_active_run_wired", None)

    @_run_wired.setter
    def _run_wired(self, val):
        self._active_run_wired = val

    @property
    def _wired_dir(self):
        return getattr(self, "_active_wired_dir", None)

    @_wired_dir.setter
    def _wired_dir(self, val):
        self._active_wired_dir = Path(val) if val is not None else None

    @property
    def _wired_dir(self):
        return getattr(self, "_active_wired_dir", None)

    @_wired_dir.setter
    def _wired_dir(self, val):
        self._active_wired_dir = Path(val) if val is not None else None

    def bind_run_wired(self, wired, wired_dir=None) -> None:
        """Передать Wired прогона (+ dir) для модулей OpenAPI/GraphQL/Цепь."""
        self._active_run_wired = wired
        if wired_dir is not None:
            self._active_wired_dir = Path(wired_dir)

    def prepare_and_import_chain(self, module_id, *, verb: str = "Цепь"):
        """
        Shared: resolve → materialize → importHar.
        Returns (seq_name, notes, har_path).
        """
        from utils.chain_runtime import prepare_chain_har, resolve_chain_arg

        mid = str(module_id or "").strip()
        if not mid:
            raise WiredError(f"{verb}: пустой id модуля / har as")
        resolved = resolve_chain_arg(
            getattr(self, "_run_wired", None),
            mid,
            wired_dir=getattr(self, "_wired_dir", None),
        )
        if not resolved.from_module and resolved.har_path is None and not resolved.chain_fields:
            raise WiredError(
                f"{verb}: " + ("; ".join(resolved.notes) or f"не найден {mid!r}")
            )
        har_path = prepare_chain_har(
            resolved,
            wired_dir=getattr(self, "_wired_dir", None),
            bindings=(
                dict(resolved.chain_fields.get("bindings") or {})
                if resolved.chain_fields
                else None
            ),
            verb=verb,
        )
        seq = resolved.sequence_name or resolved.har_as or mid
        imported = self.import_har_sequence(seq, str(har_path), assert_code=False)
        if not imported:
            raise WiredError(
                f"{verb}: importHar не удался для sequence={seq!r} path={har_path}"
            )
        notes = list(resolved.notes) + [f"importHar ok sequence={seq}"]
        return seq, notes, har_path

    def execute_chain_module(self, module_id):
        """MethodId ``ВыполнитьЦепь``: materialize → importHar (play)."""
        mid = str(module_id or "").strip()
        seq, notes, har_path = self.prepare_and_import_chain(
            mid, verb="ВыполнитьЦепь"
        )
        notes.append("play — без active scan")
        self._last_chain_execute = {
            "ok": True,
            "module_id": mid,
            "sequence": seq,
            "har_path": str(har_path),
            "notes": notes,
        }
        logger.info(
            "ВыполнитьЦепь ok: %s",
            json.dumps(self._last_chain_execute, ensure_ascii=False),
        )
        return True

    def scan_chain_module(self, module_id):
        """MethodId ``СканированиеЦепи``: materialize → importHar → sequence_active_scan."""
        mid = str(module_id or "").strip()
        seq, notes, har_path = self.prepare_and_import_chain(
            mid, verb="СканированиеЦепи"
        )
        scanned = self.sequence_active_scan(seq)
        if not scanned:
            raise WiredError(
                f"СканированиеЦепи: sequence_active_scan не удался для {seq!r}"
            )
        notes.append("sequence_active_scan ok")
        self._last_chain_scan = {
            "ok": True,
            "module_id": mid,
            "sequence": seq,
            "har_path": str(har_path),
            "notes": notes,
        }
        logger.info(
            "СканированиеЦепи ok: %s",
            json.dumps(self._last_chain_scan, ensure_ascii=False),
        )
        return True

    def _chain_prepare_fields(self, mid: str):
        from utils.chain_ops import ChainError, dry_run_preconditions
        from utils.chain_runtime import resolve_chain_arg

        wired_dir = getattr(self, "_wired_dir", None)
        resolved = resolve_chain_arg(
            getattr(self, "_run_wired", None),
            mid,
            wired_dir=wired_dir,
        )
        fields = dict(resolved.chain_fields or {})
        if not fields and resolved.har_path is not None:
            raise WiredError(
                "ПодготовитьЦепь: нужен модуль Цепь с steps/roles "
                "(не сырой har_file)"
            )
        if not fields:
            raise WiredError(
                "ПодготовитьЦепь: "
                + ("; ".join(resolved.notes) or f"не найден {mid!r}")
            )
        fields["module_id"] = mid
        if resolved.har_as:
            fields.setdefault("har_as", resolved.har_as)
        try:
            dry = dry_run_preconditions(fields, bindings=dict(fields.get("bindings") or {}))
        except ChainError as exc:
            raise WiredError(f"ПодготовитьЦепь: {exc}") from exc
        setup = str(dry.get("setup_har_text") or "")
        if not setup.strip():
            raise WiredError(
                "ПодготовитьЦепь: пустой setup HAR — "
                + "; ".join(dry.get("notes") or [])
            )
        return resolved, fields, dry, setup, wired_dir

    def _write_chain_setup_har(self, har_as: str, setup: str, wired_dir):
        if wired_dir is not None:
            path = Path(wired_dir) / "resources" / f"{har_as}_setup.har"
        else:
            from utils.paths import ensure_runs_dir

            path = ensure_runs_dir() / "_chain_exec" / f"{har_as}_setup.har"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(setup, encoding="utf-8")
        return path

    def prepare_chain_module(self, module_id):
        """
        MethodId ``ПодготовитьЦепь`` (PRE-3): extract + import only precondition HAR.
        """
        mid = str(module_id or "").strip()
        if not mid:
            raise WiredError("ПодготовитьЦепь: пустой id модуля / har as")
        resolved, fields, dry, setup, wired_dir = self._chain_prepare_fields(mid)
        har_as = str(fields.get("har_as") or mid).strip() or mid
        seq = f"{resolved.sequence_name or har_as}_setup"
        path = self._write_chain_setup_har(har_as, setup, wired_dir)
        if not self.import_har_sequence(seq, str(path), assert_code=False):
            raise WiredError(
                f"ПодготовитьЦепь: importHar не удался sequence={seq!r}"
            )
        notes = list(dry.get("notes") or []) + [
            f"importHar ok sequence={seq}",
            "prepare — только precondition",
        ]
        self._last_chain_prepare = {
            "ok": True,
            "module_id": mid,
            "sequence": seq,
            "har_path": str(path),
            "notes": notes,
        }
        logger.info(
            "ПодготовитьЦепь ok: %s",
            json.dumps(self._last_chain_prepare, ensure_ascii=False),
        )
        return True

    def _investigate_include_hosts(self, ephemeral: str, har_path, notes: list):
        from utils.chain_investigate import hosts_from_har_path

        seed_url = None
        for origin in hosts_from_har_path(Path(har_path)):
            include = origin.rstrip("/") + ".*"
            try:
                self.set_context_include(ephemeral, include)
                notes.append(f"include {include}")
                if seed_url is None:
                    seed_url = origin
            except Exception as exc:
                notes.append(f"include_skip {include}: {exc}")
        return seed_url

    def _investigate_apply_har_auth(
        self, ephemeral: str, har_path, seed_url, notes: list
    ) -> bool:
        from core.auth_bootstrap import apply_scanner_auth
        from utils.chain_investigate import extract_auth_from_har

        auth_hint = extract_auth_from_har(Path(har_path))
        notes.extend(auth_hint.get("notes") or [])
        if not auth_hint.get("found"):
            notes.append("auth_skipped")
            return False
        auth_res = apply_scanner_auth(
            scanner_adapter=self,
            context_name=ephemeral,
            auth_type=str(auth_hint.get("auth_type") or ""),
            auth_details=dict(auth_hint.get("auth_details") or {}),
            base_url=seed_url or "",
        )
        notes.extend(auth_res.get("notes") or [])
        if auth_res.get("applied"):
            notes.append("auth_applied")
            return True
        if auth_res.get("error"):
            notes.append(f"auth_apply_soft: {auth_res.get('error')}")
        return False

    def _investigate_quick_scans(self, seq: str, seed_url, ephemeral: str, notes: list):
        from utils.chain_investigate import INV_QUICK_TIMEOUT_MIN

        if not self.sequence_active_scan(seq):
            raise WiredError(
                f"РасследованиеЦепи: sequence_active_scan не удался для {seq!r}"
            )
        notes.append("sequence_active_scan ok")
        quick = INV_QUICK_TIMEOUT_MIN
        self.spider_scan(url=seed_url, context_name=ephemeral, timeout_minutes=quick)
        notes.append("spider_quick ok")
        self.active_scan(url=seed_url, context_name=ephemeral, timeout_minutes=quick)
        notes.append("active_quick ok")
        self.passive_scan_wait(timeout_minutes=quick)
        notes.append("passive_wait ok")

    def _investigate_cleanup(
        self,
        *,
        mid: str,
        seq: str,
        ephemeral: str,
        har_path,
        notes: list,
        auth_applied: bool,
        created: bool,
        previous,
        log_name: str,
    ) -> None:
        from adapters.data_processor import DataProcessor
        from utils.chain_investigate import (
            purge_stale_auth_replacer,
            write_investigate_evidence,
        )

        if auth_applied:
            notes.extend(purge_stale_auth_replacer(self))
        else:
            notes.append("purge_skip (no auth applied)")

        evidence = {
            "module_id": mid,
            "sequence": seq,
            "context": ephemeral,
            "har_path": str(har_path) if har_path else "",
            "notes": list(notes),
        }
        ev_path = write_investigate_evidence(
            wired_dir=getattr(self, "_wired_dir", None),
            module_id=mid,
            payload=evidence,
        )
        notes.append(
            f"evidence {ev_path.name}" if ev_path is not None else "evidence_skip (no wired_dir)"
        )

        try:
            DataProcessor.end_log_cut(log_name)
            notes.append(f"end_log_cut {log_name}")
        except Exception as exc:
            notes.append(f"end_log_cut_fail: {exc}")
        if created:
            try:
                self.delete_context(ephemeral)
                notes.append(f"delete_context {ephemeral}")
            except Exception as exc:
                notes.append(f"delete_context_fail: {exc}")
        if previous:
            try:
                self.switch_context(previous)
                notes.append(f"restore_context {previous}")
            except Exception as exc:
                notes.append(f"restore_fail: {exc}")
                self.context_name = previous
            return
        try:
            self.clear_context()
            notes.append("clear_context (no previous)")
        except Exception as exc:
            notes.append(f"clear_context_fail: {exc}")

    def investigate_chain_module(self, module_id):
        """
        MethodId ``РасследованиеЦепи``:
        log → ctx → auth from HAR (8b) → import+seq → spider/ascan/pscan
        → evidence sidecar + purge pk-auth* (8c) → end log → restore.
        """
        from adapters.data_processor import DataProcessor
        from utils.chain_investigate import (
            ephemeral_context_name,
            investigation_log_name,
            redact_notes,
        )

        mid = str(module_id or "").strip()
        if not mid:
            raise WiredError("РасследованиеЦепи: пустой id модуля / har as")

        log_name = investigation_log_name(mid)
        ephemeral = ephemeral_context_name(mid)
        previous = getattr(self, "context_name", None)
        notes: list = [f"previous_context={previous!r}"]
        created = False
        auth_applied = False
        seq = ""
        har_path = None

        DataProcessor.start_log_cut(
            log_name, options="security", comment=f"РасследованиеЦепи {mid}"
        )
        notes.append(f"start_log_cut {log_name}")

        try:
            self.create_context(ephemeral, description=f"РасследованиеЦепи {mid}")
            created = True
            notes.append(f"create_context {ephemeral}")
            seq, prep_notes, har_path = self.prepare_and_import_chain(
                mid, verb="РасследованиеЦепи"
            )
            notes.extend(prep_notes)
            seed_url = self._investigate_include_hosts(ephemeral, har_path, notes)
            auth_applied = self._investigate_apply_har_auth(
                ephemeral, har_path, seed_url, notes
            )
            self._investigate_quick_scans(seq, seed_url, ephemeral, notes)
        finally:
            self._investigate_cleanup(
                mid=mid,
                seq=seq,
                ephemeral=ephemeral,
                har_path=har_path,
                notes=notes,
                auth_applied=auth_applied,
                created=created,
                previous=previous,
                log_name=log_name,
            )

        safe_notes = redact_notes(notes)
        self._last_chain_investigate = {
            "ok": True,
            "module_id": mid,
            "sequence": seq,
            "context": ephemeral,
            "har_path": str(har_path) if har_path else "",
            "notes": safe_notes,
        }
        logger.info(
            "РасследованиеЦепи ok: %s",
            json.dumps(self._last_chain_investigate, ensure_ascii=False),
        )
        return True

    def list_openapi_operations(self, spec_url_or_file):
        """Список операций OpenAPI: id модуля, URL, путь или текст схемы. MethodId: СписокОперацийOpenAPI."""
        from utils.api_import_lab import dumps_ops
        from utils.api_module_runtime import inventory_openapi, resolve_openapi_arg

        resolved = resolve_openapi_arg(
            getattr(self, "_run_wired", None),
            str(spec_url_or_file or ""),
        )
        payload = inventory_openapi(resolved.spec)
        payload["notes"] = list(resolved.notes) + list(payload.get("notes") or [])
        if resolved.from_module:
            payload["module_id"] = resolved.module_id
            if resolved.base_url and not payload.get("base_url"):
                payload["base_url"] = resolved.base_url
        self._last_openapi_ops = payload
        return dumps_ops(payload)

    def import_openapi_spec(self, spec_url_or_file):
        """
        Импорт OpenAPI в scanner. Для идентификатора модуля — флаг scanner_import
        (принудительно: переменная окружения). PK_API_LAB_DRY=1 — только перечень
        операций без вызова scanner. Нет дополнения — False и заметки.
        """
        from utils.api_import_lab import api_lab_dry
        from utils.api_module_runtime import allow_scanner_import, resolve_openapi_arg

        resolved = resolve_openapi_arg(
            getattr(self, "_run_wired", None),
            str(spec_url_or_file or ""),
        )
        spec = resolved.spec
        inventory = self.list_openapi_operations(spec_url_or_file)
        if resolved.from_module:
            allowed, gate_notes = allow_scanner_import(
                module_flag=resolved.scanner_import, openapi=True
            )
            if not allowed:
                self._last_openapi_import = {
                    "ok": True,
                    "skipped": True,
                    "notes": list(resolved.notes) + gate_notes,
                    "inventory": inventory[:120],
                    "module_id": resolved.module_id,
                }
                logger.info("OpenAPI import skipped (module gate): %s", resolved.module_id)
                return True
        if api_lab_dry():
            logger.info("OpenAPI lab dry import (no scanner): %s", spec)
            self._last_openapi_import = {
                "ok": True,
                "dry": True,
                "notes": list(resolved.notes) + ["PK_API_LAB_DRY"],
                "inventory": inventory[:120],
            }
            return True
        probe = self._probe_scanner_addon(["openapi"])
        if not probe["available"]:
            logger.warning("OpenAPI scanner import skipped: %s", "; ".join(probe["notes"][-3:]))
            self._last_openapi_import = {
                "ok": False,
                "dry": False,
                "notes": list(resolved.notes) + probe["notes"],
                "inventory": inventory[:120],
            }
            return False
        try:
            if str(spec).startswith("http"):
                self._scanner.urlopen(
                    "https://scanner/json/openapi/action/importUrl/",
                    data={"url": spec},
                )
            else:
                self._scanner.urlopen(
                    "https://scanner/json/openapi/action/importFile/",
                    data={"file": spec},
                )
            logger.info("Imported OpenAPI spec: %s (%s)", spec, inventory[:80])
            self._last_openapi_import = {
                "ok": True,
                "notes": list(resolved.notes),
                "inventory": inventory[:120],
            }
            return True
        except Exception as e:
            logger.error(f"Failed to import OpenAPI spec: {e}")
            self._last_openapi_import = {
                "ok": False,
                "notes": list(resolved.notes) + [str(e)],
                "inventory": inventory[:120],
            }
            return False

    def scan_openapi(self, context_name=None):
        """Скан OpenAPI: имя контекста или идентификатор модуля (нужен scanner_import)."""
        from utils.api_import_lab import api_lab_dry
        from utils.api_module_runtime import allow_scanner_scan, resolve_openapi_arg

        arg = context_name
        resolved = resolve_openapi_arg(
            getattr(self, "_run_wired", None),
            str(arg or ""),
        )
        if resolved.from_module:
            allowed, gate_notes = allow_scanner_scan(
                module_flag=resolved.scanner_import,
                openapi=True,
                from_module=True,
            )
            if not allowed:
                self._last_openapi_scan = {
                    "ok": True,
                    "skipped": True,
                    "notes": list(resolved.notes) + gate_notes,
                    "module_id": resolved.module_id,
                }
                return True
            context = self.context_name
        else:
            context = arg or self.context_name

        if api_lab_dry():
            logger.info("OpenAPI lab dry scan skipped (no scanner)")
            self._last_openapi_scan = {
                "ok": True,
                "dry": True,
                "notes": list(resolved.notes) + ["PK_API_LAB_DRY"],
            }
            return True
        probe = self._probe_scanner_addon(["openapi"])
        if not probe["available"]:
            logger.warning("OpenAPI scanner scan skipped: %s", "; ".join(probe["notes"][-3:]))
            self._last_openapi_scan = {
                "ok": False,
                "notes": list(resolved.notes) + probe["notes"],
            }
            return False
        try:
            if context:
                self._scanner.urlopen(
                    "https://scanner/json/openapi/action/runScan/",
                    data={"context": context},
                )
            else:
                self._scanner.urlopen("https://scanner/json/openapi/action/runScan/")
            logger.info("OpenAPI scan started")
            self._last_openapi_scan = {"ok": True, "notes": list(resolved.notes)}
            return True
        except Exception as e:
            logger.error(f"Failed to scan OpenAPI: {e}")
            self._last_openapi_scan = {
                "ok": False,
                "notes": list(resolved.notes) + [str(e)],
            }
            return False

    # --- GraphQL ---

    def list_graphql_operations(self, schema_url_or_file):
        """Список операций GraphQL: id модуля, URL, путь или SDL. MethodId: СписокОперацийGraphQL."""
        from utils.api_import_lab import dumps_ops
        from utils.api_module_runtime import inventory_graphql, resolve_graphql_arg

        resolved = resolve_graphql_arg(
            getattr(self, "_run_wired", None),
            str(schema_url_or_file or ""),
        )
        payload = inventory_graphql(resolved.schema)
        payload["notes"] = list(resolved.notes) + list(payload.get("notes") or [])
        if resolved.from_module:
            payload["module_id"] = resolved.module_id
            if resolved.endpoint:
                payload["endpoint"] = resolved.endpoint
        self._last_graphql_ops = payload
        return dumps_ops(payload)

    def _graphql_endurl(self, resolved, schema: str) -> str:
        endurl = (resolved.endpoint or "").strip()
        if endurl:
            return endurl
        man = getattr(self, "_run_wired", None)
        base = ""
        if man is not None and hasattr(man, "scan_base_url"):
            try:
                base = str(man.scan_base_url() or "").strip()
            except Exception:
                base = ""
        if str(schema).startswith("http"):
            return str(schema)
        if base:
            return base.rstrip("/") + "/graphql"
        return ""

    def _scanner_import_graphql(self, schema: str, endurl: str) -> None:
        graphql = getattr(self._scanner, "graphql", None)
        # zapv2 GraphQL addon: import_url(endurl, url=…) / import_file(endurl, file)
        if graphql is not None and hasattr(graphql, "import_url"):
            if str(schema).startswith("http"):
                graphql.import_url(endurl or schema, url=schema)
                return
            if hasattr(graphql, "import_file") and endurl:
                try:
                    graphql.import_file(endurl, schema)
                except Exception as file_exc:
                    logger.warning(
                        "GraphQL import_file failed (%s); try import_url endurl=%s",
                        file_exc,
                        endurl,
                    )
                    graphql.import_url(endurl, url=endurl)
                return
            graphql.import_url(endurl or schema, url=endurl or schema)
            return
        if graphql is not None and hasattr(graphql, "import_schema"):
            graphql.import_schema(schema)
            return
        if str(schema).startswith("http"):
            self._scanner.urlopen(
                "https://scanner/json/graphql/action/importUrl/",
                data={"url": schema, "endurl": endurl or schema},
            )
            return
        self._scanner.urlopen(
            "https://scanner/json/graphql/action/importFile/",
            data={"file": schema, "endurl": endurl},
        )

    def import_graphql_schema(self, schema_url_or_file):
        """Импорт GraphQL в scanner; для идентификатора модуля нужен флаг scanner_import."""
        from utils.api_import_lab import api_lab_dry
        from utils.api_module_runtime import allow_scanner_import, resolve_graphql_arg

        resolved = resolve_graphql_arg(
            getattr(self, "_run_wired", None),
            str(schema_url_or_file or ""),
        )
        schema = resolved.schema
        inventory = self.list_graphql_operations(schema_url_or_file)
        if resolved.from_module:
            allowed, gate_notes = allow_scanner_import(
                module_flag=resolved.scanner_import, openapi=False
            )
            if not allowed:
                self._last_graphql_import = {
                    "ok": True,
                    "skipped": True,
                    "notes": list(resolved.notes) + gate_notes,
                    "inventory": inventory[:120],
                    "module_id": resolved.module_id,
                }
                logger.info("GraphQL import skipped (module gate): %s", resolved.module_id)
                return True
        if api_lab_dry():
            logger.info("GraphQL lab dry import (no scanner): %s", schema)
            self._last_graphql_import = {
                "ok": True,
                "dry": True,
                "notes": list(resolved.notes) + ["PK_API_LAB_DRY"],
                "inventory": inventory[:120],
            }
            return True
        probe = self._probe_scanner_addon(["graphql"])
        if not probe["available"]:
            logger.warning("GraphQL scanner import skipped: %s", "; ".join(probe["notes"][-3:]))
            self._last_graphql_import = {
                "ok": False,
                "notes": list(resolved.notes) + probe["notes"],
                "inventory": inventory[:120],
            }
            return False
        try:
            self._scanner_import_graphql(schema, self._graphql_endurl(resolved, schema))
            logger.info("Imported GraphQL schema: %s (%s)", schema, inventory[:80])
            self._last_graphql_import = {
                "ok": True,
                "notes": list(resolved.notes),
                "inventory": inventory[:120],
            }
            return True
        except Exception as e:
            logger.error(f"Failed to import GraphQL schema: {e}")
            self._last_graphql_import = {
                "ok": False,
                "notes": list(resolved.notes) + [str(e)],
                "inventory": inventory[:120],
            }
            return False

    def scan_graphql_api(self, context_name=None):
        """Скан GraphQL: имя контекста или идентификатор модуля (нужен scanner_scan)."""
        from utils.api_import_lab import api_lab_dry
        from utils.api_module_runtime import allow_scanner_scan, resolve_graphql_arg

        arg = context_name
        resolved = resolve_graphql_arg(
            getattr(self, "_run_wired", None),
            str(arg or ""),
        )
        if resolved.from_module:
            allowed, gate_notes = allow_scanner_scan(
                module_flag=resolved.scanner_scan,
                openapi=False,
                from_module=True,
            )
            if not allowed:
                self._last_graphql_scan = {
                    "ok": True,
                    "skipped": True,
                    "notes": list(resolved.notes) + gate_notes,
                    "module_id": resolved.module_id,
                }
                return True
            context = self.context_name
        else:
            context = arg or self.context_name

        if api_lab_dry():
            logger.info("GraphQL lab dry scan skipped (no scanner)")
            self._last_graphql_scan = {
                "ok": True,
                "dry": True,
                "notes": list(resolved.notes) + ["PK_API_LAB_DRY"],
            }
            return True
        probe = self._probe_scanner_addon(["graphql"])
        if not probe["available"]:
            logger.warning("GraphQL scanner scan skipped: %s", "; ".join(probe["notes"][-3:]))
            self._last_graphql_scan = {
                "ok": False,
                "notes": list(resolved.notes) + probe["notes"],
            }
            return False
        try:
            graphql = getattr(self._scanner, "graphql", None)
            if graphql is not None and hasattr(graphql, "scan"):
                if context:
                    graphql.scan(context=context)
                else:
                    graphql.scan()
            else:
                data = {"context": context} if context else None
                self._scanner.urlopen(
                    "https://scanner/json/graphql/action/scan/",
                    data=data,
                )
            logger.info("GraphQL scan started")
            self._last_graphql_scan = {"ok": True, "notes": list(resolved.notes)}
            return True
        except Exception as e:
            logger.error(f"Failed to scan GraphQL: {e}")
            self._last_graphql_scan = {
                "ok": False,
                "notes": list(resolved.notes) + [str(e)],
            }
            return False

    def set_graphql_request_method(self, method="POST"):
        from utils.api_import_lab import api_lab_dry

        if api_lab_dry():
            logger.info("GraphQL lab dry set_option_request_method=%s", method)
            return True
        probe = self._probe_scanner_addon(["graphql"])
        if not probe["available"]:
            logger.warning("GraphQL set method skipped: addon missing")
            return False
        try:
            graphql = getattr(self._scanner, "graphql", None)
            if graphql is not None and hasattr(graphql, "set_option_request_method"):
                graphql.set_option_request_method(method)
            else:
                self._scanner.urlopen(
                    "https://scanner/json/graphql/action/setOptionRequestMethod/",
                    data={"Boolean": str(method)},
                )
            logger.info(f"GraphQL request method set to: {method}")
            return True
        except Exception as e:
            logger.error(f"Failed to set GraphQL request method: {e}")
            return False

    # ========== GRPC ==========

    @staticmethod
    def _grpc_pack_payload(parsed, extra_notes=None):
        notes = list(parsed.get("notes") or [])
        if extra_notes:
            notes.extend(extra_notes)
        return {
            "ok": True,
            "source": parsed.get("source"),
            "files": parsed.get("files") or [],
            "services": parsed.get("services") or [],
            "notes": notes,
        }

    def list_grpc_services(self, proto_file_or_text):
        """Список сервисов gRPC из текста proto или пакета. MethodId: СписокСервисовgRPC."""
        from utils.api_import_lab import dumps_ops, lab_search_roots, read_local_text, resolve_lab_path
        from utils.grpc_ops import GrpcParseError, parse_proto_services, resolve_proto_pack

        raw = str(proto_file_or_text or "")
        resolved = resolve_lab_path(raw)
        if resolved is not None and (resolved.is_dir() or resolved.suffix.lower() == ".zip"):
            try:
                payload = self._grpc_pack_payload(
                    resolve_proto_pack(str(resolved), search_roots=lab_search_roots())
                )
            except GrpcParseError as exc:
                payload = {"ok": False, "services": [], "notes": [str(exc)]}
            self._last_grpc_services = payload
            return dumps_ops(payload)

        text, notes = read_local_text(raw)
        if text is None:
            try:
                payload = self._grpc_pack_payload(
                    resolve_proto_pack(raw, search_roots=lab_search_roots()),
                    extra_notes=notes,
                )
            except GrpcParseError:
                payload = {"ok": False, "services": [], "notes": notes}
            self._last_grpc_services = payload
            return dumps_ops(payload)
        try:
            parsed = parse_proto_services(text)
            payload = {
                "ok": True,
                "source": parsed.get("source"),
                "services": parsed.get("services") or [],
                "notes": list(parsed.get("notes") or []) + notes,
            }
        except GrpcParseError as exc:
            payload = {"ok": False, "services": [], "notes": notes + [str(exc)]}
        self._last_grpc_services = payload
        return dumps_ops(payload)

    def import_grpc_proto(self, proto_file_or_dir):
        """
        Импорт gRPC: перечень сервисов в PK; при отсутствии API дополнения scanner —
        заметки, трафик через прокси остаётся. MethodId: ИмпортgRPC.
        """
        from utils.api_import_lab import api_lab_dry

        inventory = self.list_grpc_services(proto_file_or_dir)
        if api_lab_dry():
            logger.info("gRPC lab dry import (no scanner): %s", proto_file_or_dir)
            self._last_grpc_import = {
                "ok": True,
                "dry": True,
                "notes": [
                    "PK_API_LAB_DRY — только перечень сервисов; трафик через прокси scanner"
                ],
                "inventory": inventory[:120],
            }
            return True
        # gRPC Support add-on historically exposes grpc / grpcSupport
        probe = self._probe_scanner_addon(["grpc", "grpcSupport", "grpcsupport"])
        if not probe["available"]:
            note = (
                "API импорта gRPC в scanner нет — перечень сервисов в PK сохранён; "
                "одиночные вызовы через прокси по-прежнему можно сканировать активно"
            )
            logger.warning(note)
            self._last_grpc_import = {
                "ok": False,
                "notes": probe["notes"] + [note],
                "inventory": inventory[:120],
                "proxy_path": True,
            }
            return False
        try:
            grpc_api = getattr(self._scanner, "grpc", None) or getattr(self._scanner, "grpcSupport", None)
            if grpc_api is not None and hasattr(grpc_api, "import_proto"):
                grpc_api.import_proto(proto_file_or_dir)
            else:
                self._scanner.urlopen(
                    f"https://scanner/json/{probe['component']}/action/importProto/",
                    data={"file": proto_file_or_dir},
                )
            logger.info("Imported gRPC proto: %s (%s)", proto_file_or_dir, inventory[:80])
            self._last_grpc_import = {"ok": True, "notes": [], "inventory": inventory[:120]}
            return True
        except Exception as e:
            logger.error(f"Failed to import gRPC proto: {e}")
            self._last_grpc_import = {
                "ok": False,
                "notes": [str(e), "активное сканирование через прокси по-прежнему возможно"],
                "inventory": inventory[:120],
                "proxy_path": True,
            }
            return False

    def scan_grpc(self, context_name=None):
        from utils.api_import_lab import api_lab_dry

        if api_lab_dry():
            logger.info("gRPC lab dry scan skipped (no scanner)")
            self._last_grpc_scan = {"ok": True, "dry": True, "notes": ["PK_API_LAB_DRY"]}
            return True
        probe = self._probe_scanner_addon(["grpc", "grpcSupport", "grpcsupport"])
        if not probe["available"]:
            note = (
                "API скана gRPC в scanner нет — используйте активное сканирование по URL/хостам "
                "после одиночных вызовов через прокси scanner"
            )
            logger.warning(note)
            self._last_grpc_scan = {
                "ok": False,
                "notes": probe["notes"] + [note],
                "proxy_path": True,
            }
            return False
        context = context_name or self.context_name
        try:
            grpc_api = getattr(self._scanner, "grpc", None)
            if grpc_api is not None and hasattr(grpc_api, "scan"):
                if context:
                    grpc_api.scan(context)
                else:
                    grpc_api.scan()
            else:
                data = {"context": context} if context else None
                self._scanner.urlopen(
                    f"https://scanner/json/{probe['component']}/action/scan/",
                    data=data,
                )
            logger.info("gRPC scan started")
            self._last_grpc_scan = {"ok": True, "notes": []}
            return True
        except Exception as e:
            logger.error(f"Failed to scan gRPC: {e}")
            self._last_grpc_scan = {
                "ok": False,
                "notes": [str(e), "сканирование через прокси возможно"],
            }
            return False

    def unary_grpc_call(self, host, method, request_json="{}"):
        """Одиночный вызов gRPC (лаборатория). MethodId: ВызовgRPC. Без PK_GRPC_UNARY — заглушка."""
        from utils.api_import_lab import dumps_ops
        from utils.grpc_ops import unary_call_harness

        payload = unary_call_harness(
            host=str(host or ""),
            method=str(method or ""),
            request_json=str(request_json if request_json is not None else "{}"),
        )
        self._last_grpc_unary = payload
        return dumps_ops(payload)

    # ========== seed URL (как Открыть → base_url) ==========

    @staticmethod
    def _is_scan_url_token(token) -> bool:
        """http(s), $ref, относительный путь — не имя контекста."""
        t = "" if token is None else str(token).strip()
        if not t:
            return False
        if t.startswith(("http://", "https://", "$")):
            return True
        if t.startswith(("/", "#", "./", "../")):
            return True
        if "/" in t:
            return True
        return False

    @staticmethod
    def _is_timeout_token(token) -> bool:
        t = "" if token is None else str(token).strip()
        if not t:
            return False
        try:
            float(t)
            return True
        except (TypeError, ValueError):
            return False

    def _resolve_scan_seed(self, url=None) -> str:
        """Пусто → base_url; relative → join; http(s) как есть."""
        from urllib.parse import urljoin

        raw = "" if url is None else str(url).strip()
        if not raw:
            base = (self.base_url or "").strip()
            if not base:
                raise WiredError(
                    "Сканер/АктивноеСканирование без URL: "
                    "нужен security_configuration.base_url_override"
                )
            return base
        if raw.startswith(("http://", "https://")):
            return raw
        base = (self.base_url or "").strip()
        if not base:
            raise WiredError(
                f"относительный URL {raw!r}: нужен security_configuration.base_url_override"
            )
        root = base if base.endswith("/") else base + "/"
        return urljoin(root, raw)

    def _normalize_spider_scan_args(
        self, url=None, context_name=None, timeout_minutes=None, logout_avoidance=None
    ):
        """
        Целевой pretty: `Сканер juice_ctx 1` (URL = base_url).
        Явный URL по-прежнему: `Сканер http://… juice_ctx 1`.
        """
        u = None if url is None or str(url).strip() == "" else str(url).strip()
        ctx = (
            None
            if context_name is None or str(context_name).strip() == ""
            else str(context_name).strip()
        )
        if u is not None and not self._is_scan_url_token(u):
            if self._is_timeout_token(u) and ctx is None:
                timeout_minutes = u if timeout_minutes is None else timeout_minutes
                u = None
            else:
                if logout_avoidance is None:
                    logout_avoidance = timeout_minutes
                timeout_minutes = ctx
                ctx = u
                u = None
        return self._resolve_scan_seed(u), ctx, timeout_minutes, logout_avoidance

    def _normalize_active_scan_args(self, url=None, context_name=None, timeout_minutes=None):
        seed, ctx, timeout_minutes, _ = self._normalize_spider_scan_args(
            url, context_name, timeout_minutes, None
        )
        return seed, ctx, timeout_minutes

    def _normalize_ajax_scan_args(self, url=None, timeout_minutes=None, logout_avoidance=None):
        """Краулер: без URL → base; число → timeout. Контекст не аргумент."""
        u = None if url is None or str(url).strip() == "" else str(url).strip()
        if u is not None and not self._is_scan_url_token(u):
            if self._is_timeout_token(u) and timeout_minutes is None:
                timeout_minutes = u
                u = None
            else:
                raise WiredError(
                    f"Краулер: {u!r} не URL. Без URL берётся base_url; "
                    f"контекст — только у Сканер / АктивноеСканирование / КраулерКлиент."
                )
        return self._resolve_scan_seed(u), timeout_minutes, logout_avoidance

    # ========== СПАЙДЕР (базовый и профили) ==========

    def spider_scan(self, url=None, context_name=None, timeout_minutes=None, logout_avoidance=None):
        url, context_name, timeout_minutes, logout_avoidance = self._normalize_spider_scan_args(
            url, context_name, timeout_minutes, logout_avoidance
        )
        self._maybe_apply_logout_avoidance(logout_avoidance)
        self._set_spider_options(max_depth=5, max_children=50, thread_count=2)
        return self._spider_scan_impl(url, context_name, timeout_minutes)

    def spider_scan_spa(self, url=None, context_name=None, timeout_minutes=None, logout_avoidance=None):
        url, context_name, timeout_minutes, logout_avoidance = self._normalize_spider_scan_args(
            url, context_name, timeout_minutes, logout_avoidance
        )
        self._maybe_apply_logout_avoidance(logout_avoidance)
        self._set_spider_options(max_depth=8, max_children=50, thread_count=5)
        return self._spider_scan_impl(url, context_name, timeout_minutes)

    def spider_scan_deep(self, url=None, context_name=None, timeout_minutes=None, logout_avoidance=None):
        url, context_name, timeout_minutes, logout_avoidance = self._normalize_spider_scan_args(
            url, context_name, timeout_minutes, logout_avoidance
        )
        self._maybe_apply_logout_avoidance(logout_avoidance)
        self._set_spider_options(max_depth=15, max_children=100, thread_count=2)
        return self._spider_scan_impl(url, context_name, timeout_minutes)

    def spider_scan_local(self, url=None, context_name=None, timeout_minutes=None, logout_avoidance=None):
        url, context_name, timeout_minutes, logout_avoidance = self._normalize_spider_scan_args(
            url, context_name, timeout_minutes, logout_avoidance
        )
        self._maybe_apply_logout_avoidance(logout_avoidance)
        self._set_spider_options(max_depth=3, max_children=20, thread_count=2)
        return self._spider_scan_impl(url, context_name, timeout_minutes)

    def _set_spider_options(self, max_depth=5, max_children=50, thread_count=2, handle_parameters=True):
        self._ensure_connected()
        self._last_spider_opts = {
            "max_depth": int(max_depth),
            "max_children": int(max_children),
            "thread_count": int(thread_count),
        }
        self._scanner.spider.set_option_max_depth(max_depth)
        self._scanner.spider.set_option_max_children(max_children)
        self._scanner.spider.set_option_thread_count(thread_count)
        self._scanner.spider.set_option_handle_parameters(handle_parameters)

    def _poll_percent_scan(
        self,
        *,
        label: str,
        status_fn,
        stop_fn,
        timeout_minutes: float,
        scan_id=None,
    ) -> float:
        start_time = time.time()
        last_progress = -1.0
        last_change = start_time
        while True:
            try:
                progress = float(status_fn(scan_id) if scan_id is not None else status_fn())
            except (ValueError, TypeError):
                progress = last_progress if last_progress >= 0 else 0.0
            if progress != last_progress:
                logger.info("%s progress: %.1f%%", label, progress)
                last_progress = progress
                last_change = time.time()
            if progress >= 100.0:
                break
            now = time.time()
            if now - start_time > timeout_minutes * 60.0:
                logger.warning(
                    "%s timed out after %.2f minutes, stopping", label, timeout_minutes
                )
                stop_fn(scan_id) if scan_id is not None else stop_fn()
                break
            if now - last_change >= float(self.spider_stall_seconds):
                logger.warning(
                    "%s stalled (no progress for %ss at %.1f%%), stopping",
                    label,
                    self.spider_stall_seconds,
                    progress,
                )
                stop_fn(scan_id) if scan_id is not None else stop_fn()
                break
            time.sleep(2)
        return last_progress

    def _spider_scan_impl(self, url, context_name=None, timeout_minutes=None):
        timeout_minutes = self._as_timeout_minutes(timeout_minutes, self.spider_timeout)
        # scanner maxDuration — целые минуты; для 0.5 ставим 1 и режем сами по wall-clock.
        scanner_max_duration = max(1, int(timeout_minutes + 0.999))
        logger.info(
            "Starting spider_scan on %s context=%s timeout=%.2f min stall=%ss",
            url,
            context_name,
            timeout_minutes,
            self.spider_stall_seconds,
        )
        self._scanner.spider.set_option_max_duration(scanner_max_duration)

        context = context_name or self.context_name
        if context:
            scan_id = self._scanner.spider.scan(url, contextname=context)
        else:
            scan_id = self._scanner.spider.scan(url)
        logger.info(f"Spider scan started with ID: {scan_id}")

        self._poll_percent_scan(
            label="Spider",
            status_fn=self._scanner.spider.status,
            stop_fn=self._scanner.spider.stop,
            timeout_minutes=timeout_minutes,
            scan_id=scan_id,
        )
        results = self._scanner.spider.results(scan_id)
        logger.info(f"Spider found {len(results) if results else 0} URLs")
        return len(results) if results else 0

    def spider_status(self, scan_id):
        self._ensure_connected()
        return float(self._scanner.spider.status(scan_id))

    def stop_spider(self, scan_id):
        self._ensure_connected()
        self._scanner.spider.stop(scan_id)

    def stop_all_spiders(self):
        """Best-effort: погасить все traditional spider scans (GATHER / orphan)."""
        self._ensure_connected()
        try:
            self._scanner.spider.stop_all_scans()
        except Exception as e:
            logger.debug("stop_all_scans: %s", e)

    # ========== AJAX СПАЙДЕР ==========

    def ajax_spider_scan(self, url=None, timeout_minutes=None, logout_avoidance=None):
        url, timeout_minutes, logout_avoidance = self._normalize_ajax_scan_args(
            url, timeout_minutes, logout_avoidance
        )
        self._maybe_apply_logout_avoidance(logout_avoidance)
        self._set_ajax_spider_options(max_depth=3, number_of_browsers=1)
        return self._ajax_spider_scan_impl(url, timeout_minutes)

    def ajax_spider_scan_shallow(self, url=None, timeout_minutes=None, logout_avoidance=None):
        url, timeout_minutes, logout_avoidance = self._normalize_ajax_scan_args(
            url, timeout_minutes, logout_avoidance
        )
        self._maybe_apply_logout_avoidance(logout_avoidance)
        self._set_ajax_spider_options(max_depth=3, number_of_browsers=1, event_wait=200)
        return self._ajax_spider_scan_impl(url, timeout_minutes)

    def ajax_spider_scan_deep(self, url=None, timeout_minutes=None, logout_avoidance=None):
        url, timeout_minutes, logout_avoidance = self._normalize_ajax_scan_args(
            url, timeout_minutes, logout_avoidance
        )
        self._maybe_apply_logout_avoidance(logout_avoidance)
        self._set_ajax_spider_options(max_depth=10, number_of_browsers=1, event_wait=100)
        return self._ajax_spider_scan_impl(url, timeout_minutes)

    def ajax_spider_scan_iterator(self, url=None, timeout_minutes=None, logout_avoidance=None):
        url, timeout_minutes, logout_avoidance = self._normalize_ajax_scan_args(
            url, timeout_minutes, logout_avoidance
        )
        self._maybe_apply_logout_avoidance(logout_avoidance)
        self._set_ajax_spider_options(
            max_depth=5,
            number_of_browsers=1,
            event_wait=300,
            click_elems_once=False,
            random_inputs=True,
            click_default_elems=False
        )
        return self._ajax_spider_scan_impl(url, timeout_minutes)

    def _set_ajax_spider_options(self, max_depth=3, number_of_browsers=1, event_wait=100,
                                click_elems_once=False, random_inputs=True, click_default_elems=False):
        self._ensure_connected()
        self._scanner.ajaxSpider.set_option_max_crawl_depth(max_depth)
        self._scanner.ajaxSpider.set_option_number_of_browsers(number_of_browsers)
        self._scanner.ajaxSpider.set_option_event_wait(event_wait)
        self._scanner.ajaxSpider.set_option_click_elems_once(click_elems_once)
        self._scanner.ajaxSpider.set_option_random_inputs(random_inputs)
        self._scanner.ajaxSpider.set_option_click_default_elems(click_default_elems)

    def _ajax_wait_until_running(self, max_wait: int = 10) -> str:
        status = "stopped"
        for _ in range(max_wait):
            status = self._scanner.ajaxSpider.status
            logger.debug(f"AJAX Spider status: {status}")
            if status != "stopped":
                return status
            time.sleep(1)
        return status

    def _ajax_poll_until_done(self, timeout_minutes: float) -> int:
        start_time = time.time()
        last_results = -1
        last_change = start_time
        results_count = 0
        while True:
            status = self._scanner.ajaxSpider.status
            try:
                results_count = int(self._scanner.ajaxSpider.number_of_results)
            except (TypeError, ValueError):
                results_count = last_results if last_results >= 0 else 0
            if results_count != last_results:
                logger.info("AJAX Spider results: %s (status=%s)", results_count, status)
                last_results = results_count
                last_change = time.time()
            if status == "stopped":
                break
            now = time.time()
            if now - start_time > timeout_minutes * 60.0:
                logger.warning(
                    "AJAX Spider timed out after %.2f minutes, stopping", timeout_minutes
                )
                self._scanner.ajaxSpider.stop()
                break
            if now - last_change >= float(self.spider_stall_seconds):
                logger.warning(
                    "AJAX Spider stalled (no new results for %ss, count=%s), stopping",
                    self.spider_stall_seconds,
                    results_count,
                )
                self._scanner.ajaxSpider.stop()
                break
            time.sleep(2)
        return int(self._scanner.ajaxSpider.number_of_results)

    def _ajax_spider_scan_impl(self, url, timeout_minutes=None):
        timeout_minutes = self._as_timeout_minutes(timeout_minutes, self.ajax_spider_timeout)
        scanner_max_duration = max(1, int(timeout_minutes + 0.999))
        self._scanner.ajaxSpider.set_option_max_duration(scanner_max_duration)
        self._scanner.ajaxSpider.scan(url)
        logger.info(
            "AJAX Spider started on %s timeout=%.2f min stall=%ss",
            url,
            timeout_minutes,
            self.spider_stall_seconds,
        )
        if self._ajax_wait_until_running() == "stopped":
            logger.warning("AJAX Spider stopped immediately, nothing to crawl")
            return 0
        results_count = self._ajax_poll_until_done(timeout_minutes)
        logger.info(f"AJAX Spider found {results_count} URLs")
        return results_count

    def ajax_spider_status(self):
        self._ensure_connected()
        return self._scanner.ajaxSpider.status

    # ========== CLIENT SPIDER (G-45) ==========

    def client_spider_scan(
        self,
        url=None,
        context_name=None,
        timeout_minutes=None,
        browser_id=None,
    ):
        """Client Spider — DOM/SPA обход (G-45). MethodId: КраулерКлиент."""
        url, context_name, timeout_minutes, _ = self._normalize_spider_scan_args(
            url, context_name, timeout_minutes, None
        )
        self._set_client_spider_options(browser_id=browser_id)
        return self._client_spider_scan_impl(url, context_name, timeout_minutes)

    def _set_client_spider_options(
        self,
        max_depth=5,
        number_of_browsers=1,
        browser_id=None,
        page_load_time=None,
    ):
        self._ensure_connected()
        self._scanner.clientSpider.set_option_max_depth(max_depth)
        self._scanner.clientSpider.set_option_thread_count(number_of_browsers)
        if browser_id:
            self._scanner.clientSpider.set_option_browser_id(browser_id)
        if page_load_time is not None:
            self._scanner.clientSpider.set_option_page_load_time_in_secs(page_load_time)

    def _client_spider_scan_impl(self, url, context_name=None, timeout_minutes=None):
        timeout_minutes = self._as_timeout_minutes(
            timeout_minutes, self.client_spider_timeout
        )
        scanner_max_duration = max(1, int(timeout_minutes + 0.999))
        self._scanner.clientSpider.set_option_max_duration(scanner_max_duration)

        kwargs = {}
        if url:
            kwargs["url"] = url
        if context_name:
            kwargs["contextname"] = context_name

        logger.info(
            "Client Spider starting on %s context=%s timeout=%.2f min stall=%ss",
            url,
            context_name,
            timeout_minutes,
            self.spider_stall_seconds,
        )
        scan_id = self._scanner.clientSpider.scan(**kwargs)
        logger.info("Client Spider scan id: %s", scan_id)

        last_progress = self._poll_percent_scan(
            label="Client Spider",
            status_fn=self._scanner.clientSpider.status,
            stop_fn=self._scanner.clientSpider.stop,
            timeout_minutes=timeout_minutes,
            scan_id=scan_id,
        )
        logger.info("Client Spider finished at %.1f%%", last_progress)
        return int(last_progress)

    def client_spider_status(self, scan_id):
        self._ensure_connected()
        return float(self._scanner.clientSpider.status(scan_id))

    def stop_client_spider(self, scan_id):
        self._ensure_connected()
        self._scanner.clientSpider.stop(scan_id)

    # ========== АКТИВНОЕ СКАНИРОВАНИЕ ==========

    def active_scan(self, url=None, context_name=None, timeout_minutes=None):
        """
        Запуск активного сканирования с таймаутом.
        URL опционален → base_url (как Открыть / Сканер).
        timeout_minutes — максимальное время сканирования в минутах.
        """
        self._ensure_connected()
        url, context_name, timeout_minutes = self._normalize_active_scan_args(
            url, context_name, timeout_minutes
        )

        # Из wire таймаут приходит строкой; 0.5 = 30 секунд — тоже валидно.
        timeout_minutes = self._as_timeout_minutes(timeout_minutes, self.active_scan_timeout)

        self.active_scan_truncated = False

        # SCAN-DEPTH: агрессивная глубина (High/Low) + чистый scope ДО атаки, иначе
        # active scan на DEFAULT strength тонет в статик-мусоре и не доходит до SQLi/XSS.
        self.harden_active_scan(context_name)

        context = context_name or self.context_name
        if context:
            context_id = self._get_context_id(context)
            logger.info(f"Active scan with context: {context} (ID: {context_id})")
            scan_id = self._scanner.ascan.scan(url, contextid=context_id, recurse=True)
        else:
            scan_id = self._scanner.ascan.scan(url)

        if not str(scan_id).isdigit():
            logger.error(f"Active scan failed: {scan_id}")
            return []

        logger.info(f"Active scan started with ID: {scan_id}")
        
        start_time = time.time()
        while True:
            # Проверяем таймаут
            if time.time() - start_time > timeout_minutes * 60:
                self.active_scan_truncated = True
                logger.warning(f"Active scan timed out after {timeout_minutes} minutes, stopping scan")
                try:
                    self._scanner.ascan.stop(scan_id)
                except Exception as e:
                    logger.debug(f"Stop error: {e}")
                break
            
            try:
                status = int(self._scanner.ascan.status(scan_id))
                if status >= 100:
                    break
            except Exception as e:
                logger.debug(f"Status check error: {e}")
                break
            
            time.sleep(5)

        count = self._count_alerts(baseurl=url)
        if self.active_scan_truncated:
            logger.error(
                "Active scan STOPPED BY TIMEOUT (truncated) after %.2f min — partial count %s; "
                "not a complete scan",
                timeout_minutes,
                count,
            )
        else:
            logger.info(f"Active scan completed, found {count} alerts")
        return count

    def _count_alerts(self, *, baseurl=None):
        """Число alerts БЕЗ вычитки всех объектов пагинацией.

        active_scan возвращает только счётчик; вычитывать 25k+ объектов (129 запросов подряд)
        — источник глубокого slice `start=21600` и зависания демона. `number_of_alerts` считает
        на стороне ZAP одним запросом; фолбэк — пагинация (старые биндинги).
        """
        self._ensure_connected()
        kwargs = {}
        if baseurl:
            kwargs["baseurl"] = str(baseurl)
        try:
            return int(self._scanner.core.number_of_alerts(**kwargs))
        except Exception as e:
            logger.warning("number_of_alerts unavailable (%s); fallback to paginated count", e)
            return len(self._fetch_alerts_paginated(baseurl=baseurl))

    def active_scan_status(self, scan_id):
        self._ensure_connected()
        return int(self._scanner.ascan.status(scan_id))

    def stop_active_scan(self, scan_id):
        self._ensure_connected()
        self._scanner.ascan.stop(scan_id)

    # ========== ПАССИВНОЕ СКАНИРОВАНИЕ ==========

    def passive_scan_wait(self, timeout_minutes=None):
        """
        Ожидает завершения пассивного сканирования.
        timeout_minutes — таймаут в минутах (по умолчанию 5).
        """
        self._ensure_connected()
        if timeout_minutes is None:
            timeout_minutes = 5
        else:
            timeout_minutes = int(timeout_minutes)

        logger.info(f"Waiting for passive scan to finish (timeout {timeout_minutes} min)")
        start_time = time.time()
        while True:
            try:
                # scanner API отдаёт число строкой: без int() сравнение с нулём никогда
                # не срабатывает и ожидание всегда выкручивается в полный таймаут.
                remaining = int(self._scanner.pscan.records_to_scan)
                logger.debug(f"Passive scan remaining: {remaining}")
                if remaining == 0:
                    logger.info("Passive scan completed")
                    return True
                if time.time() - start_time > timeout_minutes * 60:
                    logger.warning(f"Passive scan timeout after {timeout_minutes} min, remaining {remaining}")
                    return False
                time.sleep(2)
            except Exception as e:
                logger.warning(f"Error while waiting for passive scan: {e}")
                time.sleep(2)

    def passive_records_to_scan(self) -> int:
        self._ensure_connected()
        return int(self._scanner.pscan.records_to_scan)

    def passive_scan_wait_seconds(self, timeout_seconds=60):
        """Пассив с капом в секундах (GATHER final wait)."""
        self._ensure_connected()
        timeout_seconds = max(1.0, float(timeout_seconds))
        logger.info(
            "Waiting for passive scan (timeout %.1fs)", timeout_seconds
        )
        start_time = time.time()
        while True:
            try:
                remaining = int(self._scanner.pscan.records_to_scan)
                if remaining == 0:
                    logger.info("Passive scan completed")
                    return True
                if time.time() - start_time > timeout_seconds:
                    logger.warning(
                        "Passive scan timeout after %.1fs, remaining %s",
                        timeout_seconds,
                        remaining,
                    )
                    return False
                time.sleep(0.5)
            except Exception as e:
                logger.warning("Error while waiting for passive scan: %s", e)
                time.sleep(0.5)

    def enable_all_passive_scanners(self):
        """Включает все пассивные сканеры (GATHER start)."""
        self._ensure_connected()
        self._scanner.pscan.enable_all_scanners()
        logger.info("All passive scanners enabled")

    # ========== HTTP SESSIONS ==========

    def get_sessions_sites(self):
        """Возвращает список сайтов, для которых scanner обнаружил HTTP-сессии."""
        self._ensure_connected()
        return self._scanner.http_sessions.sites

    def get_site_sessions(self, site, session_name=None):
        """Возвращает список сессий для указанного сайта."""
        self._ensure_connected()
        if session_name:
            return self._scanner.http_sessions.sessions(site, session=session_name)
        else:
            return self._scanner.http_sessions.sessions(site)

    # ========== УПРАВЛЕНИЕ ПАССИВНЫМИ СКАНЕРАМИ ==========

    def get_passive_scanners(self):
        """Возвращает список всех пассивных сканеров с их параметрами."""
        self._ensure_connected()
        return self._scanner.pscan.scanners

    def enable_passive_scanners(self, ids):
        """Включает пассивные сканеры по списку ID."""
        self._ensure_connected()
        self._scanner.pscan.enable_scanners(ids)
        logger.info(f"Passive scanners enabled: {ids}")

    def disable_all_passive_scanners(self):
        """Отключает все пассивные сканеры."""
        self._ensure_connected()
        self._scanner.pscan.disable_all_scanners()
        logger.info("All passive scanners disabled")

    # ========== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ==========

    def create_user(self, context_name, username):
        """
        Создаёт пользователя в указанном контексте.
        Возвращает user_id (число или строку).
        """
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        result = self._scanner.users.new_user(contextid=context_id, name=username)
        
        # Если result — словарь, извлекаем userId/id
        if isinstance(result, dict):
            user_id = result.get("userId") or result.get("id")
        else:
            # Если result — строка, это и есть user_id
            user_id = str(result)
        
        if user_id is None:
            raise ValueError(f"Failed to create user: {result}")
        
        logger.info(f"User '{username}' created with ID: {user_id}")
        return user_id

    def set_user_credentials(self, context_name, user_id, username, password):
        """
        Устанавливает учётные данные (логин/пароль) для пользователя.
        """
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        # В некоторых версиях этот метод может возвращать строку или словарь, игнорируем результат
        try:
            self._scanner.users.set_authentication_credentials(
                contextid=context_id,
                userid=user_id,
                authcredentialsconfigparams={
                    "username": username,
                    "password": password
                }
            )
            logger.info(f"Credentials set for user ID: {user_id}")
        except Exception as e:
            logger.error(f"Failed to set credentials for user {user_id}: {e}")
            raise

    def enable_user(self, context_name, user_id):
        """
        Активирует пользователя (делает доступным).
        """
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        try:
            self._scanner.users.set_user_enabled(contextid=context_id, userid=user_id, enabled=True)
            logger.info(f"User ID: {user_id} enabled")
        except Exception as e:
            logger.error(f"Failed to enable user {user_id}: {e}")
            raise

    def disable_user(self, context_name, user_id):
        """
        Деактивирует пользователя.
        """
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        try:
            self._scanner.users.set_user_enabled(contextid=context_id, userid=user_id, enabled=False)
            logger.info(f"User ID: {user_id} disabled")
        except Exception as e:
            logger.error(f"Failed to disable user {user_id}: {e}")
            raise

    def get_users(self, context_name):
        """
        Возвращает список всех пользователей в контексте.
        """
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        result = self._scanner.users.users_list(contextid=context_id)
        # result может быть словарем со списком или строкой, проверяем
        if isinstance(result, dict):
            return result.get("usersList", [])
        else:
            # если строка, пробуем распарсить как JSON
            try:
                import json
                data = json.loads(result)
                return data.get("usersList", [])
            except Exception:
                return []

    def new_user_intercept_context(self, context_name, username, login=None, password=None):
        """
        Создаёт пользователя, устанавливает креды (если переданы) и активирует его.
        Возвращает user_id.
        """
        user_id = self.create_user(context_name, username)
        if login is not None and password is not None:
            self.set_user_credentials(context_name, user_id, login, password)
        self.enable_user(context_name, user_id)
        logger.info(f"User '{username}' (ID: {user_id}) fully configured and enabled")
        return user_id

    # ========== FORCED USER MODE ==========

    def set_forced_user(self, context_name, user_id):
        """
        Устанавливает принудительного пользователя для контекста.
        Все запросы в этом контексте будут отправляться от имени указанного пользователя.
        """
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        try:
            self._scanner.forcedUser.set_forced_user(context_id, user_id)
            logger.info(f"Forced user set: context={context_name}, user={user_id}")
        except Exception as e:
            logger.error(f"Failed to set forced user: {e}")
            raise

    def enable_forced_user_mode(self, context_name):
        """
        Включает режим принудительного пользователя для контекста.
        """
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        try:
            self._scanner.forcedUser.set_forced_user_mode_enabled(context_id, True)
            logger.info(f"Forced user mode enabled for context: {context_name}")
        except Exception as e:
            logger.error(f"Failed to enable forced user mode: {e}")
            raise

    def disable_forced_user_mode(self, context_name):
        """
        Выключает режим принудительного пользователя для контекста.
        """
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        try:
            self._scanner.forcedUser.set_forced_user_mode_enabled(context_id, False)
            logger.info(f"Forced user mode disabled for context: {context_name}")
        except Exception as e:
            logger.error(f"Failed to disable forced user mode: {e}")
            raise

    def create_and_force_user(self, context_name, username, login=None, password=None):
        user_id = self.new_user_intercept_context(context_name, username, login, password)
        self.set_forced_user(context_name, user_id)
        self.enable_forced_user_mode(context_name)
        return user_id

    # ========== ПОЛИТИКИ СКАНИРОВАНИЯ ==========

    def get_scan_policies(self):
        self._ensure_connected()
        return self._scanner.ascan.scan_policies()

    def set_scan_policy(self, policy_name, depth_profile=None):
        """
        Установить политику active scan по имени.
        Опционально depth_profile (smoke/deep/api) — G-49 strength/threshold.
        """
        self._ensure_connected()
        policy = str(policy_name or "").strip()
        if not policy:
            raise WiredError("ПолитикаСканирования: пустое имя политики")
        self._scanner.ascan.set_scan_policy(policy)
        if depth_profile not in (None, ""):
            self.apply_scan_depth_profile(depth_profile, scan_policy_name=policy)
        else:
            logger.info("Scan policy set to: %s", policy)

    def apply_scan_depth_profile(self, profile_name, scan_policy_name=None):
        """
        G-49: strength/threshold для профиля smoke/deep/api на named policy.
        MethodId: ``ПрофильСканирования``.
        """
        from core.af_plan import SCAN_DEPTH_PROFILES

        key = str(profile_name or "").strip().lower()
        spec = SCAN_DEPTH_PROFILES.get(key)
        if spec is None:
            known = ", ".join(sorted(k for k, v in SCAN_DEPTH_PROFILES.items() if v))
            raise WiredError(
                f"ПрофильСканирования: неизвестный профиль {profile_name!r}; "
                f"ожидается один из: {known}"
            )
        policy = str(scan_policy_name or spec.get("policy_name") or "Default Policy").strip()
        strength = spec["defaultStrength"]
        threshold = spec["defaultThreshold"]
        self._ensure_connected()
        self._scanner.ascan.set_scan_policy(policy)
        self._set_policy_defaults(policy, strength, threshold)
        logger.info(
            "Scan depth profile %s → policy=%s strength=%s threshold=%s",
            key,
            policy,
            strength,
            threshold,
        )
        return {"profile": key, "policy": policy, "strength": strength, "threshold": threshold}

    def _set_policy_defaults(self, policy_name, strength, threshold):
        """Выставить default strength/threshold для всех категорий политики.

        ZAP `setPolicyAttackStrength` проводит sentinel ``-1`` (all) без эффекта:
        strength остаётся DEFAULT. Работает только перебор категорий политики
        (id 0-4), полученных из ``ascan.policies``.
        """
        set_strength = getattr(self._scanner.ascan, "set_policy_attack_strength", None)
        set_threshold = getattr(self._scanner.ascan, "set_policy_alert_threshold", None)
        category_ids = ["0", "1", "2", "3", "4"]
        try:
            pols = self._scanner.ascan.policies(scanpolicyname=policy_name)
            if isinstance(pols, list) and pols and isinstance(pols[0], dict):
                got = [
                    str(p.get("id"))
                    for p in pols
                    if isinstance(p, dict) and p.get("id") is not None
                ]
                if got:
                    category_ids = got
        except Exception as exc:
            logger.debug(
                "ascan policies unavailable (%s); using default category ids", exc
            )
        for cid in category_ids:
            if set_strength is not None:
                try:
                    set_strength(cid, strength, scanpolicyname=policy_name)
                except Exception as exc:
                    logger.debug("ascan policy strength id=%s failed: %s", cid, exc)
            if set_threshold is not None:
                try:
                    set_threshold(cid, threshold, scanpolicyname=policy_name)
                except Exception as exc:
                    logger.debug("ascan policy threshold id=%s failed: %s", cid, exc)

    def harden_active_scan(self, context_name=None):
        """SCAN-DEPTH: агрессивная глубина + чистый scope перед активным сканом.

        Корень «active scan 100% passive / High=0» — не отключённые правила (все
        enabled), а DEFAULT strength/threshold + scope, раздутый статик-мусором
        (8617 узлов; скан стопился на 35%, не дойдя до SQLi-точки). Тут:
          1) strength=HIGH / threshold=LOW на политике по умолчанию (один раз);
          2) static/node_modules/assets — out of scope (один раз на контекст).
        """
        self._ensure_connected()
        if not self._active_scan_hardened:
            try:
                self._set_policy_defaults("Default Policy", "High", "Low")
                self._active_scan_hardened = True
                logger.info(
                    "active scan hardened: Default Policy strength=High threshold=Low"
                )
            except Exception as exc:
                logger.warning("active scan depth hardening failed: %s", exc)

        ctx = (context_name or self.context_name or "").strip()
        if ctx and ctx not in self._scope_excluded_contexts:
            ok = 0
            for rx in ACTIVE_SCAN_NOISE_EXCLUDES:
                try:
                    self._scanner.context.exclude_from_context(ctx, rx)
                    ok += 1
                except Exception as exc:
                    logger.debug("context exclude %s skipped: %s", rx, exc)
            self._scope_excluded_contexts.add(ctx)
            logger.info(
                "active scan scope cleanup: %s/%s noise excludes for context %s",
                ok,
                len(ACTIVE_SCAN_NOISE_EXCLUDES),
                ctx,
            )

    # ========== АЛЕРТЫ ==========

    def reset_alerts(self):
        """Каноничная свежая сессия ZAP на каждый прогон (follow-up BOX-LIVE-4).

        Вызывается один раз на старт каждого run (из `_ensure_connected`). Без сброса ZAP
        копит alerts И site-tree между run'ами: `_fetch_alerts_paginated` упирается в глубокий
        slice (`start=21600`) → ProxyError → рестарт контейнера. `new_session` чистит и alerts,
        и сайты (детерминированный per-run объём); фолбэк — `delete_all_alerts` (только alerts).
        Дополнительно (BOX-SAN-1) удаляет именованные контексты (`juice_ctx` и др.), чтобы
        active/spider не тащили чужой скоуп прошлого прогона. Возвращает True при успехе,
        False при недоступности — прогон не отбрасывается.
        """
        self._ensure_connected()
        reset_ok = False
        try:
            self._scanner.core.new_session()
            logger.info("scanner new session (fresh per run)")
            reset_ok = True
        except Exception as e:
            logger.warning("scanner new_session unavailable (%s); fallback delete_all_alerts", e)
        if not reset_ok:
            try:
                self._scanner.core.delete_all_alerts()
                logger.info("scanner alerts reset (fresh session for run)")
                reset_ok = True
            except Exception as e:
                logger.warning("scanner delete_all_alerts skipped: %s", e)
        # BOX-SAN-1: new_session/delete_all_alerts чистит alerts/site-tree, но именованные
        # контексты могли остаться от прошлого прогона — явно удаляем их.
        self._purge_named_contexts()
        return reset_ok

    def _purge_named_contexts(self) -> None:
        """BOX-SAN-1: удалить именованные ZAP-контексты от прошлого прогона.

        `Default Context` не трогаем; локальный `context_name` обнуляется. Best-effort —
        любой сбой только логируется (прогон не отбрасывается).
        """
        try:
            contexts = self.list_contexts()
        except Exception as exc:
            logger.debug("scanner list_contexts unavailable: %s", exc)
            self.context_name = None
            return
        for name in contexts or []:
            if not name or str(name).strip() == "Default Context":
                continue
            try:
                self._scanner.context.remove_context(name)
                logger.info("scanner removed stale context: %s", name)
            except Exception as exc:
                logger.warning("scanner remove_context(%s) skipped: %s", name, exc)
        self.context_name = None

    def _fetch_alerts_paginated(self, *, riskid=None, baseurl=None, page_size=200):
        """
        scanner core.alerts() без start/count отдаёт мегабайты JSON → IncompleteRead.
        Тянем страницами; riskid (0..3) и baseurl (scope URL) сужают выборку НА СТОРОНЕ
        scanner ДО пагинации — глубокий slice по всей истории сессии не возникает.
        """
        self._ensure_connected()
        out = []
        start = 0
        size = max(1, int(page_size or 200))
        while True:
            kwargs = {"start": start, "count": size}
            if riskid is not None:
                kwargs["riskid"] = str(riskid)
            if baseurl:
                kwargs["baseurl"] = str(baseurl)
            try:
                batch = self._scanner.core.alerts(**kwargs)
            except TypeError:
                # Старые биндинги без riskid/baseurl
                kwargs.pop("riskid", None)
                kwargs.pop("baseurl", None)
                batch = self._scanner.core.alerts(**kwargs)
            if not batch:
                break
            if not isinstance(batch, list):
                batch = list(batch)
            out.extend(batch)
            if len(batch) < size:
                break
            start += len(batch)
            if start > 100_000:
                logger.warning("scanner alerts: обрезка после %s (защита от цикла)", start)
                break
        return out

    @staticmethod
    def _alert_matches_risk(alert: dict, risk_l: str) -> bool:
        risk_name = str(alert.get("risk", "")).strip().lower()
        riskcode = str(alert.get("riskcode"))
        if risk_name == risk_l:
            return True
        if risk_l in ("informational", "info") and risk_name in ("informational", "info"):
            return True
        code_map = {
            "high": "3",
            "medium": "2",
            "low": "1",
            "informational": "0",
            "info": "0",
        }
        return code_map.get(risk_l) == riskcode

    def get_alerts(self, context_name=None, risk=None, url=None):
        self._ensure_connected()
        risk_l = str(risk).strip().lower() if risk else ""
        riskid = {
            "high": "3",
            "medium": "2",
            "low": "1",
            "informational": "0",
            "info": "0",
        }.get(risk_l)
        alerts = self._fetch_alerts_paginated(riskid=riskid, baseurl=url)
        if context_name:
            alerts = [a for a in alerts if a.get("contextId") == context_name]
        if risk:
            alerts = [a for a in alerts if self._alert_matches_risk(a, risk_l)]
        # url → baseurl ушёл на сторону scanner ДО пагинации (scope/prefix); точное
        # совпадение по-прежнему добивается клиентски (baseurl не exact-match).
        if url:
            alerts = [a for a in alerts if a.get("url") == url]
        return alerts

    def get_alerts_by_baseurl(self, baseurl, risk=None):
        """Alerts по baseurl (scope/prefix на стороне scanner) БЕЗ exact-match.

        BOX-GATE-NORM: для alert-diff фаззера достаточно скоупа endpoint (baseurl без
        query), а не всей сессии. Полная пагинация всех alerts (25k+) — источник
        зависания демона; тут сужаем выборку ДО пагинации.
        """
        self._ensure_connected()
        risk_l = str(risk).strip().lower() if risk else ""
        riskid = {
            "high": "3",
            "medium": "2",
            "low": "1",
            "informational": "0",
            "info": "0",
        }.get(risk_l)
        return self._fetch_alerts_paginated(riskid=riskid, baseurl=baseurl)

    def get_alert_count(self, context_name=None):
        self._ensure_connected()
        return len(self.get_alerts(context_name))

    @staticmethod
    def _alert_filter_level(new_level) -> str:
        """scanner newlevel: -1 False Positive, 0–3 risk. Accepts labels."""
        raw = str(new_level).strip()
        key = raw.lower().replace(" ", "")
        labels = {
            "falsepositive": "-1",
            "fp": "-1",
            "info": "0",
            "informational": "0",
            "low": "1",
            "medium": "2",
            "high": "3",
        }
        if key in labels:
            return labels[key]
        return raw

    def add_alert_filter(
        self,
        context_name,
        rule_id,
        new_level,
        url=".*",
        url_is_regex=True,
        parameter="",
        enabled=True,
    ):
        """Context Alert Filter (до скана). new_level: -1 FP или 0–3 / label."""
        self._ensure_connected()
        context_id = self._get_context_id(context_name)
        level = self._alert_filter_level(new_level)
        url_flag = "true" if str(url_is_regex).lower() in ("1", "true", "yes") else "false"
        en_flag = "true" if str(enabled).lower() in ("1", "true", "yes") else "false"
        self._scanner.alertFilter.add_alert_filter(
            contextid=str(context_id),
            ruleid=str(rule_id),
            newlevel=str(level),
            url=str(url or ".*"),
            urlisregex=url_flag,
            parameter=str(parameter or ""),
            enabled=en_flag,
        )
        logger.info(
            "Alert filter context=%s rule=%s level=%s url=%s",
            context_name,
            rule_id,
            level,
            url,
        )

    def add_global_alert_filter(
        self,
        rule_id,
        new_level,
        url=".*",
        url_is_regex=True,
        parameter="",
        enabled=True,
    ):
        """Global Alert Filter."""
        self._ensure_connected()
        level = self._alert_filter_level(new_level)
        url_flag = "true" if str(url_is_regex).lower() in ("1", "true", "yes") else "false"
        en_flag = "true" if str(enabled).lower() in ("1", "true", "yes") else "false"
        self._scanner.alertFilter.add_global_alert_filter(
            ruleid=str(rule_id),
            newlevel=str(level),
            url=str(url or ".*"),
            urlisregex=url_flag,
            parameter=str(parameter or ""),
            enabled=en_flag,
        )
        logger.info("Global alert filter rule=%s level=%s url=%s", rule_id, level, url)

    def _resolve_alert_filter_path(self, file_path):
        from pathlib import Path

        path = Path(str(file_path))
        if path.is_file():
            return path
        alt = Path(__file__).resolve().parents[1] / path
        return alt if alt.is_file() else path

    def _load_alert_filter_doc(self, path):
        import json

        text = path.read_text(encoding="utf-8")
        suffix = path.suffix.lower()
        if suffix not in (".yaml", ".yml"):
            return json.loads(text)
        try:
            import yaml  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "Для .yaml нужен PyYAML (pip install pyyaml) или используйте .json"
            ) from exc
        return yaml.safe_load(text) or {}

    def load_alert_filters(self, file_path, context_name=None):
        """
        Загрузить фильтры из JSON/YAML.
        Формат::
          {"context": "juice_ctx", "filters": [{"rule_id": 10021, "new_level": -1, "url": ".*"}]}
        context в файле или аргумент context_name; без context → global.
        """
        path = self._resolve_alert_filter_path(file_path)
        doc = self._load_alert_filter_doc(path)
        ctx = (context_name or doc.get("context") or "").strip() or None
        filters = doc.get("filters") or []
        for item in filters:
            rule_id = item.get("rule_id") or item.get("ruleid")
            new_level = item.get("new_level", item.get("newlevel", "-1"))
            url = item.get("url", ".*")
            url_is_regex = item.get("url_is_regex", item.get("urlisregex", True))
            parameter = item.get("parameter", "")
            enabled = item.get("enabled", True)
            if ctx:
                self.add_alert_filter(
                    ctx, rule_id, new_level, url, url_is_regex, parameter, enabled
                )
            else:
                self.add_global_alert_filter(
                    rule_id, new_level, url, url_is_regex, parameter, enabled
                )
        logger.info("Loaded %s alert filter(s) from %s", len(filters), path)
        return len(filters)

    def log_attack(self, message: str) -> None:
        """
        Маркер атаки для Live «Проверки безопасности» (channel=scanner, kind=LOG).

        message — готовый текст после «ЛогАтаки | », например
        ``Замена: payload:'${x}'`` или ``вошли как user@x, cookies 12``.
        Публикация в diary_bus — в controller._publish_log_attack_live.
        """
        msg = str(message or "").strip()
        if msg:
            logger.info("[ATTACK-LOG] %s", msg)

    # ========== Automation Framework (G-38) ==========

    def run_automation_plan(self, file_path, timeout_minutes=None):
        """
        Запустить AF YAML через automation.runPlan и ждать завершения.
        timeout_minutes — потолок ожидания (default = active_scan_timeout).
        Возвращает planId (str).
        """
        self._ensure_connected()
        from pathlib import Path

        path = Path(str(file_path))
        if not path.is_file():
            alt = Path(__file__).resolve().parents[1] / path
            if alt.is_file():
                path = alt
        if not path.is_file():
            raise WiredError(f"AF plan not found: {file_path}")
        abs_path = str(path.resolve())
        timeout_minutes = self._as_timeout_minutes(
            timeout_minutes, self.active_scan_timeout
        )
        logger.info(
            "AF runPlan %s timeout=%.2f min", abs_path, timeout_minutes
        )
        raw = self._scanner.automation.run_plan(abs_path)
        plan_id = self._extract_plan_id(raw)
        if not plan_id:
            raise WiredError(f"AF runPlan: empty planId from {raw!r}")
        self._wait_automation_plan(plan_id, timeout_minutes)
        return plan_id

    def automation_plan_progress(self, plan_id):
        """Сырой planProgress для диагностики."""
        self._ensure_connected()
        return self._scanner.automation.plan_progress(planid=str(plan_id))

    def stop_automation_plan(self, plan_id):
        self._ensure_connected()
        try:
            self._scanner.automation.stop_plan(planid=str(plan_id))
        except Exception as exc:
            # Старые add-on без stopPlan — best-effort.
            logger.warning("AF stopPlan failed: %s", exc)

    @staticmethod
    def _extract_plan_id(raw) -> str:
        if raw is None:
            return ""
        if isinstance(raw, dict):
            return str(raw.get("planId") or raw.get("planid") or "").strip()
        text = str(raw).strip()
        return text

    def _wait_automation_plan(self, plan_id, timeout_minutes: float) -> None:
        start = time.time()
        last_info = ""
        while True:
            prog = self.automation_plan_progress(plan_id)
            finished = self._af_plan_finished(prog)
            info = str(prog)[:200]
            if info != last_info:
                logger.info("AF plan %s progress: %s", plan_id, info)
                last_info = info
            if finished:
                logger.info("AF plan %s finished", plan_id)
                return
            if time.time() - start > float(timeout_minutes) * 60.0:
                logger.error(
                    "AF plan %s timed out after %.2f min — stopping",
                    plan_id,
                    timeout_minutes,
                )
                self.stop_automation_plan(plan_id)
                raise WiredError(
                    f"AF plan {plan_id} timed out after {timeout_minutes} min"
                )
            time.sleep(2.0)

    @staticmethod
    def _af_plan_finished(prog) -> bool:
        if prog is None:
            return False
        if isinstance(prog, dict):
            # AF: finished — ISO-timestamp или true; пока бежит — "" / false / null
            finished = prog.get("finished")
            if finished is True or (isinstance(finished, str) and finished.strip()):
                return True
            stopped = prog.get("stopped")
            if stopped is True or (
                isinstance(stopped, str) and stopped.strip().lower() in ("true", "1", "yes")
            ):
                return True
            err = prog.get("error")
            if err is True or (isinstance(err, str) and err.strip()):
                return True
            status = str(prog.get("status") or prog.get("state") or "").lower()
            return status in (
                "finished",
                "complete",
                "completed",
                "error",
                "failed",
                "stopped",
            )
        text = str(prog).lower()
        return "finished" in text and "null" not in text

    def summarize_high_alerts(self, limit=30):
        """Совместимость: High-only. Для порога G-19 — _summarize_gate_alerts."""
        return self._summarize_gate_alerts(risks=("High",), limit=limit)

    @staticmethod
    def _gate_alert_line(alert: dict) -> str:
        name = (alert.get("alert") or alert.get("name") or "alert").strip()
        url = (alert.get("url") or "").strip()
        risk_name = (alert.get("risk") or "").strip()
        prefix = f"[{risk_name}] " if risk_name else ""
        return f"{prefix}{name} @ {url}" if url else f"{prefix}{name}"

    def _summarize_gate_alerts(self, risks=None, limit=30):
        """
        Уникальные алерты для quality gate: имя + URL, без дублей.
        risks — уровни scanner (High/Medium/…); None → PK_GATE_SEVERITY и выше.
        Не keyword (leading _).
        """
        if risks is None:
            from core.gate_policy import severities_at_or_above

            risks = tuple(severities_at_or_above())
        all_alerts = []
        for risk in risks:
            all_alerts.extend(self.get_alerts(risk=risk))
        seen = set()
        lines = []
        for alert in all_alerts:
            name = (alert.get("alert") or alert.get("name") or "alert").strip()
            url = (alert.get("url") or "").strip()
            key = (name, url)
            if key in seen:
                continue
            seen.add(key)
            if limit is None or len(lines) < int(limit):
                lines.append(self._gate_alert_line(alert))
        return {
            "total": len(all_alerts),
            "unique": len(seen),
            "lines": lines,
            "risks": list(risks),
        }

    @staticmethod
    def _live_risk_kind(risk_raw: str) -> tuple[str, str]:
        raw = str(risk_raw).strip()
        if raw.lower() in ("informational", "info"):
            return "Informational", "INFO"
        risk_name = raw.title()
        return risk_name, risk_name.upper()

    def _collect_live_risk_alerts(
        self,
        *,
        risk,
        seen: set,
        items: list,
        limit,
    ) -> tuple[int, int]:
        risk_name, kind = self._live_risk_kind(risk)
        alerts = self.get_alerts(risk=risk_name)
        unique_for_risk = 0
        for alert in alerts:
            name = (alert.get("alert") or alert.get("name") or "alert").strip()
            url = (alert.get("url") or "").strip()
            plugin = (alert.get("pluginId") or alert.get("alertRef") or "").strip()
            key = (kind, name, url, plugin)
            if key in seen:
                continue
            seen.add(key)
            unique_for_risk += 1
            if limit is not None and len(items) >= int(limit):
                continue
            line = self._format_alert_live_line(alert, risk_name=risk_name, plugin=plugin)
            items.append({"kind": kind, "line": line})
        return len(alerts), unique_for_risk

    def summarize_alerts_for_live(
        self,
        risks=("High", "Medium", "Low", "Informational"),
        limit=None,
    ):
        """
        Все риски scanner для Live channel=scanner (паук/скан/пейлоад/скрипт — по имени алерта).
        limit=None — без обрезки.
        """
        items = []
        seen = set()
        tallies = {}
        for risk in risks:
            _, kind = self._live_risk_kind(risk)
            total, unique = self._collect_live_risk_alerts(
                risk=risk, seen=seen, items=items, limit=limit
            )
            tallies[f"{kind.lower()}_total"] = total
            tallies[f"{kind.lower()}_unique"] = unique
        return {
            "high_total": tallies.get("high_total", 0),
            "high_unique": tallies.get("high_unique", 0),
            "medium_total": tallies.get("medium_total", 0),
            "medium_unique": tallies.get("medium_unique", 0),
            "low_total": tallies.get("low_total", 0),
            "low_unique": tallies.get("low_unique", 0),
            "info_total": tallies.get("info_total", 0),
            "info_unique": tallies.get("info_unique", 0),
            "items": items,
        }

    @staticmethod
    def _short_confidence(raw) -> str:
        """scanner confidence → короткий код: C:H / C:M / C:L / C:! (confirmed)."""
        s = str(raw or "").strip().lower()
        if not s:
            return ""
        if s in ("3", "high"):
            return "C:H"
        if s in ("2", "medium"):
            return "C:M"
        if s in ("1", "low"):
            return "C:L"
        if s in ("0", "false positive", "falsepositive"):
            return "C:0"
        if "confirm" in s:
            return "C:!"
        return f"C:{s[:1].upper()}"

    @staticmethod
    def _clip(text, n=48) -> str:
        t = " ".join(str(text or "").split())
        if len(t) <= n:
            return t
        return t[: max(0, n - 1)] + "…"

    def _format_alert_live_line(self, alert: dict, *, risk_name: str, plugin: str) -> str:
        """
        Одна компактная строка: risk, confidence, name, param/evidence/attack, url.
        Без description/solution — они для отчёта, не для Live.
        """
        name = (alert.get("alert") or alert.get("name") or "alert").strip()
        url = (alert.get("url") or "").strip()
        conf = self._short_confidence(alert.get("confidence"))
        param = self._clip(alert.get("param"), 40)
        evidence = self._clip(alert.get("evidence"), 48)
        attack = self._clip(alert.get("attack"), 40)
        bits = [f"[{risk_name}]"]
        if conf:
            bits.append(conf)
        if plugin:
            bits.append(f"p:{plugin}")
        bits.append(name)
        extras = []
        if param:
            extras.append(f"param={param}")
        if evidence:
            extras.append(f"ev={evidence}")
        elif attack:
            extras.append(f"atk={attack}")
        if extras:
            bits.append("(" + "; ".join(extras) + ")")
        if url:
            bits.append("@ " + url)
        return " ".join(bits)

    # ========== СООБЩЕНИЯ ==========

    def get_messages(self, context_name=None, start=None, count=None):
        """Сообщения History (для fuzz Campaign source=history).

        Читаем JSON API напрямую (не через zapv2 proxies→http://scanner/…): на больших
        лентах proxy-путь часто рвётся RemoteDisconnected. По умолчанию — хвост
        истории (до 200), этого хватает для pick после login/seed.
        """
        self._ensure_connected()
        import requests

        base = f"http://{self.host}:{self.port}/JSON/core/view"
        params: dict = {}
        if self.api_key:
            params["apikey"] = self.api_key
        want_start, want_count = start, count
        if want_start is None and want_count is None:
            try:
                n_raw = requests.get(
                    f"{base}/numberOfMessages/", params=params, timeout=30
                ).json()
                n = int(n_raw.get("numberOfMessages") or 0)
            except Exception as exc:
                logger.debug("numberOfMessages failed: %s", exc)
                n = 0
            if n > 200:
                want_start = max(0, n - 200)
                want_count = 200
        if want_start is not None:
            params["start"] = int(want_start)
        if want_count is not None:
            params["count"] = int(want_count)
        try:
            data = requests.get(f"{base}/messages/", params=params, timeout=90).json()
            messages = data.get("messages") or []
        except Exception as exc:
            logger.warning(
                "get_messages direct API failed (%s); fallback zapv2.core.messages",
                exc,
            )
            messages = self._scanner.core.messages()
        if context_name:
            return [m for m in messages if m.get("contextId") == context_name]
        return messages

    # ========== КАСТОМНЫЕ СЛОВАРИ ==========

    def add_custom_payload(self, name, payload_list_or_file):
        self._ensure_connected()
        if isinstance(payload_list_or_file, list):
            payloads = payload_list_or_file
        else:
            with open(payload_list_or_file, 'r', encoding='utf-8') as f:
                payloads = [line.strip() for line in f if line.strip()]
        self._scanner.custompayloads.load_payloads(name, payloads)
        logger.info(f"Loaded {len(payloads)} payloads as '{name}'")
        return True

    def get_payloads(self):
        self._ensure_connected()
        return self._scanner.custompayloads.get_payloads()

    def remove_payload(self, name):
        self._ensure_connected()
        self._scanner.custompayloads.remove_payload(name)

    # ========== OAST ==========

    def start_oast_server(self):
        self._ensure_connected()
        self._scanner.oast.start()
        logger.info("OAST server started")
        return True

    def stop_oast_server(self):
        self._ensure_connected()
        self._scanner.oast.stop()
        logger.info("OAST server stopped")
        return True

    def get_oast_alerts(self):
        self._ensure_connected()
        return self._scanner.oast.get_alerts()

    # ========== LIFECYCLE: полный стоп ==========

    def shutdown_all(self):
        """
        Гасит scanner целиком: API core.shutdown + stop-команды демона/Webswing (env).

        Keyword: внутренний (не MethodId). Вызов из Controller по idle/work timeout.
        Env (опционально, best-effort после API):
          PK_SCANNER_STOP_DAEMON_CMD
          PK_SCANNER_STOP_WEBSWING_CMD
        """
        api_ok = False
        try:
            self._ensure_connected()
            self._scanner.core.shutdown()
            api_ok = True
            logger.info("scanner core.shutdown() sent")
        except Exception as e:
            logger.warning("scanner core.shutdown failed (продолжаем stop-команды): %s", e)

        # Клиент больше не валиден после shutdown.
        self._scanner = None
        self._connected = False

        daemon_stopped = self._try_external_stop(
            "PK_SCANNER_STOP_DAEMON_CMD", "stop scanner daemon"
        )
        swing_stopped = self._try_external_stop(
            "PK_SCANNER_STOP_WEBSWING_CMD", "stop Webswing"
        )
        if not api_ok and not daemon_stopped and not swing_stopped:
            raise WiredError(
                "shutdown_all: не удалось погасить scanner — "
                "API shutdown не прошёл и не заданы "
                "PK_SCANNER_STOP_DAEMON_CMD / PK_SCANNER_STOP_WEBSWING_CMD"
            )
        return True

    def _try_external_stop(self, env_name: str, label: str) -> bool:
        import os

        raw = (os.getenv(env_name) or "").strip()
        if not raw:
            return False
        try:
            self._run_external_mode_cmd(env_name, label)
            return True
        except WiredError as e:
            logger.warning("%s: %s", label, e)
            return False

    # ========== DEV-ONLY: demon → webswing ==========
    # НЕ MethodId / НЕ в keywords.json. Банку не светим: webswing заказывают с старта.
    # Личный wire Максима: scanner|start_webswing / scanner|stop_daemon_start_webswing
    #   PK_SCANNER_STOP_DAEMON_CMD / PK_SCANNER_START_WEBSWING_CMD

    def start_webswing(self):
        """Dev: старт Webswing (env PK_SCANNER_START_WEBSWING_CMD)."""
        return self._run_external_mode_cmd(
            "PK_SCANNER_START_WEBSWING_CMD",
            "start Webswing",
        )

    def stop_daemon_start_webswing(self):
        """Dev: погасить demon → Webswing. Не для портала/банка."""
        self._run_external_mode_cmd(
            "PK_SCANNER_STOP_DAEMON_CMD",
            "stop scanner daemon",
        )
        return self.start_webswing()

    def _run_external_mode_cmd(self, env_name: str, label: str):
        import os
        import subprocess
        import shlex

        raw = (os.getenv(env_name) or "").strip()
        if not raw:
            raise WiredError(
                f"{label}: не задан {env_name}. "
                "Укажи команду раннера (пример: "
                f'{env_name}=\"scanner.bat -host 0.0.0.0 -port 8080\").'
            )
        logger.info("scanner mode cmd (%s): %s", label, raw)
        # shell=True на Windows для .bat; на *nix — список токенов безопаснее
        if os.name == "nt":
            completed = subprocess.run(raw, shell=True, check=False)
        else:
            completed = subprocess.run(shlex.split(raw), check=False)
        if completed.returncode != 0:
            raise WiredError(
                f"{label}: команда завершилась с кодом {completed.returncode}: {raw}"
            )
        # Сбросить клиент — следующий вызов _ensure_connected подхватит новый процесс.
        self._scanner = None
        self._connected = False
        return True

    # ========== ОТЧЁТЫ ==========

    def generate_report(
        self,
        format="html",
        output_file="scanner_report.html",
        attach_to_allure=False,
        template=None,
    ):
        """
        Генерирует отчёт scanner и сохраняет его.
        format/template: html→legacy core.htmlreport (детерминированный файл);
        xml→полный OWASP XML из alerts (Dojo); sarif/json/md/traditional-* — add-on/legacy.
        attach_to_allure: только для html; по умолчанию false (отчёт тяжёлый).
        Явно true/1 — приложить HTML к Allure.
        """
        self._ensure_connected()

        from core.af_plan import normalize_report_template

        attach_to_allure = coerce_attach_flag(attach_to_allure)
        fmt = str(format or "html").strip().lower()
        template_id = normalize_report_template(template or fmt)

        output_path = scanner_report_path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        addon_templates = {
            "traditional-html",
            "traditional-html-plus",
            "sarif-json",
            "risk-confidence-html",
            "traditional-json",
            "traditional-json-plus",
            "traditional-md",
            "traditional-pdf",
            "traditional-xml",
            "traditional-xml-plus",
            "high-level-report",
            "modern",
        }
        if fmt == "xml" and template_id not in addon_templates:
            # SCAN-EXPORT-GAP: core.xmlreport() legacy недоэкспортирует (6 alertitem/23
            # инстанса против полных 6937) — собираем OWASP XML из полного набора alerts.
            return str(self._export_owasp_xml_full(output_path))
        if fmt == "html" and template_id == "traditional-html":
            # html пишется в СВОЙ файл детерминированно (нет add-on path mismatch и
            # глоба `{stem}*`, подхватывающего stale-файл прошлого шага).
            report = self._scanner.core.htmlreport()
            output_path.write_text(report, encoding="utf-8")
            if attach_to_allure:
                attach_scanner_html(report, name=output_path.name)
            return str(output_path)
        if template_id in addon_templates or fmt in ("sarif", "sarif-json", "traditional-html"):
            path = self._generate_report_via_addon(
                template_id,
                output_path,
                attach_to_allure=attach_to_allure and fmt in ("html", "traditional-html"),
            )
            return str(path)

        if fmt == "json":
            report = self._scanner.core.jsonreport()
        elif fmt == "md":
            report = self._scanner.core.mdreport()
        else:
            raise ValueError(f"Unsupported report format: {format}")

        output_path.write_text(report, encoding="utf-8")

        return str(output_path)

    def _generate_report_via_addon(self, template_id, output_path, attach_to_allure=False):
        """Report Generation add-on (G-46): reports.generate / urlopen fallback."""
        title = output_path.stem or "scanner Report"
        report_dir = str(output_path.parent.resolve())
        report_file = output_path.name
        reports = getattr(self._scanner, "reports", None)
        if reports is not None and hasattr(reports, "generate"):
            try:
                reports.generate(
                    title=title,
                    template=template_id,
                    reportdir=report_dir,
                    reportfilename=report_file,
                    description=f"PK report ({template_id})",
                    display="false",
                )
            except TypeError:
                reports.generate(
                    title,
                    template_id,
                    reportdir=report_dir,
                    reportfilename=report_file,
                )
        else:
            self._scanner.urlopen(
                "https://scanner/JSON/reports/action/generate/",
                data={
                    "title": title,
                    "template": template_id,
                    "reportDir": report_dir,
                    "reportFileName": report_file,
                    "display": "false",
                },
            )

        if not output_path.is_file():
            # add-on может применить своё расширение — ищем ближайший файл
            candidates = sorted(
                output_path.parent.glob(f"{output_path.stem}*"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if candidates:
                output_path = candidates[0]

        if attach_to_allure and output_path.is_file():
            try:
                attach_scanner_html(
                    output_path.read_text(encoding="utf-8", errors="replace"),
                    name=output_path.name,
                )
            except Exception as exc:
                logger.debug("Allure attach skipped for addon report: %s", exc)

        return output_path

    def _export_owasp_xml_full(self, output_path):
        """SCAN-EXPORT-GAP: полный OWASPscannerReport XML из полного набора alerts.

        `core.xmlreport()` (legacy движок) отдаёт только пассивную подвыборку (6
        alertitem / 23 инстанса) — Dojo/collapse поедают обрубок. Собираем XML сама
        из `_fetch_alerts_paginated()`: reset_alerts() гарантирует per-run объём
        (новый сессион на каждый прогон), так что «все alerts сессии» = «все находки
        этого прогона», и Dojo получает честные active/passive целиком.
        """
        import xml.etree.ElementTree as ET

        alerts = self._fetch_alerts_paginated()

        first_url = alerts[0].get("url", "") if alerts else ""
        site_name = (self.base_url or first_url or "scanner-target").strip()

        root = ET.Element("OWASPscannerReport")
        root.set("version", "2.14.0")
        site = ET.SubElement(root, "site")
        site.set("name", site_name)
        alerts_el = ET.SubElement(site, "alerts")

        risk_map = {
            "Informational": ("0", "Informational"),
            "Low": ("1", "Low"),
            "Medium": ("2", "Medium"),
            "High": ("3", "High"),
            "Critical": ("3", "High"),
        }

        groups = {}
        for alert in alerts:
            pid = str(alert.get("pluginId") or alert.get("pluginid") or "")
            name = str(alert.get("name") or alert.get("alert") or "(alert)")
            risk = str(alert.get("risk") or "Informational")
            groups.setdefault((pid, name, risk), []).append(alert)

        for (pid, name, risk), items in groups.items():
            code, label = risk_map.get(risk, ("0", str(risk)))
            item_el = ET.SubElement(alerts_el, "alertitem")
            ET.SubElement(item_el, "pluginid").text = pid
            ET.SubElement(item_el, "alertRef").text = str(
                items[0].get("alertRef") or pid or ""
            )
            ET.SubElement(item_el, "alert").text = name
            ET.SubElement(item_el, "name").text = name
            ET.SubElement(item_el, "riskcode").text = code
            ET.SubElement(item_el, "riskdesc").text = f"{label} ({label})"
            ET.SubElement(item_el, "cweid").text = str(items[0].get("cweid") or "")
            ET.SubElement(item_el, "count").text = str(len(items))
            instances_el = ET.SubElement(item_el, "instances")
            for alert in items:
                inst = ET.SubElement(instances_el, "instance")
                ET.SubElement(inst, "uri").text = str(alert.get("url") or site_name)
                ET.SubElement(inst, "param").text = str(alert.get("param") or "")
                ET.SubElement(inst, "method").text = str(alert.get("method") or "")
                ET.SubElement(inst, "attack").text = str(alert.get("attack") or "")
                ET.SubElement(inst, "evidence").text = str(alert.get("evidence") or "")

        tree = ET.ElementTree(root)
        try:
            ET.indent(tree, space="  ")
        except Exception:
            pass
        tree.write(output_path, encoding="utf-8", xml_declaration=True)
        return output_path

    # ========== УПРАВЛЕНИЕ СЕССИЕЙ ==========

    def save_session(self, session_name):
        self._ensure_connected()
        self._scanner.core.save_session(session_name)

    def load_session(self, session_name):
        self._ensure_connected()
        self._scanner.core.load_session(session_name)

    # ========== СКРИПТЫ / HttpSender ==========

    _HTTP_SENDER_ENGINE = "Graal.js"

    def _script_file_arg(self, script_code_or_path: str) -> str:
        """scanner script.load ждёт путь к файлу. Код → tempfile."""
        import os
        import tempfile
        from pathlib import Path

        raw = script_code_or_path
        if isinstance(raw, str) and os.path.isfile(raw):
            return str(Path(raw).resolve())
        suffix = ".js"
        fd, path = tempfile.mkstemp(prefix="httpsender_", suffix=suffix)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(raw if isinstance(raw, str) else str(raw))
        except Exception:
            try:
                os.unlink(path)
            except OSError:
                pass
            raise
        return path

    def _script_enable(self, name: str, enabled: bool = True) -> None:
        """enable/disable — канон API; set_enabled — fallback старых клиентов."""
        script = self._scanner.script
        if enabled:
            if hasattr(script, "enable"):
                script.enable(name)
            else:
                script.set_enabled(name, True)
        else:
            if hasattr(script, "disable"):
                script.disable(name)
            else:
                script.set_enabled(name, False)

    def load_script(self, name, script_type, engine, code):
        self._ensure_connected()
        path = self._script_file_arg(code)
        self._scanner.script.load(name, script_type, engine, path)

    def run_script(self, name):
        self._ensure_connected()
        self._scanner.script.run(name)

    def remove_script(self, name):
        self._ensure_connected()
        self._scanner.script.remove(name)

    def list_scripts(self):
        self._ensure_connected()
        script = self._scanner.script
        if hasattr(script, "list_scripts"):
            return script.list_scripts()
        return script.list_engines()

    def load_http_sender_script(self, name, script_code):
        """Загрузить httpsender из кода или пути к файлу и сразу enable."""
        self._ensure_connected()
        path = self._script_file_arg(script_code)
        try:
            self._scanner.script.load(
                name, "httpsender", self._HTTP_SENDER_ENGINE, path
            )
            self._script_enable(name, True)
            logger.info("Loaded and enabled HTTP Sender script: %s", name)
            return True
        except Exception as e:
            logger.error("Failed to load HTTP Sender script: %s", e)
            raise WiredError(f"load_http_sender_script({name!r}): {e}") from e

    def enable_http_sender_script(self, name):
        self._ensure_connected()
        try:
            self._script_enable(name, True)
            return True
        except Exception as e:
            raise WiredError(f"enable_http_sender_script({name!r}): {e}") from e

    def disable_http_sender_script(self, name):
        self._ensure_connected()
        try:
            self._script_enable(name, False)
            return True
        except Exception as e:
            raise WiredError(f"disable_http_sender_script({name!r}): {e}") from e

    def remove_http_sender_script(self, name):
        """Снять httpsender (disable + remove)."""
        self._ensure_connected()
        try:
            self._script_enable(name, False)
        except Exception:
            pass
        try:
            self._scanner.script.remove(name)
        except Exception as e:
            raise WiredError(f"remove_http_sender_script({name!r}): {e}") from e
        return True

    def set_script_global_var(self, key, value):
        """scanner ScriptVars global — пейлоад для масочного httpsender."""
        self._ensure_connected()
        script = self._scanner.script
        try:
            if hasattr(script, "set_global_var"):
                script.set_global_var(str(key), str(value))
            else:
                script.setglobalvar(str(key), str(value))
            return True
        except Exception as e:
            raise WiredError(f"set_script_global_var({key!r}): {e}") from e

    def set_fuzz_payload(self, payload, var_key="fuzz_payload"):
        """Текущий пейлоад подмены (ScriptVars). Цикл — снаружи (ДляКаждого)."""
        from core.fuzz_sender import DEFAULT_VAR_KEY

        key = (var_key or DEFAULT_VAR_KEY).strip() or DEFAULT_VAR_KEY
        return self.set_script_global_var(key, payload)

    def install_mask_http_sender(
        self,
        name,
        mask,
        var_key="fuzz_payload",
        initial_payload="",
    ):
        """Сгенерировать масочный httpsender, load+enable, опционально initial пейлоад.

        Пример:
          scanner HttpSender fuzz_mask §FUZZ§
          ДляКаждого ${p} В ${payloads} {
            scanner ПейлоадПодмены ${p}
            HTTP GET https://target/?q=§FUZZ§
          }
          scanner ВыключитьHttpSender fuzz_mask
        """
        from core.fuzz_sender import DEFAULT_VAR_KEY, render_mask_httpsender

        key = (var_key or DEFAULT_VAR_KEY).strip() or DEFAULT_VAR_KEY
        code = render_mask_httpsender(str(mask), key)
        self.load_http_sender_script(name, code)
        if initial_payload is not None and str(initial_payload) != "":
            self.set_fuzz_payload(initial_payload, key)
        return True

    # ========== УПРАВЛЕНИЕ REPLACER RULES ==========

    def add_replacer_rule(self, description, match_type, match_string, replacement, match_regex=False):
        self._ensure_connected()
        self._scanner.replacer.add_rule(
            description,
            True,
            match_type,
            match_regex,
            match_string,
            replacement
        )

    def remove_replacer_rule(self, rule_id):
        self._ensure_connected()
        self._scanner.replacer.remove_rule(rule_id)

    def clear_replacer_rules(self):
        self._ensure_connected()
        self._scanner.replacer.remove_all_rules()

    def list_replacer_rules(self):
        self._ensure_connected()
        return self._scanner.replacer.get_rules()

    # ========== ИМПОРТ СЕРТИФИКАТА ==========

    def import_certificate(self, cert_path):
        self._ensure_connected()
        with open(cert_path, 'rb') as f:
            cert_data = f.read()
        self._scanner.core.import_certificate(cert_data)

    # ========== ЗАКОММЕНТИРОВАННЫЕ МЕТОДЫ ==========
    # def run_zest_script(...):
    #     pass


# ========== БЛОК ДОКУМЕНТАЦИИ ==========
"""
================================================================================
Адаптер для OWASP scanner API (v2.17.0)
================================================================================

Методы управления контекстом:
- create_context(name, description) — создать контекст
- delete_context(name) — удалить контекст
- switch_context(name) — переключиться на контекст
- list_contexts() — список контекстов
- archive_context(name) — удалить контекст (алиас delete_context)
- clear_context() — сбросить текущий контекст
- set_context_include(context, regex) — добавить правило включения в контекст
- set_context_exclude(context, regex) — добавить правило исключения из контекста
- set_context_auth(context, login_url, post_data, logout_url, method) — настроить авторизацию

Методы HTTP через scanner:
- scanner_http_request(method, url, headers, body, follow_redirects) — отправить HAR-запрос
- scanner_http_raw_request(raw_request, follow_redirects) — отправить сырой HTTP-запрос

Импорт спецификаций:
- import_har_sequence(name, file_path, assert_code, assert_length) — импорт HAR
- import_openapi_spec(url_or_file) — импорт OpenAPI
- import_graphql_schema(url_or_file) — импорт GraphQL схемы
- import_grpc_proto(file_or_dir) — импорт gRPC .proto

Сканирование API:
- scan_openapi(context) — сканирование OpenAPI
- scan_graphql_api(context) — сканирование GraphQL
- scan_grpc(context) — сканирование gRPC

Настройка GraphQL:
- set_graphql_request_method(method) — GET или POST

Паук (Spider):
- spider_scan(url, context, timeout) — стандартный (глубина 5, 2 потока)
- spider_scan_spa(url, context, timeout) — SPA (глубина 8, 5 потоков)
- spider_scan_deep(url, context, timeout) — глубокий (глубина 15, 2 потока)
- spider_scan_local(url, context, timeout) — локальный (глубина 3, 2 потока)
- spider_status(scan_id) — статус
- stop_spider(scan_id) — остановить

AJAX-паук:
- ajax_spider_scan(url, timeout) — стандартный (глубина 3, 1 браузер)
- ajax_spider_scan_shallow(url, timeout) — быстрый (глубина 3, 1 браузер, event_wait=200)
- ajax_spider_scan_deep(url, timeout) — глубокий (глубина 10, 1 браузер)
- ajax_spider_scan_iterator(url, timeout) — итератор (глубина 5, 1 браузер, event_wait=300)
- ajax_spider_status() — статус

Активное сканирование:
- active_scan(url, context, timeout) — запуск с таймаутом и остановкой
- active_scan_status(scan_id) — статус
- stop_active_scan(scan_id) — остановить

Пассивное сканирование:
- passive_scan_wait(timeout) — ожидать завершения пассивного скана

Управление политиками:
- get_scan_policies() — список политик
- set_scan_policy(name) — установить политику

Алерты:
- get_alerts(context, risk, url) — получить алерты с фильтрацией
- get_alert_count(context) — количество алертов
- log_attack(message) — маркер атаки в Live LOG (ЛогАтаки | …)

Сообщения (Messages):
- get_messages(context) — получить сообщения из сессии

Управление сессиями HTTP:
- get_sessions_sites() — список сайтов с сессиями
- get_site_sessions(site, session_name) — сессии для сайта

Управление пассивными сканерами:
- get_passive_scanners() — список пассивных сканеров
- enable_passive_scanners(ids) — включить по ID
- disable_all_passive_scanners() — отключить все

Управление пользователями и Forced User Mode:
- create_user(context, username) — создать пользователя, вернуть user_id
- set_user_credentials(context, user_id, login, password) — установить логин/пароль
- enable_user(context, user_id) — активировать пользователя
- disable_user(context, user_id) — деактивировать пользователя
- get_users(context) — список пользователей в контексте
- new_user_intercept_context(context, username, login, password) — создать, установить креды и активировать за один вызов
- set_forced_user(context, user_id) — назначить принудительного пользователя
- enable_forced_user_mode(context) — включить режим принудительного пользователя
- disable_forced_user_mode(context) — выключить режим принудительного пользователя

Кастомные словари (Payloads):
- add_custom_payload(name, list_or_file) — загрузить словарь
- get_payloads() — список словарей
- remove_payload(name) — удалить словарь

OAST (Out-of-Band):
- start_oast_server() — запустить OAST-сервер
- stop_oast_server() — остановить OAST-сервер
- get_oast_alerts() — алерты OAST

Отчёты:
- generate_report(format, output_file) — scanner-results/ (голое имя) или явный путь

Управление сессией scanner:
- save_session(name) — сохранить сессию
- load_session(name) — загрузить сессию

Скрипты:
- load_script(name, type, engine, code) — загрузить скрипт
- run_script(name) — выполнить скрипт
- remove_script(name) — удалить скрипт
- list_scripts() — список скриптов
- load_http_sender_script(name, code|path) — загрузить HTTP Sender + enable
- enable_http_sender_script / disable_http_sender_script / remove_http_sender_script
- install_mask_http_sender(name, mask, var_key?, initial_payload?) — alpha fuzz
- set_fuzz_payload(payload, var_key?) / set_script_global_var(key, value)

Replacer Rules:
- add_replacer_rule(desc, match_type, match_string, replacement, regex) — добавить правило
- remove_replacer_rule(rule_id) — удалить правило
- clear_replacer_rules() — очистить
- list_replacer_rules() — список правил

Сертификаты:
- import_certificate(path) — импорт корневого сертификата

================================================================================
"""
