# -*- coding: utf-8 -*-
"""RUN-CTL-3: тесты FIFO-очереди (infra/run_queue.py + run_queue_position.py).

Acceptance-критерии пакета:
  * enqueue 3 runs → порядок сохранён; dequeue → первый зашедший первым;
  * dequeue из пустой очереди → None;
  * queue_position первого → {"pos": 1, ...}; третьего → {"pos": 3, ...};
  * queue_depth → 3;
  * Pure Box: очередь in-memory, без Valkey;
  * Enterprise: после рестарта Valkey очередь не теряется
    (извлечённое в полёте возвращается из backup-списка).

Переходы QUEUED/RUNNING проверяются через колбэки (интеграция подключит
RunStore.transition из run_state.py).
"""
from __future__ import annotations

from typing import Dict, List, Optional

import pytest

from infra.run_queue import (
    InMemoryQueueBackend,
    RunQueue,
    ValkeyQueueBackend,
)
from infra.run_queue_position import (
    DEFAULT_MEAN_DURATION_S,
    DurationTracker,
    QueuePositionService,
    queue_depth,
    queue_position,
)


# ── Тестовый double Valkey (Enterprise-контракт без реального сервера) ──


class FakeValkey:
    """Минимальный in-memory double команд RPUSH/LPOP/LMOVE/LRANGE/LREM/LLEN.

    Хранит списки строк (без bytes-энкодинга) — контракт бэкенда одинаков,
    декодирование покрывается отдельно.
    """

    def __init__(self) -> None:
        self._store: Dict[str, List[str]] = {}

    def _lst(self, key: str) -> List[str]:
        return self._store.setdefault(key, [])

    def rpush(self, key: str, value: str) -> int:
        self._lst(key).append(value)
        return len(self._lst(key))

    def lpush(self, key: str, value: str) -> int:
        self._lst(key).insert(0, value)
        return len(self._lst(key))

    def lpop(self, key: str) -> Optional[str]:
        lst = self._lst(key)
        return lst.pop(0) if lst else None

    def rpop(self, key: str) -> Optional[str]:
        lst = self._lst(key)
        return lst.pop() if lst else None

    def lmove(self, src: str, dst: str, src_dir: str, dst_dir: str) -> Optional[str]:
        s, d = self._lst(src), self._lst(dst)
        if not s:
            return None
        item = s.pop(0) if src_dir == "LEFT" else s.pop()
        if dst_dir == "LEFT":
            d.insert(0, item)
        else:
            d.append(item)
        return item

    def rpoplpush(self, src: str, dst: str) -> Optional[str]:
        item = self.rpop(src)
        if item is None:
            return None
        self.lpush(dst, item)
        return item

    def lrange(self, key: str, start: int, end: int) -> List[str]:
        lst = self._lst(key)
        stop = None if end == -1 else end + 1
        return lst[start:stop]

    def lrem(self, key: str, count: int, value: str) -> int:
        lst = self._lst(key)
        try:
            lst.remove(value)  # count=1: первое вхождение с головы
            return 1
        except ValueError:
            return 0

    def llen(self, key: str) -> int:
        return len(self._lst(key))


# ── Pure Box: in-memory, без Valkey ──


