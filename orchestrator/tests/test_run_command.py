# -*- coding: utf-8 -*-
"""ВыполнитьКоманду — gate + dry + allowlist."""
from __future__ import annotations

import json
import sys

import pytest

from adapters.data_processor import DataProcessor
from core.errors import WiredError
from core.method_id import lookup_method_id


def test_method_id_wire():
    assert lookup_method_id("ВыполнитьКоманду") == ("core", "run_command")


def test_run_command_disabled(monkeypatch):
    monkeypatch.delenv("KDT_EXECUTE_COMMAND", raising=False)
    monkeypatch.delenv("KDT_API_LAB_DRY", raising=False)
    monkeypatch.delenv("KDT_COMMAND_ALLOWLIST", raising=False)
    with pytest.raises(WiredError, match="KDT_EXECUTE_COMMAND"):
        DataProcessor.run_command("echo hi")


def test_run_command_dry(monkeypatch):
    monkeypatch.setenv("KDT_API_LAB_DRY", "1")
    monkeypatch.delenv("KDT_EXECUTE_COMMAND", raising=False)
    raw = DataProcessor.run_command("nuclei -u http://x")
    payload = json.loads(raw)
    assert payload["ok"] is True
    assert payload["dry"] is True
    assert payload["head"] == "nuclei"


def test_run_command_allowlist_deny(monkeypatch):
    monkeypatch.setenv("KDT_EXECUTE_COMMAND", "1")
    monkeypatch.delenv("KDT_API_LAB_DRY", raising=False)
    monkeypatch.setenv("KDT_COMMAND_ALLOWLIST", "nuclei|trivy")
    with pytest.raises(WiredError, match="ALLOWLIST"):
        DataProcessor.run_command("rm -rf /")


def test_run_command_live_echo(monkeypatch):
    monkeypatch.setenv("KDT_EXECUTE_COMMAND", "1")
    monkeypatch.delenv("KDT_API_LAB_DRY", raising=False)
    if sys.platform.startswith("win"):
        monkeypatch.setenv("KDT_COMMAND_ALLOWLIST", "cmd.exe|cmd")
        raw = DataProcessor.run_command("cmd /c echo kdt-ok", 30)
    else:
        monkeypatch.setenv("KDT_COMMAND_ALLOWLIST", "echo")
        raw = DataProcessor.run_command("echo kdt-ok", 30)
    payload = json.loads(raw)
    assert payload["ok"] is True
    assert payload["returncode"] == 0
    assert "kdt-ok" in (payload.get("stdout") or "")
