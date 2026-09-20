# -*- coding: utf-8 -*-
"""RC2-2: сквозная корреляция run → attempt → step → worker → artifact.

Проверяет TELEMETRY-1/2 (DoD RC2-2):
  * артефакт/лог несёт run/step ID (цепочка не рвётся);
  * структурированные логи содержат run_id/attempt/step_id/worker_id;
  * метрика глубины очереди растёт при накоплении queued-run'ов;
  * фасад эмитит событие на каждый переход состояния.

Внешние сервисы не нужны: in-memory backend очереди, логи — captured handler.
"""
from __future__ import annotations

import json
import logging
import uuid

from contracts.studio_run_output import canonical_artifact_ref, is_artifact_ref
from core.run_control_plane import RunControlPlane
from infra.run_control_facade import RunControlFacade
from infra.run_dispatch import RunDispatcher
from infra.run_idempotency import DedupStore
from infra.run_queue import InMemoryQueueBackend, RunQueue
from infra.run_queue_position import DurationTracker
from infra.telemetry import (
    ArtifactIndex,
    RunTelemetryHub,
    RunTrace,
    get_telemetry_hub,
)


# ── Захват структурированных логов ──────────────────────────────────────────


class ListHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def make_logger() -> tuple[logging.Logger, ListHandler]:
    logger = logging.getLogger(f"test.telemetry.{uuid.uuid4().hex}")
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    handler = ListHandler()
    logger.addHandler(handler)
    return logger, handler


def payloads(handler: ListHandler) -> list[dict]:
    return [json.loads(r.getMessage()) for r in handler.records]


# ── TELEMETRY-1: artifact ref несёт цепочку ─────────────────────────────────


def test_artifact_ref_carries_run_attempt_step():
    trace = RunTrace(run_id="run-1", attempt=2, worker_id="w1", step_id="step-login")
    ref = trace.artifact_ref_for("screenshot.png")

    assert ref == "artifact://run-1/a2/step-login/screenshot.png"
    assert is_artifact_ref(ref)
    assert canonical_artifact_ref(ref) == ref


def test_artifact_ref_without_step_uses_placeholder():
    trace = RunTrace(run_id="run-2", attempt=1)
    assert trace.artifact_ref_for("log.txt") == "artifact://run-2/a1/_/log.txt"


def test_child_step_keeps_run_attempt_worker():
    parent = RunTrace(run_id="run-3", attempt=4, worker_id="w9", step_id="a")
    child = parent.child_step("b")

    assert child.run_id == parent.run_id
    assert child.attempt == parent.attempt
    assert child.worker_id == parent.worker_id
    assert child.step_id == "b"
    assert parent.step_id == "a"  # родитель не мутирован


def test_with_worker_and_attempt_are_fluent():
    trace = RunTrace(run_id="run-4")
    assert trace.with_worker("w2").with_attempt(3) is trace
    assert trace.worker_id == "w2"
    assert trace.attempt == 3


# ── TELEMETRY-1: ArtifactIndex хранит корреляцию ────────────────────────────


def test_artifact_index_records_full_correlation():
    index = ArtifactIndex()
    trace = RunTrace(run_id="run-5", attempt=2, worker_id="w1", step_id="s1")

    correlation = index.record(trace, "harness.log")

    assert correlation.ref == "artifact://run-5/a2/s1/harness.log"
    assert correlation.run_id == "run-5"
    assert correlation.attempt == 2
    assert correlation.step_id == "s1"
    assert correlation.worker_id == "w1"
    assert correlation.name == "harness.log"
    assert index.get(correlation.ref) is correlation
    assert index.for_run("run-5") == [correlation]
    assert len(index) == 1


def test_artifact_index_isolates_runs_and_clears():
    index = ArtifactIndex()
    index.record(RunTrace(run_id="r-a"), "a.png")
    index.record(RunTrace(run_id="r-b"), "b.png")
    index.record(RunTrace(run_id="r-a"), "a2.png")

    assert len(index.for_run("r-a")) == 2
    assert len(index.for_run("r-b")) == 1
    assert len(index) == 3

    index.clear()
    assert len(index) == 0
    assert index.for_run("r-a") == []


# ── TELEMETRY-2: структурные логи с run-контекстом ──────────────────────────


