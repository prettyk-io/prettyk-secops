# -*- coding: utf-8 -*-
"""T-juice-IDE обвязка: sanitized operator fixture → validate-only.

Позитивный fixture обязан проходить validate-only (0 ошибок, exit 0).
Негативный вариант (намеренно неизвестный шаг) обязан падать с диагностикой.
Отсутствующий fixture — явный fail, а не молчаливый skip (BOX-BASELINE-1).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

ORCH = Path(__file__).resolve().parents[1]
ROOT = ORCH.parent
MAIN = ORCH / "main.py"
JUICE = ROOT / "docs" / "acceptance" / "fixtures" / "operator_juice_editor.sanitized.json"
JUICE_BAD = JUICE.with_name("operator_juice_editor.sanitized.bad.json")


def _require_fixture(path: Path) -> None:
    if not path.is_file():
        pytest.fail(f"acceptance fixture не найден: {path}. Восстанови его, а не пропускай приёмку.")


def _run_validate(wired: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(MAIN), "--wired", str(wired), "--validate-only"],
        cwd=str(ORCH),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def test_operator_juice_fixture_validate_only_zero():
    _require_fixture(JUICE)
    from core.wired_validate import validate_wired_file

    issues, wired = validate_wired_file(JUICE)
    assert issues == [], issues
    assert wired is not None


def test_operator_juice_fixture_cli_exit_zero():
    _require_fixture(JUICE)
    proc = _run_validate(JUICE)
    assert proc.returncode == 0, proc.stderr + proc.stdout


def test_operator_juice_fixture_negative_fails_with_diagnostics():
    """Негативный acceptance-сценарий (намеренно неизвестный шаг) → fail, не skip/success."""
    _require_fixture(JUICE_BAD)
    from core.wired_validate import validate_wired_file

    issues, _ = validate_wired_file(JUICE_BAD)
    assert issues, "негативный сценарий обязан дать ошибку валидации"
    assert any(
        "constructor:" in i or "неизвест" in i.lower() or "unknown" in i.lower() for i in issues
    ), f"ожидалась диагностика по неизвестному шагу, получили: {issues}"


def test_operator_juice_fixture_negative_cli_exit_one():
    _require_fixture(JUICE_BAD)
    proc = _run_validate(JUICE_BAD)
    assert proc.returncode == 1, proc.stderr + proc.stdout