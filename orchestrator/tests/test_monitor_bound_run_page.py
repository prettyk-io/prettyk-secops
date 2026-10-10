# -*- coding: utf-8 -*-
"""MONITOR-DEEPLINK-LIVE-CLIENT: контракт клиентской логики Monitor-страницы.

Тестируется РЕАЛЬНЫЙ bound-run блок из static/live/index.html (между маркерами)
в node — та же логика, что исполняет страница. Без node тест честно скипается.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

LIVE_HTML = ROOT / "static" / "live" / "index.html"
HELPERS_BEGIN = "/* bound-run helpers:begin"
HELPERS_END = "/* bound-run helpers:end */"


def _html() -> str:
    return LIVE_HTML.read_text(encoding="utf-8")


def _extract_helpers() -> str:
    html = _html()
    assert HELPERS_BEGIN in html, "bound-run helpers:begin marker missing"
    assert HELPERS_END in html, "bound-run helpers:end marker missing"
    start = html.index(HELPERS_BEGIN)
    stop = html.index(HELPERS_END, start) + len(HELPERS_END)
    return html[start:stop]


def test_page_wires_live_first_deep_link():
    """Страница: deep-link резолвит режим, live-поток run-scoped, честный recording-стейт."""
    html = _html()
    assert "void bootBoundRun(replayRunId);" in html, "boot должен резолвить режим рана"
    assert "enterLiveRunMode(" in html, "live-режим при активном ране"
    assert "/api/diary?channel=all&run_id=" in html, "run-scoped live SSE"
    assert "acceptBoundRunEvent" in html, "строгий фильтр событий привязанного рана"
    assert "recording/status" in html, "готовность MP4 — по status-ручке"
    assert 'id="recordingState"' in html, "видимый стейт recording"


@pytest.mark.skipif(shutil.which("node") is None, reason="node not available")
def test_bound_run_logic_contract_in_node():
    block = _extract_helpers()
    script = (
        "const block = " + json.dumps(block) + ";\n"
        "const api = eval('(function(){' + block + '; return PK_BOUND_RUN;})()');\n"
        "const out = {};\n"
        # decideBoundRunMode: live только для активного running рана
        "out.mode_unknown = api.decideBoundRunMode({ run_found: false, status: 'unknown' });\n"
        "out.mode_live = api.decideBoundRunMode({ run_found: true, run_source: 'active', status: 'running' });\n"
        "out.mode_replay_export = api.decideBoundRunMode({ run_found: true, run_source: 'export', status: 'waiting' });\n"
        "out.mode_replay_active_waiting = api.decideBoundRunMode({ run_found: true, run_source: 'active', status: 'waiting' });\n"
        "out.mode_replay_missing_meta = api.decideBoundRunMode(null);\n"
        # acceptBoundRunEvent: строгая изоляция по run_id
        "out.accept_own = api.acceptBoundRunEvent({ run_id: 'run-a', kind: 'STEP' }, 'run-a');\n"
        "out.accept_foreign = api.acceptBoundRunEvent({ run_id: 'run-b' }, 'run-a');\n"
        "out.accept_unstamped = api.acceptBoundRunEvent({ kind: 'STEP' }, 'run-a');\n"
        "out.accept_no_binding = api.acceptBoundRunEvent({ kind: 'STEP' }, '');\n"
        "out.accept_null = api.acceptBoundRunEvent(null, 'run-a');\n"
        # recordingStateFrom: ready | pending | absent
        "out.rec_ready = api.recordingStateFrom(true, 1, 40);\n"
        "out.rec_pending = api.recordingStateFrom(false, 1, 40);\n"
        "out.rec_absent = api.recordingStateFrom(false, 40, 40);\n"
        "console.log(JSON.stringify(out));\n"
    )
    res = subprocess.run(
        ["node", "-e", script],
        capture_output=True, text=True, encoding="utf-8", timeout=30, cwd=str(ROOT),
    )
    assert res.returncode == 0, f"node failed: {res.stderr[:1500]}"
    out = json.loads(res.stdout)
    assert out == {
        "mode_unknown": "unknown",
        "mode_live": "live",
        "mode_replay_export": "replay",
        "mode_replay_active_waiting": "replay",
        "mode_replay_missing_meta": "unknown",
        "accept_own": True,
        "accept_foreign": False,
        "accept_unstamped": False,
        "accept_no_binding": True,
        "accept_null": False,
        "rec_ready": "ready",
        "rec_pending": "pending",
        "rec_absent": "absent",
    }
