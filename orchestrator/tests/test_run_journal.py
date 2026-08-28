# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path

from utils.run_journal import (
    build_journal_from_export,
    filter_journal_events,
    read_ndjson_events,
)


def test_read_and_filter_journal(tmp_path: Path):
    nd = tmp_path / "run.ndjson"
    rows = [
        {"ts": 1, "kind": "NOTE", "channel": "diary", "text": "start"},
        {"ts": 2, "kind": "HIGH", "channel": "scanner", "text": "SQLi"},
        {"ts": 3, "kind": "ERROR", "channel": "diary", "text": "wd fail"},
        {"ts": 4, "kind": "LOG", "channel": "diary", "text": "noise"},
        {"ts": 5, "kind": "HEAL", "channel": "diary", "text": "locator heal OK"},
        {"ts": 6, "kind": "HEAL_MISS", "channel": "diary", "text": "locator heal MISS"},
        {"ts": 7, "kind": "LABEL", "channel": "diary", "text": "label resolve OK"},
        {
            "ts": 8,
            "kind": "LABEL_AMBIGUOUS",
            "channel": "diary",
            "text": "label ambiguous",
        },
        {"ts": 9, "kind": "LABEL_MISS", "channel": "diary", "text": "label miss"},
    ]
    nd.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    events = read_ndjson_events(nd)
    assert len(events) == 9
    errs = filter_journal_events(events, "errors")
    assert [e["kind"] for e in errs] == ["HIGH", "ERROR"]
    sig = filter_journal_events(events, "signal")
    kinds = {e["kind"] for e in sig}
    assert "HIGH" in kinds and "ERROR" in kinds and "NOTE" in kinds
    assert "HEAL" in kinds and "HEAL_MISS" in kinds
    assert "LABEL" in kinds and "LABEL_AMBIGUOUS" in kinds and "LABEL_MISS" in kinds
    assert "LOG" not in kinds

    journal = build_journal_from_export(nd, preset="errors", run_id="r1")
    assert journal["kind"] == "pk_run_journal"
    assert journal["run_id"] == "r1"
    assert journal["events_shown"] == 2
    assert journal["counts"]["HIGH"] == 1


def test_missing_export():
    journal = build_journal_from_export(None, preset="all")
    assert journal["source"] == "none"
    assert journal["events"] == []
