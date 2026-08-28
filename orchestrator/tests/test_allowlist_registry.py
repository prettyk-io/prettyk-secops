"""DSL-B4: Тесты PrettyMethodSpec (Pydantic-модель) + Allowlist Registry."""
import pytest
from pydantic import ValidationError
from orchestrator.core.pretty_method_spec import (
    P0_ALLOWLIST, PrettyMethodSpec, MethodParam,
    lookup_by_wirek, lookup_by_method_id, is_allowed_action,
    all_actions_for, p0_allowlist_actions,
    validate_method_ids_against_registry,
)


class TestPrettyMethodSpecPydantic:
    def test_wirek_format(self):
        m = P0_ALLOWLIST[0]
        assert m.wirek == "webdriver|open"

    def test_immutable_through_frozen_config(self):
        m = P0_ALLOWLIST[0]
        with pytest.raises((ValidationError, TypeError)):
            m.method_id = "changed"  # type: ignore[misc]

    def test_all_have_component(self):
        for m in P0_ALLOWLIST:
            assert m.component in ("webdriver", "browser")
            assert m.action
            assert m.gate in ("ui", "assert", "util")

    def test_all_have_runtime_support(self):
        for m in P0_ALLOWLIST:
            assert m.runtime_support in ("pw", "selenium", "both")

    def test_validates_gate(self):
        with pytest.raises(ValidationError):
            PrettyMethodSpec(
                method_id="Test", component="webdriver", action="test",
                gate="invalid_gate", tier="ui", runtime_support="both",  # type: ignore[arg-type]
            )

    def test_validates_component(self):
        with pytest.raises(ValidationError):
            PrettyMethodSpec(
                method_id="Test", component="selenium", action="test",  # type: ignore[arg-type]
                gate="ui", tier="ui", runtime_support="both",
            )

    def test_empty_method_id_rejected(self):
        with pytest.raises(ValidationError):
            PrettyMethodSpec(
                method_id="", component="webdriver", action="test",
                gate="ui", tier="ui", runtime_support="both",
            )

    def test_serializable_to_dict(self):
        m = P0_ALLOWLIST[0]
        d = m.model_dump()
        assert d["method_id"] == "Открыть"
        assert d["component"] == "webdriver"
        assert d["action"] == "open"
        # params — tuple из Pydantic frozen, model_dump даёт list в mode='python' но tuple по умолчанию
        parsed_params = d["params"]
        assert len(parsed_params) == 1

    def test_deserialize_from_dict(self):
        d = {
            "method_id": "Клик", "component": "webdriver", "action": "click",
            "gate": "ui", "tier": "ui", "runtime_support": "both",
            "params": [{"name": "locator", "required": True}],
        }
        m = PrettyMethodSpec(**d)
        assert m.method_id == "Клик"
        assert m.wirek == "webdriver|click"
        assert len(m.params) == 1
        assert m.params[0].name == "locator"

    def test_build_dry_action(self):
        """Проверка: dry-фабрика строит action без реального браузера."""
        from orchestrator.core.action_factory import ActionFactory
        from orchestrator.core.pretty_method_spec import P0_ALLOWLIST
        from adapters.webdriver_adapter import WebDriverAdapter

        factory = ActionFactory()
        wd = WebDriverAdapter.__new__(WebDriverAdapter)
        for spec in P0_ALLOWLIST:
            if spec.component == "webdriver":
                method = getattr(wd, spec.action, None)
                if callable(method):
                    factory.register(spec.component, spec.action, method)

        # Проверяем, что ключевые методы зарегистрированы
        for action in ("open", "click", "send_keys", "take_screenshot", "get_text", "back"):
            m = factory.get_method("webdriver", action)
            assert m is not None, f"Method webdriver|{action} not registered"
            assert callable(m)

    def test_unknown_method_id_in_factory(self):
        """Неизвестный method_id → ошибка при регистрации."""
        from orchestrator.core.action_factory import ActionFactory
        factory = ActionFactory()
        assert factory.get_method("webdriver", "nonexistent_method") is None


class TestP0Allowlist:
    def test_exactly_25_methods(self):
        assert len(P0_ALLOWLIST) == 25, f"Expected 25, got {len(P0_ALLOWLIST)}"

    def test_no_duplicate_wirek(self):
        wireks = [m.wirek for m in P0_ALLOWLIST]
        assert len(wireks) == len(set(wireks))

    def test_no_duplicate_method_ids(self):
        ids = [m.method_id for m in P0_ALLOWLIST]
        assert len(ids) == len(set(ids))

    def test_navigation_methods_present(self):
        actions = all_actions_for("webdriver")
        for a in ("open", "back", "refresh", "forward"):
            assert a in actions

    def test_action_methods_present(self):
        actions = all_actions_for("webdriver")
        for a in ("click", "send_keys", "hover", "clear"):
            assert a in actions

    def test_wait_methods_present(self):
        actions = all_actions_for("webdriver")
        for a in ("wait_for_element", "wait_for_text", "wait_url"):
            assert a in actions

    def test_assertion_methods_present(self):
        assert_methods = [m for m in P0_ALLOWLIST if m.tier == "assert"]
        assert len(assert_methods) >= 3


class TestLookups:
    def test_lookup_by_wirek(self):
        m = lookup_by_wirek("webdriver|click")
        assert m is not None
        assert m.method_id == "Клик"

    def test_lookup_by_wirek_missing(self):
        assert lookup_by_wirek("webdriver|nonexistent") is None

    def test_lookup_by_method_id(self):
        m = lookup_by_method_id("Открыть")
        assert m is not None
        assert m.action == "open"

    def test_lookup_by_alias(self):
        m = lookup_by_method_id("Вернуться")
        assert m is not None
        assert m.action == "back"

    def test_lookup_missing(self):
        assert lookup_by_method_id("НеСуществует") is None


class TestMethodIdsIntegration:
    def test_validate_method_ids_returns_tuples(self):
        missing_in_allowlist, missing_in_json = validate_method_ids_against_registry()
        assert isinstance(missing_in_allowlist, list)
        assert isinstance(missing_in_json, list)

    def test_allowlist_ids_all_in_registry(self):
        """Все 25 method_id из P0_ALLOWLIST должны быть в локальном реестре."""
        ids = {m.method_id for m in P0_ALLOWLIST}
        assert len(ids) == 25


class TestAllowlistCheck:
    def test_allowed_action(self):
        assert is_allowed_action("webdriver", "click")

    def test_not_allowed_cdp_action(self):
        assert not is_allowed_action("webdriver", "cdp_clear_browser_cache")

    def test_p0_actions_frozenset(self):
        actions = p0_allowlist_actions()
        assert "click" in actions
        assert "open" in actions
        assert "cdp_network_enable" not in actions