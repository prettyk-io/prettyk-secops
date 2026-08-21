# -*- coding: utf-8 -*-
"""IMP-HAR: ZAP path rewrite + controller har_file stream."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.zap_adapter import ZapAdapter, zap_har_file_for_api
from core.controller import Controller
from core.data_stream import DataStream
from core.errors import WiredError


def test_zap_har_file_for_api_rewrites_under_runs(tmp_path, monkeypatch):
    runs = tmp_path / "runs"
    runs.mkdir()
    host = runs / "abc" / "resources" / "checkout.har"
    host.parent.mkdir(parents=True)
    host.write_text('{"log":{"entries":[]}}', encoding="utf-8")
    monkeypatch.setattr("adapters.zap_adapter.RUNS_DIR", runs)
    out = zap_har_file_for_api(str(host))
    assert out.replace("\\", "/").endswith("abc/resources/checkout.har")
    assert out.startswith("/zap/wrk/kdt-runs/")


def test_zap_har_file_outside_runs_unchanged(tmp_path, monkeypatch):
    monkeypatch.setattr("adapters.zap_adapter.RUNS_DIR", tmp_path / "runs")
    other = tmp_path / "elsewhere.har"
    other.write_text("{}", encoding="utf-8")
    assert zap_har_file_for_api(str(other)) == str(other.resolve())


def test_import_har_sequence_uses_rewritten_path(tmp_path, monkeypatch):
    runs = tmp_path / "runs"
    har = runs / "r1" / "resources" / "x.har"
    har.parent.mkdir(parents=True)
    har.write_text('{"log":{"entries":[]}}', encoding="utf-8")
    monkeypatch.setattr("adapters.zap_adapter.RUNS_DIR", runs)
    zap = ZapAdapter.__new__(ZapAdapter)
    zap._ensure_connected = lambda: None
    zap._zap = MagicMock()
    assert zap.import_har_sequence("seq", str(har), assert_code=False) is True
    data = zap._zap.urlopen.call_args.kwargs["data"]
    assert data["harFile"].startswith("/zap/wrk/kdt-runs/")
    assert data["harFile"].endswith("r1/resources/x.har")


def test_controller_har_file_sets_path_scalar(tmp_path):
    har = tmp_path / "flow.har"
    har.write_text('{"log":{"entries":[]}}', encoding="utf-8")
    ctrl = Controller.__new__(Controller)
    ctrl.wired_path = str(tmp_path / "Wired.json")
    stream = DataStream()
    item = SimpleNamespace(path=str(har), kind="har_file", as_name="flow")
    Controller._import_suite_item(ctrl, stream, item)
    assert stream.get("flow") == str(har.resolve())


def test_controller_har_file_rejects_txt(tmp_path):
    txt = tmp_path / "x.txt"
    txt.write_text("a\n", encoding="utf-8")
    ctrl = Controller.__new__(Controller)
    ctrl.wired_path = str(tmp_path / "Wired.json")
    stream = DataStream()
    item = SimpleNamespace(path=str(txt), kind="har_file", as_name="x")
    with pytest.raises(WiredError, match=r"\.har"):
        Controller._import_suite_item(ctrl, stream, item)
