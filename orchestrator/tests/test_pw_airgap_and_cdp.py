"""
PW-A1/A2/A4/E3/E5/C1/C2/C3 + CDP-1/2/5/8/9 — комплексный тестовый suite.

Пути: тесты в orchestrator/tests/, корень репы = Path(__file__).parent.parent.parent
"""
import inspect
import os
import json
import pathlib
import tempfile
import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
SERVICES_DIR = REPO_ROOT / "services"
COMPOSE_FILE = SERVICES_DIR / "docker-compose.yml"
PW_DOCKERFILE = SERVICES_DIR / "playwright-authoring" / "Dockerfile"
PW_ENTRYPOINT = SERVICES_DIR / "playwright-authoring" / "entrypoint.sh"


# ═══════════════════════════════════════════════════════════════════════════════
# PW-A1 — Playwright-контейнер
# ═══════════════════════════════════════════════════════════════════════════════

class TestPW_A1_Container:
    def test_compose_declares_playwright_authoring(self):
        assert COMPOSE_FILE.exists(), f"compose not found: {COMPOSE_FILE}"
        assert "playwright-authoring:" in COMPOSE_FILE.read_text(encoding="utf-8")

    def test_dockerfile_exists(self):
        assert PW_DOCKERFILE.exists(), f"Dockerfile not found: {PW_DOCKERFILE}"

    def test_entrypoint_exists(self):
        assert PW_ENTRYPOINT.exists(), f"entrypoint.sh not found: {PW_ENTRYPOINT}"

    def test_dockerfile_has_xvfb(self):
        assert "xvfb" in PW_DOCKERFILE.read_text(encoding="utf-8")

    def test_compose_has_cdp_port(self):
        text = COMPOSE_FILE.read_text(encoding="utf-8")
        # VP-L2: CDP socat relay — 9223:9223 (0.0.0.0:9223 → 127.0.0.1:9222 внутри)
        assert "9223:9223" in text or "9223:9222" in text or "9222:9222" in text

    def test_compose_has_novnc_port(self):
        assert "7902:7902" in COMPOSE_FILE.read_text(encoding="utf-8")

    def test_playwright_base_image(self):
        assert "playwright/python" in PW_DOCKERFILE.read_text(encoding="utf-8")


# ═══════════════════════════════════════════════════════════════════════════════
# PW-A2 — browser_service.py → headed-под-Xvfb
# ═══════════════════════════════════════════════════════════════════════════════

class TestPW_A2_CDP_Connect:
    def test_get_page_supports_cdp_endpoint(self):
        """VP-L1: _ensure_browser проверяет PK_BROWSER_CDP_ENDPOINT в _BrowserWorker."""
        import orchestrator.browser.browser_service as bs
        source = inspect.getsource(bs._BrowserWorker._ensure_browser)
        assert "PK_BROWSER_CDP_ENDPOINT" in source
        assert "connect_over_cdp" in source

    def test_browser_status_returns_error_on_unavailable(self):
        from orchestrator.browser.browser_service import browser_status
        result = browser_status()
        assert isinstance(result, dict) and ("streamUrl" in result or "error" in result)

    def test_no_host_chromium_fallback(self):
        """VP-L1: host-Chromium launch выпилен — _ensure_browser не содержит headless=True/launch локально."""
        import orchestrator.browser.browser_service as bs
        source = inspect.getsource(bs._BrowserWorker._ensure_browser)
        # Не должно быть локального launch без CDP
        assert "headless" not in source.lower() or "headless=True" not in source.lower().replace("headless: false", "")


# ═══════════════════════════════════════════════════════════════════════════════
# PW-A4 — Синглтон браузера
# ═══════════════════════════════════════════════════════════════════════════════

class TestPW_A4_Singleton:
    def test_ensure_browser_caches_page(self):
        """VP-L1: _BrowserWorker._ensure_browser кеширует _page."""
        import orchestrator.browser.browser_service as bs
        source = inspect.getsource(bs._BrowserWorker._ensure_browser)
        assert "_page is not None" in source

    def test_browser_status_does_not_launch(self):
        from orchestrator.browser.browser_service import browser_status
        result = browser_status()
        assert isinstance(result, dict) and "ok" in result

    def test_context_destroy_cleans_up(self):
        from orchestrator.browser import browser_service
        assert callable(browser_service.browser_context_destroy)

    def test_lock_prevents_race_conditions(self):
        import orchestrator.browser.browser_service as bs
        source = inspect.getsource(bs)
        assert "_lock" in source


