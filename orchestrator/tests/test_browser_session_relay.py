# -*- coding: utf-8 -*-
"""SOR-L1: Per-session browser relay binding.

GWT:
  Две сессии → workers изолированы (разные объекты);
  BrowserSessionManager.get('a') != BrowserSessionManager.get('b');
  Публичное API browser_status(session_id='x') диспатчит на свой worker.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from browser.browser_service import BrowserSessionManager, _BrowserWorker


class TestBrowserSessionManager:
    """SOR-L1: per-session BrowserWorker изоляция."""

    def teardown_method(self):
        """Очищаем сессии после каждого теста."""
        for sid in BrowserSessionManager.active_sessions():
            BrowserSessionManager.remove(sid)

    def test_get_creates_worker(self):
        worker = BrowserSessionManager.get("session-a")
        assert worker is not None
        assert isinstance(worker, _BrowserWorker)
        assert "session-a" in BrowserSessionManager.active_sessions()

    def test_same_session_returns_same_worker(self):
        w1 = BrowserSessionManager.get("session-x")
        w2 = BrowserSessionManager.get("session-x")
        assert w1 is w2

    def test_different_sessions_different_workers(self):
        w_a = BrowserSessionManager.get("session-a")
        w_b = BrowserSessionManager.get("session-b")
        assert w_a is not w_b

    def test_active_sessions_list(self):
        BrowserSessionManager.get("s1")
        BrowserSessionManager.get("s2")
        sessions = BrowserSessionManager.active_sessions()
        assert "s1" in sessions
        assert "s2" in sessions

    def test_remove_cleans_session(self):
        BrowserSessionManager.get("temp")
        assert "temp" in BrowserSessionManager.active_sessions()
        BrowserSessionManager.remove("temp")
        assert "temp" not in BrowserSessionManager.active_sessions()

    def test_remove_nonexistent_no_error(self):
        BrowserSessionManager.remove("no-such-session")

    def test_worker_for_with_session_id(self):
        w = BrowserSessionManager.worker_for("s1")
        assert w is BrowserSessionManager.get("s1")

    def test_worker_for_without_session_id_returns_default(self):
        from browser.browser_service import _worker
        w = BrowserSessionManager.worker_for(None)
        assert w is _worker

    def test_multiple_sessions_isolated(self):
        """Две сессии → workers разные объекты, не смешиваются."""
        a = BrowserSessionManager.get("session-alpha")
        b = BrowserSessionManager.get("session-beta")
        assert a is not b
        assert id(a) != id(b)


class TestPublicApiSessionAware:
    """Публичные функции принимают session_id и диспатчат на правильный worker."""

    def teardown_method(self):
        for sid in BrowserSessionManager.active_sessions():
            BrowserSessionManager.remove(sid)

    def test_browser_status_with_session(self):
        from browser.browser_service import browser_status

        # Без сессии — на глобальный worker (который без CDP — вернёт ошибку, но не упадёт)
        result = browser_status(session_id=None)
        assert isinstance(result, dict)

    def test_browser_navigate_accepts_session(self):
        from browser.browser_service import browser_navigate

        # Функция компилируется и принимает session_id
        import inspect
        sig = inspect.signature(browser_navigate)
        params = list(sig.parameters.keys())
        assert "session_id" in params

    def test_all_public_functions_have_session_id(self):
        """Проверить, что все публичные функции принимают session_id."""
        import browser.browser_service as bs
        functions = [
            bs.browser_status,
            bs.browser_navigate,
            bs.browser_screenshot,
            bs.browser_back,
            bs.browser_forward,
            bs.browser_click,
            bs.browser_type_text,
            bs.browser_highlight,
            bs.browser_eval,
            bs.browser_observe_start,
            bs.browser_observe_stop,
            bs.browser_observe_event,
            bs.browser_observe_click,
            bs.browser_context_ensure,
            bs.browser_context_destroy,
        ]
        import inspect
        for fn in functions:
            sig = inspect.signature(fn)
            assert "session_id" in sig.parameters, f"{fn.__name__} missing session_id"


class TestCdpViewportRelaySession:
    """CdpViewportRelay принимает session_id и ws_port."""

    def test_relay_accepts_session_id(self):
        from browser.cdp_viewport_relay import CdpViewportRelay
        r = CdpViewportRelay(session_id="test-session", ws_port=19224)
        assert r._session_id == "test-session"
        assert r._ws_port == 19224

    def test_relay_default_session_empty(self):
        from browser.cdp_viewport_relay import CdpViewportRelay
        r = CdpViewportRelay()
        assert r._session_id == ""

    def test_start_relay_signature(self):
        from browser.cdp_viewport_relay import start_relay
        import inspect
        sig = inspect.signature(start_relay)
        assert "session_id" in sig.parameters
        assert "ws_port" in sig.parameters