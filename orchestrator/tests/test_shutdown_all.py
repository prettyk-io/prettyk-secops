# -*- coding: utf-8 -*-
"""Таймауты infrastructure — конфиг на старте; shutdown_all гасит ZAP."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.zap_adapter import ZapAdapter
from core.errors import WiredError
from core.method_id import lookup_method_id
from models.wired import Infrastructure, Wired, Meta, SecurityConfiguration


def _minimal_manifest(**infra_kw) -> Manifest:
    infra = {
        "zap_mode": "demon",
        "browser_type": "chrome-headless",
    }
    infra.update(infra_kw)
    return Manifest(
        meta=Meta(assessment_purpose="scheduled"),
        infrastructure=Infrastructure(**infra),
        security_configuration=SecurityConfiguration(
            base_url_override="http://example.test",
            allowed_extra_domains="",
            scan_policy="custom_policy",
            auth_type="Без авторизации",
        ),
    )


def test_ostanovit_zap_is_not_method_id():
    assert lookup_method_id("\u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044cZAP") is None


def test_session_timeout_falls_back_to_daemon_timer():
    infra = Infrastructure(
        zap_mode="demon",
        browser_type="chrome-headless",
        zap_work_timeout_min=90,
        webswing_session_timeout_min=None,
    )
    assert infra.session_timeout_min() == 90


def test_demon_ignores_stale_session_when_work_timeout_set():
    """Демон с явным zap_work_timeout_min — не берём stale webswing_session."""
    infra = Infrastructure(
        zap_mode="demon",
        browser_type="chrome-headless",
        zap_work_timeout_min=60,
        webswing_session_timeout_min=180,
    )
    assert infra.session_timeout_min() == 60


def test_webswing_mode_uses_session_field():
    infra = Infrastructure(
        zap_mode="webswing",
        browser_type="chrome-headless",
        zap_work_timeout_min=60,
        webswing_session_timeout_min=120,
    )
    assert infra.session_timeout_min() == 120


def test_manual_without_daemon_timer_uses_session_field():
    """Ручная проверка: таймаут ZAP форма прячет, живёт длительность сессии."""
    infra = Infrastructure(webswing_session_timeout_min=90)
    assert infra.session_timeout_min() == 90


def test_manual_purpose_forces_webswing_even_without_zap_mode():
    """Форма strip'ает zap_mode → pydantic default demon; manual обязан → webswing."""
    m = Manifest(
        meta=Meta(assessment_purpose="manual"),
        infrastructure=Infrastructure(
            webswing_session_timeout_min=30,
            idle_timeout_min=5,
        ),
    )
    assert m.infrastructure.zap_mode == "webswing"


def test_shutdown_all_api_success(monkeypatch):
    zap = ZapAdapter()
    core = MagicMock()
    zap._zap = MagicMock(core=core)
    zap._connected = True
    monkeypatch.delenv("KDT_ZAP_STOP_DAEMON_CMD", raising=False)
    monkeypatch.delenv("KDT_ZAP_STOP_WEBSWING_CMD", raising=False)

    assert zap.shutdown_all() is True
    core.shutdown.assert_called_once()
    assert zap._zap is None
    assert zap._connected is False


def test_shutdown_all_falls_back_to_env(monkeypatch):
    zap = ZapAdapter()
    monkeypatch.setenv("KDT_ZAP_STOP_DAEMON_CMD", "echo stop-daemon")
    monkeypatch.delenv("KDT_ZAP_STOP_WEBSWING_CMD", raising=False)

    with patch.object(zap, "_ensure_connected", side_effect=RuntimeError("down")):
        with patch.object(zap, "_run_external_mode_cmd", return_value=True) as run:
            assert zap.shutdown_all() is True
            run.assert_called_once_with("KDT_ZAP_STOP_DAEMON_CMD", "stop ZAP daemon")


def test_shutdown_all_fails_without_api_or_env(monkeypatch):
    zap = ZapAdapter()
    monkeypatch.delenv("KDT_ZAP_STOP_DAEMON_CMD", raising=False)
    monkeypatch.delenv("KDT_ZAP_STOP_WEBSWING_CMD", raising=False)

    with patch.object(zap, "_ensure_connected", side_effect=RuntimeError("down")):
        with pytest.raises(WiredError, match="shutdown_all"):
            zap.shutdown_all()


