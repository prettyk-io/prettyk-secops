# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path


def test_notify_results_hook_falls_back_to_file(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("KDT_LIVE", "1")
    monkeypatch.setenv("KDT_LIVE_PORT", "58767")
    live = tmp_path / "live"
    live.mkdir()
    hooks_path = live / "results_hooks.json"
    monkeypatch.setattr("utils.paths.LIVE_DIR", live)
    monkeypatch.setattr("utils.paths.RESULTS_HOOKS_JSON", hooks_path)
    monkeypatch.setattr("utils.diary_bus.RESULTS_HOOKS_JSON", hooks_path)
    monkeypatch.setattr("utils.diary_bus.ensure_live_dir", lambda: live.mkdir(parents=True, exist_ok=True))

    from utils.live_server import notify_results_hook

    # Force HTTP miss → local file bus
    def boom(*_a, **_k):
        raise OSError("refused")

    monkeypatch.setattr("urllib.request.urlopen", boom)
    out = notify_results_hook(
        "allure",
        "http://127.0.0.1:5050/",
        summary={"passed": 1, "failed": 0, "total": 1},
        allure_project_id="default",
    )
    assert out is not None
    assert out.get("ok") is True
    disk = json.loads(hooks_path.read_text(encoding="utf-8"))
    assert disk["allure"]["report_url"].startswith("http://127.0.0.1:5050")
    assert disk["allure"]["summary"]["total"] == 1


def test_notify_results_hook_stores_run_id(tmp_path: Path, monkeypatch):
    """Hook entry carries run_id for per-run filtering."""
    monkeypatch.setenv("KDT_LIVE", "1")
    live = tmp_path / "live"
    live.mkdir()
    hooks_path = live / "results_hooks.json"
    monkeypatch.setattr("utils.paths.LIVE_DIR", live)
    monkeypatch.setattr("utils.paths.RESULTS_HOOKS_JSON", hooks_path)
    monkeypatch.setattr("utils.diary_bus.RESULTS_HOOKS_JSON", hooks_path)
    monkeypatch.setattr("utils.diary_bus.ensure_live_dir", lambda: live.mkdir(parents=True, exist_ok=True))

    from utils.live_server import notify_results_hook

    def boom(*_a, **_k):
        raise OSError("refused")

    monkeypatch.setattr("urllib.request.urlopen", boom)
    notify_results_hook(
        "allure",
        "http://127.0.0.1:5050/",
        run_id="rid-one",
        check_id="check-a",
    )
    notify_results_hook(
        "dojo",
        "http://127.0.0.1:8081/",
        run_id="rid-two",
        check_id="check-a",
    )
    disk = json.loads(hooks_path.read_text(encoding="utf-8"))
    assert disk["allure"]["run_id"] == "rid-one"
    assert disk["allure"]["check_id"] == "check-a"
    assert disk["dojo"]["run_id"] == "rid-two"
    assert disk["dojo"]["check_id"] == "check-a"

    # get_results_hooks filters by run_id
    hooks_r1 = __import__("utils.diary_bus", fromlist=["get_results_hooks"]).get_results_hooks(run_id="rid-one")
    assert hooks_r1["allure"] is not None
    assert hooks_r1["dojo"] is None
