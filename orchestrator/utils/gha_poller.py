# -*- coding: utf-8 -*-
"""
RES-G: GitHub Actions → Live CI status (не poll из браузера).

Env:
  KDT_GHA_TOKEN   — required for real API
  KDT_GHA_REPO    — owner/name
  KDT_GHA_WORKFLOW — optional workflow file or id
  KDT_GHA_BRANCH  — optional branch filter
  KDT_GHA_JOB     — optional job name (prefer for conclusion/url)
  KDT_GHA_API_BASE — default https://api.github.com

Канон: docs/internal/gha-poller.md
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import logging
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

_KDT_EXIT_RE = re.compile(r"KDT_EXIT\s*=\s*([012])", re.IGNORECASE)

logger = logging.getLogger("orchestrator")

HttpGet = Callable[[str, Dict[str, str]], Dict[str, Any]]


@dataclass
class GhaPollerConfig:
    token: str
    repo: str
    workflow: str = ""
    branch: str = ""
    job_name: str = ""
    api_base: str = "https://api.github.com"

    @property
    def owner_repo(self) -> Tuple[str, str]:
        parts = (self.repo or "").strip().split("/", 1)
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise ValueError("KDT_GHA_REPO must be owner/name")
        return parts[0], parts[1]


def load_gha_config_from_env() -> GhaPollerConfig:
    token = (pk_env("GHA_TOKEN") or "").strip()
    repo = (pk_env("GHA_REPO") or "").strip()
    if not token:
        raise ValueError("KDT_GHA_TOKEN is required")
    if not repo:
        raise ValueError("KDT_GHA_REPO is required (owner/name)")
    return GhaPollerConfig(
        token=token,
        repo=repo,
        workflow=(pk_env("GHA_WORKFLOW") or "").strip(),
        branch=(pk_env("GHA_BRANCH") or "").strip(),
        job_name=(pk_env("GHA_JOB") or "").strip(),
        api_base=(pk_env("GHA_API_BASE") or "https://api.github.com").rstrip(
            "/"
        ),
    )


def default_http_get(url: str, headers: Dict[str, str]) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read().decode("utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError(f"expected JSON object from {url}")
    return data


def _auth_headers(token: str) -> Dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "zap-kdt-gha-poller",
    }


def fetch_latest_workflow_run(
    cfg: GhaPollerConfig,
    *,
    http_get: HttpGet = default_http_get,
) -> Optional[Dict[str, Any]]:
    owner, name = cfg.owner_repo
    qs: Dict[str, str] = {"per_page": "1"}
    if cfg.branch:
        qs["branch"] = cfg.branch
    query = urllib.parse.urlencode(qs)
    if cfg.workflow:
        # numeric id or workflow file name
        wf = urllib.parse.quote(cfg.workflow, safe="")
        url = f"{cfg.api_base}/repos/{owner}/{name}/actions/workflows/{wf}/runs?{query}"
    else:
        url = f"{cfg.api_base}/repos/{owner}/{name}/actions/runs?{query}"
    data = http_get(url, _auth_headers(cfg.token))
    runs = data.get("workflow_runs")
    if not isinstance(runs, list) or not runs:
        return None
    run = runs[0]
    return run if isinstance(run, dict) else None


def fetch_run_jobs(
    cfg: GhaPollerConfig,
    run_id: int,
    *,
    http_get: HttpGet = default_http_get,
) -> List[Dict[str, Any]]:
    owner, name = cfg.owner_repo
    url = f"{cfg.api_base}/repos/{owner}/{name}/actions/runs/{int(run_id)}/jobs?per_page=50"
    data = http_get(url, _auth_headers(cfg.token))
    jobs = data.get("jobs")
    if not isinstance(jobs, list):
        return []
    return [j for j in jobs if isinstance(j, dict)]


def _pick_job(jobs: List[Dict[str, Any]], job_name: str) -> Optional[Dict[str, Any]]:
    if not jobs:
        return None
    wanted = (job_name or "").strip().lower()
    if wanted:
        for job in jobs:
            name = str(job.get("name") or "").strip().lower()
            if name == wanted:
                return job
        for job in jobs:
            name = str(job.get("name") or "").strip().lower()
            if wanted in name:
                return job
    # Prefer currently running, else first
    for job in jobs:
        if str(job.get("status") or "").lower() == "in_progress":
            return job
    return jobs[0]


def _kdt_exit_chunks(
    run: Dict[str, Any], job: Optional[Dict[str, Any]]
) -> List[str]:
    chunks: List[str] = [
        str(run.get("display_title") or ""),
        str(run.get("name") or ""),
    ]
    head = run.get("head_commit")
    if isinstance(head, dict):
        chunks.append(str(head.get("message") or ""))
    if not job:
        return chunks
    chunks.append(str(job.get("name") or ""))
    steps = job.get("steps")
    if isinstance(steps, list):
        for step in steps:
            if isinstance(step, dict):
                chunks.append(str(step.get("name") or ""))
    anns = job.get("annotations")
    if isinstance(anns, list):
        for ann in anns:
            if isinstance(ann, dict):
                chunks.append(str(ann.get("message") or ""))
                chunks.append(str(ann.get("title") or ""))
    return chunks


def extract_kdt_exit(
    run: Dict[str, Any],
    job: Optional[Dict[str, Any]] = None,
) -> Optional[int]:
    """
    MC-RES-5: явный сигнал exit 2 / fail_gate из GHA.
    Ищем `KDT_EXIT=0|1|2` в display_title, job name, step names, annotations text.
    """
    match = _KDT_EXIT_RE.search("\n".join(_kdt_exit_chunks(run, job)))
    if not match:
        return None
    return int(match.group(1))


def _gha_phase(status: str) -> str:
    if status in ("queued", "waiting", "requested", "pending"):
        return "queued"
    if status in ("in_progress", "waiting"):
        return "in_progress"
    if status == "completed":
        return "completed"
    return status or "queued"


def _gha_job_description(run: Dict[str, Any]) -> str:
    desc_parts = []
    if run.get("display_title"):
        desc_parts.append(str(run.get("display_title")))
    elif run.get("name"):
        desc_parts.append(str(run.get("name")))
    run_number = run.get("run_number")
    if run_number is not None:
        desc_parts.append(f"#{run_number}")
    return " / ".join(desc_parts) if desc_parts else "GitHub Actions"


def _gha_exit_and_gate(
    phase: str, kdt_exit: Optional[int], conclusion: str
) -> tuple[Optional[int], str]:
    if phase != "completed":
        return None, ""
    if kdt_exit == 2:
        return 2, "fail"
    if kdt_exit == 0:
        return 0, "pass"
    if kdt_exit == 1:
        return 1, "error"
    if conclusion == "success" or conclusion in ("neutral", "skipped"):
        return 0, "pass"
    if conclusion in ("failure", "timed_out", "cancelled", "startup_failure"):
        return 1, "error"
    return 1, "error"


def map_gha_to_ci_status(
    run: Dict[str, Any],
    *,
    job: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Map GitHub workflow run (+ optional job) → Live /api/ci/status body."""
    status = str((job or run).get("status") or run.get("status") or "").strip().lower()
    conclusion = str(
        (job or {}).get("conclusion") or run.get("conclusion") or ""
    ).strip().lower()
    phase = _gha_phase(status)
    job_name = str((job or {}).get("name") or run.get("name") or "gha").strip()
    html_url = str(
        (job or {}).get("html_url") or run.get("html_url") or ""
    ).strip()
    job_description = _gha_job_description(run)
    kdt_exit = extract_kdt_exit(run, job)
    exit_code, gate = _gha_exit_and_gate(phase, kdt_exit, conclusion)

    payload: Dict[str, Any] = {
        "phase": phase,
        "conclusion": conclusion or None,
        "job_name": job_name,
        "job_description": job_description,
        "job_url": html_url or None,
        "html_url": html_url or None,
        "source": "gha_poller",
        "gha_run_id": run.get("id"),
        "gha_run_attempt": run.get("run_attempt"),
    }
    if exit_code is not None:
        payload["exit_code"] = exit_code
    if gate:
        payload["gate"] = gate
    if kdt_exit is not None:
        payload["kdt_exit"] = kdt_exit
    # Drop Nones for notify_ci_status cleanliness
    return {k: v for k, v in payload.items() if v is not None}


