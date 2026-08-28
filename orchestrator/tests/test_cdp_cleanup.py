"""
DSL-B6: Тесты CDP Cleanup.

Проверка: старые wired не падают после удаления cdp_* методов.
Цель: browser_adapter.py ≤200 строк (было 757).
"""
import pytest
from orchestrator.adapters.browser_adapter import BrowserAdapter
from orchestrator.core.action_factory import ActionFactory
from orchestrator.core.pretty_method_spec import P0_ALLOWLIST, is_allowed_action, browser_standard_actions


# ── Smoke: старый wired должен валидироваться ──

MOCK_DRIVER = type("MockDriver", (), {
    "get_cookie": lambda self, n: {"name": n, "value": "test"},
    "get_cookies": lambda self: [],
    "add_cookie": lambda self, c: True,
    "delete_cookie": lambda self, n: True,
    "delete_all_cookies": lambda self: True,
    "session_id": "mock-session",
    "capabilities": {"browserName": "chrome"},
    "timeouts": {"implicit": 10, "page_load": 30, "script": 30},
    "implicitly_wait": lambda self, t: None,
    "set_page_load_timeout": lambda self, t: None,
    "set_script_timeout": lambda self, t: None,
    "execute_script": lambda self, s, *a: f"js:{s}",
    "get_log": lambda self, t: [],
    "execute_cdp_cmd": lambda self, c, p: {"result": {}},
    "set_network_conditions": lambda self, **kw: None,
    "get_network_conditions": lambda self: {},
})()


class MockWebDriverAdapter:
    driver = MOCK_DRIVER


class TestCDPCleanup:

    def test_line_count_under_200(self):
        """DSL-B6 DoD: browser_adapter.py ≤ 200 строк."""
        import inspect
        source = inspect.getsource(BrowserAdapter)
        lines = source.count("\n") + 1
        # +1 для декларации класса
        assert lines <= 210, (
            f"BrowserAdapter is {lines} lines — target ≤200 (tolerance +10). "
            f"Cut more cdp_* wrappers or inline boilerplate."
        )

    def test_no_cdp_methods_except_escape_hatch(self):
        """Нет cdp_* методов кроме cdp_command (escape hatch)."""
        cdp_methods = [
            name for name in dir(BrowserAdapter)
            if name.startswith("cdp_") and name != "cdp_command"
        ]
        assert not cdp_methods, (
            f"Still has CDP wrappers: {cdp_methods}. "
            f"Use Playwright-native equivalents."
        )

    def test_cdp_command_still_exists(self):
        """cdp_command остаётся как escape hatch."""
        assert hasattr(BrowserAdapter, "cdp_command")

    def test_essential_methods_present(self):
        """Ключевые методы НЕ удалены: куки, сессия, storage, логи."""
        ba = BrowserAdapter(MockWebDriverAdapter())
        essential = [
            "get_cookie", "set_cookie", "clear_cookies",
            "get_all_cookies", "get_session_id",
            "get_local_storage_item", "clear_local_storage",
            "get_session_storage_item", "clear_session_storage",
            "clear_state", "get_browser_logs",
            "set_network_conditions", "get_network_conditions",
        ]
        for name in essential:
            assert hasattr(ba, name), f"Missing essential method: {name}"

    def test_old_wired_does_not_break(self):
        """Smoke: старый wired со стандартными методами не падает."""
        factory = ActionFactory()
        ba = BrowserAdapter(MockWebDriverAdapter())
        # Browser-методы из стандартного реестра
        for action in sorted(browser_standard_actions()):
            method = getattr(ba, action, None)
            if callable(method):
                factory.register("browser", action, method)
            else:
                pytest.fail(
                    f"Browser method {action} not found after CDP cleanup"
                )

        # Smoke_dry: стандартный wired для get_cookie, clear_cookies, set_cookie
        for action in ("get_cookie", "clear_cookies", "set_cookie",
                        "get_all_cookies", "clear_state"):
            method = factory.get_method("browser", action)
            assert method is not None, (
                f"Method browser|{action} not in factory after CDP cleanup. "
                f"Old wired would break."
            )

    def test_p0_allowlist_methods_available(self):
        """Все 25 методов P0_ALLOWLIST доступны после CDP cleanup."""
        ba = BrowserAdapter(MockWebDriverAdapter())
        for spec in P0_ALLOWLIST:
            target = ba if spec.component == "browser" else None
            if target is not None:
                method = getattr(target, spec.action, None)
                assert callable(method), (
                    f"P0 method {spec.wirek} missing after CDP cleanup"
                )

    def test_no_old_cdp_smoke_wired_uses_cdp_methods(self):
        """Старый wired с cdp_clear_browser_cache больше не в allowlist
        — должен быть заменён на Playwright-native или через cdp_command."""
        assert not is_allowed_action("browser", "cdp_clear_browser_cache")
        assert not is_allowed_action("browser", "cdp_set_user_agent")
        assert not is_allowed_action("browser", "cdp_capture_screenshot")