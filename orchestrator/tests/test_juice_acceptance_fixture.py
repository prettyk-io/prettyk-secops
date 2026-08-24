# -*- coding: utf-8 -*-
"""T-juice-IDE обвязка: sanitized operator fixture → validate-only."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ORCH = Path(__file__).resolve().parents[1]
ROOT = ORCH.parent
MAIN = ORCH / "main.py"
JUICE = ROOT / "docs" / "acceptance" / "fixtures" / "operator_juice_editor.sanitized.json"


def test_operator_juice_fixture_validate_only_zero():
    from core.wired_validate import validate_wired_file

    assert JUICE.is_file(), JUICE
    issues, wired = validate_wired_file(JUICE)
    assert issues == [], issues
    assert wired is not None


def test_operator_juice_fixture_cli_exit_zero():
    proc = subprocess.run(
        [sys.executable, str(MAIN), "--wired", str(JUICE), "--validate-only"],
        cwd=str(ORCH),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert proc.returncode == 0, proc.stderr + proc.stdout