def poll_once(
    cfg: GhaPollerConfig,
    *,
    http_get: HttpGet = default_http_get,
    push: bool = True,
    notify: Optional[Callable[..., Any]] = None,
) -> Dict[str, Any]:
    """
    Fetch latest run → map → optional notify_ci_status.
    Returns {ok, skipped?, payload?, push?, error?}.
    """
    try:
        run = fetch_latest_workflow_run(cfg, http_get=http_get)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
        logger.warning("gha_poller fetch run failed: %s", exc)
        return {"ok": False, "error": str(exc)}

    if run is None:
        return {"ok": True, "skipped": True, "reason": "no_runs"}

    job = None
    run_id = run.get("id")
    if run_id is not None:
        try:
            jobs = fetch_run_jobs(cfg, int(run_id), http_get=http_get)
            job = _pick_job(jobs, cfg.job_name)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
            logger.info("gha_poller jobs miss (%s) — map run only", exc)

    payload = map_gha_to_ci_status(run, job=job)
    out: Dict[str, Any] = {"ok": True, "payload": payload, "run_id": run_id}
    if not push:
        out["pushed"] = False
        return out

    notify_fn = notify
    if notify_fn is None:
        from utils.live_server import notify_ci_status

        notify_fn = notify_ci_status

    # notify_ci_status accepts kwargs; strip gha_* extras that apply_ci_status ignores
    fields = {
        k: v
        for k, v in payload.items()
        if k
        in (
            "phase",
            "conclusion",
            "exit_code",
            "gate",
            "job_name",
            "job_description",
            "job_url",
            "html_url",
            "risk_hints",
            "recommendations",
        )
    }
    result = notify_fn(**fields)
    out["pushed"] = result is not None
    out["notify"] = result
    return out


def poll_loop(
    cfg: GhaPollerConfig,
    *,
    interval_sec: float = 30.0,
    once: bool = False,
    push: bool = True,
    http_get: HttpGet = default_http_get,
    sleep: Callable[[float], None] = time.sleep,
    stop_flag: Optional[Callable[[], bool]] = None,
) -> None:
    """Watch loop for CLI / Live idle. Dedupes identical phase+conclusion+run_id."""
    last_key: Optional[Tuple[Any, ...]] = None
    while True:
        if stop_flag and stop_flag():
            return
        result = poll_once(cfg, http_get=http_get, push=push)
        payload = result.get("payload") if isinstance(result.get("payload"), dict) else {}
        key = (
            result.get("run_id"),
            payload.get("phase"),
            payload.get("conclusion"),
            payload.get("exit_code"),
        )
        if result.get("ok") and not result.get("skipped") and key != last_key:
            logger.info(
                "gha_poller update run=%s phase=%s conclusion=%s exit=%s pushed=%s",
                key[0],
                key[1],
                key[2],
                key[3],
                result.get("pushed"),
            )
            last_key = key
        elif result.get("error"):
            logger.warning("gha_poller: %s", result.get("error"))
        if once:
            return
        sleep(max(5.0, float(interval_sec)))
