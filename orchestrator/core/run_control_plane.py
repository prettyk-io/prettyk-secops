# -*- coding: utf-8 -*-
"""RUN-CTL: Run Control Plane — ядро жизненного цикла запуска.

Спецификация: docs/research/2026-08-27-system-layers-health-run-ctl-backlog.md (§ RUN-CTL).

Чистое ядро без I/O (нет subprocess/файлов/сети) — тестируемо напрямую.
Отвечает за:
  RUN-CTL-1 — модель жизненного цикла (queued→running→succeeded/failed/cancelled)
              с атомарными переходами и историей состояний;
  RUN-CTL-2 — защита от дублирования (идемпотентный create по dedup_key);
  RUN-CTL-3 — FIFO-очередь с видимой позицией и глобальным лимитом;
  RUN-CTL-4 — назначение запуска подходящему worker'у по capabilities;
  RUN-CTL-5 — worker lease + heartbeat + обнаружение зависших (> timeout);
  RUN-CTL-6 — автоматический retry с классификацией (инфра → повтор,
              валидация/target → мгновенный fail).

Архитектурная граница: это НЕ Cosmoport run_model (batch/pipeline) и НЕ
lab_run (single-flight subprocess). Это системный слой «запуск как управляемая
сущность», к которому подключаются раннеры.
"""
from __future__ import annotations

import hashlib
import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


# ── Состояния жизненного цикла (RUN-CTL-1) ──

class RunState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


# Атомарные переходы: нельзя «застрять» между состояниями.
# RUNNING → QUEUED разрешён: retry/requeue после infra-отказа или зависшего lease.
_VALID_TRANSITIONS: dict[RunState, frozenset[RunState]] = {
    RunState.QUEUED: frozenset({RunState.RUNNING, RunState.CANCELLED}),
    RunState.RUNNING: frozenset({RunState.SUCCEEDED, RunState.FAILED, RunState.CANCELLED, RunState.QUEUED}),
    RunState.SUCCEEDED: frozenset(),
    RunState.FAILED: frozenset(),
    RunState.CANCELLED: frozenset(),
}

_TERMINAL = frozenset({RunState.SUCCEEDED, RunState.FAILED, RunState.CANCELLED})


# ── Классификация отказов (RUN-CTL-6) ──

class FailureClass(str, Enum):
    INFRA = "infra"           # сеть/worker/таймаут → автоматический повтор
    VALIDATION = "validation" # ошибка манифеста → мгновенный fail
    TARGET = "target"         # target недоступен → мгновенный fail


@dataclass
class RunRecord:
    id: str
    dedup_key: str
    state: RunState = RunState.QUEUED
    capabilities: frozenset[str] = frozenset()
    worker_id: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    history: list[tuple[str, float, str]] = field(default_factory=list)
    attempt: int = 1
    failure_class: Optional[FailureClass] = None
    error: Optional[str] = None

    @property
    def is_terminal(self) -> bool:
        return self.state in _TERMINAL


@dataclass
class Worker:
    id: str
    capabilities: frozenset[str] = frozenset()
    busy: bool = False
    current_run_id: Optional[str] = None
    lease_expires_at: Optional[float] = None
    last_heartbeat: float = field(default_factory=time.time)


# ── Run Control Plane ──

