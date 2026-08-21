import json

from utils import telemetry_bus


def test_telemetry_events_keep_order_and_structured_envelope(monkeypatch):
    captured = []
    telemetry_bus._seq_by_run.clear()
    monkeypatch.setattr(
        telemetry_bus.diary_bus,
        "append",
        lambda channel, payload: captured.append((channel, json.loads(payload))),
    )

    telemetry_bus.emit_step_start("run-1", "step-1", "Open application")
    telemetry_bus.emit_step_end("run-1", "step-1", "success", duration_ms=120)

    assert [channel for channel, _ in captured] == ["telemetry", "telemetry"]
    assert [event["seq"] for _, event in captured] == [1, 2]
    assert captured[0][1]["kind"] == "step.started"
    assert captured[1][1]["facts"]["duration_ms"] == 120
    assert captured[1][1]["run_id"] == "run-1"


def test_ai_whisper_is_explicitly_hypothesis(monkeypatch):
    captured = []
    monkeypatch.setattr(
        telemetry_bus.diary_bus,
        "append",
        lambda channel, payload: captured.append(json.loads(payload)),
    )

    telemetry_bus.emit_ai_whisper("run-2", "scenario:0", "Possible next phase")

    assert captured[0]["kind"] == "ai.whisper"
    assert captured[0]["trust"] == "hypothesis"
    assert captured[0]["facts"]["whisper"] == "Possible next phase"
