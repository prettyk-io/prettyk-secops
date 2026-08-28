# -*- coding: utf-8 -*-
"""Lab demo: push Allure / DefectDojo report URLs into Live for Results glow."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable, Dict, Optional
from utils.env_dual import pk_env

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DEFAULT_LIVE = "http://127.0.0.1:8767"
DEFAULT_ALLURE = "http://127.0.0.1:5050/"

# Lab seed for «Сохранить акт» (RES-ACT): stats + systemic collapse sample.
SEED_DOJO_STATS = {
    "critical": 0,
    "high": 1,
    "medium": 0,
    "low": 1,
    "info": 0,
}
SEED_DOJO_COLLAPSE = {
    "kind": "pk_finding_collapse",
    "version": 1,
    "raw_count": 5,
    "cluster_count": 2,
    "systemic_clusters": 1,
    "totals": {"critical": 0, "high": 1, "medium": 0, "low": 1, "info": 0},
    "top_findings": [
        {
            "name": "SQL Injection",
            "risk": "high",
            "count": 1,
            "systemic": False,
        },
        {
            "name": "Missing Anti-clickjacking Header",
            "risk": "low",
            "count": 5,
            "systemic": True,
            "sample_endpoints": [
                "http://127.0.0.1:3000/",
                "http://127.0.0.1:3000/login",
            ],
        },
    ],
}
SEED_DOJO_EXECUTIVE = {
    "executive_class": "High",
    "source": "demo-seed",
    "risks": dict(SEED_DOJO_STATS),
    "recommendations": [
        "Заключение: высокий уровень риска — закрыть ACTIVE High/Critical "
        "(critical=0, high=1) до следующего допуска.",
        "Кластер: SQL Injection — high×1.",
        "Кластер: Missing Anti-clickjacking Header — low×5 (site-wide).",
    ],
}


def default_dojo_url() -> str:
    eng = (pk_env("DEFECTDOJO_ENGAGEMENT") or "1").strip() or "1"
    return f"http://127.0.0.1:8081/engagement/{eng}"


def hooks_url(live_base: str) -> str:
    return live_base.rstrip("/") + "/api/results/hooks"


def fetch_hooks(live_base: str, timeout: float = 5.0) -> Dict[str, Any]:
    req = urllib.request.Request(hooks_url(live_base), method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_hooks(live_base: str, payload: Dict[str, Any], timeout: float = 5.0) -> Dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        hooks_url(live_base),
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def dojo_hook_body(dojo_url: str, *, seed_act: bool) -> Dict[str, Any]:
    body: Dict[str, Any] = {"dojo_report_url": dojo_url}
    if seed_act:
        body["stats"] = dict(SEED_DOJO_STATS)
        body["collapse"] = dict(SEED_DOJO_COLLAPSE)
        body["executive"] = dict(SEED_DOJO_EXECUTIVE)
    return body


def seed_act_meta(*, run_id: str = "demo-seed") -> None:
    """Live meta для кнопки/zip акта: generate_act + ось fail_gate."""
    try:
        from utils import diary_bus
    except Exception as exc:  # noqa: BLE001
        print(f"seed act meta skipped: {exc}", file=sys.stderr)
        return
    try:
        diary_bus.set_meta(
            session_name=run_id,
            status="waiting",
            generate_act=True,
            assessment_purpose="emergency",
            ci_phase="completed",
            ci_conclusion="failure",
            ci_verdict="fail_gate",
            ci_exit_code=2,
            ci_gate="fail",
            ci_job_name=run_id,
            ci_job_description="demo seed: акт + hooks",
        )
    except Exception as exc:  # noqa: BLE001
        print(f"seed act meta failed: {exc}", file=sys.stderr)


def seed_journal_and_evidence(*, run_id: str = "demo-seed") -> None:
    """RES-3 lab: diary events + export + evidence registry history."""
    try:
        from utils import diary_bus
        from utils.evidence_refs import append_evidence_history, upsert_check_evidence
    except Exception as exc:  # noqa: BLE001
        print(f"seed journal/evidence skipped: {exc}", file=sys.stderr)
        return
    diary_bus.publish("NOTE", f"demo seed start {run_id}", channel="diary")
    diary_bus.publish("HIGH", "SQL Injection — demo alert", channel="scanner")
    diary_bus.publish("ERROR", "demo watchdog flake (non-fatal)", channel="diary")
    diary_bus.publish("SCAN", "passive scan finished", channel="scanner")
    diary_bus.publish("GATE", "admission Watch (demo)", channel="diary")
    try:
        diary_bus.export_diary_snapshot(run_id=run_id, filter_preset="all")
    except Exception as exc:  # noqa: BLE001
        print(f"export seed skipped: {exc}", file=sys.stderr)
    check_id = f"run_{run_id}"
    upsert_check_evidence(
        {
            "check_id": check_id,
            "deploy_id": "dep_lab_demo",
            "source": "hooks",
            "allure": {
                "report_url": DEFAULT_ALLURE,
                "allure_project_id": "default",
                "status": "ok",
                "summary": {
                    "passed": 4,
                    "failed": 1,
                    "broken": 0,
                    "skipped": 0,
                    "total": 5,
                },
            },
            "dojo": {
                "engagement_url": default_dojo_url(),
                "stats": dict(SEED_DOJO_STATS),
            },
        }
    )
    append_evidence_history(
        check_id,
        {
            "gate": "fail",
            "note": "High",
            "allure_report_url": DEFAULT_ALLURE,
            "dojo_engagement_url": default_dojo_url(),
            "dojo_stats": dict(SEED_DOJO_STATS),
        },
    )


def seed_run_summary_g20(*, run_id: str = "demo-seed") -> None:
    """G-20 lab: mirror run_summary.json onto Live."""
    try:
        from utils.reporter import build_run_summary, persist_live_run_summary
    except Exception as exc:  # noqa: BLE001
        print(f"seed run_summary skipped: {exc}", file=sys.stderr)
        return
    payload = build_run_summary(
        exit_code=2,
        gate="fail",
        scenarios={"ok": 4, "fail": 1, "skip": 0},
        paths={
            "allure_results": "reports/allure-results",
            "allure_report": "reports/allure-report",
            "live": DEFAULT_LIVE,
        },
        scanner_mode="demon",
    )
    payload["dojo_stats"] = dict(SEED_DOJO_STATS)
    payload["executive"] = dict(SEED_DOJO_EXECUTIVE)
    payload["executive_class"] = "High"
    payload["run_id"] = run_id
    payload["built_at"] = time.time()
    persist_live_run_summary(payload)


def seed_run_ui_summary(*, run_id: str = "demo-seed") -> None:
    """RES-4 lab: write run_ui_summary.json + a couple of trend points."""
    try:
        from utils.run_ui_summary import (
            append_severity_trend,
            build_run_ui_summary,
            persist_run_ui_summary,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"seed summary skipped: {exc}", file=sys.stderr)
        return
    summary = build_run_ui_summary(
        allure={
            "status": "ok",
            "summary": {
                "passed": 4,
                "failed": 1,
                "broken": 0,
                "skipped": 0,
                "total": 5,
            },
        },
        dojo={
            "stats": dict(SEED_DOJO_STATS),
            "collapse": dict(SEED_DOJO_COLLAPSE),
            "executive": dict(SEED_DOJO_EXECUTIVE),
        },
        scanner={
            "ok": True,
            "counts": {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 1},
            "instance_counts": {
                "critical": 0,
                "high": 2,
                "medium": 4,
                "low": 8,
                "info": 1,
            },
            "alert_count": 7,
            "instance_count": 15,
            "top_findings": list(SEED_DOJO_COLLAPSE["top_findings"]),
            "collapse": dict(SEED_DOJO_COLLAPSE),
        },
        executive=dict(SEED_DOJO_EXECUTIVE),
        run_id=run_id,
    )
    persist_run_ui_summary(summary)
    # second older-looking point so trend chart is non-trivial
    prior = {
        **summary,
        "run_id": "demo-prev",
        "built_at": float(summary["built_at"]) - 3600,
        "risks": {"critical": 0, "high": 0, "medium": 2, "low": 1, "info": 0},
    }
    append_severity_trend(prior)
    append_severity_trend(summary)


def scanner_hook_body(*, seed_act: bool) -> Dict[str, Any]:
    body: Dict[str, Any] = {"scanner_report_url": "http://127.0.0.1:8080/"}
    if seed_act:
        body["counts"] = {
            "critical": 0,
            "high": 1,
            "medium": 2,
            "low": 3,
            "info": 1,
        }
        body["collapse"] = dict(SEED_DOJO_COLLAPSE)
        body["top_findings"] = list(SEED_DOJO_COLLAPSE["top_findings"])
        body["status"] = "ok"
    return body


def entry_ready(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    url = entry.get("report_url")
    if not isinstance(url, str):
        return False
    lower = url.strip().lower()
    return lower.startswith("http://") or lower.startswith("https://")


def pair_ready(hooks: Dict[str, Any]) -> bool:
    return entry_ready(hooks.get("allure")) and entry_ready(hooks.get("dojo"))


def format_status(hooks: Dict[str, Any]) -> str:
    a = "ready" if entry_ready(hooks.get("allure")) else "pending"
    d = "ready" if entry_ready(hooks.get("dojo")) else "pending"
    pair = "yes" if pair_ready(hooks) else "no"
    return f"allure: {a}\ndojo: {d}\npair: {pair}"


def print_verify(hooks: Dict[str, Any]) -> None:
    print(json.dumps(hooks, ensure_ascii=False, indent=2), flush=True)
    print(format_status(hooks), flush=True)


def wait_hooks(
    live_base: str,
    *,
    need_allure: bool = False,
    need_dojo: bool = False,
    timeout_sec: float = 10.0,
    interval_sec: float = 0.1,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    fetch: Optional[Callable[[str], Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Poll GET hooks until required services are ready (no blind sleep-only wait)."""
    get = fetch or fetch_hooks
    deadline = clock() + timeout_sec
    last: Dict[str, Any]
    while True:
        last = get(live_base)
        a_ok = (not need_allure) or entry_ready(last.get("allure"))
        d_ok = (not need_dojo) or entry_ready(last.get("dojo"))
        if a_ok and d_ok:
            return last
        if clock() >= deadline:
            raise TimeoutError(
                f"hooks not ready within {timeout_sec}s "
                f"(need_allure={need_allure}, need_dojo={need_dojo}): "
                f"{format_status(last)}"
            )
        sleep(interval_sec)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Push Allure/Dojo report URLs into Live Results hooks"
    )
    parser.add_argument(
        "mode",
        nargs="?",
        choices=("allure", "dojo", "both", "staged", "clear"),
        default="both",
    )
    parser.add_argument("--live-base", default=DEFAULT_LIVE)
    parser.add_argument("--allure-url", default=DEFAULT_ALLURE)
    parser.add_argument("--dojo-url", default=None)
    parser.add_argument(
        "--timeout-sec",
        type=float,
        default=10.0,
        help="hard timeout for staged GET poll",
    )
    parser.add_argument(
        "--interval-sec",
        type=float,
        default=0.15,
        help="poll interval for staged mode",
    )
    parser.add_argument(
        "--seed-act",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="attach sample dojo.stats + collapse for lab «Сохранить акт» (default: on)",
    )
    args = parser.parse_args(argv)
    dojo_url = args.dojo_url or default_dojo_url()
    live = args.live_base
    seed = bool(args.seed_act)

    try:
        if args.mode == "clear":
            posted = post_hooks(live, {"clear": True})
            hooks = posted.get("hooks") if isinstance(posted.get("hooks"), dict) else fetch_hooks(live)
            try:
                from utils.live_mirrors import clear_live_results_mirrors

                wiped = clear_live_results_mirrors()
                if wiped:
                    print("mirrors wiped:", ", ".join(wiped), flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"mirrors wipe skipped: {exc}", file=sys.stderr)
            print_verify(hooks)
            return 0

        if args.mode == "allure":
            post_hooks(live, {"allure_report_url": args.allure_url})
            print_verify(fetch_hooks(live))
            return 0

        if args.mode == "dojo":
            post_hooks(live, dojo_hook_body(dojo_url, seed_act=seed))
            if seed:
                post_hooks(live, scanner_hook_body(seed_act=True))
                seed_act_meta()
                seed_run_ui_summary()
                seed_journal_and_evidence()
                seed_run_summary_g20()
            print_verify(fetch_hooks(live))
            return 0

        if args.mode == "both":
            body = dojo_hook_body(dojo_url, seed_act=seed)
            body["allure_report_url"] = args.allure_url
            post_hooks(live, body)
            if seed:
                post_hooks(live, scanner_hook_body(seed_act=True))
                seed_act_meta()
                seed_run_ui_summary()
                seed_journal_and_evidence()
                seed_run_summary_g20()
            print_verify(fetch_hooks(live))
            return 0

        # staged: Dojo first -> poll -> Allure -> poll both
        # ASCII markers: Windows console (cp1251) dies on arrows.
        print("-> dojo", flush=True)
        post_hooks(live, dojo_hook_body(dojo_url, seed_act=seed))
        mid = wait_hooks(
            live,
            need_dojo=True,
            timeout_sec=args.timeout_sec,
            interval_sec=args.interval_sec,
        )
        print_verify(mid)
        print("-> allure", flush=True)
        post_hooks(live, {"allure_report_url": args.allure_url})
        both = wait_hooks(
            live,
            need_allure=True,
            need_dojo=True,
            timeout_sec=args.timeout_sec,
            interval_sec=args.interval_sec,
        )
        print_verify(both)
        return 0
    except urllib.error.URLError as exc:
        print(f"Live unreachable at {hooks_url(live)}: {exc}", file=sys.stderr)
        return 2
    except TimeoutError as exc:
        print(str(exc), file=sys.stderr)
        return 3
    except Exception as exc:  # noqa: BLE001 — CLI surface
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
