# -*- coding: utf-8 -*-
"""W3: Telemetry Event Bus — лёгкие нормализованные события для canvas.

Пишет события в diary_bus как строки JSON, с которыми SSE-клиент
(StudioGraphExplorer) уже работает.
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, asdict
from typing import Optional
import threading

from utils import diary_bus


_seq_lock = threading.Lock()
_seq_by_run: dict[str, int] = {}


def _next_seq(run_id: str) -> int:
    with _seq_lock:
        next_value = _seq_by_run.get(run_id, 0) + 1
        _seq_by_run[run_id] = next_value
        return next_value


@dataclass
class TelemetryEvent:
    event_id: str
    run_id: str
    step_id: Optional[str] = None
    seq: int = 0
    kind: str = ""  # step.started, step.completed, edge.pulse, ai.whisper
    status: str = ""  # running, success, failure, warning, predicted, queued
    occurred_at: str = ""
    duration_ms: Optional[int] = None
    facts: dict | None = None
    evidence_refs: list[str] | None = None
    trust: str = "deterministic"  # deterministic | derived | hypothesis

    def to_json(self) -> str:
        d = asdict(self)
        return json.dumps(d, ensure_ascii=False)


def _emit(channel: str, event: TelemetryEvent) -> None:
    try:
        diary_bus.append(channel, event.to_json())
    except Exception:
        pass


def emit_telemetry(run_id: str, kind: str, status: str, **facts) -> None:
    """Один вызов для step start/end/pulse/etc."""
    event = TelemetryEvent(
        event_id=f"telemetry:{uuid.uuid4().hex[:16]}",
        run_id=run_id,
        step_id=facts.get("step_id", None),
        seq=_next_seq(run_id),
        kind=kind,
        status=status,
        occurred_at=time.strftime("%Y-%m-%dT%H:%M:%S.", time.gmtime()) + f"{int(time.time() * 1000) % 1000:03d}Z",
        duration_ms=facts.get("duration_ms", None),
        facts=facts,
        evidence_refs=facts.get("evidence_refs", None),
        trust=facts.get("trust", "deterministic"),
    )
    _emit("telemetry", event)


def emit_step_start(run_id: str, step_id: str, step_label: str = "") -> None:
    emit_telemetry(run_id, "step.started", "running", step_id=step_id, step_label=step_label)


def emit_step_end(run_id: str, step_id: str, status: str, duration_ms: int = 0) -> None:
    emit_telemetry(run_id, "step.completed", status, step_id=step_id, duration_ms=duration_ms)


def emit_edge_pulse(run_id: str, source: str, target: str, latency_ms: int = 0) -> None:
    emit_telemetry(run_id, "edge.pulse", "running", source=source, target=target, latency_ms=latency_ms)


def emit_ai_whisper(run_id: str, node_id: str, whisper_text: str) -> None:
    emit_telemetry(run_id, "ai.whisper", "predicted", node_id=node_id, whisper=whisper_text, trust="hypothesis")
