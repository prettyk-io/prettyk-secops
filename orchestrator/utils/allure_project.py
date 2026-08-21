# -*- coding: utf-8 -*-
"""
Allure project isolation (opt-in).

meta.project_id (bank apps in wired) ≠ allure_project_id (Lite subdir).
See docs/check-evidence-refs.md.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import os
import re
from pathlib import Path
from typing import Any, Dict

from utils.paths import ALLURE_RESULTS_DIR

_PROJECT_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
_SLUG_SAFE = re.compile(r"[^a-zA-Z0-9_-]+")


def allure_project_mode() -> str:
    """default | check — дефолт check (per‑check проекты для Allure3)."""
    raw = (pk_env("ALLURE_PROJECT_MODE") or "check").strip().lower()
    return "check" if raw in {"check", "per_check", "per-check"} else "default"


def slugify_allure_project_id(raw: str, *, max_len: int = 64) -> str:
    text = (raw or "").strip()
    if not text:
        return "default"
    if text.startswith("chk_"):
        text = "chk_" + text[4:]
    text = _SLUG_SAFE.sub("_", text).strip("_")
    if not text:
        return "default"
    if len(text) > max_len:
        text = text[:max_len].rstrip("_")
    if not _PROJECT_ID_RE.fullmatch(text):
        return "default"
    return text


def resolve_allure_project_id() -> str:
    """Resolve Allure project_id. Never uses meta.project_id.

    Приоритет: KDT_ALLURE_PROJECT_ID → KDT_CHECK_ID → KDT_RUN_ID.
    check_id стабилен между запусками — история проверки собирается
    в одном Allure-проекте (AL3-INSTANCE: per-instance вместо per-run).
    KDT_RUN_ID — fallback, когда check_id ещё не назначен.
    """
    if allure_project_mode() != "check":
        return "default"
    explicit = (pk_env("ALLURE_PROJECT_ID") or "").strip()
    if explicit:
        return slugify_allure_project_id(explicit)
    check_id = (pk_env("CHECK_ID") or "").strip()
    if check_id:
        return slugify_allure_project_id(check_id)
    run_id = (pk_env("RUN_ID") or "").strip()
    if run_id:
        return slugify_allure_project_id(run_id)
    return "default"


def resolve_allure_results_dir() -> Path:
    """
    Where FileLogger writes *-result.json.
    check mode + non-default id → ALLURE_RESULTS_DIR / <allure_project_id>
    (matches services/allure-light-secops/app/paths.py).
    """
    project_id = resolve_allure_project_id()
    if project_id == "default":
        return ALLURE_RESULTS_DIR
    path = ALLURE_RESULTS_DIR / project_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def build_allure_report_url(
    allure_base_url: str = "http://127.0.0.1:5050",
    project_id: str | None = None,
) -> str:
    base = (allure_base_url or "http://127.0.0.1:5050").rstrip("/")
    pid = project_id if project_id is not None else resolve_allure_project_id()
    if pid == "default":
        return f"{base}/"
    return f"{base}/projects/{pid}/reports/latest/"


def summarize_allure_results_dir(results_dir: Path | None = None) -> Dict[str, Any]:
    """
    RES-4 thin: counts from *-result.json (honest, no fake widgets scrape).

    Returns: passed/failed/broken/skipped + status + total.
    """
    root = Path(results_dir) if results_dir is not None else resolve_allure_results_dir()
    tallies = {"passed": 0, "failed": 0, "broken": 0, "skipped": 0}
    if not root.is_dir():
        return {**tallies, "total": 0, "status": "missing"}
    for path in root.glob("*-result.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, UnicodeDecodeError):
            continue
        if not isinstance(data, dict):
            continue
        st = str(data.get("status") or "").strip().lower()
        if st in tallies:
            tallies[st] += 1
        elif st == "canceled":
            tallies["skipped"] += 1
    total = sum(tallies.values())
    status = "ok" if total > 0 else "empty"
    if tallies["failed"] or tallies["broken"]:
        status = "has_failures"
    return {**tallies, "total": total, "status": status}
