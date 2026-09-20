# -*- coding: utf-8 -*-
"""RC2-1: Run Control facade — единая точка входа над RunControlPlane / queue / lease / streams.

Зачем: волна 1 (RUN-CTL-1..6) дала четыре независимых in-process слоя
(`core/run_control_plane.py`, `infra/run_queue.py`, `infra/run_lease.py`,
`infra/run_streams.py`). Каждый можно обновить отдельно — и тогда слои
расходятся: очередь содержит run, которого нет в ядре; lease жив, а run
терминален; задание лежит в stream, хотя run завершён. Этот фасад —
единственный публичный вход: caller НЕ трогает слои напрямую.

Модель согласованности («без рассинхрона»):
  * `RunControlPlane` (ядро) — АВТОРИТЕТ. Атомарные переходы, FIFO-очередь,
    capability-dispatch, worker lease/heartbeat, retry-классификация уже
    реализованы в ядре (RUN-CTL-1..6).
  * Остальные слои — ПРОЕКЦИИ. После каждой мутации фасад внутри одного
    лока пересчитывает проекции всех слоёв из авторитетного RunRecord.
    Проекции идемпотентны, поэтому повторный проход ничего не ломает.
  * `consistency_report()` сверяет слои и возвращает расхождения;
    `assert_consistent()` бросает `FacadeError`, если контур разошёлся.

Опциональные коллабораторы (dependency injection; None = слой не подключён):
  * `queue`      — durable-зеркало очереди (`infra/run_queue.RunQueue`);
  * `dispatcher` — зеркало реестра worker'ов (`infra/run_dispatch.RunDispatcher`);
  * `lease`      — sync-адаптер durable lease (register/heartbeat/sweep);
  * `streams`    — транспорт заданий (`infra/run_streams.RunStreamCoordinator`);
  * `metrics`    — наблюдаемость (`infra/telemetry.RunMetrics`, RC2-2);
  * `telemetry`  — сквозная корреляция run→attempt→step→worker→artifact
                   (`infra/telemetry.RunTelemetryHub`, RC2-2);
  * `dedup_store`— дедуп на API-границе (`infra/run_idempotency.DedupStore`);
  * `durations`  — ETA позиции в очереди (`infra/run_queue_position.DurationTracker`);
  * `retry`      — классификация исключений (`infra/retry_policy.RetryPolicy`).

Границы RC2-1 (осознанные):
  * PostgreSQL `RunStore` не подключается per-transition: его замороженная
    таблица переходов запрещает RUNNING→QUEUED (см. test_run_state_machine),
    а retry ядра переиспользует run_id с ростом `attempt`. Durable-персистентность
    попыток — отдельный follow-up (attempt-row projection).
  * `RunLeaseBridge` асинхронный; фасад работает синхронно и принимает
    sync-адаптер (обёртка над мостом) — так контур остаётся тестируемым без loop'а.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any, Optional

from core.run_control_plane import (
    FailureClass,
    RunControlPlane,
    RunRecord,
    RunState,
)
from infra.retry_policy import ErrorClass, RetryPolicy
from infra.run_idempotency import RunIdempotency
from infra.run_queue_position import DurationTracker


_TERMINAL = frozenset({RunState.SUCCEEDED, RunState.FAILED, RunState.CANCELLED})

# ErrorClass (классификация исключения) → FailureClass (ядро).
# UNKNOWN — fail-closed: не повторяем, поэтому идёт в VALIDATION-ведро.
_ERROR_TO_FAILURE: dict[ErrorClass, FailureClass] = {
    ErrorClass.INFRASTRUCTURE: FailureClass.INFRA,
    ErrorClass.VALIDATION: FailureClass.VALIDATION,
    ErrorClass.TARGET: FailureClass.TARGET,
    ErrorClass.UNKNOWN: FailureClass.VALIDATION,
}


class FacadeError(RuntimeError):
    """Базовое нарушение контракта фасада."""


class FacadeProjectionError(FacadeError):
    """Проекция слоя не применилась — контур мог разойтись."""


@dataclass(frozen=True)
class RunView:
    """Единый операторский вид запуска (проекция авторитетного RunRecord)."""

    run_id: str
    state: str
    attempt: int
    worker_id: Optional[str]
    capabilities: frozenset[str]
    created_at: float
    started_at: Optional[float]
    finished_at: Optional[float]
    error: Optional[str]
    failure_class: Optional[str]
    queue_position: Optional[int]

    @property
    def is_terminal(self) -> bool:
        return self.state in {s.value for s in _TERMINAL}

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "state": self.state,
            "attempt": self.attempt,
            "worker_id": self.worker_id,
            "capabilities": sorted(self.capabilities),
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "error": self.error,
            "failure_class": self.failure_class,
            "queue_position": self.queue_position,
        }


class RunControlFacade:
    """Единственный публичный API жизненного цикла запуска."""

    def __init__(
        self,
        plane: Optional[RunControlPlane] = None,
        *,
        queue: Any = None,
        dispatcher: Any = None,
        lease: Any = None,
        streams: Any = None,
        stream_name: str = "runs",
        stream_group: str = "run-workers",
        metrics: Any = None,
        durations: Optional[DurationTracker] = None,
        telemetry: Any = None,
        dedup_store: Any = None,
        dedup_ttl_s: float = 30.0,
        retry: Optional[RetryPolicy] = None,
    ) -> None:
        self._plane = plane if plane is not None else RunControlPlane()
        self._queue = queue
        self._dispatcher = dispatcher
        self._lease = lease
        self._streams = streams
        self._stream_name = stream_name
        self._stream_group = stream_group
        self._metrics = metrics
        self._telemetry = telemetry
        self._durations = durations if durations is not None else DurationTracker()
        self._retry = retry if retry is not None else RetryPolicy()
        self._idem_params: Optional[dict[str, Any]] = None
        self._idem_caps: frozenset[str] = frozenset()
        self._idempotency: Optional[RunIdempotency] = (
            RunIdempotency(
                run_factory=self._idempotent_factory,
                run_resolver=self._plane.get_run,
                store=dedup_store,
                ttl_s=dedup_ttl_s,
            )
            if dedup_store is not None
            else None
        )

        self._lock = threading.RLock()
        self._stream_msg: dict[str, str] = {}       # run_id → message id
        self._lease_registered: set[str] = set()
        self._last_state: dict[str, str] = {}       # run_id → спроецированное состояние
        self._duration_recorded: set[str] = set()
        self._projection_errors: list[str] = []

    # ── Worker'ы ────────────────────────────────────────────────────

    def register_worker(
        self,
        worker_id: str,
        capabilities: Optional[frozenset[str] | set[str]] = None,
    ) -> None:
        """Зарегистрировать worker и немедленно раздать ожидающие задания."""
        caps = frozenset(capabilities) if capabilities else frozenset()
        with self._lock:
            self._plane.register_worker(worker_id, caps)
            if self._dispatcher is not None:
                self._dispatcher.registry.register(worker_id, set(caps))
            if self._metrics is not None:
                self._metrics.worker_online(worker_id)
            self._plane.dispatch_pending()
            self._project_all()

    # ── Создание / жизненный цикл ──────────────────────────────────

    def create_run(
        self,
        params: dict[str, Any],
        capabilities: Optional[frozenset[str] | set[str]] = None,
        *,
        pipeline_id: Optional[str] = None,
        inputs_hash: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> tuple[RunView, bool]:
        """Идемпотентно создать запуск. Возвращает (view, is_new)."""
        caps = frozenset(capabilities) if capabilities else frozenset()
        with self._lock:
            if (
                self._idempotency is not None
                and pipeline_id is not None
                and inputs_hash is not None
            ):
                self._idem_params = dict(params)
                self._idem_caps = caps
                run, is_new, _reason = self._idempotency.create_run(
                    pipeline_id,
                    inputs_hash,
                    correlation_id,
                )
            else:
                run, is_new = self._plane.create_run(params, caps)
            self._project_all()
            return self._view(run.id), is_new

    def _idempotent_factory(
        self,
        pipeline_id: str,
        inputs_hash: str,
        correlation_id: Optional[str],
        dedup_key: str,
        nonce: str,
    ) -> RunRecord:
        """Фабрика для RunIdempotency: nonce в параметрах снимает дедуп ядра.

        Решение о дедупликации принимает ТОЛЬКО слой идемпотентности —
        ядро не должно «проглотить» вызов своим собственным dedup_key.
        """
        payload = dict(self._idem_params or {})
        payload["_nonce"] = nonce
        run, _ = self._plane.create_run(payload, self._idem_caps)
        return run

    def start_run(self, run_id: str) -> RunView:
        """Перевести QUEUED→RUNNING без dispatch (прямой subprocess)."""
        with self._lock:
            self._plane.start_tracking_run(run_id)
            self._project_all()
            return self._require_view(run_id)

    def succeed_run(self, run_id: str) -> RunView:
        with self._lock:
            self._plane.succeed_run(run_id)
            self._project_all()
            return self._require_view(run_id)

    def fail_run(
        self,
        run_id: str,
        failure_class: FailureClass,
        error: str = "",
    ) -> RunView:
        with self._lock:
            self._plane.fail_run(run_id, failure_class, error)
            self._project_all()
            return self._require_view(run_id)

    def fail_from_exception(self, run_id: str, exc: BaseException) -> RunView:
        """Классифицировать исключение (RetryPolicy) и завершить запуск.

        INFRASTRUCTURE → INFRA (повтор до max_retries); VALIDATION/TARGET/
        UNKNOWN → мгновенный fail без повторов.
        """
        error_class = self._retry.classify(exc)
        failure = _ERROR_TO_FAILURE.get(error_class, FailureClass.VALIDATION)
        return self.fail_run(run_id, failure, str(exc))

    def cancel_run(self, run_id: str) -> RunView:
        with self._lock:
            self._plane.cancel_run(run_id)
            self._project_all()
            return self._require_view(run_id)

    # ── Lease / heartbeat / зависшие ────────────────────────────────

    def heartbeat(self, worker_id: str) -> None:
        """Worker подтверждает жизнь: lease ядра + durable lease его run'а."""
        with self._lock:
            self._plane.heartbeat(worker_id)
            if self._lease is not None:
                for run in self._plane.list_runs():
                    if run.worker_id == worker_id and not run.is_terminal:
                        self._lease.heartbeat(run.id)
            if self._dispatcher is not None:
                self._dispatcher.registry.heartbeat(worker_id)
            self._project_all()

    def sweep_stale(self) -> list[str]:
        """Найти зависшие run'ы (lease истёк), освободить worker'ов, продолжить.

        Ядро само решает: requeue (infra-повтор) или FAILED при исчерпании
        попыток. Durable lease sweep вызывается для каждого зависшего.
        """
        with self._lock:
            stale = self._plane.detect_stale()
            if self._lease is not None:
                for run_id in stale:
                    try:
                        self._lease.sweep(run_id)
                    except Exception as exc:  # noqa: BLE001 — lease best-effort
                        self._record_projection_error(f"lease.sweep({run_id}): {exc}")
            self._plane.dispatch_pending()
            self._project_all()
            return stale

    # ── Чтение ──────────────────────────────────────────────────────

    def get(self, run_id: str) -> Optional[RunView]:
        with self._lock:
            run = self._plane.get_run(run_id)
            return self._view(run.id) if run is not None else None

    def list_runs(self) -> list[RunView]:
        with self._lock:
            return [self._view(r.id) for r in self._plane.list_runs()]

    def queue_position(self, run_id: str) -> Optional[dict[str, int]]:
        """Позиция (1 = голова) и оценка ожидания в секундах."""
        with self._lock:
            index = self._plane.queue_position(run_id)
            if index is None:
                return None
            pos = index + 1
            est_wait = int(round(pos * self._durations.mean_with_default()))
            return {
                "position": pos,
                "estimated_wait_s": est_wait,
                "pos": pos,
                "est_wait_s": est_wait,
            }

    def queue_depth(self) -> int:
        return self._plane.queue_length()

    def metrics(self) -> dict[str, Any]:
        """Машиночитаемые метрики: из RunMetrics, иначе — снимок ядра."""
        with self._lock:
            if self._metrics is not None:
                return self._metrics.snapshot()
            runs = self._plane.list_runs()
            return {
                "active_runs": sum(1 for r in runs if r.state == RunState.RUNNING),
                "queue_depth": self._plane.queue_length(),
                "live_workers": len(self._plane._workers),
                "total_errors": sum(1 for r in runs if r.state == RunState.FAILED),
            }

    # ── Согласованность слоёв ───────────────────────────────────────

    def consistency_report(self) -> list[str]:
        """Сверить проекции слоёв с авторитетным ядром. Пусто = рассинхрона нет."""
        with self._lock:
            problems = list(self._projection_errors)
            runs = {r.id: r for r in self._plane.list_runs()}
            queued = set(self._plane.queued_ids())

            if self._queue is not None:
                mirrored = set(self._queue.items())
                if mirrored != queued:
                    problems.append(
                        f"queue mirror desync: mirror={sorted(mirrored)} "
                        f"plane={sorted(queued)}"
                    )

            if self._dispatcher is not None:
                for wid, worker in self._plane._workers.items():
                    reg = self._dispatcher.registry.get(wid)
                    if reg is None:
                        problems.append(f"dispatcher missing worker {wid}")
                        continue
                    busy = reg.status == "busy"
                    if busy != worker.busy:
                        problems.append(
                            f"dispatcher desync for {wid}: "
                            f"registry_busy={busy} plane_busy={worker.busy}"
                        )

            if self._streams is not None:
                for run_id, run in runs.items():
                    has_msg = run_id in self._stream_msg
                    if not run.is_terminal and not has_msg:
                        problems.append(f"stream missing task for active run {run_id}")
                    if run.is_terminal and has_msg:
                        problems.append(f"stream not acked for terminal run {run_id}")

            if self._lease is not None:
                for run_id, run in runs.items():
                    if not run.is_terminal and run_id not in self._lease_registered:
                        problems.append(f"lease not registered for active run {run_id}")

            if self._metrics is not None:
                snap = self._metrics.snapshot()
                active = sum(1 for r in runs.values() if r.state == RunState.RUNNING)
                if snap["active_runs"] != active:
                    problems.append(
                        f"metrics active_runs={snap['active_runs']} "
                        f"plane={active}"
                    )
                if snap["queue_depth"] != len(queued):
                    problems.append(
                        f"metrics queue_depth={snap['queue_depth']} "
                        f"plane={len(queued)}"
                    )
            return problems

    def assert_consistent(self) -> None:
        problems = self.consistency_report()
        if problems:
            raise FacadeError("Run Control layers desynced: " + "; ".join(problems))

    # ── Проекции ────────────────────────────────────────────────────

    def _project_all(self) -> None:
        for run in self._plane.list_runs():
            self._project(run)

    def _project(self, run: RunRecord) -> None:
        """Пересчитать проекции одного run'а из авторитетного RunRecord."""
        try:
            self._project_metrics(run)
            self._project_telemetry(run)
            self._project_durations(run)
            self._project_queue(run)
            self._project_dispatcher(run)
            self._project_streams(run)
            self._project_lease(run)
            self._last_state[run.id] = run.state.value
        except Exception as exc:  # noqa: BLE001 — фиксируем и продолжаем, слой best-effort
            self._record_projection_error(f"project({run.id}): {exc}")

    def _project_metrics(self, run: RunRecord) -> None:
        if self._metrics is None:
            return
        prev = self._last_state.get(run.id)
        state = run.state.value
        if prev == state:
            return
        if state == RunState.QUEUED.value:
            if prev == RunState.RUNNING.value:
                # requeue после infra-отказа: снять из активных, вернуть в очередь
                self._metrics.run_completed(run.id)
            self._metrics.run_queued(run.id)
        elif state == RunState.RUNNING.value:
            self._metrics.run_started(run.id)
        elif run.is_terminal:
            self._metrics.run_completed(run.id)
            if run.state == RunState.FAILED:
                self._metrics.record_error(run.id, run.error or "")

    def _project_telemetry(self, run: RunRecord) -> None:
        """RC2-2: событие на каждый переход с run/attempt/step/worker-контекстом."""
        if self._telemetry is None:
            return
        prev = self._last_state.get(run.id)
        state = run.state.value
        if prev == state:
            return
        telemetry = self._telemetry.for_run(run.id)
        telemetry.attempt(run.attempt).worker(run.worker_id or "")
        telemetry.event(
            "run.state",
            state=state,
            previous=prev,
            attempt=run.attempt,
            failure_class=run.failure_class.value if run.failure_class else None,
            error=run.error,
        )

    def _project_durations(self, run: RunRecord) -> None:
        if run.id in self._duration_recorded:
            return
        if run.started_at is not None and run.finished_at is not None:
            self._durations.record(run.finished_at - run.started_at)
            self._duration_recorded.add(run.id)

    def _project_queue(self, run: RunRecord) -> None:
        if self._queue is None:
            return
        items = set(self._queue.items())
        if run.state == RunState.QUEUED and run.id not in items:
            self._queue.enqueue(run.id)
        elif run.state != RunState.QUEUED and run.id in items:
            self._queue.remove(run.id)

    def _project_dispatcher(self, run: RunRecord) -> None:
        if self._dispatcher is None:
            return
        registry = self._dispatcher.registry
        if run.worker_id is not None and registry.get(run.worker_id) is None:
            registry.register(run.worker_id, set())
        for wid, worker in self._plane._workers.items():
            reg = registry.get(wid)
            if reg is None:
                registry.register(wid, set(worker.capabilities))
                reg = registry.get(wid)
            wanted = "busy" if worker.busy else "idle"
            if reg is not None and reg.status != wanted and reg.status != "draining":
                registry.set_status(wid, wanted)

    def _project_streams(self, run: RunRecord) -> None:
        if self._streams is None:
            return
        if not run.is_terminal and run.id not in self._stream_msg:
            message_id = self._streams.enqueue(
                self._stream_name,
                {
                    "run_id": run.id,
                    "attempt": run.attempt,
                    "state": run.state.value,
                },
            )
            self._stream_msg[run.id] = message_id
        elif run.is_terminal and run.id in self._stream_msg:
            message_id = self._stream_msg.pop(run.id)
            self._streams.ack(self._stream_name, self._stream_group, message_id)

    def _project_lease(self, run: RunRecord) -> None:
        if self._lease is None:
            return
        if run.is_terminal:
            return
        if run.id not in self._lease_registered:
            self._lease.register(run.id)
            self._lease_registered.add(run.id)

    # ── Внутреннее ──────────────────────────────────────────────────

    def _record_projection_error(self, message: str) -> None:
        if message not in self._projection_errors:
            self._projection_errors.append(message)

    def _view(self, run_id: str) -> Optional[RunView]:
        run = self._plane.get_run(run_id)
        if run is None:
            return None
        pos = self._plane.queue_position(run_id)
        return RunView(
            run_id=run.id,
            state=run.state.value,
            attempt=run.attempt,
            worker_id=run.worker_id,
            capabilities=run.capabilities,
            created_at=run.created_at,
            started_at=run.started_at,
            finished_at=run.finished_at,
            error=run.error,
            failure_class=run.failure_class.value if run.failure_class else None,
            queue_position=(pos + 1) if pos is not None else None,
        )

    def _require_view(self, run_id: str) -> RunView:
        view = self._view(run_id)
        if view is None:
            raise FacadeError(f"unknown run: {run_id}")
        return view

    # ── Диагностика ─────────────────────────────────────────────────

    @property
    def plane(self) -> RunControlPlane:
        """Доступ к ядру только для чтения/тестов; мутации — через фасад."""
        return self._plane

    @property
    def telemetry(self) -> Any:
        """Хаб телеметрии (RC2-2) или None, если слой не подключён."""
        return self._telemetry

    def trace(self, run_id: str) -> Optional[dict[str, Any]]:
        """Сквозной контекст запуска (run/attempt/step/worker/artifact)."""
        if self._telemetry is None:
            return None
        return self._telemetry.for_run(run_id).trace_dict()

    def artifacts(self, run_id: str) -> list[Any]:
        """Артефакты запуска с корреляцией run→attempt→step→worker."""
        if self._telemetry is None:
            return []
        return self._telemetry.index.for_run(run_id)
