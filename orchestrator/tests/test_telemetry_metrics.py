# -*- coding: utf-8 -*-
"""TELEMETRY-3: базовые операционные метрики (композитный сборщик + live-источники).

Проверяем MetricsCollector (TTL-кэш, fallback, override) и связку
system_metrics_snapshot() с рантаймом Run Control без внешних зависимостей
(Pure Box: нет PG/Valkey, проберы возвращают None → push-счётчики RunMetrics).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

import infra.telemetry as tel
from infra.telemetry import MetricsCollector, RunMetrics


@pytest.fixture(autouse=True)
def _reset_singletons(monkeypatch):
    """Изолируем модульные синглтоны от кросс-тестового влияния."""
    monkeypatch.setattr(tel, "_system_metrics_collector", None)
    monkeypatch.setattr(tel, "_runtime_plane", lambda: None)
    yield


# ── MetricsCollector ────────────────────────────────────────────────────────


def test_collector_live_source_overrides_push_counter():
    metrics = RunMetrics()
    metrics.run_queued("r1")
    metrics.run_queued("r2")  # fallback = 2
    collector = MetricsCollector(metrics=metrics)
    collector.set_source("queue_depth", lambda: 7)
    snap = collector.snapshot()
    assert snap["queue_depth"] == 7
    assert snap["active_runs"] == 0


def test_collector_source_raises_falls_back():
    metrics = RunMetrics()
    metrics.run_started("r1")
    collector = MetricsCollector(metrics=metrics)
    collector.set_source("active_runs", lambda: 1 / 0)  # бросает
    snap = collector.snapshot()
    assert snap["active_runs"] == 1  # fallback из push-счётчика


def test_collector_source_none_falls_back():
    metrics = RunMetrics()
    metrics.worker_online("w1")
    collector = MetricsCollector(metrics=metrics)
    collector.set_source("live_workers", lambda: None)  # источник недоступен
    snap = collector.snapshot()
    assert snap["live_workers"] == 1


def test_collector_source_negative_falls_back():
    metrics = RunMetrics()
    metrics.run_queued("r1")
    collector = MetricsCollector(metrics=metrics)
    collector.set_source("queue_depth", lambda: -3)  # некорректное значение
    snap = collector.snapshot()
    assert snap["queue_depth"] == 1


def test_collector_ttl_cache_and_force():
    calls = {"n": 0}

    def probe():
        calls["n"] += 1
        return calls["n"]

    collector = MetricsCollector(metrics=RunMetrics(), ttl_s=30.0)
    collector.set_source("queue_depth", probe)

    s1 = collector.snapshot()
    assert s1["queue_depth"] == 1
    s2 = collector.snapshot()  # внутри TTL — источник не вызывается повторно
    assert s2["queue_depth"] == 1
    assert calls["n"] == 1

    s3 = collector.snapshot(force=True)  # принудительное обновление
    assert s3["queue_depth"] == 2
    assert calls["n"] == 2


def test_collector_snapshot_has_all_keys():
    collector = MetricsCollector(metrics=RunMetrics())
    snap = collector.snapshot()
    assert set(snap) >= {
        "timestamp", "uptime_s", "active_runs", "queue_depth",
        "live_workers", "total_errors", "errors_last_hour",
        "window_s", "refresh_ttl_s",
    }


# ── system_metrics_snapshot (связка с рантаймом) ────────────────────────────


class _FakeRun:
    def __init__(self, state: str, finished_at: float | None = None):
        self._state = state
        self.is_terminal = state in ("succeeded", "failed", "cancelled")
        self.finished_at = finished_at

    @property
    def state(self):
        class _S:
            value = self._state
        return _S()


class _FakePlane:
    def __init__(self, runs, queue, workers):
        self._runs = runs
        self._queue = queue
        self._workers = workers

    def list_runs(self):
        return self._runs

    def queue_length(self):
        return len(self._queue)


def test_system_metrics_reads_runtime_plane(monkeypatch):
    now = time.time()
    plane = _FakePlane(
        runs=[
            _FakeRun("running"),                              # active
            _FakeRun("queued"),                               # active (в очереди)
            _FakeRun("failed", finished_at=now - 10),        # error в последний час
            _FakeRun("failed", finished_at=now - 7200),      # error старее часа
            _FakeRun("succeeded"),
        ],
        queue=["run-x"],
        workers={"w1": object(), "w2": object()},
    )
    monkeypatch.setattr(tel, "_runtime_plane", lambda: plane)

    snap = tel.system_metrics_snapshot(force=True)
    assert snap["active_runs"] == 2
    assert snap["queue_depth"] == 1
    assert snap["live_workers"] == 2
    assert snap["total_errors"] == 2
    assert snap["errors_last_hour"] == 1


def test_system_metrics_pure_box_no_runtime(monkeypatch):
    """Без рантайма (Pure Box) — не падает, использует push-счётчики."""
    monkeypatch.setattr(tel, "_runtime_plane", lambda: None)
    metrics = tel.get_metrics()
    metrics.run_queued("r1")
    metrics.worker_online("w1")

    snap = tel.system_metrics_snapshot(force=True)
    assert snap["active_runs"] == 0
    assert snap["queue_depth"] == 1
    assert snap["live_workers"] == 1


def test_get_system_metrics_wires_five_sources():
    collector = tel.get_system_metrics()
    assert set(collector._sources) == {
        "active_runs", "queue_depth", "live_workers",
        "total_errors", "errors_last_hour",
    }


def test_system_metrics_snapshot_is_cacheable(monkeypatch):
    """Повторный вызов без force внутри TTL не дёргает live-источники."""
    counter = {"n": 0}

    def probe():
        counter["n"] += 1
        return counter["n"]

    collector = tel.get_system_metrics()
    monkeypatch.setattr(tel, "_runtime_plane", lambda: _FakePlane([], [], {}))
    collector.set_source("queue_depth", probe)

    tel.system_metrics_snapshot(force=True)
    v = tel.system_metrics_snapshot()  # cached branch
    assert v["queue_depth"] == 1
    assert counter["n"] == 1