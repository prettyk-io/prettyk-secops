# -*- coding: utf-8 -*-
"""RUN-CTL: тесты Run Control Plane (RUN-CTL-1..6)."""
from __future__ import annotations

import pytest

from core.run_control_plane import (
    FailureClass,
    RunControlPlane,
    RunState,
    json_dumps_sorted,
)


# ── RUN-CTL-1: жизненный цикл + атомарные переходы ──


class TestLifecycle:
    def test_happy_path_queued_running_succeeded(self):
        c = RunControlPlane()
        c.register_worker("w1", frozenset({"chrome"}))
        run, _ = c.create_run({"wired": "a"}, frozenset({"chrome"}))

        # create_run сразу диспатчит на свободного worker'а → running
        assert run.state == RunState.RUNNING
        assert run.worker_id == "w1"

        c.succeed_run(run.id)
        assert run.state == RunState.SUCCEEDED
        assert len(run.history) >= 2  # queued→running, running→succeeded

    def test_invalid_transition_raises(self):
        c = RunControlPlane()
        c.register_worker("w1", frozenset({"chrome"}))
        run, _ = c.create_run({"wired": "a"}, frozenset({"chrome"}))
        c.succeed_run(run.id)
        assert run.state == RunState.SUCCEEDED
        # fail_run/succeed_run на terminal — no-op (не бросают, не меняют состояние)
        c.fail_run(run.id, FailureClass.INFRA)
        assert run.state == RunState.SUCCEEDED
        # прямой переход через стейт-машину — бросает
        with pytest.raises(ValueError, match="Invalid transition"):
            c._transition(run, RunState.RUNNING)

    def test_cancel_in_queue(self):
        c = RunControlPlane(max_concurrent=1)
        c.register_worker("w1", frozenset({"chrome"}))
        # Занять worker'а
        c.register_worker("w_blocker", frozenset({"chrome"}))
        run1, _ = c.create_run({"wired": "1"}, frozenset({"chrome"}))
        run2, _ = c.create_run({"wired": "2"}, frozenset({"chrome"}))

        # run1 ушёл на w1 (первый свободный), run2 в очереди
        c.cancel_run(run2.id)
        assert run2.state == RunState.CANCELLED
        assert c.queue_position(run2.id) is None

    def test_cancel_while_running(self):
        c = RunControlPlane()
        c.register_worker("w1", frozenset({"chrome"}))
        run, _ = c.create_run({"wired": "a"}, frozenset({"chrome"}))
        assert run.state == RunState.RUNNING
        c.cancel_run(run.id)
        assert run.state == RunState.CANCELLED


# ── RUN-CTL-2: защита от дублирования ──


class TestDedup:
    def test_duplicate_params_returns_existing(self):
        c = RunControlPlane()
        c.register_worker("w1")
        r1, is_new1 = c.create_run({"wired": "x", "session": "s"})
        r2, is_new2 = c.create_run({"wired": "x", "session": "s"})

        assert is_new1 is True
        assert is_new2 is False
        assert r1.id == r2.id

    def test_key_order_independent(self):
        a = RunControlPlane._dedup_key({"a": 1, "b": 2})
        b = RunControlPlane._dedup_key({"b": 2, "a": 1})
        assert a == b

    def test_different_params_new_run(self):
        c = RunControlPlane()
        c.register_worker("w1")
        r1, _ = c.create_run({"wired": "x"})
        c.succeed_run(r1.id)  # завершить первый, чтобы dedup освободился
        r2, is_new = c.create_run({"wired": "x"})
        assert is_new is True
        assert r1.id != r2.id


# ── RUN-CTL-3: FIFO-очередь ──


class TestQueue:
    def test_fifo_order_and_position(self):
        c = RunControlPlane(max_concurrent=1)
        c.register_worker("w1", frozenset({"chrome"}))
        r1, _ = c.create_run({"wired": "1"}, frozenset({"chrome"}))
        r2, _ = c.create_run({"wired": "2"}, frozenset({"chrome"}))
        r3, _ = c.create_run({"wired": "3"}, frozenset({"chrome"}))

        # r1 занял единственный worker; r2 и r3 в очереди
        assert r1.state == RunState.RUNNING
        assert r2.state == RunState.QUEUED
        assert r3.state == RunState.QUEUED
        assert c.queue_position(r2.id) == 0
        assert c.queue_position(r3.id) == 1
        assert c.queue_length() == 2

    def test_queue_advances_when_worker_freed(self):
        c = RunControlPlane(max_concurrent=1)
        c.register_worker("w1", frozenset({"chrome"}))
        r1, _ = c.create_run({"wired": "1"}, frozenset({"chrome"}))
        r2, _ = c.create_run({"wired": "2"}, frozenset({"chrome"}))

        assert r2.state == RunState.QUEUED
        c.succeed_run(r1.id)
        assert r2.state == RunState.RUNNING
        assert r2.worker_id == "w1"


# ── RUN-CTL-4: назначение по capabilities ──