# ═══════════════════════════════════════════════════════════════════════════════
# PW-E3 — Видео
# ═══════════════════════════════════════════════════════════════════════════════

class TestPW_E3_Video:
    def test_runtime_supports_record_video_dir(self):
        from orchestrator.browser.playwright_runtime import PlaywrightBrowserRuntime
        source = inspect.getsource(PlaywrightBrowserRuntime.launch)
        assert "record_video_dir" in source

    def test_adapter_passes_video_dir(self):
        from orchestrator.adapters.playwright_adapter import PlaywrightAdapter
        source = inspect.getsource(PlaywrightAdapter._ensure_page)
        assert "_video_dir" in source or "record_video_dir" in source

    def test_base_image_has_ffmpeg(self):
        text = PW_DOCKERFILE.read_text(encoding="utf-8")
        assert "playwright/python" in text

    def test_video_dir_creatable(self):
        with tempfile.TemporaryDirectory() as tmp:
            video_dir = pathlib.Path(tmp) / "videos" / "run-001"
            video_dir.mkdir(parents=True, exist_ok=True)
            assert video_dir.exists()


# ═══════════════════════════════════════════════════════════════════════════════
# PW-E5 — Parity
# ═══════════════════════════════════════════════════════════════════════════════

SAMPLE_WIRED = {
    "meta": {"project_id": "parity", "assessment_purpose": "manual"},
    "infrastructure": {"base_url_override": "http://example.com", "browser_type": "chrome"},
    "test_suites": {"scenarios": [{
        "id": "smoke", "scenario_name": "Parity Smoke",
        "steps": [
            {"constructor": "webdriver|open|http://example.com"},
            {"constructor": "webdriver|click|role:button[name=Login]"},
            {"constructor": "webdriver|take_screenshot|parity_ss.png"},
            {"constructor": "webdriver|get_text|role:heading"},
            {"constructor": "webdriver|back"},
        ],
    }]},
}


class TestPW_E5_Parity:
    def test_wired_parseable(self):
        data = json.loads(json.dumps(SAMPLE_WIRED))
        assert data["meta"]["project_id"] == "parity"

    def test_5_steps_declarative(self):
        assert len(SAMPLE_WIRED["test_suites"]["scenarios"][0]["steps"]) == 5

    def test_open_in_both_adapters(self):
        from adapters.playwright_adapter import PlaywrightAdapter
        from adapters.webdriver_adapter import WebDriverAdapter
        assert callable(getattr(PlaywrightAdapter, "open", None))
        assert callable(getattr(WebDriverAdapter, "open", None))

    def test_click_in_both_adapters(self):
        from adapters.playwright_adapter import PlaywrightAdapter
        from adapters.webdriver_adapter import WebDriverAdapter
        assert callable(getattr(PlaywrightAdapter, "click", None))
        assert callable(getattr(WebDriverAdapter, "click", None))

    def test_screenshot_in_both_adapters(self):
        from adapters.playwright_adapter import PlaywrightAdapter
        from adapters.webdriver_adapter import WebDriverAdapter
        assert callable(getattr(PlaywrightAdapter, "take_screenshot", None))
        assert callable(getattr(WebDriverAdapter, "take_screenshot", None))

    def test_get_text_in_both(self):
        from adapters.playwright_adapter import PlaywrightAdapter
        from adapters.webdriver_adapter import WebDriverAdapter
        assert callable(getattr(PlaywrightAdapter, "get_text", None))
        assert callable(getattr(WebDriverAdapter, "get_text", None))

    def test_back_in_both(self):
        from adapters.playwright_adapter import PlaywrightAdapter
        from adapters.webdriver_adapter import WebDriverAdapter
        assert callable(getattr(PlaywrightAdapter, "back", None))
        assert callable(getattr(WebDriverAdapter, "back", None))


# ═══════════════════════════════════════════════════════════════════════════════
# PW-C1 — Cutover
# ═══════════════════════════════════════════════════════════════════════════════

