# -*- coding: utf-8 -*-
"""BOX-GATE-NORM: regression tests for Playwright wait_for_network_idle.

Гарантирует честную семантику ожидания сети для SPA (Juice Shop):
  - native networkidle (ноль соединений) неприменим к вечному polling/websocket;
  - фикс считает Resource Timing entries; стабилизация = просто й;
  - шаг НЕ валится по таймауту/ошибке чтения (возвращает False), но и НЕ маскирует
    реальные ошибки (непрерывный рост счётчика без стабилизации = False).
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

import time

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

from adapters.playwright_adapter import PlaywrightAdapter  # noqa: E402


def _adapter_with_page(evaluate_side_effect) -> PlaywrightAdapter:
    ad = PlaywrightAdapter(browser="chromium", headless=True)
    page = MagicMock()
    page.evaluate.side_effect = evaluate_side_effect
    ad._page = page  # короткое замыкание _ensure_page
    return ad


def test_idle_when_resource_count_stabilizes():
    # Счётчик застыл на 12 → минуем стабилизацию, возвращаем True быстро.
    ad = _adapter_with_page(lambda script: 12)
    started = time.time()
    assert ad.wait_for_network_idle(idle_seconds=0.3, timeout=3) is True
    assert time.time() - started < 2.0


def test_spa_polling_returns_false_not_raise():
    # SPA: счётчик resources растёт каждый опрос (вечное догружение) → честный False.
    counter = {"n": 0}

    def growing(_script):
        counter["n"] += 1
        return counter["n"]

    ad = _adapter_with_page(growing)
    assert ad.wait_for_network_idle(idle_seconds=2.0, timeout=1.0) is False


def test_evaluate_error_returns_false_not_raise():
    ad = _adapter_with_page(lambda script: (_ for _ in ()).throw(RuntimeError("boom")))
    assert ad.wait_for_network_idle(idle_seconds=0.2, timeout=1.0) is False


def test_no_native_networkidle_dependency():
    """Регрессия: реализация не должна больше звать wait_for_load_state('networkidle')."""
    import ast
    import inspect
    import textwrap

    src = textwrap.dedent(inspect.getsource(PlaywrightAdapter.wait_for_network_idle))
    node = ast.parse(src)
    func = node.body[0]
    for stmt in ast.walk(func):
        if isinstance(stmt, ast.Attribute) and stmt.attr == "wait_for_load_state":
            pytest.fail("wait_for_network_idle всё ещё зовёт wait_for_load_state")

    # Убеждаемся, что выбран Resource Timing механизм присутствует в коде.
    assert "getEntriesByType" in src