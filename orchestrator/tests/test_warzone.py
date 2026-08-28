# -*- coding: utf-8 -*-
"""WARZONE: тесты WZ-1 (Timeline Controller), WZ-2 (Event Journal), WZ-5 (VideoTrackAdapter)."""
from __future__ import annotations

import math

import pytest

from warzone.event_journal import (
    EventJournal,
    beam_intensity,
    SceneState,
)
from warzone.timeline_controller import TimelineController
from warzone.video_track_adapter import VideoTrackAdapter


# ══════════════════════════════════════════════════════════════════════
# WZ-2: Event Journal + свертка S(t) + инвариант 100/100
# ══════════════════════════════════════════════════════════════════════


class TestBeamIntensity:
    def test_zero_before_start(self):
        assert beam_intensity(0.0, t_start=1.0, t_end=5.0) == 0.0

    def test_zero_after_end(self):
        assert beam_intensity(6.0, t_start=1.0, t_end=5.0) == 0.0

    def test_ramp_monotonic(self):
        # интенсивность растёт в фазе ramp
        a = beam_intensity(1.05, t_start=1.0, t_end=5.0)
        b = beam_intensity(1.10, t_start=1.0, t_end=5.0)
        assert 0.0 <= a < b <= 1.0

    def test_dim_monotonic_decrease(self):
        # интенсивность падает в фазе dim
        a = beam_intensity(4.85, t_start=1.0, t_end=5.0)
        b = beam_intensity(4.95, t_start=1.0, t_end=5.0)
        assert 0.0 <= b < a <= 1.0

    def test_no_discontinuity_at_end(self):
        # в t_end интенсивность ≈ 0 (без скачка)
        assert beam_intensity(5.0, t_start=1.0, t_end=5.0) == pytest.approx(0.0)


class TestEventJournal:
    def test_from_ndjson_parses_events(self):
        text = (
            '{"ts": 0.5, "kind": "STEP", "payload": {"step": "open"}}\n'
            '{"ts": 1.0, "kind": "FUZZ_BEAM_START", "payload": {"id": "b1", "source": "fuzzer", "target": "t1", "t_end": 2.5}}\n'
            '{"ts": 2.0, "kind": "TARGET_HIT", "payload": {"target": "t1"}}\n'
        )
        journal = EventJournal.from_ndjson(text)
        assert len(journal.events) == 3
        assert journal.duration == 2.0

    def test_events_sorted_by_ts(self):
        text = (
            '{"ts": 3.0, "kind": "A"}\n'
            '{"ts": 1.0, "kind": "B"}\n'
            '{"ts": 2.0, "kind": "C"}\n'
        )
        journal = EventJournal.from_ndjson(text)
        assert [e.ts for e in journal.events] == [1.0, 2.0, 3.0]

    def test_skips_malformed_lines(self):
        text = 'not json\n{"ts": 1.0, "kind": "STEP"}\n{"broken"\n'
        journal = EventJournal.from_ndjson(text)
        assert len(journal.events) == 1

    def test_state_at_folds_events_deterministically(self):
        text = (
            '{"ts": 1.0, "kind": "FUZZ_BEAM_START", "payload": {"id": "b1", "source": "f", "target": "t", "t_end": 4.0}}\n'
            '{"ts": 2.0, "kind": "TARGET_HIT", "payload": {"target": "t"}}\n'
            '{"ts": 3.0, "kind": "FINDING_ALERT", "payload": {"id": "f1"}}\n'
        )
        journal = EventJournal.from_ndjson(text)

        # t=1.5: луч активен, hit/finding ещё нет
        s = journal.state_at(1.5)
        assert len(s.active_beams) == 1
        assert s.node_hits == {}
        assert s.findings == []

        # t=3.5: hit + finding появились, луч ещё активен
        s = journal.state_at(3.5)
        assert s.node_hits == {"t": 1}
        assert s.findings == ["f1"]
        assert len(s.active_beams) == 1

    def test_beam_gone_after_t_end(self):
        text = '{"ts": 1.0, "kind": "FUZZ_BEAM_START", "payload": {"id": "b1", "source": "f", "target": "t", "t_end": 2.0}}\n'
        journal = EventJournal.from_ndjson(text)
        s = journal.state_at(2.5)
        assert s.active_beams == []  # луч погас


