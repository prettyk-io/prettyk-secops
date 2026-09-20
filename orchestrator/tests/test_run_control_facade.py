# -*- coding: utf-8 -*-
"""RC2-1: интеграционные тесты Run Control facade.

Проверяют единый публичный API и инвариант «без рассинхрона слоёв»:
после любой последовательности операций проекции queue / dispatcher / lease /
streams / metrics согласованы с авторитетным ядром (consistency_report == []).

Внешние сервисы (Valkey, PG) не нужны: очередь — InMemoryQueueBackend,
streams/lease — in-memory doubles контракта.
"""
from __future__ import annotations

import threading

import pytest

from core.run_control_plane import FailureClass, RunControlPlane, RunState
from infra.run_control_facade import (
    FacadeError,
    RunControlFacade,
    RunView,
)
from infra.run_dispatch import WORKER_BUSY, WORKER_IDLE, RunDispatcher
from infra.run_idempotency import DedupStore
from infra.run_queue import InMemoryQueueBackend, RunQueue
from infra.run_queue_position import DurationTracker
from infra.telemetry import RunMetrics


# ── In-memory doubles контрактов ────────────────────────────────────────────


class FakeStreams:
    def __init__(self) -> None:
        self.enqueued: list[tuple[str, dict, str]] = []
        self.acked: list[tuple[str, str, str]] = []
        self._seq = 0

    def enqueue(self, stream_name: str, payload: dict) -> str:
        self._seq += 1
        message_id = f"{self._seq}-0"
        self.enqueued.append((stream_name, dict(payload), message_id))
        return message_id

    def ack(self, stream_name: str, group_name: str, message_id: str) -> int:
        self.acked.append((stream_name, group_name, message_id))
        return 1


class FakeLease:
    def __init__(self) -> None:
        self.registered: set[str] = set()
        self.heartbeats: list[str] = []
        self.swept: list[str] = []

    def register(self, run_id: str) -> None:
        self.registered.add(run_id)

    def heartbeat(self, run_id: str) -> int:
        self.heartbeats.append(run_id)
        return 1

    def sweep(self, run_id: str) -> bool:
        self.swept.append(run_id)
        return True


# ── Фикстуры ────────────────────────────────────────────────────────────────


def make_facade(plane: RunControlPlane | None = None, **over) -> RunControlFacade:
    kwargs = {
        "plane": plane or RunControlPlane(max_concurrent=1, lease_timeout_sec=60.0, max_retries=3),
        "queue": RunQueue(backend=InMemoryQueueBackend()),
        "dispatcher": RunDispatcher(),
        "lease": FakeLease(),
        "streams": FakeStreams(),
        "metrics": RunMetrics(),
        "durations": DurationTracker(),
    }
    kwargs.update(over)
    return RunControlFacade(**kwargs)


@pytest.fixture()
def facade() -> RunControlFacade:
    return make_facade()


# ── Единый публичный API и жизненный цикл ───────────────────────────────────


def test_single_entry_point_lifecycle(facade: RunControlFacade):
    facade.register_worker("w1", {"chrome"})
    view, is_new = facade.create_run({"wired": "a"}, {"chrome"})

    assert is_new is True
    assert isinstance(view, RunView)
    assert view.state == RunState.RUNNING.value
    assert view.worker_id == "w1"

    facade.assert_consistent()

    done = facade.succeed_run(view.run_id)
    assert done.state == RunState.SUCCEEDED.value
    assert done.is_terminal is True
    facade.assert_consistent()


def test_unknown_run_raises(facade: RunControlFacade):
    with pytest.raises(FacadeError, match="unknown run"):
        facade.succeed_run("ghost")


def test_terminal_run_is_noop(facade: RunControlFacade):
    facade.register_worker("w1")
    view, _ = facade.create_run({"wired": "a"})
    facade.succeed_run(view.run_id)

    again = facade.fail_run(view.run_id, FailureClass.INFRA, "late")
    assert again.state == RunState.SUCCEEDED.value  # terminal не воскресает
    facade.assert_consistent()


# ── Очередь: зеркало + позиция ──────────────────────────────────────────────


def test_queue_mirror_tracks_plane(facade: RunControlFacade):
    facade.register_worker("w1", {"chrome"})
    r1, _ = facade.create_run({"wired": "1"}, {"chrome"})
    r2, _ = facade.create_run({"wired": "2"}, {"chrome"})

    assert r1.state == RunState.RUNNING.value   # занял единственный worker
    assert r2.state == RunState.QUEUED.value
    assert facade.queue_depth() == 1

    pos = facade.queue_position(r2.run_id)
    assert pos is not None
    assert pos["position"] == 1
    assert pos["pos"] == 1
    assert pos["estimated_wait_s"] >= 0

    assert set(facade._queue.items()) == {r2.run_id}
    facade.assert_consistent()

    # Освобождение worker'а продвигает очередь, зеркало чистится.
    facade.succeed_run(r1.run_id)
    assert facade.get(r2.run_id).state == RunState.RUNNING.value
    assert facade._queue.items() == []
    assert facade.queue_position(r2.run_id) is None
    facade.assert_consistent()


def test_cancel_queued_run(facade: RunControlFacade):
    facade.register_worker("w1", {"chrome"})
    facade.create_run({"wired": "1"}, {"chrome"})
    r2, _ = facade.create_run({"wired": "2"}, {"chrome"})
    assert r2.state == RunState.QUEUED.value

    cancelled = facade.cancel_run(r2.run_id)
    assert cancelled.state == RunState.CANCELLED.value
    assert facade._queue.items() == []
    assert facade.queue_position(r2.run_id) is None
    facade.assert_consistent()


# ── Lease: heartbeat и разбор зависших ──────────────────────────────────────