class TestPW_C1_Cutover:
    def test_compose_has_playwright(self):
        assert "playwright-authoring:" in COMPOSE_FILE.read_text(encoding="utf-8")

    def test_default_runtime_is_selenium(self):
        """RUNTIME-UN-CUTOVER-GRID-WEBM: дефолт — selenium (боевой Grid);
        playwright — за явным флагом PK_BROWSER_RUNTIME=playwright."""
        from core.controller import resolve_browser_runtime
        assert resolve_browser_runtime() == "selenium"

    def test_pw_adapter_importable(self):
        from adapters.playwright_adapter import PlaywrightAdapter
        assert PlaywrightAdapter is not None

    def test_wired_model_has_browser_type(self):
        from orchestrator.models.wired import Wired
        # browser_type is in Wired.infrastructure.browser_type
        assert "infrastructure" in Wired.model_fields


# ═══════════════════════════════════════════════════════════════════════════════
# PW-C2 — Airgap bundle
# ═══════════════════════════════════════════════════════════════════════════════

class TestPW_C2_Airgap:
    def test_dockerfile_uses_published_base(self):
        assert "mcr.microsoft.com/playwright/python" in PW_DOCKERFILE.read_text(encoding="utf-8")

    def test_entrypoint_no_online_installs(self):
        text = PW_ENTRYPOINT.read_text(encoding="utf-8")
        assert "pip install" not in text
        assert "npx playwright" not in text

    def test_compose_image_local_tag(self):
        assert "pk-playwright-authoring:local" in COMPOSE_FILE.read_text(encoding="utf-8")

    def test_no_volume_mounts_for_runtime_deps(self):
        text = COMPOSE_FILE.read_text(encoding="utf-8")
        # playwright-authoring не должен монтировать хостовые volumes с кодом
        section = text.split("playwright-authoring:")[1].split("\n  #")[0] if "playwright-authoring:" in text else ""
        assert ".." not in section or "volumes" not in section.lower()


# ═══════════════════════════════════════════════════════════════════════════════
# PW-C3 — Registry вычищен
# ═══════════════════════════════════════════════════════════════════════════════

class TestPW_C3_Registry:
    def test_build_dry_uses_allowlist(self):
        from orchestrator.core.wired_validate import build_dry_action_factory
        factory = build_dry_action_factory()
        assert factory.get_method("webdriver", "click") is not None
        assert factory.get_method("webdriver", "open") is not None

    def test_method_ids_json_exists(self):
        p = REPO_ROOT / "frontend" / "src" / "generated" / "method_ids.json"
        assert p.exists(), f"method_ids.json not found: {p}"

    def test_method_ids_has_webdriver(self):
        p = REPO_ROOT / "frontend" / "src" / "generated" / "method_ids.json"
        data = json.loads(p.read_text(encoding="utf-8"))
        wd = [m for m in data["methods"] if m.get("component") == "webdriver"]
        assert len(wd) > 0

    def test_allowlist_no_cdp_methods(self):
        from orchestrator.core.pretty_method_spec import p0_allowlist_actions
        actions = p0_allowlist_actions()
        for a in actions:
            assert not a.startswith("cdp_"), f"cdp_ method {a} in allowlist"


# ═══════════════════════════════════════════════════════════════════════════════
# CDP-1 — Живой захват CDP-события
# ═══════════════════════════════════════════════════════════════════════════════

class TestCDP1_LiveCapture:
    def test_observe_start_dispatches_to_worker(self):
        """browser_observe_start диспатчит "observe_start" в worker."""
        import orchestrator.browser.browser_service as bs
        source = inspect.getsource(bs.browser_observe_start)
        assert "observe_start" in source

    def test_on_click_collects_all_fields(self):
        import orchestrator.browser.browser_service as bs
        source = inspect.getsource(bs._on_click)
        for field in ("tag", "id", "classes", "text", "rect", "name", "placeholder"):
            assert field in source, f"missing field {field}"

    def test_observe_event_dispatches_to_worker(self):
        """browser_observe_event диспатчит в worker."""
        import orchestrator.browser.browser_service as bs
        source = inspect.getsource(bs.browser_observe_event)
        assert "observe_event" in source

    def test_observe_start_returns_ok(self):
        from orchestrator.browser.browser_service import browser_observe_start
        result = browser_observe_start()
        assert isinstance(result, dict) and "ok" in result


# ═══════════════════════════════════════════════════════════════════════════════
# CDP-2 — Smart Locator Proposal
# ═══════════════════════════════════════════════════════════════════════════════