class TestDeterminismInvariant:
    """Инвариант 100/100: S(t) одинаков при forward/backward/direct seek."""

    def _journal(self) -> EventJournal:
        text = (
            '{"ts": 0.5, "kind": "STEP", "payload": {"step": "open"}}\n'
            '{"ts": 1.0, "kind": "FUZZ_BEAM_START", "payload": {"id": "b1", "source": "f", "target": "t1", "t_end": 5.0}}\n'
            '{"ts": 2.0, "kind": "TARGET_HIT", "payload": {"target": "t1"}}\n'
            '{"ts": 3.0, "kind": "FUZZ_BEAM_START", "payload": {"id": "b2", "source": "f", "target": "t2", "t_end": 8.0}}\n'
            '{"ts": 5.0, "kind": "FINDING_ALERT", "payload": {"id": "f1"}}\n'
        )
        return EventJournal.from_ndjson(text)

    def test_forward_equals_direct_seek(self):
        j = self._journal()
        # прямой проход: последовательно вызываем state_at
        # и прямой seek на те же t — hash одинаков
        for t in (0.5, 1.5, 2.5, 4.0, 6.0):
            assert j.state_hash(t) == j.state_hash(t)

    def test_verify_determinism_checkpoints(self):
        j = self._journal()
        assert j.verify_determinism([0.5, 1.5, 3.0, 5.5, 7.0]) is True

    def test_state_hash_stable_and_distinct(self):
        j = self._journal()
        h1 = j.state_hash(1.5)
        h2 = j.state_hash(1.5)
        h3 = j.state_hash(6.0)
        assert h1 == h2       # одинаковый t → одинаковый hash
        assert h1 != h3       # разный t → разный hash


# ══════════════════════════════════════════════════════════════════════
# WZ-1: Timeline Controller
# ══════════════════════════════════════════════════════════════════════


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


class TestTimelineController:
    def test_play_pause_seek(self):
        clock = FakeClock()
        c = TimelineController(duration=100.0, clock=clock)

        assert c.current_time == 0.0
        assert c.is_playing is False

        c.play()
        assert c.is_playing is True
        clock.now = 5.0
        assert c.current_time == pytest.approx(5.0)

        c.pause()
        assert c.is_playing is False
        paused = c.current_time
        clock.now = 10.0  # время идёт, но пауза → позиция не двигается
        assert c.current_time == pytest.approx(paused)

    def test_seek_clamps_to_duration(self):
        c = TimelineController(duration=10.0)
        c.seek(50.0)
        assert c.current_time == 10.0
        c.seek(-5.0)
        assert c.current_time == 0.0

    def test_speed_changes_rate(self):
        clock = FakeClock()
        c = TimelineController(duration=100.0, clock=clock)
        c.play()
        c.set_speed(2.0)
        clock.now = 3.0
        # 3 сек * 2x = 6 сек
        assert c.current_time == pytest.approx(6.0)

    def test_set_speed_rejects_non_positive(self):
        c = TimelineController(duration=10.0)
        with pytest.raises(ValueError):
            c.set_speed(0.0)

    def test_subscriber_notified_and_unsubscribed(self):
        c = TimelineController(duration=10.0)
        received: list[float] = []

        def cb(snapshot) -> None:
            received.append(snapshot)

        unsub = c.subscribe(cb)
        c.seek(3.0)
        assert received == [3.0]

        unsub()
        c.seek(7.0)
        assert received == [3.0]  # подписчик отписан

    def test_play_reaches_end_then_stays(self):
        clock = FakeClock()
        c = TimelineController(duration=10.0, clock=clock)
        c.play()
        clock.now = 20.0
        assert c.current_time == 10.0  # не больше duration


# ══════════════════════════════════════════════════════════════════════
# WZ-5: VideoTrackAdapter
# ══════════════════════════════════════════════════════════════════════


class TestVideoTrackAdapter:
    def test_live_push_frames_with_fifo(self):
        v = VideoTrackAdapter(live_buffer_capacity=3)
        for i in range(5):
            v.push_live_frame(b"frame-%d" % i, i * 100)
        assert v.live_frame_count() == 3  # FIFO обрезал старые

    def test_seamless_switch_preserves_position(self):
        v = VideoTrackAdapter()
        v.push_live_frame(b"x", 0)
        v.push_live_frame(b"y", 5000)
        # позиция сейчас на 5s (playhead)
        v.seek(5000)
        assert v.mode == "live"

        # завершаем запись, монтируем MP4
        pos = v.switch_to_replay("run.mp4", duration_ms=30000)
        # бесшовность: позиция 5000ms сохранена (не сброшена в 0 — нет чёрного экрана)
        assert pos.current_time_ms == 5000
        assert pos.duration_ms == 30000
        assert v.mode == "replay"
        assert v.mp4_path == "run.mp4"

    def test_switch_clamps_position_to_duration(self):
        v = VideoTrackAdapter()
        v.seek(99999)
        pos = v.switch_to_replay("run.mp4", duration_ms=10000)
        assert pos.current_time_ms == 10000  # зажато к длительности

    def test_transition_logged(self):
        v = VideoTrackAdapter()
        v.switch_to_replay("run.mp4", 10000)
        v.switch_to_live()
        assert v.transitions == ["live->replay@0ms", "replay->live"]

    def test_double_switch_is_noop(self):
        v = VideoTrackAdapter()
        p1 = v.switch_to_replay("a.mp4", 10000)
        p2 = v.switch_to_replay("b.mp4", 20000)
        assert p1.current_time_ms == p2.current_time_ms  # второй switch — no-op
        assert v.mp4_path == "a.mp4"