def test_run_telemetry_event_logs_full_context():
    logger, handler = make_logger()
    hub = RunTelemetryHub(base_logger=logger)

    telemetry = hub.for_run("run-6").attempt(2).worker("w1").step("step-x")
    result = telemetry.event("step.started", tool="chrome")

    records = payloads(handler)
    assert len(records) == 1
    record = records[0]
    assert record["run_id"] == "run-6"
    assert record["attempt"] == 2
    assert record["step_id"] == "step-x"
    assert record["worker_id"] == "w1"
    assert record["level"] == "INFO"
    assert record["event"] == "step.started"
    assert record["tool"] == "chrome"
    assert result["event"] == "step.started"


def test_run_telemetry_error_level():
    logger, handler = make_logger()
    hub = RunTelemetryHub(base_logger=logger)

    hub.for_run("run-7").event("run.failed", level="ERROR", error="boom")

    assert handler.records[0].levelno == logging.ERROR
    assert payloads(handler)[0]["level"] == "ERROR"


def test_run_telemetry_artifact_sets_trace_and_index():
    hub = RunTelemetryHub()
    telemetry = hub.for_run("run-8").attempt(1).worker("w3").step("s")

    ref = telemetry.artifact("dump.har")
    assert ref == "artifact://run-8/a1/s/dump.har"
    assert telemetry.trace.artifact_ref == ref
    assert hub.index.get(ref).worker_id == "w3"
    assert telemetry.trace_dict()["artifact_ref"] == ref


def test_hub_for_run_is_singleton_per_run():
    hub = RunTelemetryHub()
    assert hub.for_run("run-9") is hub.for_run("run-9")
    assert hub.for_run("run-9") is not hub.for_run("run-10")

    before = hub.for_run("run-9")
    hub.reset()
    assert hub.for_run("run-9") is not before  # реестр сброшен


def test_module_singleton_exposed():
    assert isinstance(get_telemetry_hub(), RunTelemetryHub)


# ── Фасад: корреляция переходов + метрики ───────────────────────────────────


def make_facade(**over) -> RunControlFacade:
    kwargs = {
        "plane": RunControlPlane(max_concurrent=1, lease_timeout_sec=60.0, max_retries=3),
        "queue": RunQueue(backend=InMemoryQueueBackend()),
        "dispatcher": RunDispatcher(),
        "durations": DurationTracker(),
    }
    kwargs.update(over)
    return RunControlFacade(**kwargs)


def test_facade_emits_correlated_state_events():
    logger, handler = make_logger()
    hub = RunTelemetryHub(base_logger=logger)
    facade = make_facade(telemetry=hub)

    view, _ = facade.create_run({"wired": "a"})  # нет worker'а → QUEUED
    facade.register_worker("w1")                 # dispatch → RUNNING
    facade.succeed_run(view.run_id)              # → SUCCEEDED

    states = [p["state"] for p in payloads(handler) if p.get("event") == "run.state"]
    assert states == ["queued", "running", "succeeded"]
    assert all(p["run_id"] == view.run_id for p in payloads(handler))

    running = next(p for p in payloads(handler) if p.get("state") == "running")
    assert running["worker_id"] == "w1"

    trace = facade.trace(view.run_id)
    assert trace["run_id"] == view.run_id
    assert trace["attempt"] >= 1
    assert trace["artifact_ref"] == ""


def test_facade_trace_and_artifacts_accessors():
    hub = RunTelemetryHub()
    facade = make_facade(telemetry=hub)
    facade.register_worker("w1", {"chrome"})
    view, _ = facade.create_run({"wired": "a"}, {"chrome"})

    ref = hub.for_run(view.run_id).attempt(1).step("s1").artifact("shot.png")
    artifacts = facade.artifacts(view.run_id)

    assert [a.ref for a in artifacts] == [ref]
    assert artifacts[0].step_id == "s1"
    assert facade.trace(view.run_id)["artifact_ref"] == ref
    assert facade.telemetry is hub


def test_facade_without_telemetry_is_safe():
    facade = make_facade()
    view, _ = facade.create_run({"wired": "a"})

    assert facade.telemetry is None
    assert facade.trace(view.run_id) is None
    assert facade.artifacts(view.run_id) == []


def test_queue_depth_metric_grows():
    facade = make_facade()
    assert facade.metrics()["queue_depth"] == 0

    for i in range(3):
        facade.create_run({"wired": str(i)})

    assert facade.metrics()["queue_depth"] == 3
    assert facade.queue_depth() == 3