class TestPureBoxQueue:
    def test_pure_box_profile_selects_inmemory_backend(self, monkeypatch):
        """Pure Box: RunQueue без аргументов → in-memory, ноль внешних зависимостей."""
        monkeypatch.setenv("PK_DEPLOY_PROFILE", "pure-box")
        q = RunQueue()
        assert isinstance(q.backend, InMemoryQueueBackend)

    def test_fifo_order_preserved(self):
        q = RunQueue(backend=InMemoryQueueBackend())
        q.enqueue("run-1")
        q.enqueue("run-2")
        q.enqueue("run-3")

        assert q.items() == ["run-1", "run-2", "run-3"]
        assert q.dequeue() == "run-1"
        assert q.dequeue() == "run-2"
        assert q.dequeue() == "run-3"

    def test_dequeue_from_empty_returns_none(self):
        q = RunQueue(backend=InMemoryQueueBackend())
        assert q.dequeue() is None
        assert q.depth() == 0

    def test_peek_does_not_remove(self):
        q = RunQueue(backend=InMemoryQueueBackend())
        q.enqueue("run-1")
        assert q.peek() == "run-1"
        assert q.depth() == 1
        assert q.dequeue() == "run-1"
        assert q.peek() is None

    def test_remove_from_middle(self):
        q = RunQueue(backend=InMemoryQueueBackend())
        q.enqueue("run-1")
        q.enqueue("run-2")
        q.enqueue("run-3")

        assert q.remove("run-2") is True
        assert q.items() == ["run-1", "run-3"]
        assert q.remove("run-2") is False  # уже нет — повторный remove честный

    def test_state_transition_callbacks_fire(self):
        """enqueue → QUEUED, dequeue → RUNNING (через колбэки интеграции)."""
        states: Dict[str, str] = {}
        q = RunQueue(
            backend=InMemoryQueueBackend(),
            on_enqueue=lambda rid: states.__setitem__(rid, "QUEUED"),
            on_dequeue=lambda rid: states.__setitem__(rid, "RUNNING"),
        )
        q.enqueue("run-1")
        assert states["run-1"] == "QUEUED"
        q.enqueue("run-2")
        q.dequeue()
        assert states["run-1"] == "RUNNING"
        assert states["run-2"] == "QUEUED"


# ── Позиция и глубина очереди ──


class TestQueuePosition:
    def _service(self, *run_ids: str) -> QueuePositionService:
        q = RunQueue(backend=InMemoryQueueBackend())
        for rid in run_ids:
            q.enqueue(rid)
        return QueuePositionService(q)

    def test_position_of_first(self):
        svc = self._service("run-1", "run-2", "run-3")
        pos = svc.position("run-1")
        assert pos is not None
        assert pos["pos"] == 1
        assert pos["position"] == 1
        # default mean 120 s × 1
        assert pos["est_wait_s"] == 120
        assert pos["estimated_wait_s"] == 120

    def test_position_of_third_is_360s(self):
        """Acceptance: queue_position третьего → {"pos": 3, "est_wait_s": 360}."""
        svc = self._service("run-1", "run-2", "run-3")
        pos = svc.position("run-3")
        assert pos is not None
        assert pos["pos"] == 3
        assert pos["est_wait_s"] == 360
        assert pos["estimated_wait_s"] == 360

    def test_position_unknown_run_returns_none(self):
        svc = self._service("run-1")
        assert svc.position("run-999") is None

    def test_depth_counts_all_queued(self):
        q = RunQueue(backend=InMemoryQueueBackend())
        q.enqueue("run-1")
        q.enqueue("run-2")
        q.enqueue("run-3")
        assert q.depth() == 3
        assert queue_depth(q) == 3
        q.dequeue()
        assert q.depth() == 2

    def test_estimated_wait_uses_recorded_durations(self):
        """Среднее по последним завершённым: 2 × 60 s → позиция 3 = 180 s."""
        q = RunQueue(backend=InMemoryQueueBackend())
        for rid in ("run-1", "run-2", "run-3"):
            q.enqueue(rid)
        tracker = DurationTracker()
        tracker.record(60.0)
        tracker.record(60.0)

        pos = queue_position("run-3", q, durations=tracker)
        assert pos is not None
        assert pos["pos"] == 3
        assert pos["est_wait_s"] == 180

    def test_duration_tracker_rolling_window_of_ten(self):
        tracker = DurationTracker()
        for value in (10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0, 999.0):
            tracker.record(value)
        # Окно 10: 999 вытеснил 10 → [20..100, 999]
        assert len(tracker) == 10
        assert tracker.mean() == pytest.approx(153.9)

    def test_empty_tracker_falls_back_to_default(self):
        tracker = DurationTracker()
        assert tracker.mean() is None
        assert tracker.mean_with_default() == DEFAULT_MEAN_DURATION_S == 120.0


