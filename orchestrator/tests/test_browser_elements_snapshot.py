# -*- coding: utf-8 -*-
"""BBA-7: backend-снимок кликабельных элементов (CandidateElement contract).

Проверяем _cmd_elements_snapshot: shape ответа, fail-closed (нет браузера /
eval упал / не-список), и что публичный API диспатчит команду. Контракт
`CandidateElement` = {tag, role, text, selector, bbox:{x,y,width,height}} —
каноническая схема BBA-7 (BBA-FE-4 сходится с ней).
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

import browser.browser_service as bs
from browser.browser_service import _ELEMENTS_SNAPSHOT_JS, _BrowserWorker


def _mock_page(raw_result):
    page = MagicMock()
    page.evaluate = MagicMock(return_value=raw_result)
    return page


def _new_worker(page):
    worker = _BrowserWorker()
    worker._page = page
    return worker


_RAW = [
    {
        "tag": "button",
        "role": "button",
        "text": "Submit",
        "selector": "#submit",
        "bbox": {"x": 10, "y": 20, "width": 80, "height": 30},
    },
    {
        "tag": "input",
        "role": "textbox",
        "text": "q",
        "selector": "form > input:nth-of-type(1)",
        "bbox": {"x": 4, "y": 4, "width": 120, "height": 22},
    },
]


# ── _cmd_elements_snapshot ─────────────────────────────────────────────────


def test_elements_snapshot_shape():
    worker = _new_worker(_mock_page(_RAW))
    r = worker._cmd_elements_snapshot()
    assert r["ok"] is True
    assert r["count"] == 2
    assert isinstance(r["elements"], list)
    el = r["elements"][0]
    assert set(el) == {"tag", "role", "text", "selector", "bbox"}
    assert isinstance(el["selector"], str) and el["selector"]
    assert set(el["bbox"]) == {"x", "y", "width", "height"}
    for k in ("x", "y", "width", "height"):
        assert isinstance(el["bbox"][k], int)


def test_elements_snapshot_no_browser():
    worker = _new_worker(None)
    r = worker._cmd_elements_snapshot()
    assert r["ok"] is False
    assert r["error"] == "browser not available"


def test_elements_snapshot_eval_raises():
    def _eval(expr):
        if expr == _ELEMENTS_SNAPSHOT_JS:
            raise RuntimeError("cdp down")
        return 1  # liveness-проверка _ensure_browser проходит

    page = _mock_page([])
    page.evaluate = MagicMock(side_effect=_eval)
    worker = _new_worker(page)
    r = worker._cmd_elements_snapshot()
    assert r["ok"] is False
    assert "RuntimeError" in r["error"]


def test_elements_snapshot_non_list_result():
    worker = _new_worker(_mock_page(None))
    r = worker._cmd_elements_snapshot()
    assert r["ok"] is True
    assert r["elements"] == []
    assert r["count"] == 0


def test_elements_snapshot_uses_canonical_probe():
    page = _mock_page(_RAW)
    worker = _new_worker(page)
    worker._cmd_elements_snapshot()
    page.evaluate.assert_any_call(_ELEMENTS_SNAPSHOT_JS)


def test_probe_is_iife_expression():
    """Пробник — самовызываемый JS-выражение (как в _cmd_eval)."""
    assert _ELEMENTS_SNAPSHOT_JS.strip().startswith("(function()")
    assert _ELEMENTS_SNAPSHOT_JS.strip().endswith(")()")


# ── публичный API ──────────────────────────────────────────────────────────


def test_browser_elements_snapshot_public_api_callable():
    from browser.browser_service import browser_elements_snapshot
    assert callable(browser_elements_snapshot)


def test_browser_elements_snapshot_dispatches():
    """Публичный API диспатчит команду elements_snapshot на worker."""
    from browser.browser_service import browser_elements_snapshot
    worker = _new_worker(_mock_page(_RAW))
    worker.dispatch = MagicMock(return_value={"ok": True, "elements": [], "count": 0})
    original = bs.BrowserSessionManager.worker_for
    bs.BrowserSessionManager.worker_for = classmethod(lambda cls, session_id=None: worker)
    try:
        r = browser_elements_snapshot()
    finally:
        bs.BrowserSessionManager.worker_for = original
    worker.dispatch.assert_called_once_with("elements_snapshot")
    assert r["ok"] is True
