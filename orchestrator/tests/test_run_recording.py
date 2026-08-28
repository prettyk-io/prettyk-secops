# -*- coding: utf-8 -*-
"""MON-5: run_recording — поиск видео по run_id + Range serve."""
from __future__ import annotations

import pytest

from utils import run_recording


def test_find_video_for_run_prefix(tmp_path, monkeypatch):
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    (tmp_path / "abc123_run-x.mp4").write_bytes(b"\x00" * 10)
    path = run_recording.find_video_for_run("abc123")
    assert path is not None and path.name == "abc123_run-x.mp4"


def test_find_video_for_run_picks_newest(tmp_path, monkeypatch):
    import os

    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    a = tmp_path / "abc123_first.mp4"
    b = tmp_path / "abc123_second.mp4"
    a.write_bytes(b"\x00" * 5)
    b.write_bytes(b"\x00" * 5)
    os.utime(a, (1000, 1000))
    os.utime(b, (2000, 2000))
    path = run_recording.find_video_for_run("abc123")
    assert path is not None and path.name == "abc123_second.mp4"


def test_find_video_for_run_ignores_other_runs(tmp_path, monkeypatch):
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    (tmp_path / "zzz_other.mp4").write_bytes(b"\x00" * 10)
    assert run_recording.find_video_for_run("abc123") is None


def test_find_video_for_run_no_fallback(tmp_path, monkeypatch):
    """Без run_id-префикса — чужой прогон не подменяется (None)."""
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    (tmp_path / "legacy.mp4").write_bytes(b"\x00" * 10)
    assert run_recording.find_video_for_run("abc123") is None


def test_parse_range_header_full():
    assert run_recording._parse_range_header("bytes=0-", 100) == (0, 99)
    assert run_recording._parse_range_header("bytes=10-19", 100) == (10, 19)
    assert run_recording._parse_range_header("bytes=99-", 100) == (99, 99)


def test_parse_range_header_invalid():
    assert run_recording._parse_range_header("", 100) is None
    assert run_recording._parse_range_header("bytes=-", 100) is None
    assert run_recording._parse_range_header("nonsense", 100) is None
    assert run_recording._parse_range_header("bytes=200-", 100) is None


def test_serve_video_full_body(tmp_path):
    video = tmp_path / "x.mp4"
    video.write_bytes(b"0123456789")
    body, status, headers = run_recording.serve_video_range_body(video, "")
    assert status == 200
    assert body == b"0123456789"
    assert headers["Content-Type"] == "video/mp4"
    assert headers["Accept-Ranges"] == "bytes"


def test_serve_video_range_206(tmp_path):
    video = tmp_path / "x.mp4"
    video.write_bytes(b"0123456789")
    body, status, headers = run_recording.serve_video_range_body(video, "bytes=2-5")
    assert status == 206
    assert body == b"2345"
    assert headers["Content-Range"] == "bytes 2-5/10"


# ── PW-E3: конверт webm → {run_id}.mp4 находится Monitor'ом ──────────────────


def test_find_video_for_run_exact_name(tmp_path, monkeypatch):
    """PW-E3: convert_webm_to_mp4 пишет {run_id}.mp4 — Monitor находит его."""
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    (tmp_path / "abc123.mp4").write_bytes(b"\x00" * 10)
    path = run_recording.find_video_for_run("abc123")
    assert path is not None and path.name == "abc123.mp4"


def test_find_video_for_run_exact_beats_prefix(tmp_path, monkeypatch):
    """Точное имя ({run_id}.mp4) приоритетнее Grid-префикса ({run_id}_...)."""
    import os

    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    grid = tmp_path / "abc123_grid.mp4"
    conv = tmp_path / "abc123.mp4"
    grid.write_bytes(b"\x00" * 5)
    conv.write_bytes(b"\x00" * 5)
    os.utime(grid, (2000, 2000))  # Grid новее
    os.utime(conv, (1000, 1000))  # конверт старше
    path = run_recording.find_video_for_run("abc123")
    # Точное имя — конверт PW-E3, несмотря на более старую дату
    assert path is not None and path.name == "abc123.mp4"


def test_find_video_for_run_no_fallback_exact(tmp_path, monkeypatch):
    """Чужой {run_id}.mp4 не подменяет чужой run."""
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    (tmp_path / "other.mp4").write_bytes(b"\x00" * 10)
    assert run_recording.find_video_for_run("abc123") is None
