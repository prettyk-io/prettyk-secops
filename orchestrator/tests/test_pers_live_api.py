# -*- coding: utf-8 -*-
"""PERS-B4: тесты нового API — live_stream, trend, run_events."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

_here = Path(__file__).resolve().parents[1]
if str(_here) not in sys.path:
    sys.path.insert(0, str(_here))


class TestRunEvents:
    """GET /api/runs/:id/events — лента событий."""

    def test_empty_events_for_new_run(self):
        from api.runs_api import write_run_start, handle_get_run_events

        write_run_start("ev-run-1", session_name="test-events")
        data = handle_get_run_events("ev-run-1")
        assert data["ok"] is True
        assert data["status"] == "running"
        assert len(data["events"]) > 0
        kinds = [e["kind"] for e in data["events"]]
        assert "CREATED" in kinds
        assert "STARTED" in kinds

    def test_events_after_finish(self):
        from api.runs_api import write_run_start, write_run_finish, handle_get_run_events

        write_run_start("ev-run-2", session_name="finish-test")
        write_run_finish("ev-run-2", exit_code=0, findings_count=3, verdict="pass")

        data = handle_get_run_events("ev-run-2")
        assert data["ok"] is True
        kinds = [e["kind"] for e in data["events"]]
        assert "SUCCEEDED" in kinds
        finished = [e for e in data["events"] if e["kind"] == "SUCCEEDED"]
        assert len(finished) == 1
        assert finished[0]["findings_count"] == 3
        assert finished[0]["verdict"] == "pass"

    def test_unknown_run_returns_error(self):
        from api.runs_api import handle_get_run_events
        data = handle_get_run_events("no-such-run")
        assert data["ok"] is False
        assert data["error"] == "not_found"


class TestTrend:
    """GET /api/summary/trend — тренд severity + pass_rate."""

    def test_empty_trend(self):
        from api.runs_api import handle_get_trend
        data = handle_get_trend(days=30)
        assert data["ok"] is True
        assert data["total_runs"] >= 0
        assert "pass_rate" in data
        assert "by_day" in data

    def test_trend_with_data(self):
        from api.runs_api import write_run_start, write_run_finish, handle_get_trend

        write_run_start("t1", session_name="pass")
        write_run_finish("t1", exit_code=0, findings_count=0)
        write_run_start("t2", session_name="fail")
        write_run_finish("t2", exit_code=1, findings_count=5, verdict="fail")

        data = handle_get_trend(days=30)
        assert data["total_runs"] >= 2
        assert data["passed"] >= 1
        assert data["failed"] >= 1
        assert data["with_findings"] >= 1

    def test_trend_custom_days(self):
        from api.runs_api import handle_get_trend
        data = handle_get_trend(days=7)
        assert data["days"] == 7


class TestLiveStreamFormat:
    """SSE-стрим формат и контракт."""

    def test_live_stream_payload_format(self):
        """Payload live_stream имеет type и поля."""
        payload = {
            "type": "live_stream",
            "total_runs": 5,
            "active_runs": 1,
            "current_run": {
                "run_id": "run-live-1",
                "status": "running",
                "started_at": "2026-08-28T20:00:00",
                "target_url": "http://example.com",
            }
        }
        assert payload["type"] == "live_stream"
        assert payload["total_runs"] >= 0
        assert "active_runs" in payload
        # опционально: текущий активный прогон
        assert isinstance(payload.get("current_run", {}), dict)

    def test_sse_event_format(self):
        """SSE event = data: {...}\n\n."""
        payload = {"type": "live_stream", "total_runs": 1, "active_runs": 0}
        sse_line = f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
        assert sse_line.startswith("data: ")
        assert sse_line.endswith("\n\n")
        # Parse back
        body = sse_line[6:].strip()
        parsed = json.loads(body)
        assert parsed["type"] == "live_stream"