def test_controller_arms_timeouts_at_start():
    from core.controller import Controller

    wired = _minimal_manifest(zap_work_timeout_min=60, idle_timeout_min=5)
    with patch.object(Controller, "_init_adapters", lambda self: None):
        with patch.object(Controller, "_register_actions", lambda self: None):
            with patch.object(Controller, "_apply_auth_bootstrap", lambda self: None):
                ctrl = Controller.__new__(Controller)
                ctrl.wired = wired
                ctrl.adapters = {"zap": MagicMock()}
                ctrl._work_timer = None
                ctrl._idle_timer = None
                ctrl._idle_seconds = None
                ctrl._timeout_kill_reason = None
                ctrl._apply_infrastructure()

    assert ctrl._idle_seconds == 5 * 60
    assert ctrl._work_timer is not None
    assert ctrl._idle_timer is not None
    ctrl._cancel_session_timeouts()


def test_idle_timeout_calls_shutdown_all():
    from core.controller import Controller

    zap = MagicMock()
    ctrl = Controller.__new__(Controller)
    ctrl.adapters = {"zap": zap}
    ctrl._work_timer = None
    ctrl._idle_timer = None
    ctrl._idle_seconds = 1.0
    ctrl._timeout_kill_reason = None
    ctrl._on_idle_timeout()
    zap.shutdown_all.assert_called_once()
    assert ctrl._timeout_kill_reason == "idle"


def test_webswing_hold_awaits_idle_kill(monkeypatch):
    from core.controller import Controller

    monkeypatch.delenv("KDT_WEBSWING_HOLD", raising=False)
    zap = MagicMock()
    ctrl = Controller.__new__(Controller)
    ctrl.wired = _minimal_manifest(
        zap_mode="webswing",
        idle_timeout_min=5,
        webswing_session_timeout_min=30,
    )
    ctrl.adapters = {"zap": zap}
    ctrl._work_timer = MagicMock()
    ctrl._idle_timer = MagicMock()
    ctrl._idle_seconds = 0.05
    ctrl._timeout_kill_reason = None

    def _kill():
        ctrl._timeout_kill_reason = "idle"

    t = __import__("threading").Timer(0.02, _kill)
    t.daemon = True
    t.start()
    ctrl._await_session_end()
    assert ctrl._timeout_kill_reason == "idle"


def test_webswing_hold_disabled(monkeypatch):
    from core.controller import Controller

    monkeypatch.setenv("KDT_WEBSWING_HOLD", "0")
    ctrl = Controller.__new__(Controller)
    ctrl.wired = _minimal_manifest(zap_mode="webswing")
    ctrl._work_timer = MagicMock()
    ctrl._idle_timer = MagicMock()
    ctrl._idle_seconds = 60.0
    ctrl._timeout_kill_reason = None
    ctrl._await_session_end()
    assert ctrl._timeout_kill_reason is None


def test_idle_timeout_sec_override(monkeypatch):
    from core.controller import Controller

    monkeypatch.setenv("KDT_IDLE_TIMEOUT_SEC", "12")
    wired = _minimal_manifest(zap_work_timeout_min=60, idle_timeout_min=5)
    with patch.object(Controller, "_init_adapters", lambda self: None):
        with patch.object(Controller, "_register_actions", lambda self: None):
            with patch.object(Controller, "_apply_auth_bootstrap", lambda self: None):
                ctrl = Controller.__new__(Controller)
                ctrl.wired = wired
                ctrl.adapters = {"zap": MagicMock()}
                ctrl._work_timer = None
                ctrl._idle_timer = None
                ctrl._idle_seconds = None
                ctrl._timeout_kill_reason = None
                ctrl._apply_infrastructure()
    assert ctrl._idle_seconds == 12.0
    ctrl._cancel_session_timeouts()


def test_bootstrap_webswing_calls_start(monkeypatch):
    from core.controller import Controller

    monkeypatch.setenv("KDT_ZAP_START_WEBSWING_CMD", "echo start-ws")
    monkeypatch.delenv("KDT_ZAP_STOP_DAEMON_CMD", raising=False)
    zap = MagicMock()
    ctrl = Controller.__new__(Controller)
    ctrl.wired = _minimal_manifest(
        zap_mode="webswing", webswing_session_timeout_min=30
    )
    ctrl.adapters = {"zap": zap}
    with patch.object(ctrl, "_wait_zap_api_ready", lambda timeout_sec=90.0: None):
        ctrl._bootstrap_zap_mode()
    zap.start_webswing.assert_called_once()
    zap.stop_daemon_start_webswing.assert_not_called()
