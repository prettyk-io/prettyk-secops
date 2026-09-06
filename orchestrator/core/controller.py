"""
Контроллер — диспетчер, управляющий жизненным циклом выполнения сценариев.
Интегрирован с Allure для отчётности.
"""
from utils.env_dual import pk_env
import os
import json
import time
import difflib
import re
import logging
import traceback
import inspect
import threading
from contextlib import contextmanager
from typing import Dict, Any, List, Optional

import allure
from models.wired import Wired, Scenario, ActionStep
from core.data_stream import DataStream
from core.errors import WiredError
from core.action_factory import ActionFactory
from core.execution_trace import ExecutionTrace
from core.language_engine import LanguageEngine
from core.page_resolver import PageResolver
from adapters.webdriver_adapter import WebDriverAdapter
from adapters.browser_adapter import BrowserAdapter
from adapters.scanner_adapter import ScannerAdapter
from adapters.grpc_adapter import GrpcAdapter
from adapters.http_adapter import HttpAdapter
from utils.reporter import Reporter
from adapters.data_processor import DataProcessor
from adapters.data_adapter import DataAdapter
from adapters.inspector import Inspector
from utils.allure_project import resolve_allure_results_dir
from utils.paths import ensure_reports_dirs, VIDEO_DIR

# Методы адаптеров, которые не являются keyword'ами сценария.
_NON_KEYWORD_METHODS = frozenset({
    "bind",
    "set_context",
    "shutdown",
    "shutdown_all",
    "update_driver",
    "domains_csv_to_include_regexes",
    "_alert_filter_level",
})

logger = logging.getLogger("controller")


def resolve_browser_runtime() -> str:
    """PW-E1/PW-C1: выбор браузерного рантайма. Дефолт — playwright (после cutover).

    ``PK_BROWSER_RUNTIME=playwright`` (или пусто) → ``"playwright"`` (PlaywrightAdapter),
    ``PK_BROWSER_RUNTIME=selenium`` → ``"selenium"`` (WebDriverAdapter, legacy Grid).

    Одна точка правды: и `_init_adapters`, и тесты читают отсюда —
    никакого двойного префикса (``pk_env`` сам добавляет ``PK_``).
    Возвращает только канонические ``playwright``/``selenium``.
    """
    raw = (pk_env("BROWSER_RUNTIME") or "playwright").strip().lower()
    return raw if raw in ("playwright", "selenium") else "playwright"


# Порты scanner задаёт инфраструктура раннера, не манифест.
# Main 8080 — для zapv2 (официальный клиент ходит через этот слушатель).
# Browser proxy 8099 — доп. Local Server (Network API addLocalServer), чтобы
# MITM-трафик браузера не делил сокет с API-клиентом. Demon-only (webswing removed 2026-08-22).
# https://www.zaproxy.org/docs/desktop/addons/network/options/localservers/
DEFAULT_scanner_PORT = 8080
DEFAULT_scanner_BROWSER_PROXY_PORT = 8099


