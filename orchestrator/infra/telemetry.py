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
from typing import Any, Callable


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

    def child_step(self, step_id: str) -> "RunTrace":
        """Новая ветка корреляции: тот же run/attempt/worker, новый шаг."""
        return RunTrace(
            run_id=self.run_id,
            attempt=self.attempt,
            worker_id=self.worker_id,
            step_id=step_id,
        )

    def with_worker(self, worker_id: str) -> "RunTrace":
        self.worker_id = worker_id
        return self

    def with_attempt(self, attempt: int) -> "RunTrace":
        self.attempt = int(attempt)
        return self

    def artifact_ref_for(self, name: str) -> str:
        """Канонический ``artifact://`` ref, несущий run/attempt/step.

        Схема совместима с Contract A (``is_artifact_ref``/``canonical_artifact_ref``):
        source = ``{run_id}/a{attempt}/{step}/{name}``.
        """
        step = self.step_id or "_"
        return f"artifact://{self.run_id}/a{self.attempt}/{step}/{name}"

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


# ═══════════════════════════════════════════════════════════════════════
# TELEMETRY-3 (расширение): композитный сборщик с live-источниками + TTL-кэш
# ═══════════════════════════════════════════════════════════════════════

class MetricsCollector:
    """Композиция push-метрик (RunMetrics) и live-источников с кэшем.

    TELEMETRY-3. Инжектируемые источники (callables) возвращают живое
    значение метрики из run_state / run_queue / run_dispatch / retry_policy.
    Если источник не зарегистрирован, вернул None или бросил исключение —
    используется fallback из push-счётчиков RunMetrics (Pure Box, без PG/Valkey).

    Снимок кэшируется на ``ttl_s`` (по умолчанию 30с) — /api/metrics не
    дёргает живые источники на каждый запрос.
    """

    def __init__(self, metrics: "RunMetrics | None" = None, ttl_s: float = 30.0) -> None:
        self._metrics = metrics or RunMetrics()
        self._ttl_s = ttl_s
        self._lock = Lock()
        self._sources: dict[str, Callable[[], int | None]] = {}
        self._cached: dict | None = None
        self._cached_at: float = 0.0

    def set_source(self, key: str, source: Callable[[], int | None]) -> None:
        """Зарегистрировать live-источник для метрики key."""
        self._sources[key] = source

    def _live(self, key: str, fallback: int) -> int:
        source = self._sources.get(key)
        if source is None:
            return fallback
        try:
            value = source()
        except Exception:
            return fallback
        if isinstance(value, int) and value >= 0:
            return value
        return fallback

    def snapshot(self, force: bool = False) -> dict:
        """Снять метрики. Внутри TTL возвращает кэшированный снимок."""
        now = time.time()
        if not force and self._cached is not None and (now - self._cached_at) < self._ttl_s:
            snap = dict(self._cached) if isinstance(self._cached, dict) else {}
            snap["timestamp"] = now
            return snap
        base = self._metrics.snapshot()
        merged = {
            "timestamp": now,
            "uptime_s": base.get("uptime_s", 0.0),
            "active_runs": self._live("active_runs", base["active_runs"]),
            "queue_depth": self._live("queue_depth", base["queue_depth"]),
            "live_workers": self._live("live_workers", base["live_workers"]),
            "total_errors": self._live("total_errors", base["total_errors"]),
            "errors_last_hour": self._live("errors_last_hour", base["errors_last_hour"]),
            "window_s": base.get("window_s", 3600.0),
            "refresh_ttl_s": self._ttl_s,
        }
        with self._lock:
            self._cached = merged
            self._cached_at = now
        return merged


# ═══════════════════════════════════════════════════════════════════════
# TELEMETRY-1/2: Корреляция артефактов и per-run хаб
# ═══════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class ArtifactCorrelation:
    """Артефакт, привязанный к сквозной цепочке запуска."""

    ref: str
    run_id: str
    attempt: int
    step_id: str
    worker_id: str
    name: str


