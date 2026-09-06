# -*- coding: utf-8 -*-
"""RUN-CTL-3: FIFO-очередь запусков (Run Control Plane).

Два бэкенда по профилю развёртывания (infra/profiles.py, не изменяется):

  Pure Box   — collections.deque, in-memory, без внешних зависимостей.
               Очередь живёт в процессе pk-control.

  Enterprise — Valkey List: RPUSH (enqueue, хвост) / LPOP (dequeue, голова).
               Атомарное извлечение с страховкой: LMOVE queue → backup
               (LEFT→LEFT); при недоступности LMOVE в клиенте —
               LPOP + RPUSH в backup (неатомарно, деградация задокументирована).
               Элементы, застрявшие в backup после сбоя/рестарта, возвращаются
               в очередь recover_from_backup() — очередь не теряется.

Переходы состояний (QUEUED при enqueue, RUNNING при dequeue) выполняются
через инжектируемые колбэки on_enqueue / on_dequeue — при интеграции туда
подключается RunStore.transition (контракт Boss, run_state.py). Модуль
сам RunStore не импортирует и не реализует.
"""
from __future__ import annotations

from collections import deque
from typing import Any, Callable, List, Optional, Protocol

from infra.profiles import is_pure_box


# ── Контракт бэкенда ──


class QueueBackend(Protocol):
    """Минимальный контракт бэкенда очереди (FIFO: голова = старейший)."""

    def enqueue(self, run_id: str) -> None: ...

    def dequeue(self) -> Optional[str]: ...

    def peek(self) -> Optional[str]: ...

    def remove(self, run_id: str) -> bool: ...

    def depth(self) -> int: ...

    def items(self) -> List[str]: ...


# ── Pure Box: in-memory ──


class InMemoryQueueBackend:
    """collections.deque без внешних зависимостей (Pure Box).

    enqueue — append (хвост), dequeue — popleft (голова): строгий FIFO.
    Дополнительный set для O(1)-проверок и корректного remove из середины.
    """

    def __init__(self) -> None:
        self._queue: deque[str] = deque()
        self._members: set[str] = set()

    def enqueue(self, run_id: str) -> None:
        self._queue.append(run_id)
        self._members.add(run_id)

    def dequeue(self) -> Optional[str]:
        if not self._queue:
            return None
        run_id = self._queue.popleft()
        self._members.discard(run_id)
        return run_id

    def peek(self) -> Optional[str]:
        return self._queue[0] if self._queue else None

    def remove(self, run_id: str) -> bool:
        if run_id not in self._members:
            return False
        try:
            self._queue.remove(run_id)
        except ValueError:
            return False
        self._members.discard(run_id)
        return True

    def depth(self) -> int:
        return len(self._queue)

    def items(self) -> List[str]:
        return list(self._queue)


# ── Enterprise: Valkey List ──

DEFAULT_QUEUE_KEY = "cosmo:run-queue"
DEFAULT_BACKUP_KEY = "cosmo:run-queue:processing"


def _decode(value: Any) -> str:
    """Valkey возвращает bytes; redis-py-совместимые клиенты — по конфигу."""
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return str(value)


