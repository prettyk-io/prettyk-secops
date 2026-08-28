# -*- coding: utf-8 -*-
# PoC — NOT production. Cosmoport boundary. Do not import into DAST runtime.
"""COS-011: SSE стриминг (EventBus) tests + COS-017 (idempotency/recovery)."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


from infra.event_bus import EventBus, RunEvent, MAX_HISTORY


# ═══════════════════════════════════════════════════════════════════════════
# COS-011: EventBus
# ═══════════════════════════════════════════════════════════════════════════

class TestEventBusPublish:
    def test_publish_returns_event(self):
        bus = EventBus()
        evt = bus.publish("run-1", "run_started", {"a": 1})
        assert evt.run_id == "run-1"
        assert evt.kind == "run_started"
        assert evt.seq == 1

    def test_seq_increments(self):
        bus = EventBus()
        bus.publish("run-1", "run_started")
        bus.publish("run-1", "batch_completed")
        bus.publish("run-1", "run_succeeded")
        history = bus.history("run-1")
        assert [e.seq for e in history] == [1, 2, 3]

    def test_seq_per_run(self):
        bus = EventBus()
        bus.publish("run-1", "run_started")
        bus.publish("run-2", "run_started")
        assert bus.publish("run-1", "batch_completed").seq == 2
        assert bus.publish("run-2", "batch_completed").seq == 2


class TestEventBusHistory:
    def test_history_returns_events(self):
        bus = EventBus()
        bus.publish("run-1", "run_started")
        bus.publish("run-1", "run_succeeded")
        history = bus.history("run-1")
        assert len(history) == 2

    def test_history_since_seq(self):
        """Backpressure recovery: история с определённого seq."""
        bus = EventBus()
        bus.publish("run-1", "run_started")
        bus.publish("run-1", "batch_completed")
        bus.publish("run-1", "run_succeeded")
        history = bus.history("run-1", since_seq=1)
        assert len(history) == 2
        assert history[0].seq == 2

    def test_history_empty_for_unknown_run(self):
        bus = EventBus()
        assert bus.history("unknown") == []


class TestEventBusSubscribe:
    def test_subscribe_receives_events(self):
        bus = EventBus()
        received = []
        bus.subscribe("run-1", received.append)
        bus.publish("run-1", "run_started")
        assert len(received) == 1
        assert received[0].kind == "run_started"

    def test_unsubscribe_stops_receiving(self):
        bus = EventBus()
        received = []
        unsub = bus.subscribe("run-1", received.append)
        unsub()
        bus.publish("run-1", "run_started")
        assert len(received) == 0


class TestEventBusSSE:
    def test_sse_format(self):
        evt = RunEvent(run_id="run-1", kind="run_started", payload={}, seq=1)
        sse = evt.as_sse()
        assert sse.startswith("event: run_started")
        assert "data: " in sse
        assert sse.endswith("\n\n")

    def test_stream_yields_history_then_live(self):
        bus = EventBus()
        bus.publish("run-1", "run_started")
        gen = bus.stream_sse("run-1", since_seq=0, heartbeat_s=0.05)
        # Первая итерация — история
        first = next(gen)
        assert "run_started" in first
        gen.close()  # не висим


class TestEventBusValkeyFallback:
    def test_valkey_fallback_to_memory(self):
        """Valkey недоступен → in-memory (не падает)."""
        bus = EventBus(use_valkey=True, valkey_host="127.0.0.1", valkey_port=1)
        # Публикация работает через in-memory fallback
        evt = bus.publish("run-1", "run_started")
        assert evt.seq == 1
        assert len(bus.history("run-1")) == 1


# ═══════════════════════════════════════════════════════════════════════════
# COS-017: Идемпотентность и Recovery
# ═══════════════════════════════════════════════════════════════════════════

class RunStateStore:
    """Минимальная in-memory стейт-машина для тестов идемпотентности.

    Имитация: PG — источник истины, Valkey — ephemeral кэш.
    """

    def __init__(self):
        self._pg: dict[str, dict] = {}       # дурабельное хранилище (PG)
        self._cache: dict[str, str] = {}     # ephemeral (Valkey)
        self._idempotency: dict[str, str] = {}  # intent_key → run_id

    def create_run(self, intent_key: str, run_id: str, status: str = "draft") -> str:
        """Идемпотентный create: тот же intent_key → тот же run_id."""
        if intent_key in self._idempotency:
            return self._idempotency[intent_key]
        self._idempotency[intent_key] = run_id
        self._pg[run_id] = {"status": status, "intent_key": intent_key}
        self._cache[run_id] = status
        return run_id

    def transition(self, run_id: str, new_status: str) -> None:
        self._pg[run_id]["status"] = new_status
        self._cache[run_id] = new_status

    def get_status(self, run_id: str) -> str | None:
        """Статус — всегда из PG (источник истины), кэш лишь ускорение."""
        return self._pg.get(run_id, {}).get("status")

    def clear_cache(self) -> None:
        """Имитация падения Valkey."""
        self._cache.clear()

    def get_status_after_cache_clear(self, run_id: str) -> str | None:
        """Статус восстанавливается из PG после очистки Valkey."""
        return self.get_status(run_id)  # читаем из PG напрямую


class TestIdempotency:
    def test_same_intent_one_run(self):
        """Два одинаковых запуска → один run (идемпотентность)."""
        store = RunStateStore()
        r1 = store.create_run("pipeline-1:inputs-hash", "run-aaa")
        r2 = store.create_run("pipeline-1:inputs-hash", "run-bbb")  # второй вызов
        assert r1 == r2 == "run-aaa"

    def test_different_intent_different_run(self):
        store = RunStateStore()
        r1 = store.create_run("pipeline-1:hash-a", "run-a")
        r2 = store.create_run("pipeline-1:hash-b", "run-b")
        assert r1 != r2


class TestRecovery:
    def test_status_survives_cache_clear(self):
        """Valkey очищен → статус восстановлен из PG."""
        store = RunStateStore()
        store.create_run("k", "run-1", status="draft")
        store.transition("run-1", "running")
        store.transition("run-1", "succeeded")
        store.clear_cache()  # имитация падения Valkey
        assert store.get_status_after_cache_clear("run-1") == "succeeded"

    def test_no_run_exists_only_in_cache(self):
        """Ни один run не существует только в Valkey."""
        store = RunStateStore()
        store.create_run("k", "run-1", status="running")
        store.clear_cache()
        # run всё ещё в PG
        assert store.get_status("run-1") == "running"