class ArtifactIndex:
    """Индекс артефактов по run_id и каноническому ref.

    Гарантия TELEMETRY-1: артефакт не «висит в воздухе» — всегда известно,
    к какому run/attempt/step/worker он относится.
    """

    def __init__(self) -> None:
        self._by_ref: dict[str, ArtifactCorrelation] = {}
        self._by_run: dict[str, list[ArtifactCorrelation]] = defaultdict(list)
        self._lock = Lock()

    def record(self, trace: RunTrace, name: str) -> ArtifactCorrelation:
        ref = trace.artifact_ref_for(name)
        correlation = ArtifactCorrelation(
            ref=ref,
            run_id=trace.run_id,
            attempt=trace.attempt,
            step_id=trace.step_id,
            worker_id=trace.worker_id,
            name=name,
        )
        with self._lock:
            self._by_ref[ref] = correlation
            self._by_run[trace.run_id].append(correlation)
        return correlation

    def get(self, ref: str) -> ArtifactCorrelation | None:
        with self._lock:
            return self._by_ref.get(ref)

    def for_run(self, run_id: str) -> list[ArtifactCorrelation]:
        with self._lock:
            return list(self._by_run.get(run_id, []))

    def clear(self) -> None:
        with self._lock:
            self._by_ref.clear()
            self._by_run.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._by_ref)


class RunTelemetry:
    """Сквозной контекст одного запуска: trace + структурированный лог + артефакты.

    События пишутся через RunLogger: каждая запись несёт run_id/attempt/
    step_id/worker_id, поэтому логи фильтруются по конкретному запуску.
    """

    def __init__(
        self,
        run_id: str,
        *,
        base_logger: logging.Logger | None = None,
        metrics: "RunMetrics | None" = None,
        index: ArtifactIndex | None = None,
    ) -> None:
        self.run_id = run_id
        self.trace = RunTrace(run_id=run_id)
        self._logger = RunLogger(run_id, base_logger)
        self._metrics = metrics
        self._index = index if index is not None else ArtifactIndex()

    # ── Привязка контекста (fluent) ──

    def attempt(self, n: int) -> "RunTelemetry":
        self.trace.with_attempt(n)
        self._logger.set_attempt(int(n))
        return self

    def worker(self, worker_id: str) -> "RunTelemetry":
        self.trace.with_worker(worker_id or "")
        self._logger.set_worker(worker_id or "")
        return self

    def step(self, step_id: str) -> "RunTelemetry":
        self.trace.with_step(step_id)
        self._logger.set_step(step_id)
        return self

    # ── Артефакты ──

    def artifact(self, name: str) -> str:
        """Зарегистрировать артефакт в цепочке и вернуть канонический ref."""
        correlation = self._index.record(self.trace, name)
        self.trace.artifact_ref = correlation.ref
        return correlation.ref

    # ── Логи ──

    def event(self, event: str, message: str = "", level: str = "INFO", **fields) -> dict:
        """Структурированное событие с run-контекстом (extra-поля в записи)."""
        payload = {"event": event, **fields}
        text = message or event
        if level == "ERROR":
            self._logger.error(text, **payload)
        elif level == "WARN":
            self._logger.warning(text, **payload)
        elif level == "DEBUG":
            self._logger.debug(text, **payload)
        else:
            self._logger.info(text, **payload)
        return {"run_id": self.run_id, **self.trace.as_dict(), **payload}

    def log(self, message: str, level: str = "INFO", **fields) -> None:
        self.event("log", message=message, level=level, **fields)

    def trace_dict(self) -> dict:
        return self.trace.as_dict()

    @property
    def index(self) -> ArtifactIndex:
        return self._index


