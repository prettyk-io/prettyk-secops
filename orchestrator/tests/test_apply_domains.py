# -*- coding: utf-8 -*-
"""G-34 ПрименитьДомены — парсер CSV → regex + MethodId."""
from __future__ import annotations

from unittest.mock import MagicMock

from adapters.scanner_adapter import ScannerAdapter
from core.method_id import lookup_facade_method, resolve_call


def test_method_id_apply_domains():
    assert lookup_facade_method("scanner", "ПрименитьДомены") == (
        "scanner",
        "apply_allowed_domains",
    )
    assert resolve_call(
        "scanner ПрименитьДомены juice_ctx https://a.test,*.b.test"
    ) == "scanner|apply_allowed_domains|juice_ctx|https://a.test,*.b.test"


def test_domains_csv_to_regexes():
    rxs = ScannerAdapter.domains_csv_to_include_regexes(
        "https://rkn.gov.ru,auth.dev.spaceport.ru,*.internal.bank"
    )
    assert len(rxs) == 3
    assert rxs[0].startswith("https")
    assert "rkn" in rxs[0]
    assert "auth\\.dev\\.spaceport\\.ru" in rxs[1] or "auth.dev" in rxs[1]
    assert "internal" in rxs[2]
    pipe = ScannerAdapter.domains_csv_to_include_regexes(
        "https://rkn.gov.ru|auth.dev.spaceport.ru"
    )
    assert len(pipe) == 2


def test_apply_allowed_domains_calls_include():
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._ensure_connected = lambda: None
    scanner._scanner = MagicMock()
    scanner.allowed_extra_domains = "https://example.test/app,*.lab.local"
    scanner.base_url = ""
    n = ScannerAdapter.apply_allowed_domains(
        scanner, "juice_ctx", "https://example.test/app,*.lab.local"
    )
    assert n == 2
    assert scanner._scanner.context.include_in_context.call_count == 2
