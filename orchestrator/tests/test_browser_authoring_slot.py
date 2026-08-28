# -*- coding: utf-8 -*-
"""SOR-L2: Playwright Authoring Slot — headed Chromium per session.

GWT:
  Две параллельные сессии → разные CDP endpoints;
  BrowserSessionManager.set_cdp_endpoint('s1', 'http://host:9223');
  _BrowserWorker._cdp_endpoint_override применён.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from browser.browser_service import BrowserSessionManager, _BrowserWorker


class TestCdpEndpointRouting:
    """SOR-L2: per-session CDP endpoint assignment."""

    def teardown_method(self):
        for sid in BrowserSessionManager.active_sessions():
            BrowserSessionManager.remove(sid)

    def test_set_cdp_endpoint_stored(self):
        BrowserSessionManager.set_cdp_endpoint("s1", "http://127.0.0.1:9223")
        assert BrowserSessionManager.get_cdp_endpoint("s1") == "http://127.0.0.1:9223"

    def test_get_cdp_endpoint_none_for_unknown_session(self):
        assert BrowserSessionManager.get_cdp_endpoint("no-such") is None

    def test_get_applies_endpoint_to_worker(self):
        BrowserSessionManager.set_cdp_endpoint("slot-a", "http://10.0.0.1:9225")
        worker = BrowserSessionManager.get("slot-a")
        assert worker._cdp_endpoint_override == "http://10.0.0.1:9225"

    def test_get_with_inline_cdp_endpoint(self):
        worker = BrowserSessionManager.get("slot-b", cdp_endpoint="http://127.0.0.1:9230")
        assert worker._cdp_endpoint_override == "http://127.0.0.1:9230"

    def test_different_sessions_different_endpoints(self):
        """Две сессии → разные CDP endpoints, не пересекаются."""
        w1 = BrowserSessionManager.get("slot-1", cdp_endpoint="http://h:9223")
        w2 = BrowserSessionManager.get("slot-2", cdp_endpoint="http://h:9224")
        assert w1._cdp_endpoint_override == "http://h:9223"
        assert w2._cdp_endpoint_override == "http://h:9224"
        assert w1 is not w2

    def test_remove_cleans_cdp_endpoint(self):
        BrowserSessionManager.set_cdp_endpoint("temp", "http://h:9999")
        assert BrowserSessionManager.get_cdp_endpoint("temp") == "http://h:9999"
        BrowserSessionManager.remove("temp")
        assert BrowserSessionManager.get_cdp_endpoint("temp") is None

    def test_worker_no_override_defaults_to_env(self):
        """Без override worker использует PK_BROWSER_CDP_ENDPOINT (или None)."""
        w = BrowserSessionManager.get("no-override")
        assert w._cdp_endpoint_override is None


class TestAuthoringSlotIsolation:
    """Два параллельных authoring-слота изолированы."""

    def teardown_method(self):
        for sid in BrowserSessionManager.active_sessions():
            BrowserSessionManager.remove(sid)

    def test_two_slots_independent_workers(self):
        slot_a = BrowserSessionManager.get("authoring-1", cdp_endpoint="http://c:9223")
        slot_b = BrowserSessionManager.get("authoring-2", cdp_endpoint="http://c:9224")

        assert slot_a is not slot_b
        assert slot_a._cdp_endpoint_override != slot_b._cdp_endpoint_override

    def test_same_slot_reconnect_same_worker(self):
        first = BrowserSessionManager.get("persistent-slot", cdp_endpoint="http://c:9223")
        second = BrowserSessionManager.get("persistent-slot")
        assert first is second
        assert second._cdp_endpoint_override == "http://c:9223"

    def test_endpoint_update_on_existing_slot(self):
        """Обновление endpoint для существующей сессии."""
        w = BrowserSessionManager.get("dynamic-slot", cdp_endpoint="http://old:9223")
        assert w._cdp_endpoint_override == "http://old:9223"
        BrowserSessionManager.set_cdp_endpoint("dynamic-slot", "http://new:9225")
        # re-get to apply
        w2 = BrowserSessionManager.get("dynamic-slot")
        assert w2._cdp_endpoint_override == "http://new:9225"