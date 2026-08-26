# -*- coding: utf-8 -*-
"""G-06 --validate-only без ZAP/Grid."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ORCH = Path(__file__).resolve().parents[1]
FIX = ORCH / "fixtures"
MAIN = ORCH / "main.py"


def _run_validate(wired: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(MAIN), "--wired", str(wired), "--validate-only"],
        cwd=str(ORCH),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def test_validate_only_ok():
    from core.wired_validate import validate_wired_file

    issues, wired = validate_wired_file(FIX / "validate_ok.json")
    assert issues == [], issues
    assert wired is not None


def test_validate_only_bad_constructor():
    from core.wired_validate import validate_wired_file

    issues, _ = validate_wired_file(FIX / "validate_bad_ctor.json")
    assert issues, "expected constructor errors"
    assert any("constructor:" in i or "НетТакого" in i or "неизвест" in i.lower() for i in issues)


def test_validate_only_cli_exit_codes():
    ok = _run_validate(FIX / "validate_ok.json")
    assert ok.returncode == 0, ok.stderr + ok.stdout
    bad = _run_validate(FIX / "validate_bad_ctor.json")
    assert bad.returncode == 1, bad.stderr + bad.stdout


def test_validate_rejects_redact_placeholder_in_secret_fields():
    """BE-RT-3: '***' в password/secret — fail validate-only."""
    from core.wired_validate import (
        REDACT_PLACEHOLDER,
        collect_redact_mask_problems,
        validate_wired_file,
    )

    bad_path = FIX / "authoring_roundtrip_bad_redact.json"
    issues, wired = validate_wired_file(bad_path)
    assert wired is None or issues, issues
    assert any("secret security_configuration/password" in i for i in issues)
    assert any(REDACT_PLACEHOLDER in i for i in issues)

    ok_issues, ok_Wired = validate_wired_file(FIX / "authoring_roundtrip_ok.json")
    assert ok_issues == [], ok_issues
    assert ok_Wired is not None
    assert collect_redact_mask_problems({"password": REDACT_PLACEHOLDER}) == [
        "secret password: маска '***' — секрет недоступен для прогона (режим B redact)"
    ]
    assert collect_redact_mask_problems({"password": "real-secret"}) == []
    assert collect_redact_mask_problems({"note": REDACT_PLACEHOLDER}) == []


def test_validate_redact_placeholder_cli_exit_one():
    bad = _run_validate(FIX / "authoring_roundtrip_bad_redact.json")
    assert bad.returncode == 1, bad.stderr + bad.stdout
    assert "***" in bad.stderr + bad.stdout or "secret" in (bad.stderr + bad.stdout).lower()