class Controller:
    def __init__(
        self,
        wired: Wired,
        wired_path: Optional[str] = None,
        secret_seeds: Optional[List[str]] = None,
    ):
        self.last_scanner_report = None
        self.wired = wired
        # Каталог манифеста — база для test_suites.imports[].path
        self.wired_path = (
            os.path.abspath(wired_path) if wired_path else None
        )
        # G-62: plaintext из ${ENV:} / secretref при load — для mask_for_log.
        self._secret_seeds: List[str] = list(secret_seeds or [])
        self.global_stream = DataStream()
        self.global_stream.seed_secret_values(self._secret_seeds)
        self.action_factory = ActionFactory()
        self.language_engine = LanguageEngine()
        self.page_resolver = None
        self.adapters: Dict[str, Any] = {}
        # Проблемы валидации конструкторов: копим при старте, светим при падении.
        self._wired_problems: List[str] = []
        # Quality / admission gate: заполняется evaluate_quality_gate().
        self.quality_gate_failed = False
        self.quality_gate_summary: Dict[str, Any] | None = None
        self.admission_risk_hints: Dict[str, Any] = {}
        self.admission_recommendations: List[str] = []
        self.auth_bootstrap_result: Dict[str, Any] | None = None
        # G-20 run_summary
        self.honest_contract_notes: List[str] = []
        self.scenario_stats: Dict[str, int] = {
            "ok": 0,
            "fail": 0,
            "fail_allowed": 0,
            "skip": 0,
        }
        self.scenario_outcomes: List[Dict[str, Any]] = []
        self.suites_complete: bool = False
        self.scanner_mode: str = (self.wired.infrastructure.scanner_mode or "demon").strip()
        self.scanner_api_port: int = DEFAULT_scanner_PORT
        self.scanner_proxy_port: int = DEFAULT_scanner_BROWSER_PROXY_PORT
        self._work_timer: Optional[threading.Timer] = None
        self._idle_timer: Optional[threading.Timer] = None
        self._idle_seconds: Optional[float] = None
        # Стек страниц: внутри тела Операции ${элемент} — элемент своей страницы.
        self._page_scope: List[str] = []
        self._timeout_kill_reason: Optional[str] = None
        # G-64: ключи stream с URL-списками (imports .txt / data additional_urls / G-65).
        self._url_list_keys: set[str] = set()

        self._init_adapters()
        self._register_actions()
        self._apply_infrastructure()
        self._apply_auth_bootstrap()

    @staticmethod
    def _env_port(name: str, default: int) -> int:
        base = name[3:] if name.startswith("PK_") else name
        raw = os.getenv(f"PK_{base}")
        if raw is None or raw.strip() == "":
            return default
        try:
            return int(raw)
        except ValueError as exc:
            raise ValueError(f"{name} must be an integer, got: {raw!r}") from exc

    def _init_adapters(self):
        # 1) ScannerAdapter на main-порту → 2) поднять browser Local Server → 3) браузер.
        # Remote: WebDriverAdapter._resolve_proxy подменит loopback на host.docker.internal.
        # Demon-only (webswing выпилен): API :8080, browser proxy :8099.
        self.scanner_mode = "demon"
        scanner_port = self._env_port("PK_SCANNER_PORT", DEFAULT_scanner_PORT)
        browser_proxy_port = self._env_port(
            "PK_SCANNER_BROWSER_PROXY_PORT", DEFAULT_scanner_BROWSER_PROXY_PORT
        )
        self.scanner_api_port = scanner_port
        self.scanner_proxy_port = browser_proxy_port

        # 127.0.0.1, не localhost: на Windows localhost часто резолвится в ::1,
        # а Docker publish слушает IPv4 — zapv2 ловит ConnectionReset.
        from core.gate_policy import scanner_api_key_from_env

        base_url = self.wired.scan_base_url()
        allowed_extra = self.wired.scan_allowed_extra_domains()

        self.adapters["scanner"] = ScannerAdapter(
            host="127.0.0.1",
            port=scanner_port,
            api_key=scanner_api_key_from_env(),
            base_url=base_url,
            allowed_extra_domains=allowed_extra,
        )
        # scanner local server (browser proxy) — demon уже поднят стендом.
        if browser_proxy_port != scanner_port:
            logger.info(
                "Ensuring scanner browser Local Server on 127.0.0.1:%s (api+proxy)",
                browser_proxy_port,
            )
            self._ensure_scanner_local_server(browser_proxy_port)
        proxy = f"127.0.0.1:{browser_proxy_port}"

        browser_type = self.wired.infrastructure.browser_type
        if browser_type.endswith("-headless"):
            browser = browser_type.replace("-headless", "")
            headless = True
        else:
            browser = browser_type
            headless = False

        # ── PW-E1: Playwright или Selenium за флагом PK_BROWSER_RUNTIME ──
        runtime = resolve_browser_runtime()

        if runtime == "playwright":
            # Браузер через Playwright (chromium/firefox/webkit).
            # scanner-прокси: loopback 127.0.0.1 → host.docker.internal в контейнере.
            from adapters.playwright_adapter import PlaywrightAdapter

            # PW-E4: live-вид execution — headed браузер живёт в контейнере
            # (headed под Xvfb → noVNC), а НЕ окном на десктопе оператора.
            # PK_BROWSER_CDP_ENDPOINT → connect_over_cdp к контейнеру.
            # Без endpoint — локальный launch (headless в норме; headed только dev).
            # pk_env сам добавляет префикс PK_ — передаём голое имя без префикса.
            cdp_endpoint = (
                (pk_env("BROWSER_CDP_ENDPOINT") or "").strip() or None
            )
            playwright_adapter = PlaywrightAdapter(
                None,
                browser=browser,
                headless=headless,
                proxy=proxy,
                session_name=self._session_name(),
                base_url=base_url,
                allowed_extra_domains=allowed_extra,
                cdp_endpoint=cdp_endpoint,
            )
            # PW-E3: запись видео при headless=False (headed execution)
            if not headless:
                safe_session = re.sub(r"[^A-Za-z0-9._-]+", "-", playwright_adapter._session_name).strip("-.") or "run"
                video_dir = str(VIDEO_DIR / f"record_{safe_session}")
                playwright_adapter.set_record_video_dir(video_dir)
            self.adapters["webdriver"] = playwright_adapter
            self.adapters["browser"] = playwright_adapter
            self.reporter = Reporter(playwright_adapter)
            logger.info("Browser runtime: Playwright (PK_BROWSER_RUNTIME=playwright)")
        else:
            # Selenium Grid (дефолт, неизменный путь).
            webdriver_adapter = WebDriverAdapter(
                None,
                browser=browser,
                headless=headless,
                proxy=proxy,
                session_name=self._session_name(),
                base_url=base_url,
                allowed_extra_domains=allowed_extra,
            )
            self.adapters["webdriver"] = webdriver_adapter
            self.adapters["browser"] = BrowserAdapter(webdriver_adapter)
            self.reporter = Reporter(webdriver_adapter)

        logger.info(
            "scanner API on 127.0.0.1:%s, browser proxy on %s",
            scanner_port,
            proxy,
        )
        self.adapters["http"] = HttpAdapter()
        self.adapters["grpc"] = GrpcAdapter()
        from adapters.connector_adapter import ConnectorAdapter

        self.adapters["connector"] = ConnectorAdapter()
        # OA/GQL/gRPC seed traffic → scanner site tree via browser proxy
        try:
            self.adapters["http"].set_proxy(f"http://{proxy}")
        except Exception as exc:  # noqa: BLE001
            logger.warning("HttpAdapter.set_proxy failed: %s", exc)
        try:
            self.adapters["grpc"].set_proxy(f"http://{proxy}")
        except Exception as exc:  # noqa: BLE001
            logger.warning("GrpcAdapter.set_proxy failed: %s", exc)
        mdir = (
            os.path.dirname(self.wired_path) if self.wired_path else None
        )
        scanner_ad = (self.adapters.get("scanner") or self.adapters.get("scanner"))
        if scanner_ad is not None and hasattr(scanner_ad, "bind_run_wired"):
            scanner_ad.bind_run_wired(self.wired, mdir)
        if hasattr(self.adapters["http"], "bind_run_wired"):
            self.adapters["http"].bind_run_wired(self.wired)
        if hasattr(self.adapters["grpc"], "bind_run_wired"):
            self.adapters["grpc"].bind_run_wired(self.wired, mdir)
        if hasattr(self.adapters["connector"], "bind_run_wired"):
            self.adapters["connector"].bind_run_wired(self.wired, mdir)
        self.adapters["data"] = DataAdapter()
        from core.fuzzing import FuzzAdapter

        self.adapters["fuzz"] = FuzzAdapter(
            self.wired,
            self.adapters["scanner"],
            browser=self.adapters.get("browser"),
        )

    def _apply_infrastructure(self):
        """
        Шаг 2 жизненного цикла: доп. порт scanner + таймауты из формы (конфиг на старте).
        work = длительность сессии / таймер демона; idle = бездействие → shutdown_all.
        """
        port = self.wired.infrastructure.additional_local_server_port
        if port is not None:
            browser_proxy_port = self._env_port(
                "PK_SCANNER_BROWSER_PROXY_PORT", DEFAULT_scanner_BROWSER_PROXY_PORT
            )
            if int(port) == browser_proxy_port:
                logger.info(
                    "Wired additional_local_server_port=%s already used as browser proxy; skip",
                    port,
                )
            else:
                logger.info(
                    "Wired requests additional scanner local server on port %s (api+proxy)",
                    port,
                )
                self.adapters["scanner"].add_local_server(port=port)

        self._apply_session_timeouts()

    def _ensure_scanner_local_server(self, port: int) -> None:
        scanner = self.adapters["scanner"]
        last_err = None
        for attempt in range(1, 16):
            try:
                scanner.add_local_server(port=port)
                return
            except Exception as exc:
                last_err = exc
                logger.warning(
                    "add_local_server :%s attempt %s/15: %s", port, attempt, exc
                )
                time.sleep(2.0)
        raise WiredError(
            f"Не удалось добавить scanner local server :{port}: {last_err}"
        )

    def _apply_session_timeouts(self) -> None:
        """Вешает work/idle таймеры из infrastructure — не MethodId, конфиг старта."""
        from core.debug_run import wired_debug_mode

        if wired_debug_mode(self.wired):
            # DBG-2: idle/work kill не вешаем (Grid/OS всё равно могут умереть).
            logger.info(
                "Infrastructure timeouts: skipped (debug_mode — idle/work не убивают сессию)"
            )
            return
        infra = self.wired.infrastructure
        work_min = infra.session_timeout_min()
        idle_min = infra.idle_timeout_min
        # Lab: PK_IDLE_TIMEOUT_SEC перекрывает минуты (без смены JSON/схемы).
        idle_sec_override = (pk_env("IDLE_TIMEOUT_SEC") or "").strip()
        logger.info(
            "Infrastructure timeouts: work=%s min, idle=%s min%s",
            work_min,
            idle_min if idle_min is not None else "—",
            f" (override {idle_sec_override}s)" if idle_sec_override else "",
        )
        if work_min and work_min > 0:
            self._arm_work_timeout(float(work_min) * 60.0)
        if idle_sec_override:
            self._idle_seconds = float(idle_sec_override)
            self._arm_idle_timeout()
        elif idle_min is not None and idle_min > 0:
            self._idle_seconds = float(idle_min) * 60.0
            self._arm_idle_timeout()

    def _should_hold_gui_session(self) -> bool:
        """Держать процесс до idle/work kill — ручной Webswing без авто-сценариев."""
        mode = (self.wired.infrastructure.scanner_mode or "").strip()
        if mode != "webswing":
            return False
        raw = (pk_env("WEBSWING_HOLD") or "1").strip().lower()
        return raw not in ("0", "false", "off", "no")

    def _await_session_end(self) -> None:
        """
        После сценариев (или пустого suites) не выходим сразу:
        ждём срабатывания idle/work → shutdown_all.
        """
        if not self._should_hold_gui_session():
            return
        if getattr(self, "_timeout_kill_reason", None):
            logger.info(
                "Webswing hold skip: already killed (%s)", self._timeout_kill_reason
            )
            return
        if self._work_timer is None and self._idle_timer is None:
            logger.warning("Webswing hold: таймеры не взведены — выход сразу")
            return
        logger.info(
            "Webswing session hold: ждём idle/work timeout "
            "(idle=%ss, work timer=%s). Ctrl+C — выход без ожидания.",
            self._idle_seconds if self._idle_seconds is not None else "—",
            "on" if self._work_timer else "off",
        )
        try:
            while not getattr(self, "_timeout_kill_reason", None):
                time.sleep(1.0)
        except KeyboardInterrupt:
            logger.warning("Webswing hold interrupted by user")
            return
        logger.info(
            "Webswing session ended by timeout: %s", self._timeout_kill_reason
        )

    def _arm_work_timeout(self, seconds: float) -> None:
        self._cancel_timer(self._work_timer)
        timer = threading.Timer(seconds, self._on_work_timeout)
        timer.daemon = True
        timer.start()
        self._work_timer = timer

    def _arm_idle_timeout(self) -> None:
        if self._idle_seconds is None:
            return
        self._cancel_timer(self._idle_timer)
        timer = threading.Timer(self._idle_seconds, self._on_idle_timeout)
        timer.daemon = True
        timer.start()
        self._idle_timer = timer

    def touch_activity(self) -> None:
        """Сброс idle при каждом leaf-шаге."""
        if getattr(self, "_idle_seconds", None) is not None:
            self._arm_idle_timeout()

    def _on_work_timeout(self) -> None:
        logger.error(
            "Таймаут работы scanner истёк — гасим demon/webswing/scanner (shutdown_all)"
        )
        self._kill_scanner_for_timeout("work")

    def _on_idle_timeout(self) -> None:
        logger.error(
            "Таймаут бездействия истёк — гасим demon/webswing/scanner (shutdown_all)"
        )
        self._kill_scanner_for_timeout("idle")

    def _kill_scanner_for_timeout(self, reason: str) -> None:
        self._timeout_kill_reason = reason
        self._cancel_session_timeouts()
        scanner = (self.adapters.get("scanner") or self.adapters.get("scanner"))
        if scanner is None:
            return
        try:
            scanner.shutdown_all()
        except Exception as e:
            logger.warning("shutdown_all after %s timeout failed: %s", reason, e)

    def _cancel_timer(self, timer: Optional[threading.Timer]) -> None:
        if timer is not None:
            timer.cancel()

    def _cancel_session_timeouts(self) -> None:
        self._cancel_timer(self._work_timer)
        self._cancel_timer(self._idle_timer)
        self._work_timer = None
        self._idle_timer = None

    def _log_auth_bootstrap_notes(self, notes: list) -> None:
        if notes:
            logger.info("Auth bootstrap: %s", "; ".join(notes))

    def _store_auth_bootstrap(self, result: dict, mod_notes: list | None = None) -> None:
        notes = list(result.get("notes") or [])
        if mod_notes:
            notes = list(mod_notes) + notes
            result["notes"] = notes
        self.auth_bootstrap_result = result
        self._log_auth_bootstrap_notes(notes)

    def _bootstrap_active_auth_module(self, active: str) -> tuple[str, dict] | None:
        """Apply active_auth_module profiles. Returns (auth_type, details) for static leaf."""
        from core.auth_module import (
            apply_auth_action,
            apply_auth_chain,
            apply_auth_form,
            apply_auth_profiles,
            resolve_active_auth_profiles,
            split_auth_module_ids,
        )

        ids = split_auth_module_ids(active)
        profiles, mod_notes = resolve_active_auth_profiles(self.wired, active)
        # BOT-A3: пустой modules= / resolve miss → notes, не silent legacy auth_type.
        if not profiles:
            self._store_auth_bootstrap(
                {
                    "applied": False,
                    "auth_type": "compose",
                    "notes": list(mod_notes)
                    or ["active_auth_module: профили не разрешены"],
                    "kind": "compose",
                }
            )
            return None
        wd = self.adapters.get("webdriver")
        scanner = (self.adapters.get("scanner") or self.adapters.get("scanner"))
        if len(ids) > 1 or len(profiles) > 1:
            self._store_auth_bootstrap(
                apply_auth_profiles(
                    profiles,
                    self.adapters["http"],
                    scanner_adapter=scanner,
                    webdriver_adapter=wd,
                ),
                mod_notes,
            )
            return None
        if len(profiles) != 1:
            if mod_notes:
                logger.info("Auth module bootstrap notes: %s", "; ".join(mod_notes))
            return None
        profile = profiles[0]
        if profile.kind == "chain":
            self._store_auth_bootstrap(
                apply_auth_chain(profile, self.adapters["http"]), mod_notes
            )
            return None
        if profile.kind == "form":
            self._store_auth_bootstrap(
                apply_auth_form(profile, wd, self.adapters["http"], scanner), mod_notes
            )
            return None
        if profile.kind == "action":
            self._store_auth_bootstrap(
                apply_auth_action(profile, wd, self.adapters["http"], scanner), mod_notes
            )
            return None
        return profile.bootstrap_auth_type(), profile.bootstrap_auth_details()

    def _apply_legacy_page_or_sso_auth(self, auth_type: str, auth_details: dict) -> bool:
        from core.auth_module import (
            apply_auth_action,
            apply_auth_form,
            profile_from_page_auth_details,
            profile_from_sso_auth_details,
        )

        kind_legacy = (auth_type or "").strip()
        if kind_legacy == "Страница авторизации":
            page_profile = profile_from_page_auth_details(auth_details)
            if page_profile is not None:
                self._store_auth_bootstrap(
                    apply_auth_form(
                        page_profile,
                        self.adapters.get("webdriver"),
                        self.adapters["http"],
                        (self.adapters.get("scanner") or self.adapters.get("scanner")),
                    )
                )
                return True
        if kind_legacy == "Последовательность действий / SSO":
            sso_profile = profile_from_sso_auth_details(auth_details)
            if sso_profile is not None:
                self._store_auth_bootstrap(
                    apply_auth_action(
                        sso_profile,
                        self.adapters.get("webdriver"),
                        self.adapters["http"],
                        (self.adapters.get("scanner") or self.adapters.get("scanner")),
                    )
                )
                return True
        return False

    def _apply_auth_bootstrap(self) -> None:
        """Http bootstrap сразу; scanner — только PK_SCANNER_AUTH_BOOTSTRAP после context."""
        from core.auth_bootstrap import apply_auth_bootstrap

        sec = self.wired.security_configuration
        if sec is None:
            return
        auth_type = sec.auth_type
        auth_details = dict(sec.auth_details or {})
        active = (getattr(sec, "active_auth_module", None) or "").strip()
        if active:
            leaf = self._bootstrap_active_auth_module(active)
            if leaf is None and self.auth_bootstrap_result is not None:
                return
            if leaf is not None:
                auth_type, auth_details = leaf
        if self._apply_legacy_page_or_sso_auth(auth_type, auth_details):
            return
        self._store_auth_bootstrap(
            apply_auth_bootstrap(
                auth_type=auth_type,
                auth_details=auth_details,
                http_adapter=self.adapters["http"],
            )
        )

    def _fill_auth_apps_params(
        self, params: dict, module_id: str, profiles, mod_notes
    ) -> None:
        import json

        apps = [
            {
                "auth_type": profile.bootstrap_auth_type(),
                "auth_details": profile.bootstrap_auth_details(),
                "kind": profile.kind,
                "module_id": profile.module_id or "",
            }
            for profile in profiles
            if profile.kind != "compose"
        ]
        if apps:
            params["auth_applications_json"] = json.dumps(apps, ensure_ascii=False)
            params["auth_type"] = apps[0]["auth_type"]
            params["auth_details_json"] = json.dumps(
                apps[0]["auth_details"], ensure_ascii=False
            )
            params["module_id"] = module_id
            return
        params["auth_type"] = ""
        params["auth_details_json"] = "{}"
        params["auth_resolve_notes_json"] = json.dumps(
            list(mod_notes) or [f"ПрименитьAuth: нет профилей для {module_id!r}"],
            ensure_ascii=False,
        )
        if mod_notes:
            logger.info(
                "ПрименитьAuth module_id=%s: %s",
                module_id,
                "; ".join(mod_notes),
            )

    def _enrich_apply_wired_auth_params(self, params: dict, sec) -> None:
        import json

        from core.auth_module import resolve_active_auth_profiles

        module_id = (params.get("module_id") or "").strip()
        if not module_id:
            module_id = (getattr(sec, "active_auth_module", None) or "").strip()
        if module_id:
            # BOT-A2: CSV / auth=compose → resolve leaf profiles (не «Без авторизации»).
            profiles, mod_notes = resolve_active_auth_profiles(self.wired, module_id)
            self._fill_auth_apps_params(params, module_id, profiles, mod_notes)
        if not (params.get("auth_applications_json") or "").strip():
            if not (params.get("auth_type") or "").strip() and not (
                params.get("auth_resolve_notes_json") or ""
            ).strip():
                params["auth_type"] = sec.auth_type or ""
            if not (params.get("auth_details_json") or "").strip():
                params["auth_details_json"] = json.dumps(
                    sec.auth_details or {}, ensure_ascii=False
                )
        if not (params.get("base_url") or "").strip():
            params["base_url"] = self.wired.scan_base_url()

    def _enrich_scanner_wired_params(self, action: str, params: dict) -> None:
        """Дополнить ПрименитьAuth / СгенерироватьПлан из security_configuration."""
        sec = self.wired.security_configuration
        if sec is None:
            return
        if action == "apply_wired_auth":
            self._enrich_apply_wired_auth_params(params, sec)
            return
        if action == "generate_automation_plan":
            if not (params.get("base_url") or "").strip():
                params["base_url"] = self.wired.scan_base_url()
            if not (params.get("scan_policy") or "").strip():
                params["scan_policy"] = sec.scan_policy or "custom_policy"
            if not (params.get("wired_json") or "").strip():
                params["wired_json"] = self.wired.model_dump_json()

    _enrich_scanner_wired_params = _enrich_scanner_wired_params

    def _maybe_scanner_auth_after_context(self, context_name: str) -> None:
        """PK_SCANNER_AUTH_BOOTSTRAP=1 → ПрименитьAuth после НовыйКонтекст."""
        from core.auth_bootstrap import scanner_auth_env_enabled

        if not scanner_auth_env_enabled():
            return
        if not context_name:
            return
        scanner = (self.adapters.get("scanner") or self.adapters.get("scanner"))
        if scanner is None:
            return
        sec = self.wired.security_configuration
        if sec is None:
            return
        import json

        try:
            params = {
                "auth_type": "",
                "auth_details_json": "",
                "base_url": self.wired.scan_base_url(),
                "module_id": (getattr(sec, "active_auth_module", None) or "").strip(),
            }
            self._enrich_scanner_wired_params("apply_wired_auth", params)
            auth_fn = getattr(scanner, "apply_wired_auth", None)
            if auth_fn is not None:
                result = auth_fn(
                    context_name,
                    auth_type=params.get("auth_type") or "",
                    auth_details_json=params.get("auth_details_json") or "{}",
                    base_url=params.get("base_url") or self.wired.scan_base_url(),
                    module_id=params.get("module_id") or "",
                    auth_applications_json=params.get("auth_applications_json") or "",
                    auth_resolve_notes_json=params.get("auth_resolve_notes_json") or "",
                )
            else:
                result = {"applied": False, "error": "No apply_wired_auth method on scanner adapter"}
            logger.info(
                "PK_SCANNER_AUTH_BOOTSTRAP after context %s: %s",
                context_name,
                result,
            )
        except Exception as exc:
            logger.warning("PK_SCANNER_AUTH_BOOTSTRAP failed: %s", exc)

    def _declarative_auth_note(self, auth: str) -> str:
        applied = bool(
            self.auth_bootstrap_result and self.auth_bootstrap_result.get("applied")
        )
        if applied:
            return (
                f"auth_type={auth!r} (Http bootstrap; scanner — "
                "scanner ПрименитьAuth или PK_SCANNER_AUTH_BOOTSTRAP=1)"
            )
        return (
            f"auth_type={auth!r} (Http bootstrap не применён; "
            "scanner — scanner ПрименитьAuth)"
        )

    def _declarative_security_notes(self) -> List[str]:
        notes: List[str] = []
        sec = self.wired.security_configuration
        if sec is None:
            return notes
        notes.append(
            f"scan_policy={sec.scan_policy!r} "
            "(нет авто spider/active; явный AF: scanner СгенерироватьПлан / scanner План)"
        )
        if self._base_url_override():
            notes.append("base_url_override → ${base_url} в stream (авто-Открыть нет)")
        domains_fn = getattr(self.wired, "scan_allowed_extra_domains", None)
        domains = domains_fn() if callable(domains_fn) else None
        if domains:
            notes.append(
                "allowed_extra_domains (нет авто include; "
                "явный шаг: scanner ПрименитьДомены <ctx> <csv>)"
            )
        auth = (sec.auth_type or "").strip()
        if auth and auth != "Без авторизации":
            notes.append(self._declarative_auth_note(auth))
        return notes

    def _log_declarative_gap(self) -> None:
        """Честный контракт: что в форме есть, но автоматом не исполняется."""
        notes = self._declarative_security_notes()
        suites = self.wired.test_suites
        if suites is not None and suites.imports:
            notes.append(
                f"imports ({len(suites.imports)}): data_file/har/proto_pack → stream; "
                f"scenario_json пока ошибка"
            )
        if self.wired.infrastructure.scanner_mode == "webswing":
            notes.append(
                "scanner_mode=webswing (bootstrap via PK_SCANNER_START_WEBSWING_CMD; "
                "hold до idle/work; PK_WEBSWING_HOLD=0 — без hold)"
            )
        self.honest_contract_notes = notes
        if notes:
            logger.info("Honest Contract — без полного авто-исполнения: %s", "; ".join(notes))

    def _quality_gate_alert_error_mode(self) -> str:
        """closed (default) | open — поведение при ошибке чтения алертов / нет scanner."""
        raw = (pk_env("QUALITY_GATE_ON_ALERT_ERROR") or "closed").strip().lower()
        if raw in ("open", "fail_open", "fail-open"):
            return "open"
        return "closed"

    def _fail_quality_gate_on_alert_error(self, reason: str) -> None:
        """Fail-closed (default) или fail-open по PK_QUALITY_GATE_ON_ALERT_ERROR.

        error в summary → main трактует как evidence/execution fail (exit 1), не fail_gate.
        quality_gate_failed всегда False: ось исполнения, не fail_gate.
        """
        mode = self._quality_gate_alert_error_mode()
        self.quality_gate_summary = {"error": reason, "fail_mode": mode, "source": "scanner"}
        self.admission_risk_hints = {}
        self.admission_recommendations = []
        self.quality_gate_failed = False
        if mode == "open":
            logger.warning(
                "Quality gate: не удалось прочитать алерты scanner (%s) — fail-open",
                reason,
            )
            return
        logger.error(
            "Quality gate: не удалось прочитать алерты scanner (%s) — fail-closed (evidence)",
            reason,
        )

    def collect_scanner_severity_counts(self) -> Dict[str, int]:
        """scanner tallies → admission counts (fallback when Dojo off)."""
        from core.gate_policy import (
            counts_from_scanner_gate_summary,
            counts_from_scanner_live_summary,
            normalize_severity_counts,
        )

        scanner = (self.adapters.get("scanner") or self.adapters.get("scanner"))
        if scanner is None:
            raise RuntimeError("scanner adapter missing")
        live_sum = getattr(scanner, "summarize_alerts_for_live", None)
        if callable(live_sum):
            return counts_from_scanner_live_summary(live_sum())
        from core.gate_policy import severities_at_or_above

        risks = tuple(severities_at_or_above())
        summarize = getattr(scanner, "_summarize_gate_alerts", None)
        if callable(summarize):
            return counts_from_scanner_gate_summary(summarize(risks=risks, limit=30))
        high = scanner.summarize_high_alerts(limit=30)
        return counts_from_scanner_gate_summary(high) or normalize_severity_counts({})

    def apply_admission_result(self, result) -> bool:
        """Persist AdmissionResult on controller. True → gate не пройден."""
        self.quality_gate_failed = bool(result.failed)
        self.quality_gate_summary = dict(result.summary or {})
        self.admission_risk_hints = dict(result.risk_hints or {})
        self.admission_recommendations = list(result.recommendations or [])
        return bool(result.failed)

    def evaluate_quality_gate(
        self,
        counts: Optional[Dict[str, Any]] = None,
        *,
        source: str = "scanner",
        policy: Any = None,
    ) -> bool:
        """
        Dual-axis ИБ-gate: severity counts vs PK_GATE_MAX_CRITICAL/HIGH.
        counts=None → собрать с scanner (fallback / unit-тесты).
        Отключение: PK_QUALITY_GATE=0.
        Нет адаптера / ошибка чтения — fail-closed (summary.error), escape:
        PK_QUALITY_GATE_ON_ALERT_ERROR=open.
        """
        from core.gate_policy import (
            AdmissionResult,
            evaluate_admission_gate,
            quality_gate_enabled,
        )

        if not quality_gate_enabled():
            logger.info("Quality gate disabled via PK_QUALITY_GATE")
            result = AdmissionResult(
                failed=False,
                watch=False,
                summary={"disabled": True, "source": source},
            )
            return self.apply_admission_result(result)

        resolved = counts
        src = (source or "scanner").strip() or "scanner"
        if resolved is None:
            try:
                resolved = self.collect_scanner_severity_counts()
                src = "scanner"
            except Exception as exc:
                self._fail_quality_gate_on_alert_error(str(exc))
                return False

        result = evaluate_admission_gate(resolved, policy, source=src)
        self.apply_admission_result(result)
        if result.failed:
            logger.error(
                "Admission gate FAIL (%s): %s",
                src,
                result.summary.get("counts"),
            )
            for line in result.recommendations:
                logger.error("Quality gate: %s", line)
            try:
                import allure

                body = json.dumps(result.summary, ensure_ascii=False, indent=2)
                allure.attach(
                    body,
                    name="Admission quality gate",
                    attachment_type=allure.attachment_type.TEXT,
                )
            except Exception:
                pass
        elif result.watch:
            logger.warning(
                "Admission gate WATCH (%s): soft residual %s",
                src,
                result.summary.get("counts"),
            )
        else:
            logger.info("Admission gate PASS (%s)", src)
        return bool(result.failed)

    def _session_name(self) -> str:
        """Человекочитаемое имя прогона для Selenoid UI и имён артефактов."""
        parts = [self.wired.meta.project_id or "pk"]
        scenarios = (self.wired.test_suites.scenarios if self.wired.test_suites else None) or []
        if len(scenarios) == 1:
            parts.append(scenarios[0].scenario_name)
        elif scenarios:
            parts.append(f"{len(scenarios)} scenarios")
        return " / ".join(p for p in parts if p)

    def _register_actions(self):
        adapters = {
            "webdriver": self.adapters["webdriver"],
            "browser": self.adapters["browser"],
            "scanner": self.adapters["scanner"],
            "http": self.adapters["http"],
            "grpc": self.adapters["grpc"],
            "connector": self.adapters["connector"],
            "data": self.adapters["data"],
            "fuzz": self.adapters["fuzz"],
            "core": DataProcessor,
            "inspector": Inspector,
        }
        # Wire `allure|…` — историческое имя; реализация = утилита Reporter (не адаптер).
        for m in (
            "attach_screenshot",
            "attach_text",
            "attach_json",
            "attach_html",
            "attach_file",
        ):
            self.action_factory.register("allure", m, getattr(self.reporter, m))
        for component, obj in adapters.items():
            methods = [
                m for m in dir(obj)
                if callable(getattr(obj, m))
                and not m.startswith("_")
                and m not in _NON_KEYWORD_METHODS
            ]
            for method_name in methods:
                method = getattr(obj, method_name)
                self.action_factory.register(component, method_name, method)
        # СборИнформации: WD navigate + scannerWorkStream (оба адаптера)
        self.action_factory.register("webdriver", "gather_info", self._kw_gather_info)
        # CD-6: zero-touch discovery pipeline keyword
        self.action_factory.register("core", "discovery_pipeline", self._kw_discovery_pipeline)

    def _kw_discovery_pipeline(
        self,
        url=None,
        context_name=None,
        run_active_scan=True,
        active_scan_target=None,
        max_depth=1,
    ):
        from corpus.pipeline import run_discovery_pipeline

        return run_discovery_pipeline(
            self.adapters.get("webdriver"),
            (self.adapters.get("scanner") or self.adapters.get("scanner")),
            url=url,
            context_name=context_name,
            run_active_scan=run_active_scan,
            active_scan_target=active_scan_target,
            max_depth=max_depth,
        )

    def _kw_gather_info(
        self,
        source,
        burst_sec=None,
        settle_sec=None,
        max_urls=None,
        pscan_timeout_sec=None,
        wall_sec=None,
        mode=None,
        spider_sec=None,
    ):
        from utils.gather_info import run_gather_info

        return run_gather_info(
            self.adapters["webdriver"],
            self.adapters["scanner"],
            source,
            burst_sec=burst_sec,
            settle_sec=settle_sec,
            max_urls=max_urls,
            pscan_timeout_sec=pscan_timeout_sec,
            wall_sec=wall_sec,
            mode=mode,
            spider_sec=spider_sec,
        )

    def _seed_wired_stream(self) -> None:
        """
        Поля формы → имена в DataStream (без побочных действий).
        base_url_override → ${base_url}; авто-Открыть по-прежнему нет.
        """
        base = self._base_url_override()
        if not base:
            return
        self.global_stream.set("base_url", base)
        logger.info("Stream seed: base_url=%s", base)

    def run(self):
        logger.info("Controller started")
        try:
            from utils.diary_bus import (
                capture_run_start,
                clear as diary_clear,
                publish,
                set_meta,
            )
            from utils.live_server import default_novnc_url, start_live_server

            diary_clear()
            run_start_ts = capture_run_start()
            try:
                from utils.log_cuts import set_sidecar_providers

                browser_ad = self.adapters.get("browser")

                def _browser_logs():
                    if browser_ad is None or not hasattr(browser_ad, "get_browser_logs"):
                        return []
                    return list(browser_ad.get_browser_logs() or [])

                def _perf_logs():
                    if browser_ad is None or not hasattr(browser_ad, "get_performance_logs"):
                        return []
                    return list(browser_ad.get_performance_logs() or [])

                set_sidecar_providers(browser_logs=_browser_logs, perf_logs=_perf_logs)
            except Exception:
                pass
            browser = getattr(self.wired.infrastructure, "browser_type", None) or "chrome"
            meta = self.wired.meta
            purpose = getattr(meta, "assessment_purpose", None)
            generate_act = bool(getattr(meta, "generate_act", False))
            try:
                from utils.live_pers_acl import resolve_run_owner_user_id

                _owner = resolve_run_owner_user_id()
            except Exception:
                _owner = None
            # Clear stale CI verdicts from previous runs before seeding fresh meta.
            try:
                from utils.diary_bus import clear_ci_meta

                clear_ci_meta()
            except Exception:
                pass
            set_meta(
                session_name=self._session_name(),
                status="running",
                novnc_url=default_novnc_url(browser),
                browser_type=browser,
                generate_act=generate_act,
                assessment_purpose=purpose,
                run_start_ts=run_start_ts,
                **({"owner_user_id": _owner} if _owner else {}),
            )
            # B-1: публикация первого события таймлайна с меткой t=0
            publish(
                "RUN_STARTED",
                rf"Прогон {self._session_name() or '—'}' начат",
                channel="diary",
            )
            # B-6: засеять scene_graph из wired манифеста для Live API
            try:
                from utils.live_server import build_scene_graph_from_wired
                graph = build_scene_graph_from_wired(self.wired.model_dump())
                diary_bus.set_meta(scene_graph=graph)
            except Exception:
                pass
            try:
                from core.debug_run import wired_debug_mode, set_live_debug_flags

                if wired_debug_mode(self.wired):
                    set_live_debug_flags(
                        enabled=True, paused=False, timers_suppressed=True
                    )
            except Exception:
                pass
            start_live_server(session_name=self._session_name())
            try:
                from utils.live_server import notify_ci_status

                notify_ci_status(
                    phase="in_progress",
                    job_name=self._session_name(),
                    job_description="Локальный прогон оркестратора",
                )
            except Exception as ci_e:
                logger.debug("PrettyK Live ci/status (running) skipped: %s", ci_e)
        except Exception as e:
            logger.debug("PrettyK Live start skipped: %s", e)
        self._seed_wired_stream()
        self._log_declarative_gap()
        if not self.wired.test_suites:
            logger.warning("No test_suites found. Nothing to execute.")
            self.suites_complete = True
            self._await_session_end()
            return
        # Не fail-fast: копим весь фарш, ведём до живого косяка, весь список — в teardown/лог.
        self._wired_problems = self.collect_wired_problems()
        if self._wired_problems:
            logger.warning(
                "В манифесте %s проблем валидации — прогон продолжаем; "
                "полный список уйдёт в лог на teardown (и при падении сценария)",
                len(self._wired_problems),
            )
        pages = self.wired.test_suites.pages or {}
        self.page_resolver = PageResolver(pages)
        scenarios = self.wired.test_suites.scenarios or []
        self.scenario_stats = {"ok": 0, "fail": 0, "fail_allowed": 0, "skip": 0}
        self.scenario_outcomes = []
        self.suites_complete = False
        try:
            if not scenarios:
                self.suites_complete = True
                logger.info("Controller finished (no scenarios)")
            else:
                self._run_all_scenarios(scenarios)
                self.suites_complete = self.scenario_stats["skip"] == 0
                logger.info("Controller finished")
        finally:
            # Один scanner-final на весь прогон (успех или падение), не на каждый сценарий.
            self._attach_final_scanner_report()
            # Ручной Webswing: держим процесс до idle/work (сценарии могли быть пусты).
            self._await_session_end()

    def _mark_remaining_scenarios_skipped(self, scenarios, start_index: int) -> None:
        from core.scenario_failsafe import scenario_failsafe_allowed

        for j in range(start_index, len(scenarios)):
            nxt = scenarios[j]
            self.scenario_outcomes.append(
                {
                    "name": nxt.scenario_name,
                    "status": "skip",
                    "failsafe": scenario_failsafe_allowed(nxt),
                }
            )

    def _run_all_scenarios(self, scenarios) -> None:
        from core.debug_run import wired_debug_mode, wait_while_paused
        from core.scenario_failsafe import scenario_failsafe_allowed

        debug = wired_debug_mode(self.wired)
        for index, scenario in enumerate(scenarios):
            name = scenario.scenario_name
            allowed = scenario_failsafe_allowed(scenario) or debug
            try:
                wait_while_paused(
                    should_stop=lambda: bool(
                        getattr(self, "_timeout_kill_reason", None)
                    )
                )
                self._run_scenario(scenario)
                self.scenario_stats["ok"] += 1
                self.scenario_outcomes.append(
                    {
                        "name": name,
                        "status": "ok",
                        "failsafe": allowed,
                        "debug_mode": debug,
                    }
                )
            except Exception as exc:
                # DBG-3: в debug любой raise (в т.ч. WiredError) → soft continue.
                if allowed:
                    self.scenario_stats["fail_allowed"] += 1
                    self.scenario_outcomes.append(
                        {
                            "name": name,
                            "status": "fail_allowed",
                            "failsafe": True,
                            "debug_mode": debug,
                        }
                    )
                    logger.warning(
                        "Scenario failsafe%s: %s failed but stage-1 continues: %s",
                        " (debug_mode)" if debug else " (<!>)",
                        name,
                        exc,
                    )
                    continue
                self.scenario_stats["fail"] += 1
                self.scenario_stats["skip"] += max(0, len(scenarios) - index - 1)
                self.scenario_outcomes.append(
                    {
                        "name": name,
                        "status": "failed",
                        "failsafe": False,
                        "debug_mode": False,
                    }
                )
                self._mark_remaining_scenarios_skipped(scenarios, index + 1)
                raise

    def shutdown(self):
        """
        Шаг 5 жизненного цикла (docs/prettyk.md): остановка незакрытых сессий браузера.
        Вызывается из finally точки входа, поэтому только логирует проблемы завершения
        и никогда не бросает исключение — иначе teardown подменит исходную ошибку прогона.
        Безопасен для симуляции (адаптер без драйвера) и для повторного вызова.
        """
        try:
            self._teardown_dump_wired_problems()
        except Exception as e:
            logger.debug("wired problems teardown dump skipped: %s", e)
        self._cancel_session_timeouts()
        logger.info("Controller shutdown: closing browser sessions")
        adapter = self.adapters.get("webdriver")
        if adapter is None:
            logger.debug("WebDriver adapter was not created, nothing to close")
        else:
            try:
                adapter.shutdown()
            except Exception as e:
                logger.warning(f"WebDriver teardown failed: {e}")

        # PW-B2: Playwright webm -> MP4 for Monitor compatibility
        try:
            from utils.run_recording import convert_webm_to_mp4

            if hasattr(adapter, "_video_dir") and adapter._video_dir:
                run_id = (pk_env("RUN_ID") or "").strip() or self._session_name()
                convert_webm_to_mp4(adapter._video_dir, run_id)
        except Exception as e:
            logger.debug("webm->mp4 conversion skipped: %s", e)
        try:
            from utils.log_cuts import close_all as log_cuts_close_all

            # Незакрытые НачатьЛогирование → flush до конца прогона (LOG-CUT).
            closed = log_cuts_close_all(with_sidecars=True)
            if closed:
                logger.info("Log cuts auto-closed: %s", ", ".join(str(p.name) for p in closed))
        except Exception as e:
            logger.debug("Log cuts auto-close skipped: %s", e)
        try:
            from utils.live_server import notify_live_run_ended

            # Shell event: export diary snapshot; do not kill Live HTTP.
            # run_id должен быть hex (PK_RUN_ID) — тот же, что летит фронтенду,
            # кладётся в видео-артефакт и в ?run_id= Monitor. Human session_name
            # сюда не годится: иначе экспорт пишется под human-именем и Monitor
            # по hex run_id не находит журнал (пустой results).
            run_id = (pk_env("RUN_ID") or "").strip() or self._session_name()
            notify_live_run_ended(run_id=run_id)
        except Exception as e:
            logger.debug("PrettyK Live run_ended notify skipped: %s", e)

    def _teardown_dump_wired_problems(self) -> None:
        """
        Весь фарш валидации в ERROR-лог на teardown.
        Не Selenium dry-run: заранее собранный список «что ещё наебнулось бы».
        """
        if not self._wired_problems:
            return
        n = len(self._wired_problems)
        body = (
            f"TEARDOWN: в манифесте {n} проблем валидации "
            f"(не abort'или заранее — вот весь список):\n"
            + "\n".join(self._wired_problems)
        )
        logger.error(body)
        try:
            allure.attach(
                body,
                name="TEARDOWN: проблемы валидации манифеста",
                attachment_type=allure.attachment_type.TEXT,
            )
        except Exception:
            pass

    def _step_for_scenario_run(self, step, step_index: int):
        """steps[0]: снять префикс <!> и @-директивы перед execute (маркер остаётся в JSON)."""
        if step_index != 0:
            return step
        from types import SimpleNamespace

        from core.scenario_failsafe import parse_scenario_failsafe_prefix, strip_at_directives

        ctor = getattr(step, "constructor", None) or ""
        if not isinstance(ctor, str):
            return step
        allowed, body = parse_scenario_failsafe_prefix(ctor)
        if allowed:
            body = strip_at_directives(body)
        else:
            ctor_stripped = strip_at_directives(ctor)
            if ctor_stripped != ctor:
                return SimpleNamespace(
                    id=getattr(step, "id", None),
                    description=getattr(step, "description", None),
                    constructor=ctor_stripped,
                    failsafe=getattr(step, "failsafe", False),
                    retry=getattr(step, "retry", 0) or 0,
                    retry_delay=getattr(step, "retry_delay", 2) or 2,
                    continue_on_failure=getattr(step, "continue_on_failure", False),
                    save_as=getattr(step, "save_as", "") or "",
                )
            return step
        if not allowed:
            return step
        return SimpleNamespace(
            id=getattr(step, "id", None),
            description=getattr(step, "description", None),
            constructor=body,
            failsafe=getattr(step, "failsafe", False),
            retry=getattr(step, "retry", 0) or 0,
            retry_delay=getattr(step, "retry_delay", 2) or 2,
            continue_on_failure=getattr(step, "continue_on_failure", False),
            save_as=getattr(step, "save_as", "") or "",
        )

    def _run_scenario(self, scenario: Scenario):
        from allure_commons.model2 import TestResult, Status, Label
        from allure_commons.utils import uuid4, now
        from utils.allure_runtime import bind_allure, unbind_allure

        ensure_reports_dirs()

        # FileLogger пишет JSON; listener связывает allure.step/attach с reporter.
        # Opt-in check mode → subdir (docs/check-evidence-refs.md); default = flat.
        reporter, listener, file_logger = bind_allure(str(resolve_allure_results_dir()))

        test_uuid = uuid4()
        suite_name = (scenario.description or "").strip() or scenario.scenario_name
        test_result = TestResult(
            uuid=test_uuid,
            name=scenario.scenario_name,
            fullName=scenario.scenario_name,
            start=now(),
            labels=[
                Label(name="suite", value=suite_name),
                Label(name="feature", value=self.wired.meta.assessment_purpose),
            ]
        )
        reporter.schedule_test(test_uuid, test_result)

        try:
            logger.info(f"Running scenario: {scenario.scenario_name}")
            self._execution_trace = ExecutionTrace()
            scenario_stream = DataStream()
            scenario_stream.seed_secret_values(getattr(self, "_secret_seeds", None) or [])
            scenario_stream.merge(self.global_stream)

            # imports (txt → list) затем data-модули → stream.
            self._url_list_keys = set()
            self._export_suite_imports(scenario_stream)
            self._export_data_modules(scenario_stream)

            from core.language_parse import is_language_script

            steps = scenario.steps or []
            from core.debug_run import wait_while_paused
            from utils.telemetry_bus import emit_step_end, emit_step_start, emit_edge_pulse

            telemetry_run_id = (
                pk_env("RUN_ID") or self._session_name()
            ).strip()
            prev_telemetry_step_id: str | None = None

            for index, step in enumerate(steps):
                wait_while_paused(
                    should_stop=lambda: bool(
                        getattr(self, "_timeout_kill_reason", None)
                    )
                )
                run_step = self._step_for_scenario_run(step, index)
                step_name = (
                    (run_step.description or "").strip()
                    or run_step.constructor
                    or "Step"
                )
                business_title = (run_step.description or "").strip()
                next_step = steps[index + 1] if index + 1 < len(steps) else None
                next_previewed = (
                    self._publish_live_next_step(next_step, scenario_stream)
                    if next_step is not None
                    else False
)
                telemetry_step_id = f"scenario:{index}"
                telemetry_started = time.perf_counter()
                emit_step_start(telemetry_run_id, telemetry_step_id, step_name)
                try:
                    if business_title:
                        with self._trace_scope(
                            kind="business",
                            category="Сценарий",
                            title=business_title,
                        ):
                            step_result = self._run_step(
                                run_step, scenario_stream, scenario, step_name
                            )
                    elif is_language_script(run_step.constructor or ""):
                        step_result = self._run_step(
                            run_step, scenario_stream, scenario, step_name
                        )
                    else:
                        step_result = self._run_step(
                            run_step, scenario_stream, scenario, step_name
                        )
                except Exception:
                    emit_step_end(
                        telemetry_run_id,
                        telemetry_step_id,
                        "failure",
                        duration_ms=int((time.perf_counter() - telemetry_started) * 1000),
                    )
                    raise
                else:
                    emit_step_end(
                        telemetry_run_id,
                        telemetry_step_id,
                        "success" if step_result is not False else "warning",
                        duration_ms=int((time.perf_counter() - telemetry_started) * 1000),
                    )
                    if prev_telemetry_step_id:
                        emit_edge_pulse(
                            telemetry_run_id,
                            source=prev_telemetry_step_id,
                            target=telemetry_step_id,
                            latency_ms=int((time.perf_counter() - telemetry_started) * 1000),
                        )

                prev_telemetry_step_id = telemetry_step_id

                if next_step is not None and not next_previewed:
                    self._publish_live_next_step(next_step, scenario_stream)

            test_result.status = Status.PASSED
            test_result.stop = now()

        except WiredError as e:
            test_result.status = Status.FAILED
            test_result.stop = now()
            # Упали на битом конструкторе — в сообщение уже входит весь список косяков.
            logger.error(f"Scenario failed: {e}")
            raise
        except Exception as e:
            test_result.status = Status.FAILED
            test_result.stop = now()
            # Упали по любой причине — всё равно светим оставшиеся косяки манифеста:
            # чинить удобнее списком, а не «ещё один прогон — ещё одна опечатка».
            self._report_wired_problems(context=f"Сценарий упал: {e}")
            logger.exception(f"Scenario failed: {e}")
            raise
        finally:
            traces = getattr(self, "execution_traces", None)
            if traces is None:
                traces = self.execution_traces = []
            traces.append((scenario.scenario_name, self._execution_trace))
            reporter.close_test(test_uuid)
            unbind_allure(listener, file_logger)

    @contextmanager
    def _trace_scope(
        self,
        *,
        kind: str,
        category: str,
        title: str,
        method_id: str = "",
        constructor: str = "",
        publish_live: bool = False,
    ):
        """Открыть trace-узел и его UI-проекцию, не отдавая trace адаптерам."""
        trace = getattr(self, "_execution_trace", None)
        if trace is None:
            trace = self._execution_trace = ExecutionTrace()
        with trace.span(
            kind=kind,
            category=category,
            title=title,
            method_id=method_id,
            constructor=constructor,
        ):
            with allure.step(title):
                yield
        if publish_live:
            try:
                from utils.diary_bus import publish

                channel = "scanner" if category == "scanner" else "diary"
                publish(category.upper(), title, channel=channel)
            except Exception:
                pass

    def _language_trace_scope(self, kind: str, title: str):
        return self._trace_scope(
            kind=kind,
            category="Управление",
            title=title,
        )

    def _attach_final_scanner_report(self):
        """
        Один финальный HTML scanner на весь прогон — после всех сценариев или при падении.

        Отдельный Allure-тест «scanner final report», чтобы вложение не дублировалось
        в каждом сценарии. Никогда не бросает — иначе teardown подменит ошибку прогона.
        """
        scanner = (self.adapters.get("scanner") or self.adapters.get("scanner"))
        if scanner is None:
            return

        from allure_commons.model2 import TestResult, Status, Label
        from allure_commons.utils import uuid4, now
        from utils.allure_runtime import bind_allure, unbind_allure

        ensure_reports_dirs()
        reporter, listener, file_logger = bind_allure(str(resolve_allure_results_dir()))
        test_uuid = uuid4()
        purpose = getattr(getattr(self.wired, "meta", None), "assessment_purpose", None) or "PK"
        test_result = TestResult(
            uuid=test_uuid,
            name="scanner final report",
            fullName="scanner final report",
            start=now(),
            labels=[
                Label(name="suite", value="scanner"),
                Label(name="feature", value=purpose),
            ],
        )
        reporter.schedule_test(test_uuid, test_result)
        try:
            report_path = scanner.generate_report(format="html", output_file="scanner-final.html")
            self.last_scanner_report = str(report_path)
            test_result.status = Status.PASSED
            test_result.stop = now()
            logger.info("Final scanner report attached once: %s", report_path)
        except Exception as e:
            test_result.status = Status.BROKEN
            test_result.stop = now()
            logger.warning("Failed to build final scanner report: %s", e)
        finally:
            try:
                reporter.close_test(test_uuid)
            except Exception as e:
                logger.debug("close_test for scanner final report: %s", e)
            unbind_allure(listener, file_logger)

    _DATA_EXPORT_MODULE_TYPES = frozenset({"Модуль работы с данными"})

    @staticmethod
    def _parse_data_lines(text: str) -> List[str]:
        """Строки editor/txt: trim, пустые и #комментарии пропускаем."""
        rows: List[str] = []
        for line in (text or "").splitlines():
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            rows.append(s)
        return rows

    @staticmethod
    def _join_base_url(base: str, row: str) -> str:
        """Относительный path → base; http(s) — как есть."""
        from urllib.parse import urljoin

        if row.startswith(("http://", "https://")):
            return row
        base = (base or "").strip()
        if not base:
            raise WiredError(
                f"относительный URL {row!r}: нужен infrastructure.base_url_override"
            )
        return urljoin(base if base.endswith("/") else base + "/", row)

    def _base_url_override(self) -> str:
        scan = getattr(self.wired, "scan_base_url", None)
        if callable(scan):
            try:
                return (scan() or "").strip()
            except Exception:
                pass
        infra = getattr(self.wired, "infrastructure", None)
        base = (getattr(infra, "base_url_override", None) or "").strip() if infra else ""
        if base:
            return base
        sec = getattr(self.wired, "security_configuration", None)
        return (getattr(sec, "base_url_override", None) or "").strip() if sec else ""

    def _resolve_import_path(self, path: str, *, allow_dir: bool = False) -> str:
        """path относительно манифеста, затем cwd; иначе WiredError."""
        from pathlib import Path

        raw = (path or "").strip()
        if not raw:
            raise WiredError("imports: пустой path")
        candidates = []
        p = Path(raw)
        if p.is_file() or (allow_dir and p.is_dir()):
            return str(p.resolve())
        if self.wired_path:
            candidates.append(Path(self.wired_path).parent / raw)
        candidates.append(Path.cwd() / raw)
        for cand in candidates:
            if cand.is_file() or (allow_dir and cand.is_dir()):
                return str(cand.resolve())
        raise WiredError(
            f"imports: {'путь' if allow_dir else 'файл'} не найден: {raw}"
        )

    def _import_path_key(self, stream: DataStream, item, *, kind: str):
        as_hint = (getattr(item, "as_name", None) or "").strip()
        try:
            path = self._resolve_import_path(
                item.path, allow_dir=(kind == "proto_pack")
            )
        except WiredError as e:
            suffix = f" (as={as_hint})" if as_hint else ""
            raise WiredError(f"{e}{suffix}") from e
        stem = os.path.splitext(os.path.basename(path))[0]
        key = (as_hint or stem or "").strip()
        if not key:
            raise WiredError(f"imports: не удалось вывести имя stream для {path}")
        if key in stream:
            raise WiredError(
                f"Коллизия имён: ${{{key}}} уже есть в stream (imports / export)"
            )
        return path, key, as_hint

    def _import_path_scalar(
        self,
        stream: DataStream,
        *,
        kind: str,
        path: str,
        key: str,
        item,
        as_hint: str,
        allowed_suffixes: set[str],
    ) -> None:
        suffix = os.path.splitext(path)[1].lower()
        if suffix not in allowed_suffixes:
            raise WiredError(
                f"imports {kind}: whitelist {', '.join(sorted(allowed_suffixes))}; "
                f"получено {suffix or '(без расширения)'} ({item.path})"
                + (f" as={as_hint}" if as_hint else "")
            )
        stream.set(key, path)
        logger.debug("Import %s: %s → ${%s} (path)", kind, path, key)

    def _import_proto_pack(
        self, stream: DataStream, *, path: str, key: str, item, as_hint: str
    ) -> None:
        from pathlib import Path as _Path

        pth = _Path(path)
        if not pth.exists():
            raise WiredError(
                f"imports proto_pack: путь не найден ({item.path})"
                + (f" as={as_hint}" if as_hint else "")
            )
        suffix = pth.suffix.lower() if pth.is_file() else ""
        if pth.is_file() and suffix not in {".zip", ".proto"}:
            raise WiredError(
                f"imports proto_pack: whitelist .zip/.proto или каталог; "
                f"получено {suffix or '(без расширения)'} ({item.path})"
                + (f" as={as_hint}" if as_hint else "")
            )
        stream.set(key, path)
        logger.debug("Import proto_pack: %s → ${%s} (path)", path, key)

    def _import_txt_rows(
        self, stream: DataStream, *, kind: str, path: str, key: str, item, as_hint: str
    ) -> None:
        suffix = os.path.splitext(path)[1].lower()
        if suffix != ".txt":
            raise WiredError(
                f"imports {kind}: whitelist только .txt (G-11); "
                f"получено {suffix or '(без расширения)'} ({item.path})"
                + (f" as={as_hint}" if as_hint else "")
            )
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        if kind == "fuzz_corpus":
            rows = self._parse_data_lines(text)
            if not rows:
                raise WiredError(f"fuzz_corpus {item.path}: нет payload-строк")
            stream.set(key, rows)
            logger.debug(
                "Import fuzz_corpus: %s → ${%s} (%s строк)", path, key, len(rows)
            )
            return
        base = self._base_url_override()
        rows = [self._join_base_url(base, row) for row in self._parse_data_lines(text)]
        stream.set(key, rows)
        self._note_url_list_key(key)
        logger.debug("Import data_file: %s → ${%s} (%s строк)", path, key, len(rows))

    def _import_suite_item(self, stream: DataStream, item) -> None:
        kind = getattr(item, "kind", None) or "data_file"
        path, key, as_hint = self._import_path_key(stream, item, kind=kind)
        if kind == "scenario_json":
            raise WiredError(
                f"imports: kind=scenario_json отклонён до beta (G-10); "
                f"merge не в этой волне ({item.path})"
                + (f" as={as_hint}" if as_hint else "")
            )
        if kind == "har_file":
            self._import_path_scalar(
                stream,
                kind=kind,
                path=path,
                key=key,
                item=item,
                as_hint=as_hint,
                allowed_suffixes={".har"},
            )
            return
        if kind == "proto_pack":
            self._import_proto_pack(
                stream, path=path, key=key, item=item, as_hint=as_hint
            )
            return
        if kind in {"openapi_spec", "graphql_sdl"}:
            allowed = (
                {".json", ".yaml", ".yml"}
                if kind == "openapi_spec"
                else {".graphql", ".sdl", ".gql", ".json"}
            )
            self._import_path_scalar(
                stream,
                kind=kind,
                path=path,
                key=key,
                item=item,
                as_hint=as_hint,
                allowed_suffixes=allowed,
            )
            return
        if kind not in {"data_file", "fuzz_corpus"}:
            raise WiredError(
                f"imports: неизвестный kind {kind!r} "
                f"(разрешены: data_file / fuzz_corpus / har_file / proto_pack / "
                f"openapi_spec / graphql_sdl; scenario_json — reject G-10)"
            )
        self._import_txt_rows(
            stream, kind=kind, path=path, key=key, item=item, as_hint=as_hint
        )

    def _export_suite_imports(self, stream: DataStream) -> None:
        """
        test_suites.imports → stream.
        Beta (G-11): kind=data_file, только .txt → URL list[str].
        Fuzz POC: kind=fuzz_corpus, только .txt → raw payload list[str].
        IMP-HAR: kind=har_file, только .har → absolute path str (ИмпортHAR).
        G-10: scenario_json — hard-reject (merge не в beta).
        """
        suites = self.wired.test_suites
        if suites is None:
            return
        for item in suites.imports or []:
            self._import_suite_item(stream, item)

    def _export_one_data_module(self, stream: DataStream, mod) -> None:
        from types import SimpleNamespace

        from core.properties_module import (
            apply_properties_module,
            looks_like_properties_module,
        )

        mid = (getattr(mod, "id", None) or "").strip()
        if not mid:
            raise WiredError("data-модуль без id — нечего экспортировать в stream")
        if mid in stream:
            raise WiredError(
                f"Коллизия имён: ${{{mid}}} уже есть в stream "
                f"(data-модуль / предыдущий export)"
            )
        storage = getattr(mod, "data_storage_fields", None)
        source_type = getattr(storage, "source_type", None) if storage else None
        process_id = (getattr(storage, "process_id", None) or "").strip() if storage else ""
        editor = (getattr(storage, "editor", None) or "").strip() if storage else ""
        if source_type == "Генерация из источника":
            if process_id == "additional_urls":
                self._export_url_line_list(stream, mid, editor)
                return
            raise WiredError(
                f"data-модуль {mid!r}: неизвестный process_id {process_id!r} "
                f"для «Генерация из источника» (известен: additional_urls)"
            )
        script = (getattr(mod, "constructor", None) or "").strip() or editor
        if looks_like_properties_module(script):
            apply_properties_module(stream, mid, script)
            logger.debug("Data-модуль properties экспортирован: %s", mid)
            return
        if self._looks_like_url_line_list(script):
            self._export_url_line_list(stream, mid, script)
            return
        self._apply_context_item(SimpleNamespace(id=mid, constructor=script), stream)
        if mid not in stream:
            raise WiredError(
                f"data-модуль {mid!r}: после constructor/editor нет ${{{mid}}} — "
                f"используйте Пусть ${{{mid}}} = … в редакторе модуля"
            )
        logger.debug("Data-модуль экспортирован: %s", mid)

    def _export_data_modules(self, stream: DataStream) -> None:
        """
        test_data_constructor с module_type «Модуль работы с данными» → stream[module.id].
        Фаззинг/коннектор/и т.п. — не данные, пока нет явного export.
        """
        suites = self.wired.test_suites
        if suites is None:
            return
        for mod in suites.test_data_constructor or []:
            if getattr(mod, "module_type", None) not in self._DATA_EXPORT_MODULE_TYPES:
                continue
            self._export_one_data_module(stream, mod)

    def _note_url_list_key(self, key: str) -> None:
        keys = getattr(self, "_url_list_keys", None)
        if not isinstance(keys, set):
            keys = set()
            self._url_list_keys = keys
        keys.add(key)

    def _export_url_line_list(self, stream: DataStream, mid: str, text: str) -> None:
        """Строки path/URL → stream[mid] list[str]; ключ помечаем для G-64."""
        base = self._base_url_override()
        urls = [
            self._join_base_url(base, row) for row in self._parse_data_lines(text)
        ]
        stream.set(mid, urls)
        self._note_url_list_key(mid)
        logger.debug("Data-модуль URL-list: %s (%s URL)", mid, len(urls))

    @classmethod
    def _looks_like_url_line_list(cls, text: str) -> bool:
        """G-65: только path/URL-строки; язык / Пусть / wire — False."""
        from core.language_parse import is_language_script
        from core.pretty_data import pretty_line_to_wire

        raw = (text or "").strip()
        if not raw:
            return False
        if is_language_script(raw):
            return False
        first = raw.split("\n", 1)[0].strip()
        try:
            if pretty_line_to_wire(first) is not None:
                return False
        except WiredError:
            pass
        rows = cls._parse_data_lines(raw)
        if not rows:
            return False
        for row in rows:
            if row.startswith(("http://", "https://", "/", "#/")):
                continue
            # относительный path без ведущего / (login, path/x)
            if "|" in row or "=" in row:
                return False
            if any(ch.isspace() for ch in row):
                return False
        return True

    def _include_stream_url_lists(
        self,
        *,
        stream: DataStream | None,
        apply_csv,
    ) -> int:
        total = 0
        keys = getattr(self, "_url_list_keys", None) or set()
        for key in sorted(keys):
            if stream is None or key not in stream:
                continue
            val = stream.get(key)
            if not isinstance(val, list) or not val:
                continue
            for item in val:
                s = str(item or "").strip()
                if s:
                    total += apply_csv(s, f"stream:{key}")
        return total

    def _include_url_lists_in_context(
        self, context_name: str, stream: DataStream | None
    ) -> None:
        """
        G-64: после НовыйКонтекст — include base_url + URL-списки suites.
        allowed_extra_domains не трогаем (явный ПрименитьДомены).
        """
        name = (context_name or "").strip()
        if not name:
            return
        scanner = (self.adapters.get("scanner") or self.adapters.get("scanner"))
        if scanner is None:
            return
        include = getattr(scanner, "set_context_include", None)
        to_rx = getattr(scanner, "domains_csv_to_include_regexes", None)
        if not callable(include) or not callable(to_rx):
            return

        def _apply_csv(csv: str, label: str) -> int:
            n = 0
            for rx in to_rx(csv) or []:
                try:
                    include(name, rx)
                    n += 1
                except Exception as exc:
                    logger.debug("G-64 include %s (%s): %s", rx, label, exc)
            return n

        total = 0
        base = self._base_url_override()
        if base:
            total += _apply_csv(base, "base_url")
        total += self._include_stream_url_lists(stream=stream, apply_csv=_apply_csv)

        # PURE: blocklisted URLs — set_context_exclude в scanner
        blocked = getattr(getattr(self.wired, "infrastructure", None), "blocked_urls_list", None)
        if blocked and isinstance(blocked, list) and len(blocked) > 0:
            exclude = getattr(scanner, "set_context_exclude", None)
            if callable(exclude):
                for url in blocked:
                    url_str = str(url).strip()
                    if url_str:
                        try:
                            for rx in to_rx(url_str) or [url_str]:
                                exclude(name, rx)
                                logger.debug("G-64 exclude %s (blocked): %s", rx, url_str)
                        except Exception as exc:
                            logger.debug("G-64 exclude fail %s: %s", url_str, exc)

        url_keys = getattr(self, "_url_list_keys", None) or set()
        if total:
            logger.info(
                "G-64: %s include-правил в context %s (base + %s URL-list ключей)",
                total,
                name,
                len(url_keys),
            )
        else:
            logger.debug("G-64: context %s — нечего include (no-op)", name)

    def _apply_context_script(self, text: str, stream: DataStream, key: str) -> bool:
        from core.language_parse import is_language_script
        from core.pretty_data import pretty_line_to_wire

        first = text.split("\n")[0].strip()
        if not (is_language_script(text) or pretty_line_to_wire(first) is not None):
            return False
        head = text.lstrip()
        if head.startswith(
            ("Если", "Цикл", "ДляКаждого", "Пока", "Попробовать", "Группа", "?")
        ):
            self._run_language_script(
                text, stream, scenario=None, step=None, step_name="context"
            )
        else:
            self._exec_data_script(text, stream)
        logger.debug("Context script applied (id=%s)", key or None)
        return True

    def _apply_context_wire(self, text: str, stream: DataStream, key: str) -> bool:
        from core.method_id import ensure_wire, looks_like_wire
        from types import SimpleNamespace

        wire = ensure_wire(text)
        if not (looks_like_wire(wire) and "|" in wire):
            return False
        leaf_step = SimpleNamespace(
            constructor=wire,
            retry=0,
            retry_delay=2,
            failsafe=False,
            continue_on_failure=False,
            save_as=key,
            id=key,
            description=None,
        )
        self._run_action_leaf(wire, leaf_step, stream, None, f"context/{key}")
        logger.debug("Context/export executed: %s", key)
        return True

    def _apply_context_item(self, ctx_item, stream: DataStream) -> None:
        """
        Context: wire/значение → set(id); pretty data / language → исполнить в stream.
        """
        raw = ctx_item.constructor if ctx_item.constructor is not None else ""
        raw = raw if isinstance(raw, str) else str(raw)
        text = raw.strip()
        if not text:
            return
        key = (getattr(ctx_item, "id", None) or "").strip()
        if key and key in stream:
            raise WiredError(
                f"Коллизия имён: ${{{key}}} уже объявлена (context / data-модуль)"
            )
        if self._apply_context_script(text, stream, key):
            return
        if not key:
            raise WiredError("Context item без id и без data-скрипта")
        if self._apply_context_wire(text, stream, key):
            return
        stream.set(key, stream.resolve(text))
        logger.debug(f"Context set: {key} = {stream.get(key)}")

    def _exec_data_script(self, script: str, stream: DataStream) -> None:
        from core.pretty_data import script_to_steps

        data_adapter = self.adapters.get("data")
        if data_adapter is not None:
            data_adapter.bind(stream)
        for index, item in enumerate(script_to_steps(script), start=1):
            wire = item["constructor"]
            component, action, params = self._parse_constructor(wire)
            # core|… — вычисляемый RHS (Пусть ${email} = СлучайныйEmail).
            if component not in ("data", "core"):
                raise WiredError(
                    f"context data-script шаг {index}: ожидался data|… или core|…, "
                    f"получено {wire!r}"
                )
            for key, val in params.items():
                if isinstance(val, str):
                    params[key] = stream.resolve_arg(val)
            result = self.action_factory.execute(component, action, params, stream)
            save_as = item.get("save_as") or ""
            if save_as:
                stream.set(save_as, result)

    def _expand_page_refs(self, text: str, stream: "DataStream | None" = None) -> str:
        """
        Подставить $page.element / $var → constructor или by|value для LocatorDesc.

        Legacy `${…}` тоже. Внутри Операции короткое $элемент — элемент страницы;
        данные сильнее: слоты payload ждут значение, не локатор.
        """
        resolver = getattr(self, "page_resolver", None)
        if not text or "$" not in text:
            return text
        from core import expr as expr_mod
        from core.expr import LocatorDesc

        scope = getattr(self, "_page_scope", None)
        page_scope = scope[-1] if scope else None

        def expand_one(path: str, original: str) -> str:
            path = path.strip()
            if resolver is not None:
                ctor = resolver.resolve_constructor(path)
                if ctor is not None:
                    return ctor
            if stream is not None:
                try:
                    val = stream.get_path(path)
                except WiredError:
                    pass
                else:
                    if isinstance(val, LocatorDesc):
                        return val.as_wire()
                    return original
            if resolver is not None and page_scope and "." not in path:
                ctor = resolver.resolve_constructor(f"{page_scope}.{path}")
                if ctor is not None:
                    return ctor
            return original

        out: list[str] = []
        i = 0
        n = len(text)
        while i < n:
            if text[i] != "$":
                out.append(text[i])
                i += 1
                continue
            try:
                got = expr_mod.match_ref_at(text, i)
            except WiredError:
                out.append(text[i])
                i += 1
                continue
            if got is None:
                out.append(text[i])
                i += 1
                continue
            tok, end = got
            path = expr_mod.strip_ref(tok)
            out.append(expand_one(path or "", tok) if path else tok)
            i = end
        return "".join(out)

    def _run_page_call(self, node, stream: DataStream, scenario, step, step_name: str):
        if self.page_resolver is None:
            raise WiredError("page_call: PageResolver не инициализирован")
        action = self.page_resolver.get_action(node.page, node.action)
        ctor = action.get("constructor") or ""
        title = (action.get("description") or "").strip() or f"{node.page}.{node.action}"

        pushed = False
        if node.payload:
            from core import expr as expr_mod

            raw_p = node.payload.strip()
            inner = expr_mod.strip_ref(raw_p)
            if inner is not None:
                payload_val = stream.get_path(inner)
            else:
                payload_val = stream.parse_value(raw_p)
            binds = self.page_resolver.bind_payload(node.page, payload_val)
            stream.push_locals(binds, page_key=node.page)
            pushed = True
        scope = getattr(self, "_page_scope", None)
        if scope is None:
            scope = self._page_scope = []
        scope.append(node.page)
        try:
            with self._trace_scope(
                kind="page_call",
                category="Страница",
                title=title,
            ):
                return self._run_language_script(
                    ctor, stream, scenario, step, f"{step_name}/{node.page}.{node.action}"
                )
        finally:
            scope.pop()
            if pushed:
                stream.pop_locals()

    def _run_language_script(
        self,
        script: str,
        stream: DataStream,
        scenario: Scenario | None,
        step: ActionStep | None,
        step_name: str,
    ) -> bool:
        from core.lang_ast import ActionNode, PageCallNode
        from types import SimpleNamespace

        def run_leaf(node: ActionNode):
            from core.method_id import ensure_wire

            ctor = self._expand_page_refs(ensure_wire(node.constructor), stream)
            leaf_desc = self._leaf_diary_description(step, node)
            if step is None:
                leaf_step = SimpleNamespace(
                    constructor=ctor,
                    retry=0,
                    retry_delay=2,
                    failsafe=False,
                    continue_on_failure=False,
                    save_as=node.save_as or "",
                    id="context",
                    description=leaf_desc or None,
                )
            else:
                leaf_step = SimpleNamespace(
                    constructor=ctor,
                    retry=getattr(step, "retry", 0) or 0,
                    retry_delay=getattr(step, "retry_delay", 2) or 2,
                    failsafe=getattr(step, "failsafe", False),
                    continue_on_failure=getattr(step, "continue_on_failure", False),
                    save_as=node.save_as or getattr(step, "save_as", "") or "",
                    id=getattr(step, "id", None),
                    description=leaf_desc or None,
                )
            return self._run_action_leaf(
                ctor,
                leaf_step,
                stream,
                scenario,
                leaf_desc or ctor,
            )

        def run_page_call(node: PageCallNode):
            return self._run_page_call(node, stream, scenario, step, step_name)

        self.language_engine.execute_script(
            script,
            stream=stream,
            run_leaf=run_leaf,
            run_page_call=run_page_call,
            step_label=step_name,
            trace_scope=self._language_trace_scope,
        )
        return True

    def _run_step(self, step: ActionStep, stream: DataStream, scenario: Scenario, step_name: str = "Step"):
        from core.language_parse import is_language_script
        from core.method_id import ensure_wire

        resolved = stream.resolve(step.constructor)
        raw_with_markers = resolved if isinstance(resolved, str) else str(resolved)

        if is_language_script(raw_with_markers):
            return self._run_language_script(
                raw_with_markers, stream, scenario, step, step_name
            )

        # Плоский MethodId-шаг (без Если/Цикл): RU → wire до parse_leaf.
        raw_with_markers = ensure_wire(raw_with_markers)
        expanded = self._expand_page_refs(raw_with_markers, stream)
        return self._run_action_leaf(expanded, step, stream, scenario, step_name)

    def _bind_leaf_save_as(self, leaf, step):
        if not leaf.save_as or (getattr(step, "save_as", None) or ""):
            return step
        try:
            step.save_as = leaf.save_as
            return step
        except Exception:
            from types import SimpleNamespace

            return SimpleNamespace(
                constructor=getattr(step, "constructor", leaf.constructor),
                retry=getattr(step, "retry", 0) or 0,
                retry_delay=getattr(step, "retry_delay", 2) or 2,
                failsafe=getattr(step, "failsafe", False),
                continue_on_failure=getattr(step, "continue_on_failure", False),
                save_as=leaf.save_as,
                id=getattr(step, "id", None),
                description=getattr(step, "description", None),
            )

    def _soft_or_raise(self, soft: bool, exc: Exception, msg: str):
        if soft:
            # After HEAL_MISS (if any) — failsafe absorbs; not ERROR.
            logger.warning("%s: %s", msg, exc)
            return False
        logger.error("Step failed (hard, heal/failsafe did not save): %s: %s", msg, exc)
        raise exc

    def _run_leaf_recover_then_retry(
        self,
        leaf,
        step,
        stream: DataStream,
        scenario: Scenario | None,
        step_name: str,
        *,
        soft: bool,
        primary_exc: Exception,
    ):
        logger.warning(
            "Step failed, recover (%s) then retry×1: %s",
            len(leaf.recover_constructors),
            primary_exc,
        )
        try:
            for idx, recover_ctor in enumerate(leaf.recover_constructors):
                self._run_leaf_attempts(
                    recover_ctor,
                    step,
                    stream,
                    scenario,
                    f"{step_name}/recover[{idx}]",
                    soft=False,
                )
        except WiredError as recover_wired:
            return self._soft_or_raise(
                soft, recover_Wired, "Recover WiredError but failsafe/debug"
            )
        except Exception as recover_exc:
            if soft:
                logger.warning("Recover failed but failsafe: %s", recover_exc)
                return False
            raise RuntimeError(
                f"Recover после ошибки primary тоже упал: {recover_exc}"
            ) from recover_exc
        try:
            return self._run_leaf_attempts(
                leaf.constructor, step, stream, scenario, step_name, soft=False
            )
        except WiredError as retry_wired:
            return self._soft_or_raise(
                soft, retry_Wired, "Retry WiredError but failsafe/debug"
            )
        except Exception as retry_exc:
            if soft:
                logger.warning("Retry after recover failed but failsafe: %s", retry_exc)
                return False
            raise RuntimeError(
                f"Primary снова упал после recover: {retry_exc}"
            ) from retry_exc

    def _run_action_leaf(
        self,
        raw_with_markers: str,
        step,
        stream: DataStream,
        scenario: Scenario | None,
        step_name: str,
    ):
        try:
            leaf = LanguageEngine.parse_leaf(raw_with_markers)
        except WiredError as e:
            raise self._enrich_wired_error(e, step=step, scenario=scenario) from e

        step = self._bind_leaf_save_as(leaf, step)
        from core.debug_run import wired_debug_mode

        soft = bool(
            leaf.failsafe
            or getattr(step, "failsafe", False)
            or getattr(step, "continue_on_failure", False)
            or wired_debug_mode(getattr(self, "wired", None))
        )
        try:
            from utils.locator_heal_runtime import heal_label_scope, heal_scope
        except Exception:
            heal_scope = None  # type: ignore
            heal_label_scope = None  # type: ignore

        def _run_primary():
            return self._run_leaf_attempts(
                leaf.constructor, step, stream, scenario, step_name, soft=False
            )

        try:
            from contextlib import ExitStack

            with ExitStack() as stack:
                if heal_scope is not None:
                    stack.enter_context(heal_scope(allowed=soft))
                hint = (getattr(leaf, "label_hint", None) or "").strip()
                if hint and heal_label_scope is not None:
                    stack.enter_context(heal_label_scope(hint))
                return _run_primary()
        except WiredError as wired_exc:
            return self._soft_or_raise(
                soft, wired_exc, "Step WiredError but failsafe/debug"
            )
        except Exception as primary_exc:
            if leaf.recover_constructors:
                return self._run_leaf_recover_then_retry(
                    leaf,
                    step,
                    stream,
                    scenario,
                    step_name,
                    soft=soft,
                    primary_exc=primary_exc,
                )
            return self._soft_or_raise(
                soft, primary_exc, "Step failed but failsafe/continue"
            )

    def _resolve_leaf_call(
        self, raw_constructor: str, stream: DataStream
    ) -> tuple[str, str, dict]:
        component, action, params = self._parse_constructor(raw_constructor)
        for key, val in params.items():
            if isinstance(val, str):
                params[key] = stream.resolve_arg(val)
        if component == "scanner" and action in (
            "apply_wired_auth",
            "generate_automation_plan",
        ):
            self._enrich_scanner_wired_params(action, params)
        return component, action, params

    def _diary_leaf_preamble(
        self,
        *,
        step: ActionStep,
        component: str,
        action: str,
        params: dict,
        call_name: str,
        execution_title: str,
        raw_constructor: str,
        stream: DataStream,
    ) -> None:
        if component == "scanner" and action == "log_attack":
            return
        if component == "core" and action == "log_message":
            # В дневник — уже resolve_arg + mask, не сырой `$var` из constructor.
            log_text = stream.mask_for_log(params.get("message") or execution_title)
            self._diary("LOG", log_text, live=True, stream=stream)
            return
        if component == "core" and action in ("start_log_cut", "end_log_cut"):
            # Сами методы уже publish LOG; STEP не дублируем.
            return
        live_step = self._should_publish_live_step(step, call_name, execution_title)
        pretty = self._step_pretty_for_live(step, raw_constructor)
        self._diary(
            "STEP",
            execution_title,
            raw_constructor,
            live=live_step,
            stream=stream,
            pretty=pretty,
        )

    def _step_pretty_for_live(self, step, raw_constructor: str) -> str:
        """PrettyK-строка для каретки шагов Live.

        Приоритет: авторский description (не wire/скрипт) → pretty из wire.
        Лог при этом остаётся `execution_title | raw_constructor`.
        """
        from core.language_parse import diary_human_title
        from core.method_id import looks_like_wire, wire_to_pretty_line

        desc = (getattr(step, "description", None) or "").strip()
        if desc and not looks_like_wire(desc):
            human = diary_human_title(desc)
            if human:
                return human
        return wire_to_pretty_line(raw_constructor or "")

    def _bind_leaf_adapters(self, component: str, stream: DataStream) -> None:
        data_adapter = self.adapters.get("data")
        if data_adapter is not None:
            data_adapter.bind(stream)
        if component == "fuzz":
            self.adapters["fuzz"].bind(stream)

    def _publish_leaf_result(
        self, component: str, action: str, params: dict, result, stream: DataStream
    ) -> None:
        if component == "scanner":
            if action == "log_attack":
                self._publish_log_attack_live(params, stream=stream)
            else:
                self._publish_scanner_live(action, params, result)
            if action in self._scanner_ALERT_FLUSH_ACTIONS:
                self._diary_scanner_alerts()
        elif component == "fuzz":
            self._publish_fuzz_live(result)

    def _finalize_leaf_success(
        self,
        *,
        component: str,
        action: str,
        params: dict,
        result,
        step: ActionStep,
        stream: DataStream,
    ) -> None:
        if component == "scanner" and action == "generate_report" and result:
            self.last_scanner_report = str(result)
            logger.info(f"scanner report saved to: {self.last_scanner_report}")
        if component == "scanner" and action == "create_context":
            ctx_name = params.get("context_name") or ""
            self._include_url_lists_in_context(ctx_name, stream)
            self._maybe_scanner_auth_after_context(ctx_name)
        # console.log → нижнее окно Live (не INFO оркестратора).
        self._flush_browser_console_to_live()
        if step.save_as:
            stream.set(step.save_as, result)
            logger.debug(
                "Saved result: %s = %s",
                step.save_as,
                stream.mask_for_log(result),
            )

    def _execute_leaf_once(
        self,
        *,
        constructor: str,
        step: ActionStep,
        stream: DataStream,
        attempt: int,
        retry_count: int,
    ) -> None:
        if getattr(self, "_timeout_kill_reason", None):
            raise WiredError(
                f"scanner уже остановлен по таймауту ({self._timeout_kill_reason})"
            )
        self.touch_activity()
        logger.debug("Executing step: %s", stream.mask_for_log(constructor))
        component, action, params = self._resolve_leaf_call(constructor, stream)
        call_name = f"{component}|{action}"
        from core.method_id import render_execution_title

        execution_title = render_execution_title(
            component, action, params, mask=stream.mask_for_log
        )
        if retry_count:
            execution_title = (
                f"Попытка {attempt + 1}/{retry_count + 1}: {execution_title}"
            )
        if (
            component == "core"
            and action == "start_log_cut"
            and not (params.get("comment") or "").strip()
        ):
            desc = (getattr(step, "description", None) or "").strip()
            if desc and not desc.lower().startswith("начатьлогирование"):
                params["comment"] = desc
        self._diary_leaf_preamble(
            step=step,
            component=component,
            action=action,
            params=params,
            call_name=call_name,
            execution_title=execution_title,
            raw_constructor=constructor,
            stream=stream,
        )
        self._bind_leaf_adapters(component, stream)
        category = execution_title.split(":", 1)[0]
        with self._trace_scope(
            kind="action",
            category=category,
            title=execution_title,
            method_id=call_name,
            constructor=constructor,
        ):
            if component == "scanner":
                self._publish_scanner_scan_started(action)
            result = self.action_factory.execute(component, action, params, stream)
            self._publish_leaf_result(component, action, params, result, stream)
        logger.info("Step executed: %s", call_name)
        self._finalize_leaf_success(
            component=component,
            action=action,
            params=params,
            result=result,
            step=step,
            stream=stream,
        )

    def _leaf_attempt_failure(
        self,
        *,
        exc: Exception,
        step_name: str,
        constructor: str,
        stream: DataStream,
        attempt: int,
        retry_count: int,
        soft: bool,
        retry_delay: float,
    ) -> bool | None:
        """None = retry; False = soft stop; raise on hard fail."""
        self._diary("ERROR", step_name, constructor, str(exc), stream=stream)
        try:
            masked_err = stream.mask_for_log(str(exc))
            masked_tb = stream.mask_for_log(traceback.format_exc())
            allure.attach(
                f"Error: {masked_err}\nTraceback:\n{masked_tb}",
                name="Exception Details",
                attachment_type=allure.attachment_type.TEXT,
            )
        except Exception:
            pass
        next_attempt = attempt + 1
        if next_attempt > retry_count:
            if soft:
                logger.warning(f"Step failed but soft=True: {exc}")
                return False
            logger.exception(f"Step failed after {retry_count} retries: {exc}")
            raise RuntimeError(f"Step failed: {exc}") from exc
        logger.warning(f"Step failed, retry {next_attempt}/{retry_count}: {exc}")
        time.sleep(retry_delay)
        return None

    def _run_leaf_attempts(
        self,
        constructor: str,
        step: ActionStep,
        stream: DataStream,
        scenario: Scenario,
        step_name: str,
        *,
        soft: bool,
    ) -> bool:
        """Retry-цикл для одного wire-constructor без маркеров."""
        retry_count = step.retry or 0
        retry_delay = step.retry_delay or 2
        attempt = 0
        while attempt <= retry_count:
            try:
                self._execute_leaf_once(
                    constructor=constructor,
                    step=step,
                    stream=stream,
                    attempt=attempt,
                    retry_count=retry_count,
                )
                return True
            except WiredError as e:
                self._diary("ERROR", step_name, str(e), stream=stream)
                raise self._enrich_wired_error(e, step=step, scenario=scenario) from e
            except Exception as e:
                outcome = self._leaf_attempt_failure(
                    exc=e,
                    step_name=step_name,
                    constructor=constructor,
                    stream=stream,
                    attempt=attempt,
                    retry_count=retry_count,
                    soft=soft,
                    retry_delay=retry_delay,
                )
                if outcome is False:
                    return False
                attempt += 1
        return False

    _LIVE_SKIP_PLUMBING = frozenset(
        {
            ("core", "log_message"),
            ("data", "size"),
            ("data", "get"),
            ("data", "let"),
            ("data", "append"),
            ("data", "pop"),
            ("data", "keys"),
            ("data", "has"),
            ("browser", "get_cookies_count"),
        }
    )

    _LIVE_USER_FLOW_COMPONENTS = frozenset({"webdriver", "browser", "http"})

    @staticmethod
    def _parse_diary_call_name(call_name: str) -> tuple[str, str]:
        raw = (call_name or "").strip()
        if raw.startswith("Попытка "):
            sep = raw.find(": ")
            if sep >= 0:
                raw = raw[sep + 2 :].strip()
        if "|" in raw:
            component, action = raw.split("|", 1)
            return component.strip(), action.strip()
        return "", raw

    def _step_human_milestone(self, step) -> bool:
        """Author-facing description (wired / parent), not auto pretty-wire."""
        from core.language_parse import diary_human_title, is_language_script
        from core.method_id import looks_like_wire, wire_to_pretty_line

        raw_desc = (getattr(step, "description", None) or "").strip()
        if not raw_desc or looks_like_wire(raw_desc):
            return False
        if is_language_script(raw_desc):
            return False
        human = diary_human_title(raw_desc)
        if not human:
            return False
        ctor = (getattr(step, "constructor", None) or "").strip()
        if ctor:
            pretty = wire_to_pretty_line(ctor)
            if pretty and human.strip() == pretty.strip():
                return False
        return True

    def _should_publish_live_step(self, step, call_name: str, title: str) -> bool:
        """Gate Live diary STEP: user-flow + milestones; skip wait/plumbing/scanner noise."""
        component, action = self._parse_diary_call_name(call_name)
        if (component, action) in self._LIVE_SKIP_PLUMBING:
            return False
        if action.startswith("wait_"):
            return False
        if component == "scanner":
            return False
        if component == "webdriver" and action == "gather_info":
            return True
        if self._step_human_milestone(step):
            return True
        if component in self._LIVE_USER_FLOW_COMPONENTS:
            return True
        return False

    def _publish_live_next_step(self, step: ActionStep, stream: DataStream) -> bool:
        """Publish an honest preview of the next plain user-flow step for PrettyK Live."""
        from core.language_parse import is_language_script
        from core.method_id import ensure_wire, render_execution_title

        try:
            resolved = stream.resolve(step.constructor)
            raw_constructor = resolved if isinstance(resolved, str) else str(resolved)
            if is_language_script(raw_constructor):
                return False

            wire = ensure_wire(raw_constructor)
            expanded = self._expand_page_refs(wire, stream)
            leaf = LanguageEngine.parse_leaf(expanded)
            component, action, params = self._parse_constructor(leaf.constructor)
            for key, value in params.items():
                if isinstance(value, str):
                    params[key] = stream.resolve_arg(value)

            call_name = f"{component}|{action}"
            title = render_execution_title(
                component, action, params, mask=stream.mask_for_log
            )
            if not self._should_publish_live_step(step, call_name, title):
                return False

            from core.method_id import wire_to_pretty_line

            pretty = wire_to_pretty_line(leaf.constructor or "")
            self._diary("NEXT", title, leaf.constructor, live=True, stream=stream, pretty=pretty)
            return True
        except Exception as exc:
            # Preview must never interrupt the scenario: a dynamic future step can
            # depend on a value that does not exist yet.
            logger.debug("Live next-step preview unavailable: %s", exc)
            return False

    def _diary(
        self,
        kind: str,
        *parts,
        live: bool = True,
        stream: DataStream | None = None,
        pretty: str = "",
    ) -> None:
        """Кураторский дневник: description/constructor/ошибки/High → консоль оркестратора."""
        if stream is not None:
            parts = stream.mask_parts(*parts)
            if pretty:
                pretty = stream.mask_for_log(pretty)
        adapter = self.adapters.get("webdriver")
        if adapter is not None:
            adapter.session_diary(kind, *parts, live=live, pretty=pretty)
            return
        text = " | ".join(str(p).replace("\n", " ").strip() for p in parts if p not in (None, ""))
        if text:
            line = text[:400]
            logger.info("[PK-DIARY] %s: %s", kind, line)
            if live:
                try:
                    from utils.diary_bus import publish

                    publish(str(kind or "NOTE").strip().upper(), line, channel="diary", pretty=pretty)
                except Exception:
                    pass

    def _diary_high_alerts(self) -> None:
        """Совместимость: то же, что _diary_scanner_alerts (High + Medium)."""
        self._diary_scanner_alerts()

    _scanner_ALERT_FLUSH_ACTIONS = frozenset(
        {
            "active_scan",
            "passive_scan_wait",
            "spider_scan",
            "spider_scan_spa",
            "spider_scan_deep",
            "spider_scan_local",
            "ajax_spider_scan",
            "ajax_spider_scan_shallow",
            "ajax_spider_scan_deep",
            "ajax_spider_scan_iterator",
            "client_spider_scan",
            "sequence_active_scan",
        }
    )

    def _leaf_diary_description(self, parent_step, node) -> str:
        """Подпись STEP для language-листа: description шага или pretty-строка."""
        from core.language_parse import is_language_script, language_script_is_single_action, leaf_source_description

        parent_desc = ""
        if parent_step is not None:
            parent_desc = (getattr(parent_step, "description", None) or "").strip()
            if parent_desc and is_language_script(parent_desc):
                parent_desc = ""
            parent_ctor = (getattr(parent_step, "constructor", None) or "").strip()
            if parent_desc and language_script_is_single_action(parent_ctor):
                return parent_desc
        src = leaf_source_description(getattr(node, "source_line", "") or "")
        if src:
            return src
        from core.method_id import wire_to_pretty_line

        return wire_to_pretty_line(getattr(node, "constructor", "") or "")

    def _diary_step_title(
        self, step, step_name: str, call_name: str, wire: str = ""
    ) -> str:
        """Короткий заголовок STEP: description / pretty-строка, не call_name."""
        from core.language_parse import diary_human_title
        from core.method_id import wire_to_pretty_line

        desc = diary_human_title(getattr(step, "description", None) or "")
        if desc:
            return desc
        name = diary_human_title(step_name or "")
        if name:
            return name
        pretty = wire_to_pretty_line(wire or step_name or "")
        if pretty:
            return pretty
        return call_name

    def _publish_scanner_live(self, action: str, params: dict, result=None) -> None:
        """Завершение scanner-операции — trace-step и событие правой scanner-ленты."""
        if action not in self._scanner_ALERT_FLUSH_ACTIONS:
            return
        text = self._format_scanner_live_text(action, params or {}, result)
        if not text:
            return
        self._record_scanner_trace_event(text, kind="scan_result")

    def _publish_scanner_scan_started(self, action: str) -> None:
        """Старт скана рядом с его completion в Live и ExecutionTrace."""
        titles = {
            "spider_scan": "Spider started",
            "spider_scan_spa": "Spider started",
            "spider_scan_deep": "Spider started",
            "spider_scan_local": "Spider started",
            "ajax_spider_scan": "AJAX Spider started",
            "ajax_spider_scan_shallow": "AJAX Spider started",
            "ajax_spider_scan_deep": "AJAX Spider started",
            "ajax_spider_scan_iterator": "AJAX Spider started",
            "client_spider_scan": "Client Spider started",
            "active_scan": "Active scan started",
            "sequence_active_scan": "Sequence active scan started",
            "passive_scan_wait": "Passive scan wait started",
        }
        title = titles.get(action)
        if title:
            self._record_scanner_trace_event(title, kind="scan_started")

    def _record_scanner_trace_event(self, text: str, *, kind: str) -> None:
        """Событие scanner — шаг, а не текстовое вложение Allure."""
        self._emit_trace_event(text, kind=kind, category="scanner")

    def _emit_trace_event(
        self,
        text: str,
        *,
        kind: str,
        category: str,
    ) -> None:
        """Открыть/закрыть trace-span без тела (публикация на exit scope)."""
        with self._trace_scope(
            kind=kind,
            category=category,
            title=text,
            publish_live=True,
        ):
            return None

    def _publish_fuzz_live(self, result) -> None:
        """Сводка фаззинга — вложенные trace-события + DF-14 digest в Allure.

        Сырые payload в ленту не попадают (только case_id / sha256-префикс).
        Файл evidence: reports/fuzz/*.json из ядра Campaign.
        """
        if not isinstance(result, dict):
            return
        from core.fuzzing import export_fuzz_security_artifacts, live_projection_titles

        titles = live_projection_titles(result)
        if not titles:
            return
        self._emit_trace_event(titles[0], kind="fuzz_result", category="Фаззинг")
        for title in titles[1:]:
            self._emit_trace_event(title, kind="fuzz_anomaly", category="Фаззинг")
        # Повторный export безопасен: findings перезаписываются; Allure — один digest.
        if result.get("digest_path") and not result.get("findings_path"):
            try:
                meta = export_fuzz_security_artifacts(result)
                result["findings_path"] = meta.get("findings_path") or ""
                result["reporting"] = meta
            except Exception:
                pass
        findings = str(result.get("findings_path") or "")
        if findings:
            from pathlib import Path as _Path

            self._emit_trace_event(
                f"Findings pack: {_Path(findings).name}",
                kind="fuzz_report",
                category="Фаззинг",
            )

    def _publish_log_attack_live(
        self, params: dict, *, stream: DataStream | None = None
    ) -> None:
        """Лог атаки: channel=scanner, kind=LOG, без STEP в diary."""
        message = str((params or {}).get("message") or "").strip()
        if not message:
            return
        if stream is not None:
            message = str(stream.mask_for_log(message))
        try:
            from utils.diary_bus import publish

            publish("LOG", f"ЛогАтаки | {message}", channel="scanner")
        except Exception:
            pass

    def _scanner_live_scan_timeout(self, action: str, params: dict):
        """
        Wire кладёт `АктивноеСканирование juice_ctx 2` как
        url=juice_ctx, context_name=2, timeout_minutes=None — сдвиг внутри адаптера.
        Live должен показывать тот же timeout, что реально ждёт сканер (минуты).
        """
        scanner = (self.adapters.get("scanner") or self.adapters.get("scanner"))
        if scanner is None:
            return params.get("timeout_minutes")
        url = params.get("url")
        ctx = params.get("context_name")
        timeout = params.get("timeout_minutes")
        if action == "active_scan":
            _, _, timeout = scanner._normalize_active_scan_args(url, ctx, timeout)
            return scanner._as_timeout_minutes(
                timeout, getattr(scanner, "active_scan_timeout", 30)
            )
        if action in {"spider_scan", "spider_scan_spa", "spider_scan_deep", "spider_scan_local"}:
            _, _, timeout, _ = scanner._normalize_spider_scan_args(
                url, ctx, timeout, params.get("logout_avoidance")
            )
            return scanner._as_timeout_minutes(timeout, getattr(scanner, "spider_timeout", 5))
        if action == "passive_scan_wait":
            if timeout in (None, ""):
                return 5
            try:
                return int(timeout)
            except (TypeError, ValueError):
                return timeout
        return timeout

    @staticmethod
    def _scanner_live_count(result) -> int:
        try:
            return max(0, int(result))
        except (TypeError, ValueError):
            return 0

    _scanner_LIVE_SPIDERS = frozenset(
        {
            "spider_scan",
            "spider_scan_spa",
            "spider_scan_deep",
            "spider_scan_local",
        }
    )
    _scanner_LIVE_AJAX = frozenset(
        {
            "ajax_spider_scan",
            "ajax_spider_scan_shallow",
            "ajax_spider_scan_deep",
            "ajax_spider_scan_iterator",
        }
    )

    def _format_scanner_live_text(self, action: str, params: dict, result=None) -> str:
        scanner = (self.adapters.get("scanner") or self.adapters.get("scanner"))
        ctx = params.get("context_name") or getattr(scanner, "context_name", None) or ""
        special = self._format_scanner_live_special(action, params, result, ctx)
        if special is not None:
            return special
        bits = [action]
        for key in ("context_name", "url", "regex", "output_file", "file_path"):
            if params.get(key):
                bits.append(str(params[key]))
        return " ".join(bits)

    @staticmethod
    def _scanner_live_create_context_line(params: dict) -> str:
        name = params.get("context_name") or ""
        desc = (params.get("description") or "").strip()
        if desc:
            return f"Создать контекст {name} — {desc}".strip()
        return f"Создать контекст {name}".strip() if name else "create_context"

    @staticmethod
    def _scanner_live_ctx_regex_line(verb: str, params: dict, ctx: str) -> str:
        return (
            f"{verb} {params.get('context_name') or ctx} {params.get('regex') or ''}"
        ).strip()

    def _scanner_live_scan_result_line(self, action: str, result) -> str | None:
        if action in self._scanner_LIVE_SPIDERS:
            return f"Spider found {self._scanner_live_count(result)} URLs"
        if action in self._scanner_LIVE_AJAX:
            return f"AJAX Spider found {self._scanner_live_count(result)} URLs"
        if action == "client_spider_scan":
            return f"Client Spider found {self._scanner_live_count(result)} URLs"
        if action == "passive_scan_wait":
            return "Passive scan completed" if result else "Passive scan timed out"
        if action == "active_scan":
            return (
                f"Active scan completed — found "
                f"{self._scanner_live_count(result)} vulnerabilities"
            )
        return None

    @staticmethod
    def _scanner_live_filter_line(action: str, params: dict, ctx: str) -> str | None:
        if action == "add_alert_filter":
            return (
                f"alert_filter {params.get('context_name') or ctx} "
                f"rule={params.get('rule_id')} level={params.get('new_level')}"
            ).strip()
        if action == "add_global_alert_filter":
            return (
                f"global_alert_filter rule={params.get('rule_id')} "
                f"level={params.get('new_level')}"
            ).strip()
        if action == "load_alert_filters":
            return (
                f"load_alert_filters {params.get('file_path') or ''} "
                f"{params.get('context_name') or ctx}"
            ).strip()
        return None

    def _format_scanner_live_special(
        self, action: str, params: dict, result, ctx: str
    ) -> str | None:
        if action == "create_context":
            return self._scanner_live_create_context_line(params)
        if action == "set_context_include":
            return self._scanner_live_ctx_regex_line("set_context_include", params, ctx)
        if action == "set_context_exclude":
            return self._scanner_live_ctx_regex_line("set_context_exclude", params, ctx)
        if action == "apply_allowed_domains":
            return (
                f"apply_domains {params.get('context_name') or ctx} "
                f"{params.get('domains_csv') or ''}"
            ).strip()
        scan_line = self._scanner_live_scan_result_line(action, result)
        if scan_line is not None:
            return scan_line
        if action == "generate_report":
            name = params.get("output_file") or params.get("format") or "report"
            return f"generate_report {name}"
        return self._scanner_live_filter_line(action, params, ctx)

    def _diary_scanner_alerts(self) -> None:
        """Только High → Live channel=scanner (формат строки не трогаем)."""
        scanner = (self.adapters.get("scanner") or self.adapters.get("scanner"))
        if scanner is None:
            return
        try:
            summary = scanner.summarize_alerts_for_live(risks=("High",))
        except Exception as e:
            self._diary("ERROR", f"Не удалось прочитать алерты scanner: {e}")
            return
        if not hasattr(self, "_live_scanner_alert_keys"):
            self._live_scanner_alert_keys = set()
        for item in summary["items"]:
            kind = item["kind"]
            line = item["line"]
            if self._is_scanner_tally_noise(line):
                continue
            key = (kind, line)
            if key in self._live_scanner_alert_keys:
                continue
            self._live_scanner_alert_keys.add(key)
            self._record_scanner_trace_event(line, kind=str(kind or "alert").lower())

    @staticmethod
    def _is_scanner_tally_noise(text: str) -> bool:
        """Отсекает строки-сводки вроде «всего=1 уникальных=1» / «high=1/1 medium=…»."""
        t = (text or "").strip().lower()
        if not t:
            return True
        if "уникальн" in t or "всего=" in t:
            return True
        if t.startswith("high=") or " high=" in f" {t}":
            if "medium=" in t or "low=" in t or "info=" in t or "уникальн" in t:
                return True
        return False

    def _publish_console_entry(self, publish, entry: dict) -> None:
        level = str(entry.get("level") or "INFO").upper()
        message = str(entry.get("message") or "").strip()
        ts = entry.get("timestamp")
        if not message:
            return
        key = (ts, level, message)
        if key in self._live_console_seen:
            return
        self._live_console_seen.add(key)
        low = message.lower()
        if "favicon" in low:
            return
        lvl = level.lower()
        if lvl in ("severe", "error"):
            label = "console.error"
        elif lvl == "warning":
            label = "console.warn"
        else:
            label = "console.log"
        try:
            publish("CONSOLE", f"{label} | {message}", channel="scanner")
        except Exception:
            pass

    def _flush_browser_console_to_live(self) -> None:
        """
        Кастомный вывод страницы: console.log/warn/error через Selenium browser log.
        Не тащим INFO оркестратора — только записи консоли браузера.
        """
        browser = self.adapters.get("browser")
        if browser is None or not hasattr(browser, "get_browser_logs"):
            return
        if not hasattr(self, "_live_console_seen"):
            self._live_console_seen = set()
        try:
            entries = browser.get_browser_logs() or []
        except Exception:
            return
        try:
            from utils.diary_bus import publish
        except Exception:
            return
        for entry in entries:
            if isinstance(entry, dict):
                self._publish_console_entry(publish, entry)

    def _parse_constructor(self, raw_string: str) -> tuple:
        """
        Конструктор из манифеста → (компонент, действие, именованные аргументы).

        Разбор строгий: неизвестное ключевое слово и неподходящее число аргументов —
        это WiredError, а не «шаг сделал что-то другое». Раньше такие конструкторы
        подменялись на core|log_message, и прогон зеленел на несуществующих шагах.
        """
        from core.wire_split import split_save_as_arrow, split_wire

        wire, _save_as = split_save_as_arrow(str(raw_string))
        parts = split_wire(wire)
        if len(parts) < 2:
            raise WiredError(
                f"Конструктор {raw_string!r} должен иметь вид "
                f"'<компонент>|<действие>[|аргументы]'"
            )

        component, action, args = parts[0], parts[1], parts[2:]

        method = self.action_factory.get_method(component, action)
        if method is None:
            raise WiredError(self._unknown_action_message(component, action))

        param_names, required_count, accepts_extra = self._signature_info(method)
        if len(args) < required_count or (not accepts_extra and len(args) > len(param_names)):
            raise WiredError(
                f"{component}|{action}: получено аргументов {len(args)}, "
                f"ожидается от {required_count} до "
                f"{'∞' if accepts_extra else len(param_names)}. "
                f"Сигнатура: {action}({', '.join(param_names)})"
            )

        params = {name: arg for name, arg in zip(param_names, args)}
        return component, action, params

    def _unknown_action_message(self, component: str, action: str) -> str:
        known_components = self.action_factory.components()
        if component not in known_components:
            return (
                f"Неизвестный компонент {component!r}. "
                f"Доступны: {', '.join(known_components)}"
            )
        actions = self.action_factory.actions_for(component)
        hint = difflib.get_close_matches(action, actions, n=3)
        message = f"Неизвестное действие {component}|{action}"
        if hint:
            message += f". Похожие: {', '.join(hint)}"
        return message

    @staticmethod
    def _signature_info(method) -> tuple:
        """Имена позиционных параметров, сколько из них обязательны и есть ли *args."""
        sig = inspect.signature(method)
        param_names = []
        required_count = 0
        accepts_extra = False
        for name, param in sig.parameters.items():
            if name in ('self', 'cls'):
                continue
            if param.kind in (param.VAR_POSITIONAL, param.VAR_KEYWORD):
                accepts_extra = True
                continue
            param_names.append(name)
            if param.default is param.empty:
                required_count += 1
        return param_names, required_count, accepts_extra

    def collect_wired_problems(self) -> List[str]:
        """
        Собирает все проблемы валидации конструкторов, не останавливаясь на первой.
        Реализация — core.wired_validate (также --validate-only без адаптеров).
        """
        from core.wired_validate import collect_wired_problems as _collect

        return _collect(self.wired, action_factory=self.action_factory)

    @staticmethod
    def _step_label(scenario=None, step=None) -> str:
        from core.wired_validate import step_label

        return step_label(scenario, step)

    def _enrich_wired_error(
        self, error: WiredError, step=None, scenario=None
    ) -> WiredError:
        """Текущий косяк + весь список проблем манифеста в одном сообщении."""
        label = self._step_label(scenario, step)
        current = f"  {label}: {error}"
        others = [p for p in self._wired_problems if p != current]
        lines = [f"Сломанный шаг {label}: {error}"]
        if others:
            lines.append("Другие проблемы валидации в манифесте:")
            lines.extend(others)
        elif self._wired_problems:
            # Список уже содержит текущий шаг — показываем его как полный отчёт.
            lines = ["Манифест содержит некорректные шаги:", *self._wired_problems]
        message = "\n".join(lines)
        self._report_wired_problems(context=message, already_formatted=True)
        return WiredError(message)

    def _report_wired_problems(self, context: str, already_formatted: bool = False) -> None:
        """Печатает и аттачит в Allure накопленные косяки валидации (если есть)."""
        if not self._wired_problems and not already_formatted:
            return
        body = context if already_formatted else (
            f"{context}\n\nПроблемы валидации манифеста:\n"
            + "\n".join(self._wired_problems)
        )
        if not already_formatted:
            logger.error(body)
        try:
            allure.attach(
                body,
                name="Проблемы валидации манифеста",
                attachment_type=allure.attachment_type.TEXT,
            )
        except Exception:
            pass


# ========== БЛОК ДОКУМЕНТАЦИИ ==========
"""
================================================================================
Файл: core/controller.py
Дата создания: 27.07.2026
Версия: 3.3 (step_name in logs)

Назначение:
    Диспетчер, управляющий жизненным циклом выполнения сценариев.
    Интегрирован с Allure для отчётности (ручной режим, без pytest).

Особенности:
    - AllureReporter + AllureFileLogger + PkAllureListener (utils/allure_runtime.py).
    - Listener нужен: без него allure.step/attach не попадают в result.json.
    - Каждый шаг сценария — `with allure.step(step_name)`; аттачи внутри шага.
    - В консоль логируется человекочитаемое имя шага (step_name).
    - Сохраняет имя последнего scanner-отчёта в `last_scanner_report`.
    - `shutdown()` закрывает сессию браузера (шаг 5 жизненного цикла) и вызывается
      из `finally` точки входа; ошибки завершения только логируются.

================================================================================
"""
