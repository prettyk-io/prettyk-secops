# -*- coding: utf-8 -*-
"""
RET-TEST: Тестирование retention manager и API управления хранилищем.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest
from utils.retention_manager import (
    PROTECTED_META_FILES,
    cleanup_artifacts,
    cleanup_temp_dumps,
    scan_storage_status,
)


def test_scan_storage_status(tmp_path, monkeypatch):
    video_dir = tmp_path / "video"
    video_dir.mkdir(parents=True)
    live_exports = tmp_path / "live" / "exports"
    live_exports.mkdir(parents=True)
    allure_dir = tmp_path / "allure-results"
    allure_dir.mkdir(parents=True)
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir(parents=True)

    # Создаем тестовые файлы
    (video_dir / "run1_test.mp4").write_bytes(b"0" * 1024)
    (live_exports / "run1.ndjson").write_bytes(b"0" * 512)
    (live_exports / "run1.json").write_bytes(b"0" * 256)
    (allure_dir / "allure_meta.json").write_bytes(b"0" * 128)
    (runs_dir / "run1").mkdir()
    (runs_dir / "run1" / "log.txt").write_bytes(b"0" * 64)

    monkeypatch.setattr("utils.retention_manager.VIDEO_DIR", video_dir)
    monkeypatch.setattr("utils.retention_manager.LIVE_EXPORTS_DIR", live_exports)
    monkeypatch.setattr("utils.retention_manager.ALLURE_RESULTS_DIR", allure_dir)
    monkeypatch.setattr("utils.retention_manager.RUNS_DIR", runs_dir)
    monkeypatch.setattr("utils.retention_manager.LIVE_DIR", tmp_path / "live")

    status = scan_storage_status()
    assert status["ok"] is True
    assert status["total_bytes"] == (1024 + 512 + 256 + 128 + 64)
    assert status["categories"]["recordings"]["count"] == 1
    assert status["categories"]["journal_exports"]["count"] == 2
    assert status["categories"]["allure_results"]["count"] == 1
    assert status["categories"]["runs_data"]["count"] == 1


def test_cleanup_artifacts_by_age_and_protection(tmp_path, monkeypatch):
    video_dir = tmp_path / "video"
    video_dir.mkdir(parents=True)
    live_exports = tmp_path / "live" / "exports"
    live_exports.mkdir(parents=True)
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir(parents=True)

    old_file_video = video_dir / "old_run.mp4"
    old_file_video.write_bytes(b"old video content")
    new_file_video = video_dir / "new_run.mp4"
    new_file_video.write_bytes(b"new video content")

    old_export = live_exports / "old_export.ndjson"
    old_export.write_bytes(b"old export content")
    protected_meta = live_exports / "runs_index.ndjson"
    protected_meta.write_bytes(b"critical meta ledger")

    old_run_dir = runs_dir / "old_check_id"
    old_run_dir.mkdir()
    (old_run_dir / "data.txt").write_bytes(b"old run data")

    # Имитируем старый возраст (10 дней назад)
    ten_days_ago = time.time() - (10 * 86400)
    os.utime(old_file_video, (ten_days_ago, ten_days_ago))
    os.utime(old_export, (ten_days_ago, ten_days_ago))
    os.utime(protected_meta, (ten_days_ago, ten_days_ago))
    os.utime(old_run_dir, (ten_days_ago, ten_days_ago))

    monkeypatch.setattr("utils.retention_manager.VIDEO_DIR", video_dir)
    monkeypatch.setattr("utils.retention_manager.LIVE_EXPORTS_DIR", live_exports)
    monkeypatch.setattr("utils.retention_manager.RUNS_DIR", runs_dir)

    # Очистка старше 7 дней
    res = cleanup_artifacts(days_older_than=7, dry_run=False)

    assert res["ok"] is True
    assert res["deleted_count"] >= 3
    assert not old_file_video.exists()
    assert new_file_video.exists()
    assert not old_export.exists()
    assert protected_meta.exists()  # Защищенный файл остался целым
    assert not old_run_dir.exists()


def test_cleanup_temp_dumps(tmp_path, monkeypatch):
    live_exports = tmp_path / "live" / "exports"
    live_exports.mkdir(parents=True)

    temp_1 = live_exports / "dump_1.ndjson"
    temp_1.write_bytes(b"temp 1")
    protected_meta = live_exports / "runs_index.ndjson"
    protected_meta.write_bytes(b"important index")

    monkeypatch.setattr("utils.retention_manager.LIVE_EXPORTS_DIR", live_exports)

    res = cleanup_temp_dumps(dry_run=False)
    assert res["ok"] is True
    assert res["deleted_count"] == 1
    assert not temp_1.exists()
    assert protected_meta.exists()