class TestCapabilities:
    def test_run_waits_for_matching_worker(self):
        c = RunControlPlane()
        c.register_worker("no-browser", frozenset({"scanner"}))
        run, _ = c.create_run({"wired": "a"}, frozenset({"chrome"}))

        # Нет worker'а с chrome → run остаётся в очереди
        assert run.state == RunState.QUEUED

        # Подключается браузерный worker
        c.register_worker("browser", frozenset({"chrome"}))
        c._dispatch()
        assert run.state == RunState.RUNNING
        assert run.worker_id == "browser"

    def test_no_caps_run_goes_anywhere(self):
        c = RunControlPlane()
        c.register_worker("w1", frozenset({"scanner"}))
        run, _ = c.create_run({"wired": "a"})
        assert run.state == RunState.RUNNING


# ── RUN-CTL-5: lease + heartbeat + обнаружение зависших ──


class TestLease:
    def test_stale_worker_detected_and_requeued(self):
        c = RunControlPlane(lease_timeout_sec=60, max_retries=3)
        c.register_worker("w1", frozenset({"chrome"}))
        run, _ = c.create_run({"wired": "a"}, frozenset({"chrome"}))
        assert run.state == RunState.RUNNING

        # Worker замолчал > 60s → зависший
        w1 = c._workers["w1"]
        w1.lease_expires_at = 0.0  # просрочено

        stale = c.detect_stale()
        assert stale == [run.id]
        assert run.state == RunState.QUEUED  # возвращён на повтор
        assert run.attempt == 2

    def test_heartbeat_keeps_lease_alive(self):
        c = RunControlPlane(lease_timeout_sec=60)
        c.register_worker("w1", frozenset({"chrome"}))
        run, _ = c.create_run({"wired": "a"}, frozenset({"chrome"}))

        w1 = c._workers["w1"]
        original_lease = w1.lease_expires_at
        c.heartbeat("w1")
        assert w1.lease_expires_at > original_lease

        stale = c.detect_stale()
        assert stale == []

    def test_stale_exhausts_retries_then_failed(self):
        c = RunControlPlane(lease_timeout_sec=60, max_retries=2)
        c.register_worker("w1", frozenset({"chrome"}))
        run, _ = c.create_run({"wired": "a"}, frozenset({"chrome"}))

        # Зависание №1 → requeue (attempt 2)
        c._workers["w1"].lease_expires_at = 0.0
        c.detect_stale()
        assert run.state == RunState.QUEUED
        assert run.attempt == 2

        # Повторный диспатч → снова running, снова зависание
        c._dispatch()
        assert run.state == RunState.RUNNING
        c._workers["w1"].lease_expires_at = 0.0
        c.detect_stale()
        # attempt 2 при max_retries=2 → исчерпано → FAILED
        assert run.state == RunState.FAILED
        assert run.failure_class == FailureClass.INFRA


# ── RUN-CTL-6: retry с классификацией ──


class TestRetryClassification:
    def test_infra_failure_retries(self):
        c = RunControlPlane(max_retries=3)
        c.register_worker("w1", frozenset({"chrome"}))
        run, _ = c.create_run({"wired": "a"}, frozenset({"chrome"}))

        c.fail_run(run.id, FailureClass.INFRA, "network lost")
        # retry сработал: attempt вырос, run ре-диспатчнут на освободившегося worker'а
        assert run.attempt == 2
        assert run.state == RunState.RUNNING
        # history содержит requeue-петлю (running→queued→running)
        states = [h[2] for h in run.history]
        assert "queued" in states

    def test_validation_failure_no_retry(self):
        c = RunControlPlane(max_retries=3)
        c.register_worker("w1", frozenset({"chrome"}))
        run, _ = c.create_run({"wired": "a"}, frozenset({"chrome"}))

        c.fail_run(run.id, FailureClass.VALIDATION, "bad wired")
        assert run.state == RunState.FAILED
        assert run.attempt == 1
        assert run.error == "bad wired"

    def test_target_failure_no_retry(self):
        c = RunControlPlane(max_retries=3)
        c.register_worker("w1")
        run, _ = c.create_run({"wired": "a"})
        c.fail_run(run.id, FailureClass.TARGET, "target unreachable")
        assert run.state == RunState.FAILED
        assert run.attempt == 1

    def test_infra_exhausts_max_retries(self):
        c = RunControlPlane(max_retries=2)
        c.register_worker("w1")
        run, _ = c.create_run({"wired": "a"})

        c.fail_run(run.id, FailureClass.INFRA)   # attempt 1→2, requeue
        assert run.attempt == 2
        # второй infra-фейл → исчерпано
        c.fail_run(run.id, FailureClass.INFRA)
        assert run.state == RunState.FAILED


# ── Канонизация ──


class TestCanonicalization:
    def test_nested_dict_keys_sorted_lists_keep_order(self):
        """dict-ключи сортируются; порядок списка ЗНАЧИМ (не сортируем [3,1])."""
        assert json_dumps_sorted({"b": [3, 1], "a": {"z": 1, "y": 2}}) == (
            '{"a": {"y": 2, "z": 1}, "b": [3, 1]}'
        )

    def test_dedup_key_stable_regardless_of_key_order(self):
        k1 = RunControlPlane._dedup_key({"nested": {"x": 1}, "list": [1, 2]})
        k2 = RunControlPlane._dedup_key({"list": [1, 2], "nested": {"x": 1}})
        assert k1 == k2

    def test_list_order_is_significant_for_dedup(self):
        """[1,2] и [2,1] — разные запуски (порядок значим)."""
        k1 = RunControlPlane._dedup_key({"steps": [1, 2]})
        k2 = RunControlPlane._dedup_key({"steps": [2, 1]})
        assert k1 != k2
