# -*- coding: utf-8 -*-
from __future__ import annotations

from adapters.scanner_adapter import ScannerAdapter


class _Fakescanner:
    def __init__(self, alive_prefix: str | None = None):
        self.alive_prefix = alive_prefix
        self.graphql = object() if alive_prefix == "graphql-attr" else None

    def urlopen(self, url, data=None):  # noqa: ANN001
        if self.alive_prefix and self.alive_prefix in str(url):
            return "{}"
        raise RuntimeError(f"missing addon path {url}")


def test_probe_addon_available_via_url(monkeypatch):
    monkeypatch.delenv("PK_API_LAB_DRY", raising=False)
    scanner = ScannerAdapter()
    scanner._connected = True
    scanner._scanner = _Fakescanner(alive_prefix="openapi")
    out = scanner._probe_scanner_addon(["openapi"])
    assert out["available"] is True
    assert out["component"] == "openapi"


def test_probe_addon_missing_notes(monkeypatch):
    monkeypatch.delenv("PK_API_LAB_DRY", raising=False)
    scanner = ScannerAdapter()
    scanner._connected = True
    scanner._scanner = _Fakescanner(alive_prefix=None)
    out = scanner._probe_scanner_addon(["grpc", "grpcSupport"])
    assert out["available"] is False
    assert out["notes"]
    assert any("недоступен" in n for n in out["notes"])


def test_probe_dry_skips(monkeypatch):
    monkeypatch.setenv("PK_API_LAB_DRY", "1")
    scanner = ScannerAdapter()
    out = scanner._probe_scanner_addon(["openapi"])
    assert out["available"] is False
    assert any("DRY" in n for n in out["notes"])
