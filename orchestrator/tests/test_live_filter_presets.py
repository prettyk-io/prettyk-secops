# -*- coding: utf-8 -*-
"""L-1 / L-2: Live filter presets + deep-link markup smoke."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.diary_bus import _filter_events_for_preset

LIVE_HTML = ROOT / "static" / "live" / "index.html"


def test_diary_preset_signal_and_errors():
    events = [
        {"kind": "LOG", "text": "noise"},
        {"kind": "STEP", "text": "step"},
        {"kind": "ERROR", "text": "boom"},
        {"kind": "HIGH", "text": "alert"},
        {"kind": "CONSOLE", "text": "dbg"},
    ]
    assert len(_filter_events_for_preset(events, "all")) == 5
    err = _filter_events_for_preset(events, "errors")
    assert {e["kind"] for e in err} == {"ERROR", "HIGH"}
    sig = _filter_events_for_preset(events, "signal")
    assert {e["kind"] for e in sig} == {"STEP", "ERROR", "HIGH"}
    assert all(e["kind"] != "LOG" for e in sig)


def test_live_html_has_presets_and_results_link():
    html = LIVE_HTML.read_text(encoding="utf-8")
    # kind-chips статически в разметке, пресеты — динамически через JS (presetChipsEl)
    assert 'id="focusKindChips"' in html
    assert 'id="diaryKindChips"' in html
    assert 'id="zapKindChips"' in html
    assert "passesFilterPreset" in html
    # MH-1: Allure/WireK убраны из хедера.
    assert 'data-testid="live-link-allure"' not in html
    assert 'data-testid="live-link-wirek"' not in html
    # MH-2: остаётся только кнопка «Результаты →».
    assert 'data-testid="live-link-results"' in html