class RunControlPlane:
    """Управляемый жизненный цикл запусков + очередь + workers."""

    def __init__(
        self,
        max_concurrent: int = 1,
        lease_timeout_sec: float = 60.0,
        max_retries: int = 3,
        clock: Any = time.time,
    ) -> None:
        self._max_concurrent = max_concurrent
        self._lease_timeout_sec = lease_timeout_sec
        self._max_retries = max_retries
        self._clock = clock

        self._lock = threading.RLock()
        self._runs: dict[str, RunRecord] = {}
        self._workers: dict[str, Worker] = {}
        self._queue: list[str] = []  # run_id в порядке FIFO

    # ── RUN-CTL-1: жизненный цикл + атомарные переходы ──

    def _transition(self, run: RunRecord, target: RunState) -> None:
        """Атомарный переход с валидацией. Нельзя застрять между состояниями."""
        allowed = _VALID_TRANSITIONS[run.state]
        if target not in allowed:
            raise ValueError(
                f"Invalid transition: {run.state.value} → {target.value} "
                f"(run {run.id})"
            )
        run.history.append((run.state.value, self._clock(), target.value))
        run.state = target

    def register_worker(self, worker_id: str, capabilities: frozenset[str] | None = None) -> Worker:
        with self._lock:
            w = Worker(id=worker_id, capabilities=capabilities or frozenset())
            self._workers[worker_id] = w
            return w

    # ── RUN-CTL-2: защита от дублирования (идемпотентный create) ──

    @staticmethod
    def _dedup_key(params: dict[str, Any]) -> str:
        """Стабильный ключ из параметров запуска (порядок-независимый)."""
        canonical = json_dumps_sorted(params)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]

    def create_run(
        self,
        params: dict[str, Any],
        capabilities: frozenset[str] | None = None,
    ) -> tuple[RunRecord, bool]:
        """Идемпотентно создать запуск. Возвращает (run, is_new).

        Если активный (не terminal) run с тем же dedup_key уже существует —
        возвращает его, не создавая дубль.
        """
        key = self._dedup_key(params)
        with self._lock:
            for existing in self._runs.values():
                if existing.dedup_key == key and not existing.is_terminal:
                    return existing, False

            run = RunRecord(
                id=f"run-{uuid.uuid4().hex[:12]}",
                dedup_key=key,
                capabilities=capabilities or frozenset(),
            )
            self._runs[run.id] = run
            self._queue.append(run.id)
            self._dispatch()
            return run, True

    # ── RUN-CTL-3: FIFO-очередь + позиция ──

    def queue_position(self, run_id: str) -> int | None:
        """Позиция запуска в очереди (0 = первый). None — не в очереди."""
        with self._lock:
            if run_id not in self._queue:
                return None
            return self._queue.index(run_id)

    def queue_length(self) -> int:
        with self._lock:
            return len(self._queue)

    # ── RUN-CTL-4: назначение по capabilities ──

    def _worker_fits(self, worker: Worker, caps: frozenset[str]) -> bool:
        if not caps:
            return True
        return caps.issubset(worker.capabilities)

    def _find_free_worker(self, caps: frozenset[str]) -> Worker | None:
        for w in self._workers.values():
            if not w.busy and self._worker_fits(w, caps):
                return w
        return None

    def _active_workers(self) -> int:
        return sum(1 for w in self._workers.values() if w.busy)

    def _dispatch(self) -> None:
        """Назначить очередь свободным worker'ам (FIFO)."""
        while self._queue and self._active_workers() < self._max_concurrent:
            run_id = self._queue[0]
            run = self._runs[run_id]
            worker = self._find_free_worker(run.capabilities)
            if worker is None:
                # Нет подходящего свободного worker'а — ждём
                return
            self._queue.pop(0)
            self._assign(run, worker)

    def _assign(self, run: RunRecord, worker: Worker) -> None:
        self._transition(run, RunState.RUNNING)
        run.worker_id = worker.id
        run.started_at = self._clock()
        worker.busy = True
        worker.current_run_id = run.id
        worker.last_heartbeat = self._clock()
        worker.lease_expires_at = self._clock() + self._lease_timeout_sec

    # ── RUN-CTL-5: lease + heartbeat + обнаружение зависших ──

    def heartbeat(self, worker_id: str) -> None:
        """Worker подтверждает, что жив."""
        with self._lock:
            w = self._workers.get(worker_id)
            if w is None:
                return
            w.last_heartbeat = self._clock()
            w.lease_expires_at = self._clock() + self._lease_timeout_sec

    def detect_stale(self) -> list[str]:
        """Запуски, чей worker замолчал > lease_timeout → «зависшие».

        Возвращает id зависших запусков; worker освобождается, run возвращается
        в очередь на повтор (RUN-CTL-6, infra-класс), если есть попытки.
        """
        with self._lock:
            now = self._clock()
            stale: list[str] = []
            for w in self._workers.values():
                if not w.busy or w.lease_expires_at is None:
                    continue
                if now >= w.lease_expires_at:
                    run_id = w.current_run_id
                    if run_id and run_id in self._runs:
                        stale.append(run_id)
                        run = self._runs[run_id]
                        # Освобождаем worker
                        w.busy = False
                        w.current_run_id = None
                        w.lease_expires_at = None
                        # Возвращаем run на повтор (infra), либо финалим как failed
                        self._release_stale_run(run)
            return stale

    def _release_stale_run(self, run: RunRecord) -> None:
        run.worker_id = None
        run.started_at = None
        if run.attempt < self._max_retries:
            run.attempt += 1
            self._transition(run, RunState.QUEUED)
            self._queue.append(run.id)
        else:
            run.failure_class = FailureClass.INFRA
            run.error = "worker stale (lease expired)"
            run.finished_at = self._clock()
            self._transition(run, RunState.FAILED)

    # ── RUN-CTL-6: retry с классификацией ──

    def fail_run(self, run_id: str, failure_class: FailureClass, error: str = "") -> None:
        """Завершить запуск с ошибкой. Инфра-отказ → повтор (до max_retries)."""
        with self._lock:
            run = self._runs.get(run_id)
            if run is None or run.is_terminal:
                return
            run.failure_class = failure_class
            run.error = error
            # Освободить worker, если назначен
            self._release_worker(run)

            if failure_class == FailureClass.INFRA and run.attempt < self._max_retries:
                run.attempt += 1
                run.started_at = None
                self._transition(run, RunState.QUEUED)
                self._queue.append(run.id)
            else:
                run.finished_at = self._clock()
                self._transition(run, RunState.FAILED)
            self._dispatch()

    def succeed_run(self, run_id: str) -> None:
        """Завершить запуск успешно."""
        with self._lock:
            run = self._runs.get(run_id)
            if run is None or run.is_terminal:
                return
            self._release_worker(run)
            run.finished_at = self._clock()
            self._transition(run, RunState.SUCCEEDED)
            self._dispatch()

    def cancel_run(self, run_id: str) -> None:
        """Отменить запуск (и в очереди, и во время выполнения)."""
        with self._lock:
            run = self._runs.get(run_id)
            if run is None or run.is_terminal:
                return
            if run.state == RunState.QUEUED:
                # Ещё в очереди — worker не получает задачу
                try:
                    self._queue.remove(run_id)
                except ValueError:
                    pass
                self._transition(run, RunState.CANCELLED)
            elif run.state == RunState.RUNNING:
                self._release_worker(run)
                run.finished_at = self._clock()
                self._transition(run, RunState.CANCELLED)
            self._dispatch()

    def _release_worker(self, run: RunRecord) -> None:
        if run.worker_id:
            w = self._workers.get(run.worker_id)
            if w is not None:
                w.busy = False
                w.current_run_id = None
                w.lease_expires_at = None
            run.worker_id = None

    # ── Чтение ──

    def get_run(self, run_id: str) -> RunRecord | None:
        with self._lock:
            return self._runs.get(run_id)

    def list_runs(self) -> list[RunRecord]:
        with self._lock:
            return list(self._runs.values())

    def find_by_dedup_key(self, params: dict[str, Any]) -> RunRecord | None:
        key = self._dedup_key(params)
        with self._lock:
            for r in self._runs.values():
                if r.dedup_key == key:
                    return r
        return None

    def start_tracking_run(self, run_id: str) -> None:
        """WIRE-RUNCTL: перевести QUEUED→RUNNING без worker dispatch.
 
        Используется когда subprocess уже спавнится напрямую (start_run)
        и worker/lease механика не нужна.
        """
        with self._lock:
            run = self._runs.get(run_id)
            if run is None or run.state != RunState.QUEUED:
                return
            run.started_at = self._clock()
            self._transition(run, RunState.RUNNING)


# ── Стабильная канонизация параметров для dedup_key ──

def json_dumps_sorted(obj: Any) -> str:
    """Рекурсивная канонизация dict → строка с отсортированными ключами."""
    import json

    def canonical(value: Any) -> Any:
        if isinstance(value, dict):
            return {k: canonical(v) for k, v in sorted(value.items())}
        if isinstance(value, (list, tuple)):
            return [canonical(v) for v in value]
        if isinstance(value, set):
            return sorted(canonical(v) for v in value)
        return value

    return json.dumps(canonical(obj), ensure_ascii=False, sort_keys=True, default=str)
