# -*- coding: utf-8 -*-
from utils.locator_heal import fingerprint_from_attrs
from utils.locator_heal_runtime import (
    clear_fingerprint_store,
    emit_heal_miss,
    emit_heal_ok,
    heal_gate_active,
    heal_label_scope,
    heal_scope,
    remember_fingerprint,
    try_resolve_healed_locator,
)


class _FakeDriver:
    def __init__(self, rows):
        self._rows = rows

    def execute_script(self, _js):
        return self._rows


def setup_function():
    clear_fingerprint_store()


def test_heal_scope_gate():
    assert not heal_gate_active()
    with heal_scope(allowed=True):
        assert heal_gate_active()
    assert not heal_gate_active()


def test_try_resolve_healed_renamed_id(monkeypatch):
    monkeypatch.delenv("KDT_LOCATOR_HEAL", raising=False)
    remember_fingerprint(
        fingerprint_from_attrs(
            locator_type="id",
            locator_value="login-btn",
            tag="button",
            id="login-btn",
            text="Войти",
            classes=("btn", "primary"),
            parent_tag="form",
        )
    )
    driver = _FakeDriver(
        [
            {
                "key": "0",
                "tag": "a",
                "id": "logout",
                "name": "",
                "text": "Выйти",
                "role": "",
                "aria_label": "",
                "classes": "link",
                "parent_tag": "nav",
            },
            {
                "key": "1",
                "tag": "button",
                "id": "login-button-new",
                "name": "",
                "text": "Войти",
                "role": "",
                "aria_label": "",
                "classes": "btn primary",
                "parent_tag": "form",
            },
        ]
    )
    with heal_scope(allowed=True):
        got = try_resolve_healed_locator(driver, "id", "login-btn", score_cap=0.5)
    assert got is not None
    new_type, new_value, score = got
    assert new_type == "id"
    assert new_value == "login-button-new"
    assert score >= 0.5


def test_try_resolve_blocked_without_gate(monkeypatch):
    monkeypatch.delenv("KDT_LOCATOR_HEAL", raising=False)
    remember_fingerprint(
        fingerprint_from_attrs(
            locator_type="id",
            locator_value="login-btn",
            tag="button",
            id="login-btn",
            text="Войти",
        )
    )
    driver = _FakeDriver(
        [
            {
                "key": "0",
                "tag": "button",
                "id": "login-button-new",
                "name": "",
                "text": "Войти",
                "role": "",
                "aria_label": "",
                "classes": "",
                "parent_tag": "form",
            }
        ]
    )
    assert try_resolve_healed_locator(driver, "id", "login-btn") is None


def test_fingerprint_persist_roundtrip(tmp_path, monkeypatch):
    path = tmp_path / "fps.json"
    monkeypatch.setenv("KDT_LOCATOR_FP_PATH", str(path))
    clear_fingerprint_store()
    remember_fingerprint(
        fingerprint_from_attrs(
            locator_type="id",
            locator_value="email",
            tag="input",
            id="email",
            name="email",
        )
    )
    assert path.is_file()
    clear_fingerprint_store()
    from utils.locator_heal_runtime import get_fingerprint

    got = get_fingerprint("id", "email")
    assert got is not None
    assert got.id == "email"


def test_heal_miss_emits_warning(caplog, monkeypatch):
    import logging

    monkeypatch.delenv("KDT_LOCATOR_HEAL", raising=False)
    remember_fingerprint(
        fingerprint_from_attrs(
            locator_type="id",
            locator_value="gone",
            tag="button",
            id="gone",
            text="Жми",
        )
    )
    driver = _FakeDriver(
        [
            {
                "key": "0",
                "tag": "div",
                "id": "other",
                "name": "",
                "text": "nope",
                "role": "",
                "aria_label": "",
                "classes": "",
                "parent_tag": "body",
            }
        ]
    )
    with heal_scope(allowed=True), caplog.at_level(logging.WARNING, logger="orchestrator"):
        assert try_resolve_healed_locator(driver, "id", "gone", score_cap=0.9) is None
    assert any("heal MISS" in r.message for r in caplog.records)


def test_emit_heal_ok_info(caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="orchestrator"):
        emit_heal_ok(
            old_type="id",
            old_value="a",
            new_type="id",
            new_value="b",
            score=0.8,
        )
    assert any("heal OK" in r.message for r in caplog.records)
    emit_heal_miss(old_type="id", old_value="a", reason="unit")


def test_label_first_heals_without_fingerprint(monkeypatch, caplog):
    import logging

    monkeypatch.delenv("KDT_LOCATOR_HEAL", raising=False)
    monkeypatch.delenv("KDT_LOCATOR_HEAL_LABEL", raising=False)
    clear_fingerprint_store()
    driver = _FakeDriver(
        [
            {
                "key": "0",
                "tag": "button",
                "id": "loginButton",
                "name": "",
                "text": "Log in",
                "role": "button",
                "aria_label": "",
                "classes": "primary",
                "parent_tag": "form",
            }
        ]
    )
    with (
        heal_scope(allowed=True),
        heal_label_scope("Log in"),
        caplog.at_level(logging.INFO, logger="orchestrator"),
    ):
        got = try_resolve_healed_locator(driver, "id", "missing-login", score_cap=0.9)
    assert got is not None
    assert got[0] == "id"
    assert got[1] == "loginButton"
    assert any("heal OK" in r.message for r in caplog.records)


def test_cold_xpath_no_signal(monkeypatch, caplog):
    import logging

    monkeypatch.delenv("KDT_LOCATOR_HEAL", raising=False)
    clear_fingerprint_store()
    driver = _FakeDriver(
        [
            {
                "key": "0",
                "tag": "button",
                "id": "x",
                "name": "",
                "text": "Go",
                "role": "",
                "aria_label": "",
                "classes": "",
                "parent_tag": "form",
            }
        ]
    )
    with heal_scope(allowed=True), caplog.at_level(logging.WARNING, logger="orchestrator"):
        assert (
            try_resolve_healed_locator(driver, "xpath", "//button[1]", score_cap=0.1)
            is None
        )
    assert any("cold_no_signal" in r.message for r in caplog.records)