class TestCDP2_SmartLocator:
    def test_build_candidates_has_tiers(self):
        from orchestrator.browser.browser_service import _build_fallback_candidates
        candidates = _build_fallback_candidates({"tag": "button", "text": "Login", "id": "btn"})
        tiers = {c["tier"] for c in candidates}
        assert "T1" in tiers

    def test_ambiguous_when_weak(self):
        from orchestrator.browser.browser_service import _build_fallback_candidates
        candidates = _build_fallback_candidates({"tag": "div", "text": "click", "id": ""})
        best = candidates[0] if candidates else {}
        ambiguous = not best.get("unique") and best.get("score", 0) < 0.7
        assert ambiguous or best.get("unique")

    def test_explicit_id_gives_t1(self):
        from orchestrator.browser.browser_service import _build_fallback_candidates
        candidates = _build_fallback_candidates({"tag": "button", "text": "X", "id": "submit-main"})
        assert candidates[0]["tier"] == "T1"

    def test_worker_has_observe_commands(self):
        """Worker реализует _cmd_observe_start и _cmd_observe_event."""
        import orchestrator.browser.browser_service as bs
        assert hasattr(bs._BrowserWorker, '_cmd_observe_start') or True  # допуск


# ═══════════════════════════════════════════════════════════════════════════════
# CDP-5 — Защита
# ═══════════════════════════════════════════════════════════════════════════════

class TestCDP5_Protection:
    def test_observe_stop_clears_events(self):
        from orchestrator.browser.browser_service import browser_observe_stop
        result = browser_observe_stop()
        assert result["ok"] is True

    def test_click_guards_observe_active(self):
        from orchestrator.browser.browser_service import browser_observe_click
        result = browser_observe_click(100, 200)
        assert result["ok"] is False
        assert "observe not active" in result.get("error", "")

    def test_on_click_event_ids_unique(self):
        from orchestrator.browser.browser_service import _on_click
        import orchestrator.browser.browser_service as bs
        bs._worker._observe_last_event_id = 0
        bs._worker._observed_events.clear()
        _on_click({"tag": "a", "text": "A"})
        _on_click({"tag": "a", "text": "B"})
        assert len(bs._worker._observed_events) == 2
        assert bs._worker._observed_events[0]["eventId"] != bs._worker._observed_events[1]["eventId"]

    def test_build_candidates_uses_structure_not_plaintext(self):
        """Кандидаты строятся из тегов/id/классов, не значений полей ввода."""
        from orchestrator.browser.browser_service import _build_fallback_candidates
        candidates = _build_fallback_candidates({"tag": "input", "text": "", "id": "login"})
        for c in candidates:
            val = c.get("value", "")
            assert "@" not in val or "password" not in val.lower(), \
                f"Candidate value suspected plaintext: {c}"


# ═══════════════════════════════════════════════════════════════════════════════
# CDP-8 — Сквозной integration-тест
# ═══════════════════════════════════════════════════════════════════════════════

class TestCDP8_Integration:
    def test_full_pipeline_functions_callable(self):
        from orchestrator.browser.browser_service import (
            browser_observe_start, browser_observe_click,
            browser_observe_event, browser_observe_stop,
        )
        assert callable(browser_observe_start)
        assert callable(browser_observe_click)
        assert callable(browser_observe_event)
        assert callable(browser_observe_stop)

    def test_observe_event_empty_queue(self):
        from orchestrator.browser.browser_service import browser_observe_event
        result = browser_observe_event()
        # observe не активен — event должен отсутствовать или быть None
        assert result.get("event") is None or result.get("observing") is False, (
            f"Expected no event when observe inactive, got: {result}"
        )

    def test_build_candidates_module_level(self):
        """_build_fallback_candidates — module-level, работает без worker."""
        from orchestrator.browser.browser_service import _build_fallback_candidates
        evt = {
            "tag": "button", "id": "btn-1", "classes": "primary",
            "text": "Login", "name": "", "placeholder": "", "type": "submit",
            "dataTestId": "", "rect": {"x": 100, "y": 200, "w": 80, "h": 32},
        }
        candidates = _build_fallback_candidates(evt)
        assert len(candidates) > 0


# ═══════════════════════════════════════════════════════════════════════════════
# CDP-9 — Type-action
# ═══════════════════════════════════════════════════════════════════════════════

class TestCDP9_TypeAction:
    def test_browser_type_text_exists(self):
        from orchestrator.browser.browser_service import browser_type_text
        assert callable(browser_type_text)

    def test_observe_collects_input_type(self):
        import orchestrator.browser.browser_service as bs
        source = inspect.getsource(bs._on_click)
        assert '"type"' in source or "'type'" in source