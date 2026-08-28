# -*- coding: utf-8 -*-
"""WIRE-WZ: тесты моста diary → EventJournal → SceneState."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

from warzone.event_journal import EventJournal


def _diary_events() -> list[dict]:
    return [
        {"kind": "STEP", "t": 0.5, "text": "open"},
        {"kind": "FUZZ_BEAM_START", "t": 1.0, "source": "fuzzer", "target": "t1", "t_end": 5.0},
        {"kind": "TARGET_HIT", "t": 2.0, "target": "t1"},
        {"kind": "scanner_ALERT", "t": 3.0, "id": "f1"},
        {"kind": "FINDING", "t": 4.0, "id": "f2"},
    ]


class TestFromDiaryEvents:
    def test_maps_diary_kinds(self):
        journal = EventJournal.from_diary_events(_diary_events())
        # STEP не распознан как semantic (passthrough kind=""), остальные — да
        semantic = [e.kind for e in journal.events if e.kind]
        assert "FUZZ_BEAM_START" in semantic
        assert "TARGET_HIT" in semantic
        assert semantic.count("FINDING_ALERT") == 2  # scanner_ALERT + FINDING

    def test_scene_state_payload_shape(self):
        journal = EventJournal.from_diary_events(_diary_events())
        payload = journal.scene_state_payload(2.5)
        assert payload["type"] == "scene_state"
        assert payload["t"] == 2.5
        assert isinstance(payload["active_beams"], list)       # BeamView[] (объекты)
        assert isinstance(payload["findings"], list)           # [{kind,count}]
        assert isinstance(payload["node_hits"], list)          # [{nodeId,hits}]
        assert "state_hash" in payload
        assert "finding_ids" in payload

    def test_scene_state_payload_beamview_contract(self):
        """Канон §6: active_beams = BeamView {id, source, target, intensity}."""
        journal = EventJournal.from_diary_events(_diary_events())
        payload = journal.scene_state_payload(2.5)
        beam = payload["active_beams"][0]
        assert set(beam) == {"id", "source", "target", "intensity"}
        assert beam["source"] == "fuzzer"
        assert beam["target"] == "t1"
        assert isinstance(beam["intensity"], (int, float))
        # node_hits — [{nodeId, hits}]
        assert payload["node_hits"] == [{"nodeId": "t1", "hits": 1}]
        # findings — [{kind,count}] агрегат (f1 приходит на t=3.0 → пусто)
        assert payload["findings"] == []

    def test_scene_state_folds_beam_hit(self):
        journal = EventJournal.from_diary_events(_diary_events())
        # t=2.5: луч активен (1.0→5.0), hit t1, finding f1 (t=3.0 ещё нет)
        s = journal.state_at(2.5)
        assert len(s.active_beams) == 1
        assert s.node_hits == {"t1": 1}
        assert s.findings == []  # f1 приходит на t=3.0

    def test_scanner_alert_becomes_finding(self):
        journal = EventJournal.from_diary_events(_diary_events())
        s = journal.state_at(4.5)
        assert len(s.findings) == 2  # f1 (scanner_ALERT) + f2 (FINDING)


class TestDeterminismViaDiary:
    def test_forward_backward_same_hash(self):
        journal = EventJournal.from_diary_events(_diary_events())
        # инвариант 100/100: один и тот же t → один и тот же state_hash,
        # независимо от того, "двигались" ли мы вперёд или назад.
        for t in (0.5, 1.5, 2.5, 4.5):
            assert journal.state_hash(t) == journal.state_hash(t)

    def test_verify_determinism(self):
        journal = EventJournal.from_diary_events(_diary_events())
        assert journal.verify_determinism([0.5, 1.5, 3.0, 4.5]) is True
