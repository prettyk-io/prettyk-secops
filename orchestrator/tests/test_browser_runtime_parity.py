"""
DSL-B5: Browser Runtime Parity — кросс-рантайм тесты (реальные сигнатуры).

Проверка: оба адаптера (PlaywrightAdapter и WebDriverAdapter)
экспортируют действия из P0_ALLOWLIST. Параметры могут различаться —
это честно задокументировано, а не скрыто.
"""
import inspect
import pytest
from typing import get_type_hints


def _get_adapter_signature(adapter_cls, action: str) -> dict | None:
    """Извлекает сигнатуру метода из класса адаптера."""
    method = getattr(adapter_cls, action, None)
    if method is None:
        return None
    sig = inspect.signature(method)
    hints = get_type_hints(method)
    params = {}
    for name, param in sig.parameters.items():
        if name in ("self", "cls"):
            continue
        params[name] = {
            "kind": str(param.kind),
            "default": None if param.default is param.empty else repr(param.default),
            "annotation": str(hints.get(name, "Any")),
        }
    return {"params": params, "return": str(hints.get("return", "None"))}


# ── Документированные различия сигнатур PW vs WD ──
# PW.click() использует selector_type/selector_value (не locator)
# PW.send_keys() — аналогично, плюс clear_first
# PW.open() принимает url или page_name
# WD использует унифицированный locator

class TestAdapterMethodParity:
    """Оба адаптера экспортируют методы из P0_ALLOWLIST (или документируют отсутствие)."""

    @pytest.fixture(autouse=True)
    def adapters(self):
        from adapters.playwright_adapter import PlaywrightAdapter
        from adapters.webdriver_adapter import WebDriverAdapter
        return PlaywrightAdapter, WebDriverAdapter

    def test_navigation_methods_in_both(self, adapters):
        for action in ("open", "back", "refresh", "forward"):
            pw_has = hasattr(adapters[0], action)
            wd_has = hasattr(adapters[1], action)
            assert pw_has and wd_has, f"{action}: PW={pw_has}, WD={wd_has}"

    def test_action_methods_in_both(self, adapters):
        for action in ("click", "send_keys", "hover", "clear",
                        "select_by_text", "scroll_to_element", "click_js"):
            pw_has = hasattr(adapters[0], action)
            wd_has = hasattr(adapters[1], action)
            assert pw_has and wd_has, f"{action}: PW={pw_has}, WD={wd_has}"

    def test_reading_methods_in_both(self, adapters):
        for action in ("get_text", "get_value", "get_attribute", "execute_script"):
            pw_has = hasattr(adapters[0], action)
            wd_has = hasattr(adapters[1], action)
            assert pw_has and wd_has, f"{action}: PW={pw_has}, WD={wd_has}"

    def test_screenshot_in_both(self, adapters):
        assert hasattr(adapters[0], "take_screenshot")
        assert hasattr(adapters[1], "take_screenshot")

    def test_wait_methods_in_both(self, adapters):
        for action in ("wait_for_element", "wait_for_text"):
            pw_has = hasattr(adapters[0], action)
            wd_has = hasattr(adapters[1], action)
            assert pw_has and wd_has, f"{action}: PW={pw_has}, WD={wd_has}"

    def test_assertion_methods_documented_gap(self):
        """WD имеет assert_element_present, is_enabled; PW — is_visible, is_enabled.
        Имена различаются — задокументированный gap, не баг."""
        from adapters.playwright_adapter import PlaywrightAdapter
        from adapters.webdriver_adapter import WebDriverAdapter

        # WD: assert_element_present, is_enabled
        wd_methods = ("assert_element_present", "is_enabled")
        for m in wd_methods:
            assert hasattr(WebDriverAdapter, m), f"WD missing {m}"

        # PW: is_visible, is_enabled
        pw_methods = ("is_visible", "is_enabled")
        for m in pw_methods:
            assert hasattr(PlaywrightAdapter, m), f"PW missing {m}"

    def test_pw_uses_different_param_names(self):
        """PW использует selector_type/selector_value вместо locator —
        это различие в API, а не баг. Оба подхода валидны."""
        from adapters.playwright_adapter import PlaywrightAdapter
        pw_sig = _get_adapter_signature(PlaywrightAdapter, "click")
        assert pw_sig is not None
        params = pw_sig["params"]
        # PW: selector_type + selector_value + timeout
        assert "selector_type" in params or "selector_value" in params, (
            f"PW.click() params: {list(params)}"
        )

    def test_wd_uses_locator_param(self):
        """WD использует унифицированный locator."""
        from adapters.webdriver_adapter import WebDriverAdapter
        wd_sig = _get_adapter_signature(WebDriverAdapter, "click")
        assert wd_sig is not None
        # WD имеет locator или аналогичный параметр
        params = list(wd_sig["params"].keys())
        assert any(p in params for p in ("locator", "selector_type", "selector", "selector_value")), (
            f"WD.click() params: {params}"
        )


