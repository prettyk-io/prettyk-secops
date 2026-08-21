# -*- coding: utf-8 -*-
"""IMP-HAR-4: live ZAP HAR → importHar → sequence activeScan (opt-in)."""
from __future__ import annotations

import json
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.zap_adapter import (  # noqa: E402
    ZapAdapter,
    har_sequence_live_enabled,
    zap_har_file_for_api,
)
from utils.paths import RUNS_DIR  # noqa: E402

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "mini_sequence.har"
ZAP_VERSION_URL = "http://127.0.0.1:8080/JSON/core/view/version/"


def _zap_demon_up() -> bool:
    try:
        with urllib.request.urlopen(ZAP_VERSION_URL, timeout=3) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def test_har_sequence_live_gate_off_by_default(monkeypatch):
    monkeypatch.delenv("KDT_HAR_SEQUENCE_LIVE", raising=False)
    assert har_sequence_live_enabled() is False
    monkeypatch.setenv("KDT_HAR_SEQUENCE_LIVE", "1")
    assert har_sequence_live_enabled() is True


@pytest.mark.heavy
@pytest.mark.lab
@pytest.mark.skipif(
    not har_sequence_live_enabled(),
    reason="KDT_HAR_SEQUENCE_LIVE not set (IMP-HAR-4 opt-in)",
)
def test_live_import_har_and_sequence_active_scan():
    if not _zap_demon_up():
        pytest.skip("ZAP demon not reachable on http://127.0.0.1:8080/")
    if not FIXTURE.is_file():
        pytest.fail(f"missing fixture {FIXTURE}")

    # Place HAR under RUNS_DIR so zap_har_file_for_api rewrites to container mount.
    run_id = "har4-live"
    dest = Path(RUNS_DIR) / run_id / "resources" / "mini_sequence.har"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(FIXTURE, dest)
    zap_path = zap_har_file_for_api(str(dest))
    assert zap_path.startswith("/zap/wrk/kdt-runs/")
    assert zap_path.endswith(f"{run_id}/resources/mini_sequence.har")

    zap = ZapAdapter(host="127.0.0.1", port=8080)
    seq = "kdt_har4_mini"
    imported = zap.import_har_sequence(seq, str(dest), assert_code=False)
    assert imported is True, "importHar failed — check ZAP sequence add-on + volume mount"

    # Short timeout if AF fallback waits; direct API returns quickly.
    scanned = zap.sequence_active_scan(seq, timeout_minutes=1)
    assert scanned, "sequence_active_scan returned falsy (API or AF)"


def test_mini_sequence_fixture_has_entries():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    entries = data["log"]["entries"]
    assert len(entries) >= 2
    assert entries[0]["request"]["method"] == "GET"
