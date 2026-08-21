# -*- coding: utf-8 -*-
"""MON-14: monitor_retention — purge по run_id + lazy TTL."""
from __future__ import annotations

import time

from utils import monitor_retention


def test_purge_by_run_id_requires_id():
    res = monitor_retention.purge_by_run_id("")
    assert res["ok"] is False
    assert res["error"] == "run_id required"


def test_find_artifacts_for_run_ndjson_sidecar_video(tmp_path, monkeypatch):
    exports = tmp_path / "exports"
    video = tmp_path / "video"
    exports.mkdir(parents=True)
    video.mkdir(parents=True)
    monkeypatch.setattr(monitor_retention, "LIVE_EXPORTS_DIR", exports)
    monkeypatch.setattr(monitor_retention, "VIDEO_DIR", video)

    (exports / "run-abc.ndjson").write_bytes(b"{}\n")
    (exports / "run-abc.json").write_text(
        '{"run_id": "run-abc", "created_at": 1000.0}', encoding="utf-8"
    )
    (exports / "other.ndjson").write_bytes(b"{}\n")
    (video / "run-abc_x.mp4").write_bytes(b"\x00" * 5)
    (video / "zzz_other.mp4").write_bytes(b"\x00" * 5)

    arts = monitor_retention.find_artifacts_for_run("run-abc")
    assert arts["ndjson"] is not None and arts["ndjson"].name == "run-abc.ndjson"
    assert arts["sidecar"] is not None and arts["sidecar"].name == "run-abc.json"
    assert arts["video"] is not None and arts["video"].name == "run-abc_x.mp4"


def test_purge_by_run_id_deletes_artifacts_not_meta(tmp_path, monkeypatch):
    exports = tmp_path / "exports"
    video = tmp_path / "video"
    exports.mkdir(parents=True)
    video.mkdir(parents=True)
    monkeypatch.setattr(monitor_retention, "LIVE_EXPORTS_DIR", exports)
    monkeypatch.setattr(monitor_retention, "VIDEO_DIR", video)

    (exports / "run-abc.ndjson").write_bytes(b"{}\n")
    (exports / "run-abc.json").write_text('{"run_id": "run-abc"}', encoding="utf-8")
    # meta-файлы, которые не должны удаляться
    (exports / "runs_index.ndjson").write_bytes(b"{}\n")
    (video / "run-abc_x.mp4").write_bytes(b"\x00" * 5)

    res = monitor_retention.purge_by_run_id("run-abc")
    assert res["ok"] is True
    assert not (exports / "run-abc.ndjson").exists()
    assert not (exports / "run-abc.json").exists()
    assert not (video / "run-abc_x.mp4").exists()
    # meta не тронут
    assert (exports / "runs_index.ndjson").exists()


def test_lazy_sweep_removes_old_artifacts(tmp_path, monkeypatch):
    exports = tmp_path / "exports"
    video = tmp_path / "video"
    exports.mkdir(parents=True)
    video.mkdir(parents=True)
    monkeypatch.setattr(monitor_retention, "LIVE_EXPORTS_DIR", exports)
    monkeypatch.setattr(monitor_retention, "VIDEO_DIR", video)

    # Старый артефакт: created_at в прошлом (далеко)
    old_ndjson = exports / "old-run.ndjson"
    old_ndjson.write_bytes(b"{}\n")
    (exports / "old-run.json").write_text(
        '{"run_id": "old-run", "created_at": 1.0}', encoding="utf-8"
    )
    old_video = video / "old-run_x.mp4"
    old_video.write_bytes(b"\x00" * 5)
    old_ts = time.time() - 20 * 86400.0  # 20 дней назад
    import os

    os.utime(old_video, (old_ts, old_ts))
    os.utime(old_ndjson, (old_ts, old_ts))

    # Свежий артефакт: mtime сейчас
    fresh_ndjson = exports / "fresh-run.ndjson"
    fresh_ndjson.write_bytes(b"{}\n")
    (exports / "fresh-run.json").write_text(
        '{"run_id": "fresh-run", "created_at": %f}' % time.time(),
        encoding="utf-8",
    )
    fresh_video = video / "fresh-run_x.mp4"
    fresh_video.write_bytes(b"\x00" * 5)

    # Сбросить таймер последнего sweep
    monitor_retention._last_sweep_ts = 0.0
    res = monitor_retention.lazy_sweep_monitor_artifacts()

    assert res["deleted"] >= 2
    assert not old_ndjson.exists()
    assert not (exports / "old-run.json").exists()
    assert not old_video.exists()
    # свежие остались
    assert fresh_ndjson.exists()
    assert fresh_video.exists()


def test_lazy_sweep_throttled(tmp_path, monkeypatch):
    exports = tmp_path / "exports"
    exports.mkdir(parents=True)
    monkeypatch.setattr(monitor_retention, "LIVE_EXPORTS_DIR", exports)
    monkeypatch.setattr(monitor_retention, "VIDEO_DIR", tmp_path / "video")

    monitor_retention._last_sweep_ts = time.time()
    res = monitor_retention.lazy_sweep_monitor_artifacts()
    assert res.get("skipped") is True
    assert res["deleted"] == 0