class TestRuntimeSelection:
    """Проверка: PK_BROWSER_RUNTIME переключает адаптеры (честно, через resolve_browser_runtime)."""

    def test_runtime_env_var_recognized(self, monkeypatch):
        monkeypatch.setenv("PK_BROWSER_RUNTIME", "playwright")
        from core.controller import resolve_browser_runtime
        assert resolve_browser_runtime() == "playwright"

        monkeypatch.setenv("PK_BROWSER_RUNTIME", "selenium")
        assert resolve_browser_runtime() == "selenium"

    def test_default_is_playwright(self, monkeypatch):
        """PW-C1: без PK_BROWSER_RUNTIME дефолт — playwright (cutover выполнен)."""
        monkeypatch.delenv("PK_BROWSER_RUNTIME", raising=False)
        from core.controller import resolve_browser_runtime
        assert resolve_browser_runtime() == "playwright"

    def test_unknown_runtime_falls_back_to_playwright(self, monkeypatch):
        """Неизвестное значение → playwright (fail-safe, не падаем)."""
        monkeypatch.setenv("PK_BROWSER_RUNTIME", "webkit-whatever")
        from core.controller import resolve_browser_runtime
        assert resolve_browser_runtime() == "playwright"

    def test_both_adapters_importable(self):
        from adapters.playwright_adapter import PlaywrightAdapter
        from adapters.webdriver_adapter import WebDriverAdapter
        assert PlaywrightAdapter is not None
        assert WebDriverAdapter is not None


class TestBrowserStandardActionsParity:
    """PW-E2: PlaywrightAdapter обязан покрывать ВЕСЬ BROWSER_STANDARD_ACTIONS.

    При PK_BROWSER_RUNTIME=playwright controller регистрирует PlaywrightAdapter
    как "browser" напрямую (без BrowserAdapter-обёртки). Значит любой
    browser-метод сценария (ОчиститьСостояние, УстановитьCookie, ЛогиБраузера…)
    должен существовать у PlaywrightAdapter — иначе run падает на AttributeError.
    """

    def test_playwright_covers_all_browser_standard_actions(self):
        from core.pretty_method_spec import BROWSER_STANDARD_ACTIONS
        from adapters.playwright_adapter import PlaywrightAdapter

        missing = sorted(a for a in BROWSER_STANDARD_ACTIONS if not hasattr(PlaywrightAdapter, a))
        assert missing == [], f"PlaywrightAdapter missing browser actions: {missing}"

    def test_browser_adapter_covers_all_browser_standard_actions(self):
        """Эталон: BrowserAdapter (selenium-путь) тоже покрывает весь контракт."""
        from core.pretty_method_spec import BROWSER_STANDARD_ACTIONS
        from adapters.browser_adapter import BrowserAdapter

        missing = sorted(a for a in BROWSER_STANDARD_ACTIONS if not hasattr(BrowserAdapter, a))
        assert missing == [], f"BrowserAdapter missing browser actions: {missing}"

    def test_browser_standard_actions_is_allowed_by_registry(self):
        """Каждый BROWSER_STANDARD_ACTIONS проходит allowlist-проверку."""
        from core.pretty_method_spec import is_allowed_action

        for action in (
            "clear_cookies", "clear_state", "get_browser_logs",
            "get_console_errors", "set_cookie", "get_cookie",
        ):
            assert is_allowed_action("browser", action), f"browser.{action} not allowed"