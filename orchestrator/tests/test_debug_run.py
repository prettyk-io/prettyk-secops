# -*- coding: utf-8 -*-
"""DBG: debug_mode helpers + Live pause/resume API."""
from __future__ import annotations

import json
import threading
import time
from urllib.request import Request, urlopen

import pytest

from core.debug_run import (
    apply_debug_admission_void,
    is_debug_paused,
    wired_debug_mode,
    set_debug_paused,
    set_live_debug_flags,
    wait_while_paused,
)
from utils import diary_bus
from utils.live_server import start_live_server, stop_live_server
from utils.pipeline_verdict import derive_pipeline_verdict


class _Infra:
    def __init__(self, debug_mode=False):
        self.debug_mode = debug_mode


class _Wired:
    def __init__(self, debug_mode=False):
        self.infrastructure = _Infra(debug_mode)


@pytest.fixture
def live_tmp(tmp_path, monkeypatch):
    live_dir = tmp_path / "live"
    live_dir.mkdir()
    exports = live_dir / "exports"
    exports.mkdir()
    monkeypatch.setattr("utils.diary_bus.LIVE_DIR", live_dir)
    monkeypatch.setattr("utils.diary_bus.DIARY_NDJSON", live_dir / "diary.ndjson")
    monkeypatch.setattr("utils.diary_bus.LIVE_META_JSON", live_dir / "meta.json")
    monkeypatch.setattr(
        "utils.diary_bus.RESULTS_HOOKS_JSON", live_dir / "results_hooks.json"
    )
    monkeypatch.setattr("utils.diary_bus.LIVE_EXPORTS_DIR", exports)
    stop_live_server()
    diary_bus.clear()
    yield live_dir
    stop_live_server()
    diary_bus.clear()


def test_wired_debug_mode_reads_infra():
    assert wired_debug_mode(_Wired(True)) is True
    assert wired_debug_mode(_Wired(False)) is False


def test_apply_debug_admission_void():
    out = apply_debug_admission_void({"counts": {"high": 1}})
    assert out["admission_void"] is True
    assert out["debug_mode"] is True
    assert out["counts"]["high"] == 1


def test_pause_resume_meta_and_diary(live_tmp):
    set_live_debug_flags(enabled=True, paused=False, timers_suppressed=True)
    meta = diary_bus.get_meta()
    assert meta.get("debug_mode") is True
    assert meta.get("debug_paused") is False
    assert meta.get("debug_timers_suppressed") is True

    set_debug_paused(True)
    assert is_debug_paused() is True
    set_debug_paused(False)
    assert is_debug_paused() is False

    text = diary_bus.DIARY_NDJSON.read_text(encoding="utf-8")
    assert "DEBUG_PAUSE" in text
    assert "DEBUG_RESUME" in text


def test_pause_without_debug_raises(live_tmp):
    diary_bus.set_meta(debug_mode=False)
    with pytest.raises(ValueError, match="debug_mode"):
        set_debug_paused(True)


def test_wait_while_paused_unblocks(live_tmp):
    set_live_debug_flags(enabled=True, paused=True, timers_suppressed=True)

    def _resume():
        time.sleep(0.3)
        set_debug_paused(False)

    threading.Thread(target=_resume, daemon=True).start()
    t0 = time.time()
    wait_while_paused(poll_sec=0.05)
    assert time.time() - t0 >= 0.25


def test_live_api_pause_resume(live_tmp):
    from utils.live_server import live_port
    import socket
    s = socket.socket()
    try:
        s.connect(('127.0.0.1', live_port()))
        s.close()
        # Live server already running — skip to avoid port conflict
        pytest.skip("Live server already running on port")
    except (ConnectionRefusedError, OSError):
        pass
    set_live_debug_flags(enabled=True, paused=False, timers_suppressed=True)
    url = start_live_server(session_name="unit-debug")
    base = url.rstrip("/")

    req = Request(f"{base}/api/debug/pause", data=b"", method="POST")
    with urlopen(req, timeout=3) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    assert body["ok"] is True
    assert body["meta"]["debug_paused"] is True

    req = Request(f"{base}/api/debug/resume", data=b"", method="POST")
    with urlopen(req, timeout=3) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    assert body["meta"]["debug_paused"] is False


def test_pipeline_verdict_debug_void_exit0_not_fail_run():
    assert (
        derive_pipeline_verdict(
            phase="completed",
            conclusion="success",
            exit_code=0,
            gate="void",
            risk_hints={"admission_void": True, "debug_mode": True},
        )
        == "pass"
    )
    assert (
        derive_pipeline_verdict(exit_code=1, gate="void") == "fail_run"
    )
    assert derive_pipeline_verdict(gate="void") == "fail_run"
