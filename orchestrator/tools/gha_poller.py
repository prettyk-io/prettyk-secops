# -*- coding: utf-8 -*-
"""CLI: poll GitHub Actions → Live POST /api/ci/status (RES-G)."""
from __future__ import annotations
from utils.env_dual import pk_env

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import List, Optional

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.gha_poller import (  # noqa: E402
    GhaPollerConfig,
    load_gha_config_from_env,
    map_gha_to_ci_status,
    poll_loop,
    poll_once,
)


def _load_fixture(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("fixture must be a JSON object")
    run = data.get("run") if isinstance(data.get("run"), dict) else data
    job = data.get("job") if isinstance(data.get("job"), dict) else None
    return map_gha_to_ci_status(run, job=job)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="RES-G: GitHub Actions → Live CI status"
    )
    parser.add_argument(
        "mode",
        nargs="?",
        choices=("once", "watch", "map-fixture"),
        default="once",
    )
    parser.add_argument(
        "--interval-sec",
        type=float,
        default=float(pk_env("GHA_POLL_INTERVAL_SEC") or "30"),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="fetch/map but do not POST to Live",
    )
    parser.add_argument(
        "--fixture",
        type=Path,
        help="map-fixture: path to JSON {run, job?} or bare run object",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    if args.mode == "map-fixture":
        if not args.fixture or not args.fixture.is_file():
            print("need --fixture path.json", file=sys.stderr)
            return 2
        payload = _load_fixture(args.fixture)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        if args.dry_run:
            return 0
        from utils.live_server import notify_ci_status

        fields = {
            k: payload[k]
            for k in (
                "phase",
                "conclusion",
                "exit_code",
                "gate",
                "job_name",
                "job_description",
                "job_url",
                "html_url",
            )
            if k in payload
        }
        print(notify_ci_status(**fields))
        return 0

    try:
        cfg = load_gha_config_from_env()
    except ValueError as exc:
        print(f"config: {exc}", file=sys.stderr)
        print(
            "Set PK_GHA_TOKEN and PK_GHA_REPO=owner/name "
            "(optional WORKFLOW/BRANCH/JOB).",
            file=sys.stderr,
        )
        return 2

    push = not args.dry_run
    if args.mode == "once":
        result = poll_once(cfg, push=push)
        print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
        return 0 if result.get("ok") else 1

    print(
        f"watching {cfg.repo} every {args.interval_sec}s "
        f"(workflow={cfg.workflow or '*'} branch={cfg.branch or '*'} dry={args.dry_run})",
        flush=True,
    )
    poll_loop(cfg, interval_sec=args.interval_sec, push=push)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
