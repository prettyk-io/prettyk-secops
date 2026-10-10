# -*- coding: utf-8 -*-
"""MONITOR-RUN-LIFECYCLE-ARCHIVE: ранний крах оставляет журнал; «живой» однозначен.

Проверки:
- ``run_is_live_shared`` опирается на общий статус раннера (``lab_run``), а не на
  env дочернего процесса → «live» одинаков во всех процессах;
- ``main._finalize_init_failure`` публикует честное событие обрыва и сигналит
  run_ended (экспорт per-run журнала), не оставляя пустоту в мониторе.
"""
from __future__ import annotations


def test_run_is_live_shared_uses_lab_status(monkeypatch):
    from utils import lab_run, live_server

    monkeypatch.setattr(
        lab_run, "get_run_status", lambda: {"phase": "running", "run_id": "run-x"}
    )
    assert live_server.run_is_live_shared("run-x") is True
    assert live_server.run_is_live_shared("run-y") is False
    assert live_server.run_is_live_shared("") is False

    monkeypatch.setattr(
        lab_run, "get_run_status", lambda: {"phase": "finished", "run_id": "run-x"}
    )
    assert live_server.run_is_live_shared("run-x") is False


def test_run_is_live_shared_tolerates_errors(monkeypatch):
    from utils import lab_run, live_server

    def _boom():
        raise RuntimeError("no status")

    monkeypatch.setattr(lab_run, "get_run_status", _boom)
    assert live_server.run_is_live_shared("run-x") is False


def test_finalize_init_failure_publishes_and_notifies(monkeypatch):
    import main as entry
    from utils import diary_bus, live_server

    published: list = []
    notified: list = []
    monkeypatch.setattr(diary_bus, "publish", lambda *a, **k: published.append((a, k)))
    monkeypatch.setattr(
        live_server, "notify_live_run_ended", lambda **k: notified.append(k)
    )
    monkeypatch.setenv("PK_RUN_ID", "run-initfail1")

    entry._finalize_init_failure("boom")

    assert published and published[0][0][0] == "ERROR"
    assert "run initialization failed" in published[0][0][1]
    assert notified and notified[0].get("run_id") == "run-initfail1"
