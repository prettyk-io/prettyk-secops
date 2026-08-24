# -*- coding: utf-8 -*-
"""G-RT / BE-RT: validate-only для authoring export (режим A)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ORCH = Path(__file__).resolve().parents[1]
FIX = ORCH / "fixtures"
MAIN = ORCH / "main.py"
AUTHORING_OK = FIX / "authoring_roundtrip_ok.json"


def _run_validate(wired: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(MAIN), "--wired", str(wired), "--validate-only"],
        cwd=str(ORCH),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def test_authoring_roundtrip_fixture_zero_issues():
    from core.wired_validate import validate_wired_file

    issues, wired = validate_wired_file(AUTHORING_OK)
    assert issues == [], issues
    assert wired is not None


def test_authoring_roundtrip_prettyk_preserved():
    """Режим A: PrettyK в pages/steps, без flatten."""
    raw = json.loads(AUTHORING_OK.read_text(encoding="utf-8"))
    login_ctor = raw["test_suites"]["pages"]["login"]["constructor"]
    assert "Элемент email" in login_ctor
    assert "data|" not in login_ctor
    step_ctor = raw["test_suites"]["scenarios"][0]["steps"][0]["constructor"]
    assert step_ctor.startswith("Пусть")


def test_authoring_roundtrip_cli_exit_zero():
    proc = _run_validate(AUTHORING_OK)
    assert proc.returncode == 0, proc.stderr + proc.stdout
