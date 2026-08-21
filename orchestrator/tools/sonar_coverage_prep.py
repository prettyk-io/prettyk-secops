# -*- coding: utf-8 -*-
"""
MC-2: подготовить coverage-отчёты для sonar-scanner.

По умолчанию — честный zero-coverage XML/LCOV (не stub «зелёная лампа»).
С --live / KDT_SONAR_COVERAGE=1 — pytest-cov (not heavy) -> real Cobertura.

  py -3 orchestrator/tools/sonar_coverage_prep.py
  py -3 orchestrator/tools/sonar_coverage_prep.py --live
"""
from __future__ import annotations
from utils.env_dual import pk_env

import argparse
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BE_COV = REPO / "reports" / "coverage-backend.xml"
FE_LCOV = REPO / "cosmo" / "coverage" / "lcov.info"
ZERO_COBERTURA = """<?xml version="1.0" encoding="UTF-8"?>
<!-- MC-2 zero coverage placeholder (honest empty). Generate real: --live -->
<coverage version="1.0" timestamp="0" lines-valid="0" lines-covered="0" line-rate="0">
  <sources/>
  <packages/>
</coverage>
"""
ZERO_LCOV = """TN:
SF:cosmo/src/.sonar-coverage-placeholder.ts
DA:1,0
LF:1
LH:0
end_of_record
"""


def write_zero() -> None:
    BE_COV.parent.mkdir(parents=True, exist_ok=True)
    BE_COV.write_text(ZERO_COBERTURA, encoding="utf-8")
    FE_LCOV.parent.mkdir(parents=True, exist_ok=True)
    FE_LCOV.write_text(ZERO_LCOV, encoding="utf-8")
    print(f"sonar_coverage_prep: zero -> {BE_COV.relative_to(REPO)}")
    print(f"sonar_coverage_prep: zero -> {FE_LCOV.relative_to(REPO)}")


# Узкий batch для live cov — не полный suite (testing policy).
_LIVE_PYTEST = (
    "tests/test_connector_ops.py",
    "tests/test_session_bridge.py",
    "tests/test_qa_markers.py",
    "tests/test_live_filter_presets.py",
)


def run_live_backend() -> int:
    BE_COV.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable,
        "-m",
        "pytest",
        *_LIVE_PYTEST,
        "--cov=utils",
        "--cov=core",
        "--cov-report=xml:" + str(BE_COV),
        "-q",
        "--tb=line",
    ]
    print("sonar_coverage_prep: live pytest-cov (sample batch)...")
    proc = subprocess.run(cmd, cwd=str(REPO / "orchestrator"))
    if not BE_COV.is_file():
        BE_COV.write_text(ZERO_COBERTURA, encoding="utf-8")
        print("sonar_coverage_prep: BE xml missing -> zero")
        return proc.returncode or 1
    print(f"sonar_coverage_prep: live -> {BE_COV.relative_to(REPO)}")
    return 0 if proc.returncode == 0 else proc.returncode


def run_live_frontend() -> int:
    """FE: zero lcov by default; vitest coverage only if script exists."""
    FE_LCOV.parent.mkdir(parents=True, exist_ok=True)
    import json

    pkg_path = REPO / "cosmo" / "package.json"
    if not pkg_path.is_file():
        FE_LCOV.parent.mkdir(parents=True, exist_ok=True)
        FE_LCOV.write_text(ZERO_LCOV, encoding="utf-8")
        return 0
    try:
        scripts = json.loads(pkg_path.read_text(encoding="utf-8")).get("scripts") or {}
    except json.JSONDecodeError:
        scripts = {}
    if "test:coverage" not in scripts:
        FE_LCOV.parent.mkdir(parents=True, exist_ok=True)
        FE_LCOV.write_text(ZERO_LCOV, encoding="utf-8")
        print("sonar_coverage_prep: no npm test:coverage -> FE zero lcov")
        return 0
    print("sonar_coverage_prep: live vitest coverage (best-effort)...")
    proc = subprocess.run(
        ["npm.cmd", "run", "test:coverage", "--", "--run"],
        cwd=str(REPO / "cosmo"),
    )
    if not FE_LCOV.is_file():
        FE_LCOV.write_text(ZERO_LCOV, encoding="utf-8")
        print("sonar_coverage_prep: FE lcov missing -> zero")
        return proc.returncode or 1
    print(f"sonar_coverage_prep: live -> {FE_LCOV.relative_to(REPO)}")
    return 0 if proc.returncode == 0 else proc.returncode


def main() -> int:
    ap = argparse.ArgumentParser(description="MC-2 Sonar coverage prep")
    ap.add_argument(
        "--live",
        action="store_true",
        help="run pytest-cov / vitest coverage (slow); else zero reports",
    )
    ap.add_argument(
        "--backend-only",
        action="store_true",
        help="only backend cobertura",
    )
    args = ap.parse_args()
    live = args.live or (pk_env("SONAR_COVERAGE") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if not live:
        write_zero()
        return 0
    rc = run_live_backend()
    if not args.backend_only:
        fe_rc = run_live_frontend()
        rc = rc or fe_rc
    return int(rc or 0)


if __name__ == "__main__":
    raise SystemExit(main())
