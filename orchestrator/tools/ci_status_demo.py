# -*- coding: utf-8 -*-
"""Lab demo: push CI status fixtures into Live for Results UI."""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

LIVE = "http://127.0.0.1:8767/api/ci/status"

FIXTURES = {
    "running": {
        "phase": "in_progress",
        "job_name": "orchestrator",
        "job_description": "Pytest + validate-only",
        "job_url": "https://github.com/example/zap-kdt/actions/runs/1",
    },
    "pass": {
        "phase": "completed",
        "conclusion": "success",
        "exit_code": 0,
        "gate": "pass",
        "job_name": "orchestrator",
        "job_description": "Чисто",
        "job_url": "https://github.com/example/zap-kdt/actions/runs/2",
    },
    "pass_watch": {
        "phase": "completed",
        "conclusion": "success",
        "exit_code": 0,
        "gate": "pass",
        "job_name": "orchestrator",
        "job_description": "Soft findings",
        "job_url": "https://github.com/example/zap-kdt/actions/runs/3",
        "risk_hints": {
            "highest_severity": "Medium",
            "counts": {"medium": 2, "low": 1},
            "recommendations": [
                "Закрыть Medium XSS на /profile до следующего релиза",
                "Пересмотреть cookie flags на staging",
            ],
        },
    },
    "pass_edge": {
        "phase": "completed",
        "conclusion": "success",
        "exit_code": 0,
        "gate": "pass",
        "job_name": "orchestrator",
        "job_description": "Elevated residual",
        "risk_hints": {"elevated": True, "highest_severity": "Medium"},
        "recommendations": ["Risk acknowledgment обязателен перед merge"],
    },
    "fail_gate": {
        "phase": "completed",
        "conclusion": "success",
        "exit_code": 2,
        "gate": "fail",
        "job_name": "orchestrator",
        "job_description": "Quality gate",
        "job_url": "https://github.com/example/zap-kdt/actions/runs/4",
    },
    "fail_run": {
        "phase": "completed",
        "conclusion": "failure",
        "exit_code": 1,
        "gate": "error",
        "job_name": "orchestrator",
        "job_description": "Job crashed",
        "job_url": "https://github.com/example/zap-kdt/actions/runs/5",
    },
}


def post(payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        LIVE,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Push CI status demo into Live")
    parser.add_argument(
        "fixture",
        nargs="?",
        choices=list(FIXTURES.keys()) + ["cycle"],
        default="cycle",
    )
    parser.add_argument("--sleep", type=float, default=2.5, help="pause in cycle mode")
    args = parser.parse_args()

    if args.fixture == "cycle":
        for name in ("running", "pass_watch", "fail_gate", "pass"):
            print("→", name, flush=True)
            print(post(FIXTURES[name]), flush=True)
            time.sleep(args.sleep)
        return

    print(post(FIXTURES[args.fixture]))


if __name__ == "__main__":
    main()