class ValkeyQueueBackend:
    """Valkey-бэкенд: RPUSH enqueue / LPOP dequeue + backup-список.

    Клиент инжектируется (valkey.Valkey / redis.Redis / тестовый double).
    Модуль не создаёт подключений сам — при старте Pure Box код не
    пытается соединяться с внешними сервисами (контракт profiles).
    """

    def __init__(
        self,
        client: Any,
        queue_key: str = DEFAULT_QUEUE_KEY,
        backup_key: str = DEFAULT_BACKUP_KEY,
    ) -> None:
        self._client = client
        self._queue_key = queue_key
        self._backup_key = backup_key

    # ── Базовые операции ──

    def enqueue(self, run_id: str) -> None:
        self._client.rpush(self._queue_key, run_id)

    def dequeue(self) -> Optional[str]:
        """Атомарно взять голову очереди и положить в backup.

        LMOVE queue backup LEFT LEFT (Redis 6.2+/Valkey). Если клиент не
        умеет LMOVE — деградация: LPOP, затем RPUSH в backup. Окно между
        LPOP и RPUSH неатомарно: при сбое элемент вернёт recover_from_backup.
        """
        try:
            moved = self._client.lmove(self._queue_key, self._backup_key, "LEFT", "LEFT")
            return _decode(moved) if moved is not None else None
        except (AttributeError, TypeError):
            pass
        popped = self._client.lpop(self._queue_key)
        if popped is None:
            return None
        run_id = _decode(popped)
        try:
            self._client.rpush(self._backup_key, run_id)
        except Exception:  # noqa: BLE001 — backup best-effort, сам pop уже состоялся
            pass
        return run_id

    def peek(self) -> Optional[str]:
        head = self._client.lrange(self._queue_key, 0, 0)
        if not head:
            return None
        return _decode(head[0])

    def remove(self, run_id: str) -> bool:
        """Удалить из очереди и/или backup (отмена во время полёта)."""
        removed = False
        try:
            if int(self._client.lrem(self._queue_key, 1, run_id)) > 0:
                removed = True
        except Exception:  # noqa: BLE001
            pass
        try:
            if int(self._client.lrem(self._backup_key, 1, run_id)) > 0:
                removed = True
        except Exception:  # noqa: BLE001
            pass
        return removed

    def depth(self) -> int:
        return int(self._client.llen(self._queue_key))

    def items(self) -> List[str]:
        raw = self._client.lrange(self._queue_key, 0, -1)
        return [_decode(v) for v in raw]

    # ── Отказоустойчивость ──

    def backup_depth(self) -> int:
        return int(self._client.llen(self._backup_key))

    def recover_from_backup(self) -> int:
        """Вернуть элементы из backup в голову очереди (после рестарта).

        Направление RIGHT→LEFT: последний извлечённый возвращается первым,
        самый ранний «зависший» оказывается головой очереди — FIFO приоритет
        самого старого восстанавливается. Для одиночного сбоя (типичный
        случай: crash между LPOP и завершением) исходный порядок
        восстанавливается точно.

        Вызывается при старте pk-control (Enterprise) до начала диспатча.
        """
        restored = 0
        while True:
            try:
                item = self._client.lmove(self._backup_key, self._queue_key, "RIGHT", "LEFT")
            except (AttributeError, TypeError):
                item = self._client.rpoplpush(self._backup_key, self._queue_key)
            if item is None:
                break
            restored += 1
        return restored


# ── Фасад очереди ──


class RunQueue:
    """RUN-CTL-3: FIFO-очередь с переходами QUEUED/RUNNING.

    Бэкенд выбирается по профилю (profiles.py, только чтение):
      * backend=... — явный (тесты, спецразвертывание);
      * Pure Box    — InMemoryQueueBackend автоматически;
      * Enterprise  — требует client (Valkey) либо готовый backend.

    on_enqueue(run_id) — переход в QUEUED (интеграция: RunStore.transition).
    on_dequeue(run_id) — переход в RUNNING.
    """

    def __init__(
        self,
        backend: Optional[QueueBackend] = None,
        client: Any = None,
        on_enqueue: Optional[Callable[[str], None]] = None,
        on_dequeue: Optional[Callable[[str], None]] = None,
        queue_key: str = DEFAULT_QUEUE_KEY,
        backup_key: str = DEFAULT_BACKUP_KEY,
    ) -> None:
        if backend is None:
            if is_pure_box():
                backend = InMemoryQueueBackend()
            elif client is not None:
                backend = ValkeyQueueBackend(client, queue_key, backup_key)
            else:
                raise ValueError(
                    "Enterprise-профиль требует Valkey client (или явный backend). "
                    "Pure Box выбирается автоматически через PK_DEPLOY_PROFILE."
                )
        self._backend: QueueBackend = backend
        self._on_enqueue = on_enqueue
        self._on_dequeue = on_dequeue

    # ── Публичный API ──

    def enqueue(self, run_id: str) -> str:
        """Поставить в хвост очереди → состояние QUEUED."""
        self._backend.enqueue(run_id)
        if self._on_enqueue is not None:
            self._on_enqueue(run_id)
        return run_id

    def dequeue(self) -> Optional[str]:
        """Взять голову очереди (FIFO) → состояние RUNNING. None — пусто."""
        run_id = self._backend.dequeue()
        if run_id is not None and self._on_dequeue is not None:
            self._on_dequeue(run_id)
        return run_id

    def peek(self) -> Optional[str]:
        """Голова очереди без извлечения."""
        return self._backend.peek()

    def remove(self, run_id: str) -> bool:
        """Удалить из очереди (отмена run'а в статусе QUEUED)."""
        return self._backend.remove(run_id)

    def depth(self) -> int:
        """Сколько run'ов сейчас в очереди."""
        return self._backend.depth()

    def items(self) -> List[str]:
        """Содержимое очереди в порядке FIFO (для позиции и отладки)."""
        return self._backend.items()

    def recover_from_backup(self) -> int:
        """Enterprise: вернуть «зависшие в полёте» run'ы после рестарта.

        Для in-memory бэкенда — no-op (0): backup-концепции нет.
        """
        if isinstance(self._backend, ValkeyQueueBackend):
            return self._backend.recover_from_backup()
        return 0

    # ── Диагностика ──

    @property
    def backend(self) -> QueueBackend:
        return self._backend
