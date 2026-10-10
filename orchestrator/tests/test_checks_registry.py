# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import time

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


# ── REGISTRY-RUN-STATUS-HYGIENE ─────────────────────────────────────────────


def _seed_registry(tmp_path, items):
    """Записать реестр напрямую (симуляция legacy-файла, минуя reconcile на save)."""
    payload = {"version": 1, "items": items, "saved_at": "2026-09-24T00:00:00Z"}
    (tmp_path / "checks_registry.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return payload


def _run_item(runs):
    return {
        "check_id": "chk_hygiene",
        "title": "Hygiene",
        "status": "ready",
        "created_at": "2026-09-01T00:00:00Z",
        "updated_at": "2026-09-24T00:00:00Z",
        "runs": runs,
    }


def test_load_reconciles_running_from_runs_index(tmp_path, monkeypatch):
    """running-статусы runs[] синхронизируются из runs_index при чтении."""
    monkeypatch.setattr(reg, "LIVE_DIR", tmp_path)
    index_path = tmp_path / "runs_index.ndjson"
    index_path.write_text(
        json.dumps(
            {"run_id": "run-aaaaaaaaaaaa", "status": "running", "ended_at": "2026-09-24T10:00:00Z"}
        )
        + "\n"
        + json.dumps(
            {
                "run_id": "run-aaaaaaaaaaaa",
                "status": "failed",
                "ended_at": "2026-09-24T10:05:00Z",
                "ci_verdict": "fail_run",
            }
        )
        + "\n"
        # legacy-зомби без run-каталога: running, но активность древняя
        + json.dumps({"run_id": "2d6e7a08bf0b", "status": "running", "last_run_ts": 1787938324.0})
        + "\n"
        # свежий running без каталога — считаем возможно живым
        + json.dumps({"run_id": "run-dddddddddddd", "status": "running", "last_run_ts": time.time()})
        + "\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("PK_RUNS_INDEX_PATH", str(index_path))
    runs_dir = tmp_path / "runs"
    (runs_dir / "run-cccccccccccc").mkdir(parents=True)
    from utils import paths as paths_mod

    monkeypatch.setattr(paths_mod, "RUNS_DIR", runs_dir)

    _seed_registry(
        tmp_path,
        [
            _run_item(
                [
                    {"run_id": "run-aaaaaaaaaaaa", "status": "running"},
                    {"run_id": "run-bbbbbbbbbbbb", "status": "running"},
                    {"run_id": "run-cccccccccccc", "status": "running"},
                    {"run_id": "2d6e7a08bf0b", "status": "running"},
                    {"run_id": "run-dddddddddddd", "status": "running"},
                ]
            )
        ],
    )

    loaded = reg.load_checks_registry()
    runs = {r["run_id"]: r for r in loaded["items"][0]["runs"]}
    # терминал из runs_index принят
    assert runs["run-aaaaaaaaaaaa"]["status"] == "failed"
    assert runs["run-aaaaaaaaaaaa"]["ci_verdict"] == "fail_run"
    assert runs["run-aaaaaaaaaaaa"]["ended_at"] == "2026-09-24T10:05:00Z"
    # мёртвая локальная ссылка без терминала отсечена (существующий prune)
    assert "run-bbbbbbbbbbbb" not in runs
    # живой прогон (есть run-каталог) остался running
    assert runs["run-cccccccccccc"]["status"] == "running"
    # legacy-зомби (running, но активность древняя) закрыт терминально
    assert runs["2d6e7a08bf0b"]["status"] == "expired"
    # свежий running без каталога — считаем живым
    assert runs["run-dddddddddddd"]["status"] == "running"
    assert loaded["runs_status_reconciled"] == {
        "checked": 5,
        "adopted": 1,
        "expired": 2,
        "left_running": 2,
    }
    assert loaded["pruned_dead_runs"] >= 1


def test_save_reconciles_running_zombies(tmp_path, monkeypatch):
    """Сейв (FE PUT) не может воскресить «вечный running» — reconcile на записи."""
    monkeypatch.setattr(reg, "LIVE_DIR", tmp_path)
    index_path = tmp_path / "runs_index.ndjson"
    index_path.write_text(
        json.dumps({"run_id": "run-aaaaaaaaaaaa", "status": "success"}) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("PK_RUNS_INDEX_PATH", str(index_path))
    from utils import paths as paths_mod

    monkeypatch.setattr(paths_mod, "RUNS_DIR", tmp_path / "runs_none")

    code, saved = reg.save_checks_registry(
        {
            "version": 1,
            "items": [_run_item([{"run_id": "run-aaaaaaaaaaaa", "status": "running"}])],
        }
    )
    assert code == 200 and saved["ok"] is True
    assert saved["runs_status_reconciled"]["adopted"] == 1
    disk = json.loads((tmp_path / "checks_registry.json").read_text(encoding="utf-8"))
    assert disk["items"][0]["runs"][0]["status"] == "success"


def test_reconcile_registry_file_closes_zombies(tmp_path, monkeypatch):
    """Разовая гигиена файла: зомби закрыты терминально, история сохранена."""
    monkeypatch.setattr(reg, "LIVE_DIR", tmp_path)
    index_path = tmp_path / "runs_index.ndjson"
    index_path.write_text(
        json.dumps({"run_id": "run-aaaaaaaaaaaa", "status": "success"}) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("PK_RUNS_INDEX_PATH", str(index_path))
    from utils import paths as paths_mod

    monkeypatch.setattr(paths_mod, "RUNS_DIR", tmp_path / "runs_none")

    _seed_registry(
        tmp_path,
        [
            _run_item(
                [
                    {"run_id": "run-aaaaaaaaaaaa", "status": "running"},
                    {"run_id": "run-bbbbbbbbbbbb", "status": "running"},
                ]
            )
        ],
    )

    result = reg.reconcile_checks_registry_file()
    assert result["ok"] is True
    assert result["reconciled"]["adopted"] == 1
    assert result["reconciled"]["expired"] == 1

    disk = json.loads((tmp_path / "checks_registry.json").read_text(encoding="utf-8"))
    statuses = {r["run_id"]: r["status"] for r in disk["items"][0]["runs"]}
    assert statuses == {"run-aaaaaaaaaaaa": "success", "run-bbbbbbbbbbbb": "expired"}
