# -*- coding: utf-8 -*-
"""RUN-CTL-2: тесты идемпотентности create_run (infra/run_idempotency.py).

Acceptance-критерии пакета:
  * create_run("pipe-1", hash="abc", corr="c1") → run в начальном статусе;
  * повтор через 5 c с теми же параметрами → тот же run_id, не новый;
  * первый run завершён (SUCCEEDED) → повторный вызов → НОВЫЙ run_id;
  * разные inputs_hash → разные run_id;
  * TTL-окно 30 с: ключ старше окна → дубликатом не считается;
  * DedupStore: sweep/корреляционный индекс.

Ядро жизненного цикла — core.run_control_plane.RunControlPlane (существующий
контракт). run_state.py (Boss) подключается той же фабрикой/резолвером.
"""
from __future__ import annotations

import pytest

from core.run_control_plane import RunControlPlane, RunState
from infra.run_idempotency import (
    DEFAULT_TTL_S,
    REASON_CREATED,
    REASON_DEDUP_ACTIVE,
    REASON_RECREATED_TERMINAL,
    REASON_RECREATED_TTL,
    DedupStore,
    RunIdempotency,
    compute_dedup_key,
)


class FakeClock:
    """Управляемые часы: никакого sleep в тестах."""

    def __init__(self, start: float = 1000.0) -> None:
        self._now = start

    def time(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


@pytest.fixture()
def wired():
    """RunIdempotency поверх существующего RunControlPlane + FakeClock."""
    cpf = RunControlPlane()
    clock = FakeClock()

    def factory(pipeline_id, inputs_hash, correlation_id=None, dedup_key=None, nonce=None):
        # nonce гарантирует, что ядро не «проглотит» вызов собственным дедупом:
        # решение о дубликате принимает только слой идемпотентности.
        run, _ = cpf.create_run(
            {
                "pipeline_id": pipeline_id,
                "inputs_hash": inputs_hash,
                "correlation_id": correlation_id,
                "nonce": nonce,
            }
        )
        return run

    idem = RunIdempotency(
        run_factory=factory,
        run_resolver=cpf.get_run,
        clock=clock.time,
        ttl_s=DEFAULT_TTL_S,
    )
    return cpf, idem, clock


class TestCreateRunIdempotency:
    def test_first_call_creates_active_run(self, wired):
        """create_run → новый run в начальном статусе (QUEUED/PENDING)."""
        cpf, idem, _ = wired
        run, is_new, reason = idem.create_run("pipe-1", "abc", "c1")

        assert is_new is True
        assert reason == REASON_CREATED
        assert run.state in (RunState.QUEUED, RunState.RUNNING)
        # Без зарегистрированных worker'ов диспатча нет → queued (PENDING-alias).
        assert run.state == RunState.QUEUED

    def test_repeat_within_ttl_returns_same_run(self, wired):
        """Повтор через 5 с (окно 30 с) → тот же run, дубль отклонён."""
        cpf, idem, clock = wired
        run1, is_new1, _ = idem.create_run("pipe-1", "abc", "c1")

        clock.advance(5)
        run2, is_new2, reason = idem.create_run("pipe-1", "abc", "c1")

        assert is_new1 is True
        assert is_new2 is False
        assert reason == REASON_DEDUP_ACTIVE
        assert run2.id == run1.id
        assert cpf.get_run(run1.id) is run1

    def test_terminal_run_does_not_block_new_run(self, wired):
        """Первый run завершён (SUCCEEDED) → повтор создаёт НОВЫЙ run."""
        cpf, idem, clock = wired
        cpf.register_worker("w1")
        run1, _, _ = idem.create_run("pipe-1", "abc", "c1")
        # Свободный worker → диспатч сразу в RUNNING; завершаем.
        assert run1.state == RunState.RUNNING
        cpf.succeed_run(run1.id)
        assert run1.state == RunState.SUCCEEDED

        clock.advance(5)  # всё ещё в пределах TTL
        run2, is_new, reason = idem.create_run("pipe-1", "abc", "c1")

        assert is_new is True
        assert reason == REASON_RECREATED_TERMINAL
        assert run2.id != run1.id

    def test_different_inputs_hash_means_new_run(self, wired):
        """Другой inputs_hash → другой dedup_key → другой run."""
        cpf, idem, _ = wired
        run1, new1, _ = idem.create_run("pipe-1", "abc", "c1")
        run2, new2, _ = idem.create_run("pipe-1", "def", "c2")

        assert new1 and new2
        assert run1.id != run2.id
        assert len(cpf.list_runs()) == 2

    def test_ttl_expiry_ignores_even_active_run(self, wired):
        """TTL-окно истекло → активный run старше окна не блокирует create."""
        cpf, idem, clock = wired
        run1, _, _ = idem.create_run("pipe-1", "abc", "c1")
        assert run1.state == RunState.QUEUED  # активен, но worker'ов нет

        clock.advance(31)  # > 30 c окно
        run2, is_new, reason = idem.create_run("pipe-1", "abc", "c1")

        assert is_new is True
        assert reason == REASON_RECREATED_TTL
        assert run2.id != run1.id

    def test_ttl_boundary_30s_still_dedups(self, wired):
        """Ровно на границе окна (30 c) dedup ещё работает (< expires_at)."""
        cpf, idem, clock = wired
        run1, _, _ = idem.create_run("pipe-1", "abc", "c1")

        clock.advance(30)
        run2, is_new, reason = idem.create_run("pipe-1", "abc", "c1")

        assert is_new is False
        assert run2.id == run1.id


class TestDedupKey:
    def test_dedup_key_stable(self):
        assert compute_dedup_key("pipe-1", "abc") == compute_dedup_key("pipe-1", "abc")

    def test_dedup_key_distinct(self):
        assert compute_dedup_key("pipe-1", "abc") != compute_dedup_key("pipe-1", "xyz")
        assert compute_dedup_key("pipe-1", "abc") != compute_dedup_key("pipe-2", "abc")

    def test_dedup_key_is_sha256_prefix(self):
        key = compute_dedup_key("pipe-1", "abc")
        assert len(key) == 32
        int(key, 16)  # hex


class TestDedupStore:
    def test_store_put_get_and_ttl_expiry(self):
        clock = FakeClock()
        store = DedupStore(clock=clock.time)
        store.put("k1", "run-1", ttl_s=30)

        assert store.get("k1") is not None
        clock.advance(31)
        assert store.get("k1") is None  # просрочена и вычищена
        assert len(store) == 0

    def test_store_correlation_index(self):
        clock = FakeClock()
        store = DedupStore(clock=clock.time)
        store.put("k1", "run-1", correlation_id="c1")

        entry = store.find_by_correlation("c1")
        assert entry is not None
        assert entry.run_id == "run-1"
        clock.advance(31)
        assert store.find_by_correlation("c1") is None  # истекла вместе с ключом

    def test_store_sweep(self):
        clock = FakeClock()
        store = DedupStore(clock=clock.time)
        store.put("k1", "run-1", ttl_s=10)
        store.put("k2", "run-2", ttl_s=100)

        clock.advance(11)
        assert store.sweep() == 1
        assert store.get("k1") is None
        assert store.get("k2") is not None
