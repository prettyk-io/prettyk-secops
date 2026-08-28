# -*- coding: utf-8 -*-
"""G-40 Alert Filters — unit без живого scanner."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

from adapters.scanner_adapter import ScannerAdapter
from core.method_id import ensure_wire, lookup_facade_method, resolve_call


def test_method_id_alert_filters():
    assert lookup_facade_method("scanner", "ФильтрАлерта") == ("scanner", "add_alert_filter")
    assert lookup_facade_method("scanner", "ЗагрузитьФильтры") == ("scanner", "load_alert_filters")
    assert resolve_call(
        "scanner ЗагрузитьФильтры config/alert-filters/juice.json juice_ctx"
    ) == "scanner|load_alert_filters|config/alert-filters/juice.json|juice_ctx"
    assert ensure_wire("scanner ФильтрАлерта juice_ctx 10062 -1").startswith(
        "scanner|add_alert_filter|"
    )


def test_add_alert_filter_calls_api():
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._scanner = MagicMock()
    scanner._ensure_connected = lambda: None
    scanner._get_context_id = lambda name: "42"
    ScannerAdapter.add_alert_filter(scanner, "juice_ctx", "10062", "False Positive", ".*/api/Cards/.*", True)
    scanner._scanner.alertFilter.add_alert_filter.assert_called_once()
    kwargs = scanner._scanner.alertFilter.add_alert_filter.call_args.kwargs
    assert kwargs["contextid"] == "42"
    assert kwargs["ruleid"] == "10062"
    assert kwargs["newlevel"] == "-1"


def test_load_alert_filters_json(tmp_path):
    doc = {
        "context": "juice_ctx",
        "filters": [{"rule_id": 10021, "new_level": -1, "url": ".*"}],
    }
    path = tmp_path / "f.json"
    path.write_text(json.dumps(doc), encoding="utf-8")
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._scanner = MagicMock()
    scanner._ensure_connected = lambda: None
    scanner._get_context_id = lambda name: "7"
    n = ScannerAdapter.load_alert_filters(scanner, str(path))
    assert n == 1
    scanner._scanner.alertFilter.add_alert_filter.assert_called_once()


def test_juice_filter_fixture_exists():
    p = Path(__file__).resolve().parents[1] / "config" / "alert-filters" / "juice.json"
    assert p.is_file()
    doc = json.loads(p.read_text(encoding="utf-8"))
    assert doc["context"] == "juice_ctx"
    assert len(doc["filters"]) >= 1
