# -*- coding: utf-8 -*-
"""Бэк #2: порты demon vs webswing (concurrent lab) без Docker."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.controller import (
    DEFAULT_WEBSWING_API_PORT,
    DEFAULT_WEBSWING_PROXY_PORT,
    DEFAULT_WEBSWING_UI_PORT,
    DEFAULT_ZAP_BROWSER_PROXY_PORT,
    DEFAULT_ZAP_PORT,
    Controller,
)
from models.wired import Infrastructure, Wired, Meta, SecurityConfiguration


def _Wired(zap_mode: str) -> Wired:
    return Wired(
        meta=Meta(assessment_purpose="scheduled"),
        infrastructure=Infrastructure(
            zap_mode=zap_mode,  # type: ignore[arg-type]
            browser_type="chrome-headless",
        ),
        security_configuration=SecurityConfiguration(
            base_url_override="http://example.test",
            allowed_extra_domains="",
            scan_policy="custom_policy",
            auth_type="Без авторизации",
        ),
    )


def _controller_with_mocked_adapters(wired: Wired) -> Controller:
    with (
        patch.object(Controller, "_bootstrap_zap_mode", lambda self: None),
        patch.object(Controller, "_ensure_zap_local_server", lambda self, port: None),
        patch.object(Controller, "_register_actions", lambda self: None),
        patch.object(Controller, "_apply_auth_bootstrap", lambda self: None),
        patch.object(Controller, "_apply_session_timeouts", lambda self: None),
        patch("core.controller.ZapAdapter", return_value=MagicMock()),
        patch("core.controller.WebDriverAdapter", return_value=MagicMock()),
        patch("core.controller.BrowserAdapter", return_value=MagicMock()),
        patch("core.controller.HttpAdapter", return_value=MagicMock()),
        patch("core.controller.DataAdapter", return_value=MagicMock()),
        patch("core.controller.Reporter", return_value=MagicMock()),
    ):
        return Controller(wired)


def test_lab_port_constants():
    assert DEFAULT_ZAP_PORT == 8080
    assert DEFAULT_ZAP_BROWSER_PROXY_PORT == 8099
    assert DEFAULT_WEBSWING_API_PORT == 8090
    assert DEFAULT_WEBSWING_PROXY_PORT == 8199
    assert DEFAULT_WEBSWING_UI_PORT == 8082


def test_compose_webswing_publishes_concurrent_ports():
    compose = (REPO / "services" / "docker-compose.zap-webswing.yml").read_text(
        encoding="utf-8"
    )
    assert f'"{DEFAULT_WEBSWING_API_PORT}:{DEFAULT_WEBSWING_API_PORT}"' in compose or (
        f"{DEFAULT_WEBSWING_API_PORT}:{DEFAULT_WEBSWING_API_PORT}" in compose
    )
    assert str(DEFAULT_WEBSWING_UI_PORT) in compose
    assert str(DEFAULT_WEBSWING_PROXY_PORT) in compose
    # Host UI mapping default 8082:8080
    assert re.search(
        rf"PK_WEBSWING_UI_PORT:-{DEFAULT_WEBSWING_UI_PORT}", compose
    )
    assert re.search(
        rf"PK_WEBSWING_PROXY_PORT:-{DEFAULT_WEBSWING_PROXY_PORT}", compose
    )


def test_compose_daemon_keeps_classic_ports():
    compose = (REPO / "services" / "docker-compose.zap.yml").read_text(encoding="utf-8")
    assert f"{DEFAULT_ZAP_PORT}:{DEFAULT_ZAP_PORT}" in compose.replace(" ", "")
    assert str(DEFAULT_ZAP_BROWSER_PROXY_PORT) in compose


def test_controller_demon_default_ports(monkeypatch):
    monkeypatch.delenv("PK_ZAP_PORT", raising=False)
    monkeypatch.delenv("PK_ZAP_BROWSER_PROXY_PORT", raising=False)
    ctrl = _controller_with_mocked_adapters(_Wired("demon"))
    assert ctrl.zap_mode == "demon"
    assert ctrl.zap_api_port == DEFAULT_ZAP_PORT
    assert ctrl.zap_proxy_port == DEFAULT_ZAP_BROWSER_PROXY_PORT


def test_controller_webswing_default_ports(monkeypatch):
    monkeypatch.delenv("PK_ZAP_PORT", raising=False)
    monkeypatch.delenv("PK_ZAP_BROWSER_PROXY_PORT", raising=False)
    ctrl = _controller_with_mocked_adapters(_Wired("webswing"))
    assert ctrl.zap_mode == "webswing"
    assert ctrl.zap_api_port == DEFAULT_WEBSWING_API_PORT
    assert ctrl.zap_proxy_port == DEFAULT_WEBSWING_PROXY_PORT


def test_controller_env_overrides_webswing_defaults(monkeypatch):
    monkeypatch.setenv("PK_ZAP_PORT", "18090")
    monkeypatch.setenv("PK_ZAP_BROWSER_PROXY_PORT", "18199")
    ctrl = _controller_with_mocked_adapters(_Wired("webswing"))
    assert ctrl.zap_api_port == 18090
    assert ctrl.zap_proxy_port == 18199
