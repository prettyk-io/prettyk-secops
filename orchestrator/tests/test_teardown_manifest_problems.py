# -*- coding: utf-8 -*-
"""TEARDOWN: весь фарш валидации в ERROR-лог."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.controller import Controller


def test_teardown_dumps_all_wired_problems(caplog):
    ctrl = Controller.__new__(Controller)
    ctrl._wired_problems = [
        "  s1 / step: битый секрет",
        "  s2 / step: неизвестный MethodId",
    ]
    ctrl._work_timer = None
    ctrl._idle_timer = None
    ctrl.adapters = {}

    with caplog.at_level(logging.ERROR):
        ctrl._teardown_dump_wired_problems()

    text = "\n".join(caplog.messages)
    assert "TEARDOWN" in text
    assert "битый секрет" in text
    assert "неизвестный MethodId" in text
    assert "2 проблем" in text or "2" in text


def test_shutdown_calls_teardown_dump(monkeypatch):
    ctrl = Controller.__new__(Controller)
    ctrl._wired_problems = ["  x: y"]
    ctrl._work_timer = None
    ctrl._idle_timer = None
    ctrl.adapters = {}
    called = []
    monkeypatch.setattr(
        ctrl, "_teardown_dump_wired_problems", lambda: called.append(1)
    )
    monkeypatch.setattr(ctrl, "_cancel_session_timeouts", lambda: None)
    ctrl.shutdown()
    assert called == [1]


def test_teardown_silent_when_clean():
    ctrl = Controller.__new__(Controller)
    ctrl._wired_problems = []
    ctrl._teardown_dump_wired_problems()  # no raise
