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


# ── MONITOR-LIVE-DEEPLINK: контейнерный producer записи прогона ─────────────


class _Proc:
    returncode = 0
    stderr = ""
    stdout = ""


def test_start_run_capture_writes_marker_and_runs_ffmpeg(tmp_path, monkeypatch):
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    monkeypatch.setenv("PK_RUN_RECORDING", "1")  # producer припаркован: явный opt-in
    calls = []

    def _fake_docker(args, **kw):
        calls.append(args)
        return _Proc()

    monkeypatch.setattr(run_recording, "_docker", _fake_docker)

    res = run_recording.start_run_capture("run-abc123456789")
    assert res["ok"] is True
    assert (tmp_path / "run-abc123456789.recording").is_file()
    assert calls, "ffmpeg exec не запущен"
    cmd = " ".join(calls[0])
    assert "x11grab" in cmd
    assert "run-abc123456789.mp4" in cmd


def test_recording_disabled_by_default(tmp_path, monkeypatch):
    """RUNTIME-UN-CUTOVER-GRID-WEBM: x11grab producer припаркован (default off)."""
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    monkeypatch.delenv("PK_RUN_RECORDING", raising=False)
    res = run_recording.start_run_capture("run-off000")
    assert res["ok"] is False
    assert res["skipped"] is True
    assert not (tmp_path / "run-off000.recording").exists()


def test_start_run_capture_disabled(tmp_path, monkeypatch):
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    monkeypatch.setenv("PK_RUN_RECORDING", "0")
    res = run_recording.start_run_capture("run-off123")
    assert res["ok"] is False
    assert res["skipped"] is True
    assert not (tmp_path / "run-off123.recording").exists()


def test_stop_run_capture_finalizes_and_clears_marker(tmp_path, monkeypatch):
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    rid = "run-fin123"
    (tmp_path / f"{rid}.mp4").write_bytes(b"\x00" * 4096)
    (tmp_path / f"{rid}.recording").write_text("1", encoding="utf-8")
    monkeypatch.setattr(run_recording, "_docker", lambda args, **kw: None)

    res = run_recording.stop_run_capture(rid, wait_sec=3.0)
    assert res["ok"] is True
    assert res["size"] == 4096
    assert not (tmp_path / f"{rid}.recording").exists()


def test_stop_run_capture_missing_artifact(tmp_path, monkeypatch):
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    (tmp_path / "run-none1.recording").write_text("1", encoding="utf-8")
    monkeypatch.setattr(run_recording, "_docker", lambda args, **kw: None)

    res = run_recording.stop_run_capture("run-none1", wait_sec=1.0)
    assert res["ok"] is False
    assert "missing" in res["error"]
    assert not (tmp_path / "run-none1.recording").exists()


def test_capture_status_states(tmp_path, monkeypatch):
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)

    st = run_recording.capture_status("run-s1")
    assert st["ready"] is False
    assert st["recording"] is False
    assert st["reason"]

    (tmp_path / "run-s1.recording").write_text("1", encoding="utf-8")
    st = run_recording.capture_status("run-s1")
    assert st["recording"] is True
    assert st["ready"] is False
    assert "идёт" in st["reason"]

    (tmp_path / "run-s1.mp4").write_bytes(b"\x00" * 10)
    st = run_recording.capture_status("run-s1")
    assert st["ready"] is True
    assert st["size"] == 10
    assert st["reason"] == ""


# ── RUNTIME-UN-CUTOVER-GRID-WEBM: webm-приоритет и Grid-финал ───────────────


def test_find_video_prefers_exact_webm_over_newer_mp4(tmp_path, monkeypatch):
    import os

    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    webm = tmp_path / "abc123.webm"
    mp4 = tmp_path / "abc123.mp4"
    webm.write_bytes(b"\x00" * 5)
    mp4.write_bytes(b"\x00" * 5)
    os.utime(webm, (1000, 1000))
    os.utime(mp4, (2000, 2000))  # mp4 свежее, но webm — целевой формат
    path = run_recording.find_video_for_run("abc123")
    assert path is not None and path.name == "abc123.webm"


def test_find_video_prefers_prefix_webm(tmp_path, monkeypatch):
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    (tmp_path / "abc123_grid_a.mp4").write_bytes(b"\x00" * 5)
    (tmp_path / "abc123_grid_b.webm").write_bytes(b"\x00" * 5)
    path = run_recording.find_video_for_run("abc123")
    assert path is not None and path.name == "abc123_grid_b.webm"


def test_finalize_grid_video_converts_then_skips(tmp_path, monkeypatch):
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    src = tmp_path / "run-g1_20260101_000000.mp4"
    src.write_bytes(b"\x00" * 2048)
    converted: list = []

    def _fake_convert(src_path, dest_path):
        converted.append((src_path, dest_path))
        dest_path.write_bytes(b"\x00" * 1024)
        return True

    monkeypatch.setattr(run_recording, "_ffmpeg_mp4_to_webm", _fake_convert)

    res = run_recording.finalize_grid_video_webm("run-g1", wait_sec=3.0)
    assert res["ok"] is True
    assert res["path"].endswith("run-g1.webm")
    assert converted and converted[0][0] == src

    again = run_recording.finalize_grid_video_webm("run-g1", wait_sec=1.0)
    assert again["ok"] is True
    assert again.get("skipped") is True


def test_finalize_grid_video_no_source(tmp_path, monkeypatch):
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    res = run_recording.finalize_grid_video_webm("run-nosrc", wait_sec=0.6)
    assert res["ok"] is False
    assert "source not found" in res["error"]


def test_finalize_grid_video_retries_while_sidecar_seals(tmp_path, monkeypatch):
    """LIVE-MONITOR-REVIVE: первая конверсия на недописанном mp4 падает
    (headed-запись запечатывается позже) - bounded-ретрай дожимает."""
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    src = tmp_path / "run-g2_grid_a.mp4"
    src.write_bytes(b"\x00" * 2048)
    calls = {"n": 0}

    def _flaky_convert(src_path, dest_path):
        calls["n"] += 1
        if calls["n"] == 1:
            return False  # AVERROR_INVALIDDATA на неполном файле
        dest_path.write_bytes(b"\x00" * 1024)
        return True

    monkeypatch.setattr(run_recording, "_ffmpeg_mp4_to_webm", _flaky_convert)
    res = run_recording.finalize_grid_video_webm(
        "run-g2", wait_sec=1.0, convert_timeout_sec=10.0, retry_pause_sec=0.2
    )
    assert res["ok"] is True
    assert res["attempts"] == 2
    assert calls["n"] == 2
    assert res["path"].endswith("run-g2.webm")


def test_finalize_grid_video_honest_failure_after_budget(tmp_path, monkeypatch):
    """Бюджет ретраев исчерпан - честный провал с числом попыток, без фантома."""
    monkeypatch.setattr(run_recording, "VIDEO_DIR", tmp_path)
    src = tmp_path / "run-g3_x.mp4"
    src.write_bytes(b"\x00" * 512)
    monkeypatch.setattr(run_recording, "_ffmpeg_mp4_to_webm", lambda s, d: False)
    res = run_recording.finalize_grid_video_webm(
        "run-g3", wait_sec=0.6, convert_timeout_sec=0.8, retry_pause_sec=0.2
    )
    assert res["ok"] is False
    assert "conversion failed" in res["error"]
    assert res.get("attempts", 0) >= 1
    assert not (tmp_path / "run-g3.webm").is_file()
