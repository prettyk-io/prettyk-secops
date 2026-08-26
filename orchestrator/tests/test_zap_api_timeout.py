# -*- coding: utf-8 -*-
"""STAB-2: zapv2 API client must pass timeout= to requests."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.zap_adapter import (
    DEFAULT_ZAP_API_TIMEOUT_SEC,
    ZapAdapter,
    zap_api_timeout_seconds,
)


def test_zap_api_timeout_seconds_default(monkeypatch):
    monkeypatch.delenv("PK_ZAP_API_TIMEOUT", raising=False)
    assert zap_api_timeout_seconds() == DEFAULT_ZAP_API_TIMEOUT_SEC


def test_zap_api_timeout_seconds_env(monkeypatch):
    monkeypatch.setenv("PK_ZAP_API_TIMEOUT", "12.5")
    assert zap_api_timeout_seconds() == 12.5


def test_zap_api_timeout_seconds_invalid_falls_back(monkeypatch):
    monkeypatch.setenv("PK_ZAP_API_TIMEOUT", "nope")
    assert zap_api_timeout_seconds() == DEFAULT_ZAP_API_TIMEOUT_SEC


def test_install_api_timeouts_request_api_passes_timeout():
    zap = SimpleNamespace()
    zap._ZAPv2__proxies = {"http": "http://127.0.0.1:8080"}
    zap._ZAPv2__apikey = "k"
    zap._ZAPv2__validate_status_code = False

    fake_resp = MagicMock()
    fake_resp.status_code = 200
    fake_resp.text = "ok"
    session = MagicMock()
    session.request.return_value = fake_resp
    session.headers = {}
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)

    with patch("adapters.zap_adapter.requests.Session", return_value=session):
        ZapAdapter._install_api_timeouts(zap, timeout=42.0)
        out = zap._request_api("http://zap/JSON/core/view/version/")

    assert out is fake_resp
    kwargs = session.request.call_args.kwargs
    assert kwargs["timeout"] == 42.0
    assert kwargs["proxies"] == {"http": "http://127.0.0.1:8080"}
    assert session.headers.get("X-ZAP-API-Key") == "k"


def test_install_api_timeouts_rejects_non_zap_url():
    zap = SimpleNamespace()
    zap._ZAPv2__proxies = {}
    zap._ZAPv2__apikey = None
    zap._ZAPv2__validate_status_code = False
    ZapAdapter._install_api_timeouts(zap, timeout=10.0)
    with pytest.raises(ValueError, match="non ZAP API"):
        zap._request_api("http://evil.example/steal")


def test_install_api_timeouts_urlopen_passes_timeout():
    zap = SimpleNamespace()
    zap._ZAPv2__proxies = {"http": "http://127.0.0.1:8080"}
    zap._ZAPv2__apikey = None
    zap._ZAPv2__validate_status_code = False

    with patch("adapters.zap_adapter.requests.get") as get:
        get.return_value = MagicMock(text="body")
        ZapAdapter._install_api_timeouts(zap, timeout=33.0)
        text = zap.urlopen("https://zap/json/foo")

    assert text == "body"
    assert get.call_args.kwargs["timeout"] == 33.0
