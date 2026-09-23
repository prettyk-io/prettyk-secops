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

from adapters.scanner_adapter import (
    DEFAULT_scanner_API_TIMEOUT_SEC,
    ScannerAdapter,
    scanner_api_timeout_seconds,
)


def test_scanner_api_timeout_seconds_default(monkeypatch):
    monkeypatch.delenv("PK_SCANNER_API_TIMEOUT", raising=False)
    assert scanner_api_timeout_seconds() == DEFAULT_scanner_API_TIMEOUT_SEC


def test_scanner_api_timeout_seconds_env(monkeypatch):
    monkeypatch.setenv("PK_SCANNER_API_TIMEOUT", "12.5")
    assert scanner_api_timeout_seconds() == 12.5


def test_scanner_api_timeout_seconds_invalid_falls_back(monkeypatch):
    monkeypatch.setenv("PK_SCANNER_API_TIMEOUT", "nope")
    assert scanner_api_timeout_seconds() == DEFAULT_scanner_API_TIMEOUT_SEC


def test_install_api_timeouts_request_api_passes_timeout():
    scanner = SimpleNamespace()
    scanner._zapv2__proxies = {"http": "http://127.0.0.1:8080"}
    scanner._zapv2__apikey = "k"
    scanner._zapv2__validate_status_code = False

    fake_resp = MagicMock()
    fake_resp.status_code = 200
    fake_resp.text = "ok"
    session = MagicMock()
    session.request.return_value = fake_resp
    session.headers = {}
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)

    with patch("adapters.scanner_adapter.requests.Session", return_value=session):
        ScannerAdapter._install_api_timeouts(scanner, timeout=42.0)
        out = scanner._request_api("http://scanner/JSON/core/view/version/")

    assert out is fake_resp
    kwargs = session.request.call_args.kwargs
    assert kwargs["timeout"] == 42.0
    assert kwargs["proxies"] == {"http": "http://127.0.0.1:8080"}
    assert session.headers.get("X-ZAP-API-Key") == "k"


def test_install_api_timeouts_rejects_non_scanner_url():
    scanner = SimpleNamespace()
    scanner._zapv2__proxies = {}
    scanner._zapv2__apikey = None
    scanner._zapv2__validate_status_code = False
    ScannerAdapter._install_api_timeouts(scanner, timeout=10.0)
    with pytest.raises(ValueError, match="non scanner API"):
        scanner._request_api("http://evil.example/steal")


def test_install_api_timeouts_urlopen_passes_timeout():
    scanner = SimpleNamespace()
    scanner._zapv2__proxies = {"http": "http://127.0.0.1:8080"}
    scanner._zapv2__apikey = None
    scanner._zapv2__validate_status_code = False

    with patch("adapters.scanner_adapter.requests.get") as get:
        get.return_value = MagicMock(text="body")
        ScannerAdapter._install_api_timeouts(scanner, timeout=33.0)
        text = scanner.urlopen("https://scanner/json/foo")

    assert text == "body"
    assert get.call_args.kwargs["timeout"] == 33.0


def test_install_api_timeouts_real_zapv2_urlopen_passes_timeout():
    """BOX-LIVE-3: живой объект ZAPv2 отдаёт _ZAPv2__proxies (не _zapv2__*)."""
    from zapv2 import ZAPv2

    scanner = ZAPv2(apikey="k", proxies={"http": "http://127.0.0.1:8080"})

    with patch("adapters.scanner_adapter.requests.get") as get:
        get.return_value = MagicMock(text="body")
        ScannerAdapter._install_api_timeouts(scanner, timeout=42.0)
        text = scanner.urlopen("https://scanner/json/foo")

    assert text == "body"
    assert get.call_args.kwargs["timeout"] == 42.0
    assert get.call_args.kwargs["proxies"] == {"http": "http://127.0.0.1:8080"}


def test_install_api_timeouts_real_zapv2_request_api_passes_timeout():
    """BOX-LIVE-3: _request_api на реальном ZAPv2 читает _ZAPv2__apikey + proxies + host `zap`."""
    from zapv2 import ZAPv2

    scanner = ZAPv2(apikey="k", proxies={"http": "http://127.0.0.1:8080"})

    fake_resp = MagicMock()
    fake_resp.status_code = 200
    fake_resp.text = "ok"
    session = MagicMock()
    session.request.return_value = fake_resp
    session.headers = {}
    session.__enter__ = MagicMock(return_value=session)
    session.__exit__ = MagicMock(return_value=False)

    with patch("adapters.scanner_adapter.requests.Session", return_value=session):
        ScannerAdapter._install_api_timeouts(scanner, timeout=42.0)
        out = scanner._request_api("http://zap/JSON/core/view/version/")

    assert out is fake_resp
    kwargs = session.request.call_args.kwargs
    assert kwargs["timeout"] == 42.0
    assert kwargs["proxies"] == {"http": "http://127.0.0.1:8080"}
    assert session.headers.get("X-ZAP-API-Key") == "k"


def test_zap_private_reads_both_mangled_names():
    """BOX-LIVE-3: helper читает и _ZAPv2__*, и legacy _zapv2__*, и отдаёт default."""
    real = SimpleNamespace()
    real._ZAPv2__proxies = {"http": "http://127.0.0.1:8080"}
    legacy = SimpleNamespace()
    legacy._zapv2__proxies = {"https": "http://127.0.0.1:8080"}

    assert ScannerAdapter._zap_private(real, "proxies") == {"http": "http://127.0.0.1:8080"}
    assert ScannerAdapter._zap_private(legacy, "proxies") == {"https": "http://127.0.0.1:8080"}
    assert ScannerAdapter._zap_private(SimpleNamespace(), "proxies", default="d") == "d"
