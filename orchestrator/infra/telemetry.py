"""
TELEMETRY-1/2/3: Сквозная идентификация, структурированные логи, метрики.

TELEMETRY-1: ID-цепочка run → attempt → step → worker → artifact
TELEMETRY-2: Структурированные логи с контекстом run (фильтр по run_id)
TELEMETRY-3: Базовые метрики (активные/очередь/worker'ы/ошибки)
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from collections import defaultdict
from threading import Lock


# ═══════════════════════════════════════════════════════════════════════
# TELEMETRY-1: ID-цепочка
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class RunTrace:
    """Сквозной контекст идентификаторов для одного запуска."""
    run_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    attempt: int = 1
    worker_id: str = ""
    step_id: str = ""
    artifact_ref: str = ""

    def child_attempt(self) -> "RunTrace":
        return RunTrace(
            run_id=self.run_id,
            attempt=self.attempt + 1,
            worker_id=self.worker_id,
        )

    def with_step(self, step_id: str) -> "RunTrace":
        self.step_id = step_id
        return self

    def with_artifact(self, ref: str) -> "RunTrace":
        self.artifact_ref = ref
        return self

    def as_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "attempt": self.attempt,
            "worker_id": self.worker_id,
            "step_id": self.step_id,
            "artifact_ref": self.artifact_ref,
        }


# ═══════════════════════════════════════════════════════════════════════
# TELEMETRY-2: Структурированные логи с контекстом run
# ═══════════════════════════════════════════════════════════════════════

class RunLogger:
    """Логгер, добавляющий run_id/attempt/step_id в каждую запись.

    Использует стандартный logging.Logger, дополняя extra-полями контекст запуска.
    Фильтрация по run_id возможна через grep/json-парсинг структурированных строк.
    """

    _instances: dict[str, "RunLogger"] = {}
    _lock = Lock()

    def __init__(self, run_id: str, base_logger: logging.Logger | None = None):
        self.run_id = run_id
        self._logger = base_logger or logging.getLogger(f"run.{run_id}")
        self._trace = RunTrace(run_id=run_id)

    @classmethod
    def for_run(cls, run_id: str, base_name: str = "orchestrator") -> "RunLogger":
        with cls._lock:
            if run_id not in cls._instances:
                cls._instances[run_id] = RunLogger(run_id, logging.getLogger(base_name))
            return cls._instances[run_id]

    def _format(self, level: str, msg: str, **extra) -> str:
        data = {
            "run_id": self._trace.run_id,
            "attempt": self._trace.attempt,
            "step_id": self._trace.step_id or None,
            "worker_id": self._trace.worker_id or None,
            "level": level,
            "message": msg,
        }
        data.update(extra)
        return json.dumps(data, ensure_ascii=False, default=str)

    def info(self, msg: str, **extra) -> None:
        self._logger.info(self._format("INFO", msg, **extra))

    def warning(self, msg: str, **extra) -> None:
        self._logger.warning(self._format("WARN", msg, **extra))

    def error(self, msg: str, **extra) -> None:
        self._logger.error(self._format("ERROR", msg, **extra))

    def debug(self, msg: str, **extra) -> None:
        self._logger.debug(self._format("DEBUG", msg, **extra))

    def set_attempt(self, n: int) -> None:
        self._trace.attempt = n

    def set_step(self, step_id: str) -> None:
        self._trace.step_id = step_id

    def set_worker(self, worker_id: str) -> None:
        self._trace.worker_id = worker_id


# ═══════════════════════════════════════════════════════════════════════
# TELEMETRY-3: Базовые метрики
# ═══════════════════════════════════════════════════════════════════════

class RunMetrics:
    """Потокобезопасный сбор метрик в памяти (без внешней БД).

    Возвращает: активные/очередь/живые worker'ы/ошибки за период.
    """

    def __init__(self, window_s: float = 3600.0):
        self._lock = Lock()
        self._window_s = window_s
        self._active_runs: set[str] = set()
        self._queued_runs: set[str] = set()
        self._live_workers: set[str] = set()
        self._error_count: int = 0
        self._errors: list[dict] = []  # (timestamp, run_id, error)
        self._start_time = time.time()

    def run_started(self, run_id: str) -> None:
        with self._lock:
            self._queued_runs.discard(run_id)
            self._active_runs.add(run_id)

    def run_queued(self, run_id: str) -> None:
        with self._lock:
            self._queued_runs.add(run_id)

    def run_completed(self, run_id: str) -> None:
        with self._lock:
            self._active_runs.discard(run_id)
            self._queued_runs.discard(run_id)

    def worker_online(self, worker_id: str) -> None:
        with self._lock:
            self._live_workers.add(worker_id)

    def worker_offline(self, worker_id: str) -> None:
        with self._lock:
            self._live_workers.discard(worker_id)

    def record_error(self, run_id: str, error: str) -> None:
        now = time.time()
        with self._lock:
            self._error_count += 1
            self._errors.append({"ts": now, "run_id": run_id, "error": str(error)[:200]})
            # Сохраняем ошибки только за окно
            cutoff = now - self._window_s
            self._errors = [e for e in self._errors if e["ts"] > cutoff]

    def snapshot(self) -> dict:
        """Снять метрики в машиночитаемом формате."""
        now = time.time()
        with self._lock:
            cutoff = now - self._window_s
            recent_errors = [e for e in self._errors if e["ts"] > cutoff]
            return {
                "timestamp": now,
                "uptime_s": round(now - self._start_time, 1),
                "active_runs": len(self._active_runs),
                "queue_depth": len(self._queued_runs),
                "live_workers": len(self._live_workers),
                "total_errors": self._error_count,
                "errors_last_hour": len(recent_errors),
                "window_s": self._window_s,
            }

    def as_json(self) -> str:
        return json.dumps(self.snapshot(), ensure_ascii=False)


# Глобальные синглтоны для Playground
_global_metrics = RunMetrics()
_global_traces: dict[str, RunTrace] = {}


def get_metrics() -> RunMetrics:
    return _global_metrics


def trace_for_run(run_id: str) -> RunTrace:
    if run_id not in _global_traces:
        _global_traces[run_id] = RunTrace(run_id=run_id)
    return _global_traces[run_id]