def test_heartbeat_extends_lease(facade: RunControlFacade):
    facade.register_worker("w1")
    view, _ = facade.create_run({"wired": "a"})

    worker = facade.plane._workers["w1"]
    before = worker.lease_expires_at
    facade.heartbeat("w1")
    assert worker.lease_expires_at > before
    assert view.run_id in facade._lease.heartbeats
    facade.assert_consistent()


def test_stale_sweep_fails_and_releases(facade: RunControlFacade):
    plane = RunControlPlane(max_concurrent=1, lease_timeout_sec=60.0, max_retries=1)
    facade = make_facade(plane=plane)
    facade.register_worker("w1", {"chrome"})
    view, _ = facade.create_run({"wired": "a"}, {"chrome"})

    plane._workers["w1"].lease_expires_at = 0.0  # worker замолчал
    stale = facade.sweep_stale()

    assert stale == [view.run_id]
    assert facade.get(view.run_id).state == RunState.FAILED.value
    assert view.run_id in facade._lease.swept
    facade.assert_consistent()


# ── Retry-классификация исключений ──────────────────────────────────────────


def test_target_exception_no_retry(facade: RunControlFacade):
    facade.register_worker("w1")
    view, _ = facade.create_run({"wired": "a"})

    result = facade.fail_from_exception(view.run_id, ConnectionRefusedError("refused"))
    assert result.state == RunState.FAILED.value
    assert result.failure_class == FailureClass.TARGET.value
    facade.assert_consistent()


def test_validation_exception_no_retry(facade: RunControlFacade):
    facade.register_worker("w1")
    view, _ = facade.create_run({"wired": "a"})

    result = facade.fail_from_exception(view.run_id, ValueError("bad manifest"))
    assert result.state == RunState.FAILED.value
    assert result.failure_class == FailureClass.VALIDATION.value


def test_unknown_exception_fail_closed(facade: RunControlFacade):
    facade.register_worker("w1")
    view, _ = facade.create_run({"wired": "a"})

    result = facade.fail_from_exception(view.run_id, RuntimeError("weird"))
    assert result.state == RunState.FAILED.value
    assert result.failure_class == FailureClass.VALIDATION.value


def test_infra_exception_retries(facade: RunControlFacade):
    plane = RunControlPlane(max_concurrent=1, max_retries=3)
    facade = make_facade(plane=plane)
    facade.register_worker("w1")
    view, _ = facade.create_run({"wired": "a"})

    result = facade.fail_from_exception(view.run_id, TimeoutError("worker vanished"))
    # infra → повтор: run снова активен, попытка выросла
    assert result.state == RunState.RUNNING.value
    assert result.attempt == 2
    facade.assert_consistent()


# ── Идемпотентность на API-границе ─────────────────────────────────────────


def test_idempotency_dedup_on_api_boundary():
    facade = make_facade(dedup_store=DedupStore())
    facade.register_worker("w1")

    first, is_new1 = facade.create_run(
        {"wired": "x"}, pipeline_id="p1", inputs_hash="h1"
    )
    second, is_new2 = facade.create_run(
        {"wired": "x"}, pipeline_id="p1", inputs_hash="h1"
    )

    assert is_new1 is True
    assert is_new2 is False
    assert first.run_id == second.run_id
    facade.assert_consistent()


# ── Согласованность слоёв ───────────────────────────────────────────────────


def test_consistency_report_detects_queue_desync(facade: RunControlFacade):
    facade.register_worker("w1")
    facade.create_run({"wired": "a"})

    facade._queue.enqueue("ghost-run")  # внеплановая запись в зеркало
    problems = facade.consistency_report()
    assert any("queue mirror desync" in p for p in problems)
    with pytest.raises(FacadeError):
        facade.assert_consistent()


def test_consistency_report_clean_after_sequence(facade: RunControlFacade):
    facade.register_worker("w1", {"chrome"})
    r1, _ = facade.create_run({"wired": "1"}, {"chrome"})
    r2, _ = facade.create_run({"wired": "2"}, {"chrome"})
    r3, _ = facade.create_run({"wired": "3"}, {"chrome"})

    facade.succeed_run(r1.run_id)
    facade.cancel_run(r3.run_id)
    facade.fail_run(r2.run_id, FailureClass.VALIDATION, "bad")

    assert facade.consistency_report() == []


# ── Метрики ─────────────────────────────────────────────────────────────────


def test_metrics_reflect_plane(facade: RunControlFacade):
    facade.register_worker("w1", {"chrome"})
    r1, _ = facade.create_run({"wired": "1"}, {"chrome"})
    facade.create_run({"wired": "2"}, {"chrome"})

    snap = facade.metrics()
    assert snap["active_runs"] == 1
    assert snap["queue_depth"] == 1
    assert snap["live_workers"] == 1

    facade.fail_run(r1.run_id, FailureClass.VALIDATION, "boom")
    snap = facade.metrics()
    assert snap["active_runs"] == 1   # второй run принял worker
    assert snap["total_errors"] == 1
    facade.assert_consistent()


# ── Атомарность под конкуренцией ────────────────────────────────────────────


def test_concurrent_mutations_keep_layers_consistent(facade: RunControlFacade):
    facade.register_worker("w1", {"chrome"})
    facade.register_worker("w2", {"chrome"})
    facade.register_worker("w3", {"chrome"})

    errors: list[BaseException] = []

    def worker(prefix: str) -> None:
        try:
            for i in range(10):
                view, _ = facade.create_run(
                    {"wired": f"{prefix}-{i}"}, {"chrome"}
                )
                if i % 2 == 0:
                    facade.succeed_run(view.run_id)
                else:
                    facade.cancel_run(view.run_id)
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(f"t{n}",)) for n in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == []
    facade.assert_consistent()