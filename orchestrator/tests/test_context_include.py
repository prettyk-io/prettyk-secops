# -*- coding: utf-8 -*-
"""ВключитьВКонтекст: пустой URL → base_url; http(s) → allowlist; иначе формат."""
from __future__ import annotations

import pytest

from adapters.zap_adapter import ZapAdapter
from core.errors import WiredError
from core.method_id import resolve_call
from utils.allowed_urls import ALLOWED_URL_DENY_MSG


def _zap(**kwargs) -> ZapAdapter:
    z = ZapAdapter.__new__(ZapAdapter)
    z.base_url = kwargs.get("base_url", "http://juice-shop:3000")
    z.allowed_extra_domains = kwargs.get("allowed_extra_domains", "")
    z._connected = True
    z._zap = type(
        "Z",
        (),
        {
            "context": type(
                "C",
                (),
                {
                    "include_in_context": staticmethod(
                        lambda *_a, **_k: None
                    )
                },
            )()
        },
    )()
    return z


def test_method_id_context_include():
    assert resolve_call("ВключитьВКонтекст juice_ctx") == (
        "zap|set_context_include|juice_ctx"
    )
    assert resolve_call("ВключитьВКонтекст juice_ctx http://x.test.*") == (
        "zap|set_context_include|juice_ctx|http://x.test.*"
    )


def test_include_empty_uses_base_url():
    z = _zap()
    calls: list[tuple[str, str]] = []
    z._zap.context.include_in_context = lambda ctx, rx: calls.append((ctx, rx))
    z.set_context_include("juice_ctx")
    assert calls
    assert all(c[0] == "juice_ctx" for c in calls)
    assert any("juice" in c[1] and "shop" in c[1] for c in calls)


def test_include_empty_requires_base_url():
    z = _zap(base_url="")
    with pytest.raises(WiredError, match="base_url"):
        z.set_context_include("juice_ctx")


def test_include_http_allowlist_and_deny():
    z = _zap(allowed_extra_domains="https://rkn.gov.ru")
    z.set_context_include("ctx", "http://juice-shop:3000.*")  # base origin
    z.set_context_include("ctx", "https://rkn.gov.ru.*")
    with pytest.raises(WiredError, match=ALLOWED_URL_DENY_MSG):
        z.set_context_include("ctx", "https://evil.test.*")


def test_include_format_error():
    z = _zap()
    with pytest.raises(WiredError, match="http:// или https://"):
        z.set_context_include("ctx", "nohttp(s)format")
