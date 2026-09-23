# -*- coding: utf-8 -*-
"""scanner alerts: пагинация, без одного гигантского core.alerts()."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.scanner_adapter import ScannerAdapter


def test_fetch_alerts_paginated_stops_and_concatenates():
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._scanner = MagicMock()
    pages = [
        [{"id": str(i), "risk": "High", "riskcode": "3"} for i in range(200)],
        [{"id": str(i), "risk": "High", "riskcode": "3"} for i in range(200, 250)],
    ]
    calls = []

    def fake_alerts(**kwargs):
        calls.append(kwargs)
        start = int(kwargs.get("start") or 0)
        if start == 0:
            return pages[0]
        if start == 200:
            return pages[1]
        return []

    scanner._scanner.core.alerts.side_effect = fake_alerts
    scanner._ensure_connected = lambda: None

    out = scanner._fetch_alerts_paginated(riskid="3", page_size=200)
    assert len(out) == 250
    assert calls[0]["start"] == 0 and calls[0]["count"] == 200
    assert calls[0].get("riskid") == "3"
    assert calls[1]["start"] == 200


def test_get_alerts_high_uses_riskid_and_filters():
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._ensure_connected = lambda: None
    scanner._fetch_alerts_paginated = MagicMock(
        return_value=[
            {"risk": "High", "riskcode": "3", "url": "http://a"},
            {"risk": "Medium", "riskcode": "2", "url": "http://b"},
        ]
    )
    highs = scanner.get_alerts(risk="High")
    scanner._fetch_alerts_paginated.assert_called_once()
    assert scanner._fetch_alerts_paginated.call_args.kwargs.get("riskid") == "3"
    assert len(highs) == 1
    assert highs[0]["url"] == "http://a"


# ========== BOX-LIVE-4: сброс сессии + фильтр ДО пагинации ==========


def test_reset_alerts_uses_new_session_primary():
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._scanner = MagicMock()
    scanner._ensure_connected = lambda: None
    assert scanner.reset_alerts() is True
    scanner._scanner.core.new_session.assert_called_once()
    scanner._scanner.core.delete_all_alerts.assert_not_called()


def test_reset_alerts_falls_back_to_delete_all_alerts():
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._scanner = MagicMock()
    scanner._scanner.core.new_session.side_effect = RuntimeError("unsupported")
    scanner._ensure_connected = lambda: None
    assert scanner.reset_alerts() is True
    scanner._scanner.core.delete_all_alerts.assert_called_once()


def test_reset_alerts_swallows_failure():
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._scanner = MagicMock()
    scanner._scanner.core.new_session.side_effect = RuntimeError("down")
    scanner._scanner.core.delete_all_alerts.side_effect = RuntimeError("down")
    scanner._ensure_connected = lambda: None
    assert scanner.reset_alerts() is False


def test_count_alerts_uses_number_of_alerts():
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._scanner = MagicMock()
    scanner._scanner.core.number_of_alerts.return_value = "25737"
    scanner._ensure_connected = lambda: None
    assert scanner._count_alerts(baseurl="http://juice:3000") == 25737
    scanner._scanner.core.number_of_alerts.assert_called_once_with(baseurl="http://juice:3000")


def test_count_alerts_falls_back_to_pagination():
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._scanner = MagicMock()
    scanner._scanner.core.number_of_alerts.side_effect = RuntimeError("no view")
    scanner._ensure_connected = lambda: None
    scanner._fetch_alerts_paginated = MagicMock(return_value=[{}] * 42)
    assert scanner._count_alerts() == 42
    scanner._fetch_alerts_paginated.assert_called_once()


def test_fetch_alerts_paginated_passes_baseurl_before_pagination():
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._scanner = MagicMock()
    scanner._ensure_connected = lambda: None
    calls = []

    def fake_alerts(**kwargs):
        calls.append(kwargs)
        return []

    scanner._scanner.core.alerts.side_effect = fake_alerts
    out = scanner._fetch_alerts_paginated(riskid="3", baseurl="http://juice:3000")
    assert out == []
    assert calls[0]["baseurl"] == "http://juice:3000"
    assert calls[0]["riskid"] == "3"


def test_get_alerts_pushes_url_to_baseurl():
    """url уходит на сторону scanner как baseurl (ДО пагинации), не только post-filter."""
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._ensure_connected = lambda: None
    scanner._fetch_alerts_paginated = MagicMock(
        return_value=[{"risk": "High", "riskcode": "3", "url": "http://juice:3000/x"}]
    )
    out = scanner.get_alerts(url="http://juice:3000/x")
    scanner._fetch_alerts_paginated.assert_called_once()
    assert scanner._fetch_alerts_paginated.call_args.kwargs.get("baseurl") == "http://juice:3000/x"
    assert len(out) == 1
