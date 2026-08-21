# -*- coding: utf-8 -*-
from __future__ import annotations

import json

import utils.checks_registry as reg


def test_load_empty_when_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(reg, "LIVE_DIR", tmp_path)
    payload = reg.load_checks_registry()
    assert payload["ok"] is True
    assert payload["version"] == 1
    assert payload["items"] == []


def test_save_and_load_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(reg, "LIVE_DIR", tmp_path)
    code, saved = reg.save_checks_registry(
        {
            "version": 1,
            "items": [
                {
                    "check_id": "chk_1",
                    "title": "Demo",
                    "status": "ready",
                    "created_at": "2026-08-11T00:00:00Z",
                    "updated_at": "2026-08-11T01:00:00Z",
                    "wired": {"meta": {"name": "Demo"}},
                    "runs": [{"run_id": "r1", "status": "success"}],
                },
                {"title": "no id skipped"},
            ],
        }
    )
    assert code == 200
    assert saved["ok"] is True
    assert saved["count"] == 1
    path = tmp_path / "checks_registry.json"
    assert path.is_file()
    disk = json.loads(path.read_text(encoding="utf-8"))
    assert disk["items"][0]["check_id"] == "chk_1"
    loaded = reg.load_checks_registry()
    assert len(loaded["items"]) == 1
    assert loaded["items"][0]["title"] == "Demo"
    assert loaded["items"][0]["runs"][0]["run_id"] == "r1"


def test_save_rejects_bad_version(tmp_path, monkeypatch):
    monkeypatch.setattr(reg, "LIVE_DIR", tmp_path)
    code, payload = reg.save_checks_registry({"version": 2, "items": []})
    assert code == 400
    assert payload["ok"] is False
