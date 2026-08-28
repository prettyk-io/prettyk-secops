# -*- coding: utf-8 -*-
"""Таймауты infrastructure — конфиг на старте; shutdown_all гасит scanner."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.scanner_adapter import ScannerAdapter
from core.errors import WiredError
from core.method_id import lookup_method_id
from models.wired import Infrastructure, Wired, Meta, SecurityConfiguration


def _minimal_Wired(**infra_kw) -> Wired:
    infra = {
        "scanner_mode": "demon",
        "browser_type": "chrome-headless",
    }
    infra.update(infra_kw)
    return Wired(
        meta=Meta(assessment_purpose="scheduled"),
        infrastructure=Infrastructure(**infra),
        security_configuration=SecurityConfiguration(
            base_url_override="http://example.test",
            allowed_extra_domains="",
            scan_policy="custom_policy",
            auth_type="Без авторизации",
        ),
    )


def test_ostanovit_scanner_is_not_method_id():
    assert lookup_method_id("\u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044cscanner") is None


def test_session_timeout_falls_back_to_daemon_timer():
    infra = Infrastructure(
        scanner_mode="demon",
        browser_type="chrome-headless",
        scanner_work_timeout_min=90,
        webswing_session_timeout_min=None,
    )
    assert infra.session_timeout_min() == 90


def test_demon_ignores_stale_session_when_work_timeout_set():
    """Демон с явным scanner_work_timeout_min — не берём stale webswing_session."""
    infra = Infrastructure(
        scanner_mode="demon",
        browser_type="chrome-headless",
        scanner_work_timeout_min=60,
    )
    assert infra.session_timeout_min() == 60


def test_shutdown_all_api_success(monkeypatch):
    scanner = ScannerAdapter()
    core = MagicMock()
    scanner._scanner = MagicMock(core=core)
    scanner._connected = True
    monkeypatch.delenv("PK_SCANNER_STOP_DAEMON_CMD", raising=False)
    monkeypatch.delenv("PK_SCANNER_STOP_WEBSWING_CMD", raising=False)

    assert scanner.shutdown_all() is True
    core.shutdown.assert_called_once()
    assert scanner._scanner is None
    assert scanner._connected is False


def test_shutdown_all_falls_back_to_env(monkeypatch):
    scanner = ScannerAdapter()
    monkeypatch.setenv("PK_SCANNER_STOP_DAEMON_CMD", "echo stop-daemon")
    monkeypatch.delenv("PK_SCANNER_STOP_WEBSWING_CMD", raising=False)

    with patch.object(scanner, "_ensure_connected", side_effect=RuntimeError("down")):
        with patch.object(scanner, "_run_external_mode_cmd", return_value=True) as run:
            assert scanner.shutdown_all() is True
            run.assert_called_once_with("PK_SCANNER_STOP_DAEMON_CMD", "stop scanner daemon")


def test_shutdown_all_fails_without_api_or_env(monkeypatch):
    scanner = ScannerAdapter()
    monkeypatch.delenv("PK_SCANNER_STOP_DAEMON_CMD", raising=False)
    monkeypatch.delenv("PK_SCANNER_STOP_WEBSWING_CMD", raising=False)

    with patch.object(scanner, "_ensure_connected", side_effect=RuntimeError("down")):
        with pytest.raises(WiredError, match="shutdown_all"):
            scanner.shutdown_all()


def test_controller_arms_timeouts_at_start():
    from core.controller import Controller

    wired = _minimal_Wired(scanner_work_timeout_min=60, idle_timeout_min=5)
    with patch.object(Controller, "_init_adapters", lambda self: None):
        with patch.object(Controller, "_register_actions", lambda self: None):
            with patch.object(Controller, "_apply_auth_bootstrap", lambda self: None):
                ctrl = Controller.__new__(Controller)
                ctrl.wired = wired
                ctrl.adapters = {"scanner": MagicMock()}
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

    scanner = MagicMock()
    ctrl = Controller.__new__(Controller)
    ctrl.adapters = {"scanner": scanner}
    ctrl._work_timer = None
    ctrl._idle_timer = None
    ctrl._idle_seconds = 1.0
    ctrl._timeout_kill_reason = None
    ctrl._on_idle_timeout()
    scanner.shutdown_all.assert_called_once()
    assert ctrl._timeout_kill_reason == "idle"


def test_idle_timeout_sec_override(monkeypatch):
    from core.controller import Controller

    monkeypatch.setenv("PK_IDLE_TIMEOUT_SEC", "12")
    wired = _minimal_Wired(scanner_work_timeout_min=60, idle_timeout_min=5)
    with patch.object(Controller, "_init_adapters", lambda self: None):
        with patch.object(Controller, "_register_actions", lambda self: None):
            with patch.object(Controller, "_apply_auth_bootstrap", lambda self: None):
                ctrl = Controller.__new__(Controller)
                ctrl.wired = wired
                ctrl.adapters = {"scanner": MagicMock()}
                ctrl._work_timer = None
                ctrl._idle_timer = None
                ctrl._idle_seconds = None
                ctrl._timeout_kill_reason = None
                ctrl._apply_infrastructure()
    assert ctrl._idle_seconds == 12.0
    ctrl._cancel_session_timeouts()
