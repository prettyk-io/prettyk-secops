# -*- coding: utf-8 -*-
"""ZAP alerts: пагинация, без одного гигантского core.alerts()."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.zap_adapter import ZapAdapter


def test_fetch_alerts_paginated_stops_and_concatenates():
    zap = ZapAdapter.__new__(ZapAdapter)
    zap._zap = MagicMock()
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

    zap._zap.core.alerts.side_effect = fake_alerts
    zap._ensure_connected = lambda: None

    out = zap._fetch_alerts_paginated(riskid="3", page_size=200)
    assert len(out) == 250
    assert calls[0]["start"] == 0 and calls[0]["count"] == 200
    assert calls[0].get("riskid") == "3"
    assert calls[1]["start"] == 200


def test_get_alerts_high_uses_riskid_and_filters():
    zap = ZapAdapter.__new__(ZapAdapter)
    zap._ensure_connected = lambda: None
    zap._fetch_alerts_paginated = MagicMock(
        return_value=[
            {"risk": "High", "riskcode": "3", "url": "http://a"},
            {"risk": "Medium", "riskcode": "2", "url": "http://b"},
        ]
    )
    highs = zap.get_alerts(risk="High")
    zap._fetch_alerts_paginated.assert_called_once()
    assert zap._fetch_alerts_paginated.call_args.kwargs.get("riskid") == "3"
    assert len(highs) == 1
    assert highs[0]["url"] == "http://a"
