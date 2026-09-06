# RUN-CTL-4: Capability-based worker dispatch для Run Control Plane.
"""
Назначение запусков только на worker'ов с нужными capabilities.

Run с требованием «нужен Chrome + scanner» получает worker именно
с этими capabilities. Подходящий свободный worker → назначение.
Нет подходящего → run остаётся в очереди (None).

Worker сообщает свои возможности при регистрации (register).
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field, replace
from typing import Optional


# Допустимые статусы worker'а
WORKER_IDLE = "idle"
WORKER_BUSY = "busy"
WORKER_DRAINING = "draining"
WORKER_OFFLINE = "offline"
_VALID_STATUSES = {WORKER_IDLE, WORKER_BUSY, WORKER_DRAINING, WORKER_OFFLINE}


@dataclass
class WorkerCapability:
    """Worker и его возможности. Worker сам заявляет capabilities при регистрации."""
    worker_id: str
    capabilities: set[str]              # {"chrome", "scanner", "connector_ssh", ...}
    status: str = WORKER_IDLE           # idle | busy | draining | offline
    last_heartbeat: float = 0.0

    def has_all(self, required: set[str]) -> bool:
        """Есть ли у worker'а ВСЕ требуемые capabilities."""
        return required.issubset(self.capabilities)

    def is_available(self, required: set[str]) -> bool:
        """Свободен И умеет всё требуемое."""
        return self.status == WORKER_IDLE and self.has_all(required)


class WorkerRegistry:
    """Реестр worker'ов. Thread-safe.

    Worker регистрируется со своими capabilities, шлёт heartbeat,
    уходит через unregister. Dispatch ищет только idle worker'ов.
    """

    def __init__(self) -> None:
        self._workers: dict[str, WorkerCapability] = {}
        self._lock = threading.Lock()

    def register(self, worker_id: str, capabilities: set[str]) -> WorkerCapability:
        """Worker заявляет о себе. Повторная регистрация обновляет capabilities."""
        caps = {c.strip().lower() for c in capabilities if c and c.strip()}
        with self._lock:
            existing = self._workers.get(worker_id)
            if existing is not None:
                updated = replace(existing, capabilities=caps, last_heartbeat=0.0)
                self._workers[worker_id] = updated
                return updated
            w = WorkerCapability(worker_id=worker_id, capabilities=caps)
            self._workers[worker_id] = w
            return w

    def unregister(self, worker_id: str) -> bool:
        """Worker уходит. Возвращает True если был в реестре."""
        with self._lock:
            return self._workers.pop(worker_id, None) is not None

    def heartbeat(self, worker_id: str) -> bool:
        """Обновить last_heartbeat. False если worker не зарегистрирован."""
        with self._lock:
            w = self._workers.get(worker_id)
            if w is None:
                return False
            self._workers[worker_id] = replace(w, last_heartbeat=time.time())
            return True

    def set_status(self, worker_id: str, status: str) -> bool:
        """Сменить статус worker'а (idle/busy/draining/offline)."""
        if status not in _VALID_STATUSES:
            raise ValueError(f"Invalid worker status: {status!r}")
        with self._lock:
            w = self._workers.get(worker_id)
            if w is None:
                return False
            self._workers[worker_id] = replace(w, status=status)
            return True

    def list_available(self, required_caps: set[str]) -> list[WorkerCapability]:
        """Idle worker'ы, у которых есть ВСЕ required capabilities.

        Draining worker'ы новых run'ов не получают.
        """
        required = {c.strip().lower() for c in required_caps if c and c.strip()}
        with self._lock:
            return [
                w for w in self._workers.values()
                if w.is_available(required)
            ]

    def list_all(self) -> list[WorkerCapability]:
        with self._lock:
            return list(self._workers.values())

    def get(self, worker_id: str) -> Optional[WorkerCapability]:
        with self._lock:
            return self._workers.get(worker_id)


class RunDispatcher:
    """Диспетчер запусков на worker'ы.

    dispatch_run ищет подходящего idle worker'а через реестр.
    Найден → помечает busy и возвращает worker_id.
    Не найден → None (run остаётся в очереди).
    """

    def __init__(self, registry: WorkerRegistry | None = None) -> None:
        self.registry = registry or WorkerRegistry()
        self._lock = threading.Lock()
        # run_id -> worker_id (кто взял run)
        self._assignments: dict[str, str] = {}

    def dispatch_run(self, run_id: str, required_caps: set[str]) -> Optional[str]:
        """Назначить run подходящему свободному worker'у.

        Returns:
            worker_id — run назначен
            None      — подходящего worker'а нет, run ждёт в очереди
        """
        caps = {c.strip().lower() for c in required_caps if c and c.strip()}
        with self._lock:
            available = self.registry.list_available(caps)
            if not available:
                return None
            worker = available[0]
            self.registry.set_status(worker.worker_id, WORKER_BUSY)
            self._assignments[run_id] = worker.worker_id
            return worker.worker_id

    def release_run(self, run_id: str) -> Optional[str]:
        """Run завершён — вернуть worker в idle. Возвращает worker_id или None."""
        with self._lock:
            worker_id = self._assignments.pop(run_id, None)
        if worker_id and self.registry.get(worker_id) is not None:
            self.registry.set_status(worker_id, WORKER_IDLE)
        return worker_id

    def assignment_of(self, run_id: str) -> Optional[str]:
        with self._lock:
            return self._assignments.get(run_id)


# ── Module-level convenience API ──

_default_registry = WorkerRegistry()
_default_dispatcher = RunDispatcher(_default_registry)


def get_default_dispatcher() -> RunDispatcher:
    return _default_dispatcher


def register(worker_id: str, capabilities: set[str]) -> WorkerCapability:
    return _default_registry.register(worker_id, capabilities)


def dispatch_run(run_id: str, required_caps: set[str]) -> Optional[str]:
    """Run-CTL-4: назначить run worker'у с нужными capabilities."""
    return _default_dispatcher.dispatch_run(run_id, required_caps)