# ── Enterprise: Valkey-бэкенд + переживание рестарта ──


class TestEnterpriseValkeyQueue:
    def test_enterprise_profile_requires_client(self, monkeypatch):
        """Enterprise без Valkey-клиента — честная ошибка, а не тихий in-memory."""
        monkeypatch.setenv("PK_DEPLOY_PROFILE", "enterprise")
        with pytest.raises(ValueError, match="Valkey client"):
            RunQueue()

    def test_valkey_backend_fifo(self, monkeypatch):
        monkeypatch.setenv("PK_DEPLOY_PROFILE", "enterprise")
        fake = FakeValkey()
        q = RunQueue(client=fake)
        assert isinstance(q.backend, ValkeyQueueBackend)

        q.enqueue("run-1")
        q.enqueue("run-2")
        q.enqueue("run-3")

        assert q.items() == ["run-1", "run-2", "run-3"]
        assert q.dequeue() == "run-1"  # FIFO: первый зашёл — первый вышел
        assert q.depth() == 2

    def test_dequeued_run_goes_to_backup(self, monkeypatch):
        """Двойной отказоустойчивый pop: извлечённое попадает в backup-список."""
        monkeypatch.setenv("PK_DEPLOY_PROFILE", "enterprise")
        fake = FakeValkey()
        q = RunQueue(client=fake)
        q.enqueue("run-1")
        q.enqueue("run-2")

        q.dequeue()
        assert fake.llen("cosmo:run-queue:processing") == 1
        assert q.backend.backup_depth() == 1

    def test_queue_survives_valkey_restart(self, monkeypatch):
        """Acceptance: рестарт Valkey → очередь не теряется.

        Сценарий: 3 run'а, один извлечён в полёте (в backup), затем
        «рестарт» — новый RunQueue на том же хранилище. recover_from_backup
        возвращает зависший run в очередь; порядок головного элемента
        (самого раннего) восстанавливается.
        """
        monkeypatch.setenv("PK_DEPLOY_PROFILE", "enterprise")
        fake = FakeValkey()
        q1 = RunQueue(client=fake)
        q1.enqueue("run-1")
        q1.enqueue("run-2")
        q1.enqueue("run-3")

        assert q1.dequeue() == "run-1"  # в полёте → backup
        assert q1.items() == ["run-2", "run-3"]

        # «Рестарт»: клиент/хранилище те же, контрол-план пересоздан.
        q2 = RunQueue(client=fake)
        assert q2.depth() == 2  # незавершённые на месте
        restored = q2.recover_from_backup()
        assert restored == 1
        assert q2.items() == ["run-1", "run-2", "run-3"]  # порядок восстановлен
        assert q2.dequeue() == "run-1"  # run-1 снова первый — FIFO честный

    def test_remove_works_across_queue_and_backup(self, monkeypatch):
        """remove достаёт run и из очереди, и из backup (отмена в полёте)."""
        monkeypatch.setenv("PK_DEPLOY_PROFILE", "enterprise")
        fake = FakeValkey()
        q = RunQueue(client=fake)
        q.enqueue("run-1")
        q.enqueue("run-2")

        flying = q.dequeue()  # run-1 → backup
        assert q.remove(flying) is True       # из backup
        assert q.remove("run-2") is True      # из очереди
        assert q.remove("run-2") is False
        assert q.depth() == 0

    def test_decode_bytes_values(self):
        """Реальный Valkey отдаёт bytes — бэкенд декодирует в str."""
        class BytesValkey(FakeValkey):
            def lrange(self, key, start, end):
                return [v.encode("utf-8") for v in super().lrange(key, start, end)]

            def lmove(self, src, dst, src_dir, dst_dir):
                item = super().lmove(src, dst, src_dir, dst_dir)
                return None if item is None else item.encode("utf-8")

        backend = ValkeyQueueBackend(BytesValkey())
        backend.enqueue("run-1")
        backend.enqueue("run-2")
        assert backend.peek() == "run-1"
        assert backend.items() == ["run-1", "run-2"]
        assert backend.dequeue() == "run-1"
