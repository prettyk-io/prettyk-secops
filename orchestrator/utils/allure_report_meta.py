# -*- coding: utf-8 -*-
"""Wave A: executor / environment / categories into allure-results before generate."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List
from utils.env_dual import pk_env

DEFAULT_REPORT_NAME = "SecOps Lab"

# SecOps-oriented buckets (RU). Order = first match wins in Allure.
DEFAULT_CATEGORIES: List[Dict[str, Any]] = [
    {
        "name": "Инфраструктура (Grid/Selenium)",
        "messageRegex": ".*(WebDriver|selenium|SessionNotCreated|grid|chromedriver|Timed out waiting).*",
        "matchedStatuses": ["broken", "failed"],
    },
    {
        "name": "Auth / сессия",
        "messageRegex": ".*(auth|login|cookie|401|403|Unauthorized|Forbidden).*",
        "matchedStatuses": ["failed", "broken"],
    },
    {
        "name": "Scanner / security",
        "messageRegex": ".*(ZAP|OWASP|alertRef|spider|ascan).*",
        "matchedStatuses": ["failed", "broken"],
    },
    {
        "name": "Таймаут шага",
        "messageRegex": ".*(Timeout|таймаут|timed out|TimeoutException).*",
        "matchedStatuses": ["broken", "failed"],
    },
    {
        "name": "Assertion / ожидание",
        "messageRegex": ".*(AssertionError|Expected|ожидал|assert |Assert).*",
        "matchedStatuses": ["failed"],
    },
    {
        "name": "Прочее",
        "matchedStatuses": ["failed", "broken"],
    },
]


def resolve_report_name(wired: Any = None) -> str:
    raw = (
        pk_env("ALLURE_REPORT_NAME")
        or pk_env("CHECK_NAME")
        or pk_env("SCENARIO_NAME")
        or ""
    ).strip()
    if raw:
        return raw
    if wired is not None:
        try:
            # Check scenarios / check_name / project_id
            scenarios = (
                getattr(wired.test_suites, "scenarios", None)
                if getattr(wired, "test_suites", None)
                else None
            ) or []
            if len(scenarios) == 1 and getattr(scenarios[0], "scenario_name", None):
                return scenarios[0].scenario_name
            meta = getattr(wired, "meta", None)
            if meta and getattr(meta, "project_id", None):
                return "Результаты проверки"
        except Exception:
            pass
    return DEFAULT_REPORT_NAME


def build_executor_payload(*, report_name: str | None = None, wired: Any = None) -> Dict[str, Any]:
    name = report_name or resolve_report_name(wired=wired)
    check_id = (pk_env("CHECK_ID") or "").strip()
    build_name = check_id or name
    return {
        "name": "PrettyK",
        "type": "other",
        "buildName": build_name,
        "reportName": name,
    }


def build_environment_lines() -> List[str]:
    pairs = [
        ("stand", pk_env("STAND", "lab")),
        ("check_id", pk_env("CHECK_ID", "")),
        ("quality_gate", pk_env("QUALITY_GATE", "")),
        ("allure_engine", pk_env("ALLURE_ENGINE", "3")),
        ("target", pk_env("TARGET_URL", os.environ.get("BASE_URL", ""))),
    ]
    lines: List[str] = []
    for key, val in pairs:
        text = str(val or "").strip()
        if text:
            lines.append(f"{key}={text}")
    if not lines:
        lines.append("stand=lab")
    return lines


def write_allure_report_meta(results_dir: Path, wired: Any = None) -> Dict[str, Any]:
    """Write executor.json, environment.properties, categories.json. Idempotent overwrite."""
    root = Path(results_dir)
    root.mkdir(parents=True, exist_ok=True)
    report_name = resolve_report_name(wired=wired)
    executor = build_executor_payload(report_name=report_name, wired=wired)
    (root / "executor.json").write_text(
        json.dumps(executor, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    env_text = "\n".join(build_environment_lines()) + "\n"
    (root / "environment.properties").write_text(env_text, encoding="utf-8")
    (root / "categories.json").write_text(
        json.dumps(DEFAULT_CATEGORIES, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "report_name": report_name,
        "executor": True,
        "environment": True,
        "categories": len(DEFAULT_CATEGORIES),
    }


def resolve_allure_service_base() -> str:
    """KDT_ALLURE_URL wins; else engine 3 → :5050 (канон). Legacy engine 2 → :5051."""
    explicit = (pk_env("ALLURE_URL") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    engine = (pk_env("ALLURE_ENGINE") or "3").strip().lower()
    if engine in {"3", "allure3", "awesome"}:
        return "http://127.0.0.1:5050"
    return "http://127.0.0.1:5051"