class RunTelemetryHub:
    """Реестр per-run RunTelemetry + общий ArtifactIndex/метрики."""

    def __init__(
        self,
        metrics: "RunMetrics | None" = None,
        base_logger: logging.Logger | None = None,
    ) -> None:
        self.index = ArtifactIndex()
        self.metrics = metrics
        self._base_logger = base_logger
        self._lock = Lock()
        self._runs: dict[str, RunTelemetry] = {}

    def for_run(self, run_id: str) -> RunTelemetry:
        with self._lock:
            telemetry = self._runs.get(run_id)
            if telemetry is None:
                telemetry = RunTelemetry(
                    run_id,
                    base_logger=self._base_logger,
                    metrics=self.metrics,
                    index=self.index,
                )
                self._runs[run_id] = telemetry
            return telemetry

    def reset(self) -> None:
        with self._lock:
            self._runs.clear()
        self.index.clear()


# Глобальные синглтоны для Playground
_global_metrics = RunMetrics()
_global_traces: dict[str, RunTrace] = {}
_global_telemetry_hub = RunTelemetryHub(metrics=_global_metrics)


def get_metrics() -> RunMetrics:
    return _global_metrics


def get_telemetry_hub() -> RunTelemetryHub:
    return _global_telemetry_hub


def trace_for_run(run_id: str) -> RunTrace:
    if run_id not in _global_traces:
        _global_traces[run_id] = RunTrace(run_id=run_id)
    return _global_traces[run_id]


# ═══════════════════════════════════════════════════════════════════════
# TELEMETRY-3: live-источники из Run Control рантайма
# ═══════════════════════════════════════════════════════════════════════

def _runtime_plane() -> Any | None:
    """Живой RunControlPlane (ядро) из lab_run, либо None (если профиль не поднял).

    Ленивый импорт — инфra-слой не тянет utils на этапе импорта модуля.
    При отсутствии плоскости (Pure Box без рантайма, тесты без lab_run)
    все проберы возвращают None → fallback на push-счётчики RunMetrics.
    """
    try:
        from utils.lab_run import _get_run_plane
        return _get_run_plane()
    except Exception:
        return None


def _probe_active_runs() -> int | None:
    plane = _runtime_plane()
    if plane is None:
        return None
    return sum(1 for r in plane.list_runs() if not r.is_terminal)


def _probe_queue_depth() -> int | None:
    plane = _runtime_plane()
    if plane is None:
        return None
    return plane.queue_length()


def _probe_live_workers() -> int | None:
    plane = _runtime_plane()
    if plane is None:
        return None
    return len(plane._workers)


def _count_failed_since(plane: Any, cutoff: float) -> int:
    n = 0
    for r in plane.list_runs():
        if r.state.value == "failed":
            if cutoff is None or (r.finished_at is not None and r.finished_at >= cutoff):
                n += 1
    return n


def _probe_total_errors() -> int | None:
    plane = _runtime_plane()
    if plane is None:
        return None
    return _count_failed_since(plane, None)


def _probe_errors_last_hour() -> int | None:
    plane = _runtime_plane()
    if plane is None:
        return None
    return _count_failed_since(plane, time.time() - 3600.0)


_system_metrics_collector: MetricsCollector | None = None
_system_metrics_lock = Lock()


def get_system_metrics() -> MetricsCollector:
    """Синглтон композитного сборщика, связанный с живым рантаймом.

    Источники: активные/очередь/worker'ы/ошибки читаются из RunControlPlane
    (авторитетный in-process рантайм run_state+run_queue+run_dispatch),
    ошибки/час — по finished_at FAILED-запусков. Без рантайма — push-счётчики
    RunMetrics (Pure Box, без PG/Valkey).
    """
    global _system_metrics_collector
    with _system_metrics_lock:
        if _system_metrics_collector is None:
            collector = MetricsCollector(metrics=_global_metrics)
            collector.set_source("active_runs", _probe_active_runs)
            collector.set_source("queue_depth", _probe_queue_depth)
            collector.set_source("live_workers", _probe_live_workers)
            collector.set_source("total_errors", _probe_total_errors)
            collector.set_source("errors_last_hour", _probe_errors_last_hour)
            _system_metrics_collector = collector
    return _system_metrics_collector


def system_metrics_snapshot(force: bool = False) -> dict:
    """Удобный шорткат: снять композитные метрики одним вызовом."""
    return get_system_metrics().snapshot(force=force)
