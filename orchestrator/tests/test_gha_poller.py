# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Dict

from utils.gha_poller import (
    GhaPollerConfig,
    extract_pk_exit,
    map_gha_to_ci_status,
    poll_once,
)


def test_map_in_progress_run():
    payload = map_gha_to_ci_status(
        {
            "id": 99,
            "status": "in_progress",
            "conclusion": None,
            "name": "CI",
            "display_title": "feat: x",
            "run_number": 12,
            "html_url": "https://github.com/o/r/actions/runs/99",
        }
    )
    assert payload["phase"] == "in_progress"
    assert payload["job_name"] == "CI"
    assert "exit_code" not in payload
    assert payload["job_url"].endswith("/99")


def test_map_success_and_failure_with_job():
    run = {
        "id": 1,
        "status": "completed",
        "conclusion": "success",
        "name": "CI",
        "html_url": "https://github.com/o/r/actions/runs/1",
    }
    ok = map_gha_to_ci_status(run)
    assert ok["phase"] == "completed"
    assert ok["exit_code"] == 0
    assert ok["gate"] == "pass"

    fail_job = {
        "name": "orchestrator",
        "status": "completed",
        "conclusion": "failure",
        "html_url": "https://github.com/o/r/actions/runs/1/job/2",
    }
    bad = map_gha_to_ci_status(run, job=fail_job)
    assert bad["exit_code"] == 1
    assert bad["gate"] == "error"
    assert bad["job_name"] == "orchestrator"
    assert "/job/2" in bad["job_url"]


def test_poll_once_with_mock_http():
    cfg = GhaPollerConfig(token="t", repo="acme/prettyk-dev", job_name="orchestrator")
    calls = {"n": 0}

    def http_get(url: str, headers: Dict[str, str]) -> Dict[str, Any]:
        calls["n"] += 1
        assert "Authorization" in headers
        if "/jobs" in url:
            return {
                "jobs": [
                    {
                        "name": "lint",
                        "status": "completed",
                        "conclusion": "success",
                        "html_url": "https://example/job/lint",
                    },
                    {
                        "name": "orchestrator",
                        "status": "completed",
                        "conclusion": "failure",
                        "html_url": "https://example/job/orch",
                    },
                ]
            }
        return {
            "workflow_runs": [
                {
                    "id": 42,
                    "status": "completed",
                    "conclusion": "failure",
                    "name": "CI",
                    "html_url": "https://example/runs/42",
                    "run_number": 7,
                }
            ]
        }

    pushed = {}

    def notify(**fields):
        pushed.update(fields)
        return {"ok": True, "verdict": "fail_run"}

    result = poll_once(cfg, http_get=http_get, push=True, notify=notify)
    assert result["ok"] is True
    assert result["pushed"] is True
    assert pushed["phase"] == "completed"
    assert pushed["exit_code"] == 1
    assert pushed["job_name"] == "orchestrator"
    assert calls["n"] == 2


def test_poll_once_no_runs():
    cfg = GhaPollerConfig(token="t", repo="acme/prettyk-dev")

    def http_get(url: str, headers: Dict[str, str]) -> Dict[str, Any]:
        return {"workflow_runs": []}

    result = poll_once(cfg, http_get=http_get, push=False)
    assert result["ok"] is True
    assert result.get("skipped") is True


def test_extract_pk_exit_from_step_name():
    assert (
        extract_pk_exit(
            {"display_title": "CI"},
            {
                "name": "orchestrator",
                "steps": [{"name": "Notify Live pk_exit=2"}],
            },
        )
        == 2
    )


def test_map_failure_with_pk_exit_2_is_fail_gate():
    run = {
        "id": 9,
        "status": "completed",
        "conclusion": "failure",
        "name": "CI",
        "html_url": "https://github.com/o/r/actions/runs/9",
    }
    job = {
        "name": "orchestrator",
        "status": "completed",
        "conclusion": "failure",
        "html_url": "https://github.com/o/r/actions/runs/9/job/1",
        "annotations": [{"message": "gate failed pk_exit=2"}],
    }
    payload = map_gha_to_ci_status(run, job=job)
    assert payload["exit_code"] == 2
    assert payload["gate"] == "fail"
    assert payload["pk_exit"] == 2
