# -*- coding: utf-8 -*-
"""Сканер / АктивноеСканирование: URL по умолчанию = base_url (сдвиг аргументов)."""

import pytest

from adapters.zap_adapter import ZapAdapter
from core.errors import WiredError


def _adapter(base="http://juice-shop:3000"):
    z = ZapAdapter.__new__(ZapAdapter)
    z.base_url = base
    return z


def test_normalize_spider_omitted_url_uses_base():
    z = _adapter()
    url, ctx, timeout, logout = z._normalize_spider_scan_args(
        "juice_ctx", "1", None, None
    )
    assert url == "http://juice-shop:3000"
    assert ctx == "juice_ctx"
    assert timeout == "1"
    assert logout is None


def test_normalize_spider_explicit_url_unchanged():
    z = _adapter()
    url, ctx, timeout, _ = z._normalize_spider_scan_args(
        "http://other:9/", "juice_ctx", "2", None
    )
    assert url == "http://other:9/"
    assert ctx == "juice_ctx"
    assert timeout == "2"


def test_normalize_spider_timeout_only():
    z = _adapter()
    url, ctx, timeout, _ = z._normalize_spider_scan_args("1", None, None, None)
    assert url == "http://juice-shop:3000"
    assert ctx is None
    assert timeout == "1"


def test_normalize_spider_empty_needs_base():
    z = _adapter("")
    with pytest.raises(WiredError, match="base_url_override"):
        z._normalize_spider_scan_args(None, "juice_ctx", "1", None)


def test_normalize_active_same_shift():
    z = _adapter()
    url, ctx, timeout = z._normalize_active_scan_args("juice_ctx", "2", None)
    assert url == "http://juice-shop:3000"
    assert ctx == "juice_ctx"
    assert timeout == "2"


def test_normalize_ajax_bare_timeout():
    z = _adapter()
    url, timeout, logout = z._normalize_ajax_scan_args("1", None, None)
    assert url == "http://juice-shop:3000"
    assert timeout == "1"
    assert logout is None


def test_normalize_ajax_rejects_context_name():
    z = _adapter()
    with pytest.raises(WiredError, match="не URL"):
        z._normalize_ajax_scan_args("juice_ctx", None, None)


def test_resolve_call_scanner_without_url():
    from core.method_id import resolve_call

    assert resolve_call("Сканер juice_ctx 1") == "zap|spider_scan|juice_ctx|1"
    assert resolve_call("АктивноеСканирование juice_ctx 2") == (
        "zap|active_scan|juice_ctx|2"
    )


@pytest.mark.parametrize(
    "action,result,expected",
    [
        ("active_scan", 17, "Active scan completed — found 17 vulnerabilities"),
        ("passive_scan_wait", True, "Passive scan completed"),
        ("passive_scan_wait", False, "Passive scan timed out"),
        ("spider_scan", 2231, "Spider found 2231 URLs"),
        ("ajax_spider_scan", 41, "AJAX Spider found 41 URLs"),
        ("client_spider_scan", 9, "Client Spider found 9 URLs"),
    ],
)
def test_zap_live_text_reports_scan_completion(action, result, expected):
    from core.controller import Controller

    ctrl = Controller.__new__(Controller)
    zap = _adapter()
    zap.active_scan_timeout = 30
    zap.spider_timeout = 5
    ctrl.adapters = {"zap": zap}
    assert ctrl._format_zap_live_text(action, {}, result) == expected


def test_zap_live_text_context_and_filters():
    """Ветки create_context / include / alert_filter (SQ-BE-2h)."""
    from core.controller import Controller

    ctrl = Controller.__new__(Controller)
    zap = _adapter()
    ctrl.adapters = {"zap": zap}
    assert (
        ctrl._format_zap_live_text(
            "create_context",
            {"context_name": "juice", "description": "lab"},
            None,
        )
        == "Создать контекст juice — lab"
    )
    assert (
        ctrl._format_zap_live_text(
            "set_context_include",
            {"context_name": "juice", "regex": "https://a/.*"},
            None,
        )
        == "set_context_include juice https://a/.*"
    )
    assert (
        ctrl._format_zap_live_text(
            "add_alert_filter",
            {"context_name": "juice", "rule_id": "10021", "new_level": "-1"},
            None,
        )
        == "alert_filter juice rule=10021 level=-1"
    )
