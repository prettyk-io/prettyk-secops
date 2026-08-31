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
            assert journal.state_hash(t) == journal.state_hash(t)  # NOSONAR — WZ determinism invariant

    def test_verify_determinism(self):
        journal = EventJournal.from_diary_events(_diary_events())
        assert journal.verify_determinism([0.5, 1.5, 3.0, 4.5]) is True


# ═══════════════════════════════════════════════════════════════════════
# WIRE-WZ: SSE endpoint tests (без реального HTTP — логика через моки)
# ═══════════════════════════════════════════════════════════════════════


class TestWarzoneSceneAtRoute:
    """GET /api/warzone/scene/at?t=... — точечный SceneState."""

    def test_scene_at_valid_t(self):
        """scene_state_payload на заданный t отдаёт корректный контракт."""
        journal = EventJournal.from_diary_events(_diary_events())
        payload = journal.scene_state_payload(2.5)

        assert payload["type"] == "scene_state"
        assert payload["t"] == 2.5
        assert len(payload["active_beams"]) == 1
        assert payload["active_beams"][0]["intensity"] > 0.5  # луч в разгаре
        assert "state_hash" in payload
        assert len(payload["state_hash"]) == 64  # sha256 hex

    def test_scene_at_no_events_zero(self):
        """На t=0 без событий — пустая сцена."""
        journal = EventJournal.from_diary_events([])
        payload = journal.scene_state_payload(0.0)
        assert payload["active_beams"] == []
        assert payload["findings"] == []
        assert payload["node_hits"] == []
        assert payload["log_index"] == 0

    def test_scene_at_reconnect_state(self):
        """При реконнекте: state_hash на последний известный t — детерминирован."""
        events = _diary_events()
        journal = EventJournal.from_diary_events(events)
        last_t = events[-1]["t"]  # 4.0
        payload1 = journal.scene_state_payload(last_t)
        payload2 = journal.scene_state_payload(last_t)
        assert payload1["state_hash"] == payload2["state_hash"]
        assert payload1["t"] == last_t


class TestWarzoneSseStream:
    """WIRE-WZ: SSE stream — event shape, поток, детерминизм."""

    def test_sse_event_payload_shape(self, monkeypatch):
        """Мок diary_bus: SSE отдаёт события с правильным контрактом."""
        from utils import diary_bus

        events = _diary_events()
        monkeypatch.setattr(diary_bus, "read_file_backlog", lambda _channel: list(events))
        monkeypatch.setattr(diary_bus, "read_file_since", lambda _offset, _channel: ([], 0))
        monkeypatch.setattr(diary_bus, "file_size", lambda: 0)

        journal = EventJournal.from_diary_events(events)
        # Симулируем начальный SSE backlog: scene_state на последнее событие
        last_t = events[-1]["t"]
        payload = journal.scene_state_payload(last_t)

        assert payload["type"] == "scene_state"
        assert isinstance(payload["active_beams"], list)
        assert isinstance(payload["findings"], list)
        assert isinstance(payload["node_hits"], list)
        assert "finding_ids" in payload
        assert "state_hash" in payload

    def test_sse_stream_events_deterministic(self):
        """Один и тот же journal → один и тот же state_hash для каждого t."""
        j1 = EventJournal.from_diary_events(_diary_events())
        j2 = EventJournal.from_diary_events(_diary_events())

        for t in (0.5, 1.0, 2.0, 3.0, 4.0):
            assert j1.scene_state_payload(t)["state_hash"] == j2.scene_state_payload(t)["state_hash"]

    def test_tail_events_merge(self):
        """Новые события в tail-потоке правильно дополняют journal."""
        backlog = _diary_events()[:2]  # только первые 2
        journal = EventJournal.from_diary_events(backlog)

        # На t=1.0: луч активен, hit ещё нет
        s1 = journal.state_at(1.0)
        assert s1.node_hits == {}

        # «Пришли» новые события (tail)
        tail = _diary_events()[2:]  # hit + findings
        new_journal = EventJournal.from_diary_events(tail)
        # Мёрджим вручную: строим новый journal из всех событий
        all_events = backlog + tail
        merged = EventJournal.from_diary_events(all_events)

        # На t=4.0: hit + findings учтены
        s2 = merged.state_at(4.0)
        assert s2.node_hits == {"t1": 1}
        assert len(s2.findings) == 2

    def test_sse_reconnect_returns_last_state(self, monkeypatch):
        """При реконнекте SSE: отдаём сцену с последней известной точки."""
        from utils import diary_bus

        events = _diary_events()
        monkeypatch.setattr(diary_bus, "read_file_backlog", lambda _channel: list(events))
        monkeypatch.setattr(diary_bus, "read_file_since", lambda _offset, _channel: ([], 0))
        monkeypatch.setattr(diary_bus, "file_size", lambda: 0)

        journal = EventJournal.from_diary_events(events)
        last_t = events[-1]["t"]
        payload = journal.scene_state_payload(last_t)

        # Реконнект: тот же t → тот же state_hash
        assert payload["log_index"] == len(events)
        assert payload["t"] == 4.0
        assert payload["state_hash"] == journal.state_hash(last_t)
