# -*- coding: utf-8 -*-
from __future__ import annotations

from adapters.zap_adapter import ZapAdapter


class _FakeZap:
    def __init__(self, alive_prefix: str | None = None):
        self.alive_prefix = alive_prefix
        self.graphql = object() if alive_prefix == "graphql-attr" else None

    def urlopen(self, url, data=None):  # noqa: ANN001
        if self.alive_prefix and self.alive_prefix in str(url):
            return "{}"
        raise RuntimeError(f"missing addon path {url}")


def test_probe_addon_available_via_url(monkeypatch):
    monkeypatch.delenv("KDT_API_LAB_DRY", raising=False)
    zap = ZapAdapter()
    zap._connected = True
    zap._zap = _FakeZap(alive_prefix="openapi")
    out = zap._probe_zap_addon(["openapi"])
    assert out["available"] is True
    assert out["component"] == "openapi"


def test_probe_addon_missing_notes(monkeypatch):
    monkeypatch.delenv("KDT_API_LAB_DRY", raising=False)
    zap = ZapAdapter()
    zap._connected = True
    zap._zap = _FakeZap(alive_prefix=None)
    out = zap._probe_zap_addon(["grpc", "grpcSupport"])
    assert out["available"] is False
    assert out["notes"]
    assert any("недоступен" in n for n in out["notes"])


def test_probe_dry_skips(monkeypatch):
    monkeypatch.setenv("KDT_API_LAB_DRY", "1")
    zap = ZapAdapter()
    out = zap._probe_zap_addon(["openapi"])
    assert out["available"] is False
    assert any("DRY" in n for n in out["notes"])
