# -*- coding: utf-8 -*-
from pathlib import Path

from utils.runs_index import append_run_index, list_run_apps, list_run_index, upsert_run_index


def test_append_and_list(tmp_path: Path, monkeypatch):
    path = tmp_path / "runs_index.ndjson"
    monkeypatch.setenv("KDT_RUNS_INDEX_PATH", str(path))
    append_run_index({"run_id": "r1", "status": "success", "ci_verdict": "pass"})
    append_run_index({"run_id": "r2", "status": "failed", "check_id": "c1"})
    rows = list_run_index(limit=10)
    assert [r["run_id"] for r in rows] == ["r2", "r1"]
    assert rows[0]["check_id"] == "c1"


def test_list_dedupes_run_id_keeps_newest(tmp_path: Path, monkeypatch):
    path = tmp_path / "runs_index.ndjson"
    monkeypatch.setenv("KDT_RUNS_INDEX_PATH", str(path))
    append_run_index({"run_id": "r1", "status": "running"})
    append_run_index({"run_id": "r1", "status": "success", "ci_verdict": "pass"})
    rows = list_run_index(limit=10)
    assert len(rows) == 1
    assert rows[0]["status"] == "success"


def test_upsert_preserves_space_fields_on_ended(tmp_path: Path, monkeypatch):
    """MH-4/MH-5: run_ended не затирает space-поля из start_run."""
    path = tmp_path / "runs_index.ndjson"
    monkeypatch.setenv("KDT_RUNS_INDEX_PATH", str(path))
    upsert_run_index(
        {
            "run_id": "r1",
            "check_id": "ck1",
            "instance_id": "ck1",
            "app_code": "IB_WEB",
            "deploy_url": "https://ib.local/",
            "status": "running",
            "owner_user_id": "appsec-expert",
            "source": "start_run",
            "first_run_ts": 1000.0,
            "last_run_ts": 1000.0,
        }
    )
    upsert_run_index(
        {
            "run_id": "r1",
            "check_id": "ck1",
            "status": "success",
            "ci_verdict": "pass",
            "source": "run_ended",
        }
    )
    rows = list_run_index(limit=10)
    assert len(rows) == 1
    rec = rows[0]
    assert rec["status"] == "success"
    assert rec["ci_verdict"] == "pass"
    assert rec["instance_id"] == "ck1"
    assert rec["app_code"] == "IB_WEB"
    assert rec["deploy_url"] == "https://ib.local/"
    assert rec["first_run_ts"] == 1000.0


def test_upsert_updates_last_run_ts_not_first(tmp_path: Path, monkeypatch):
    path = tmp_path / "runs_index.ndjson"
    monkeypatch.setenv("KDT_RUNS_INDEX_PATH", str(path))
    upsert_run_index(
        {
            "run_id": "r1",
            "check_id": "ck1",
            "instance_id": "ck1",
            "app_code": "IB_WEB",
            "status": "running",
            "first_run_ts": 1000.0,
            "last_run_ts": 1000.0,
        }
    )
    upsert_run_index(
        {
            "run_id": "r2",
            "check_id": "ck2",
            "instance_id": "ck2",
            "app_code": "IB_WEB",
            "status": "running",
            "first_run_ts": 2000.0,
            "last_run_ts": 2000.0,
        }
    )
    rows = list_run_index(limit=10)
    assert len(rows) == 2
    # первый run app_code сохраняет first_run_ts=1000, второй — свой
    by_id = {r["run_id"]: r for r in rows}
    assert by_id["r1"]["first_run_ts"] == 1000.0
    assert by_id["r2"]["first_run_ts"] == 2000.0


def test_list_run_apps_groups_and_sorts(tmp_path: Path, monkeypatch):
    """MH-3: app → deploy → instance, сортировка по last_run_ts desc."""
    path = tmp_path / "runs_index.ndjson"
    monkeypatch.setenv("KDT_RUNS_INDEX_PATH", str(path))
    # app A (старее), app B (свежее)
    upsert_run_index(
        {
            "run_id": "r1", "check_id": "ck1", "instance_id": "ck1",
            "app_code": "IB_WEB", "deploy_url": "https://ib.local/",
            "status": "success", "first_run_ts": 1000.0, "last_run_ts": 1000.0,
        }
    )
    upsert_run_index(
        {
            "run_id": "r2", "check_id": "ck2", "instance_id": "ck2",
            "app_code": "CRM", "deploy_url": "https://crm.local/",
            "status": "failed", "first_run_ts": 2000.0, "last_run_ts": 2000.0,
        }
    )
    apps = list_run_apps()
    assert [a["app_code"] for a in apps] == ["CRM", "IB_WEB"]
    # app A: один deploy, один instance
    crm = apps[0]
    assert crm["deploys"][0]["deploy_url"] == "https://crm.local/"
    assert crm["deploys"][0]["instances"][0]["instance_id"] == "ck2"
    assert crm["first_run_ts"] == 2000.0
    assert crm["last_run_ts"] == 2000.0


def test_list_run_apps_merges_runs_same_app(tmp_path: Path, monkeypatch):
    path = tmp_path / "runs_index.ndjson"
    monkeypatch.setenv("KDT_RUNS_INDEX_PATH", str(path))
    # два прогона одного app_code → один app, два deploy
    upsert_run_index(
        {
            "run_id": "r1", "check_id": "ck1", "instance_id": "ck1",
            "app_code": "IB_WEB", "deploy_url": "https://ib.local/",
            "status": "success", "first_run_ts": 1000.0, "last_run_ts": 1000.0,
        }
    )
    upsert_run_index(
        {
            "run_id": "r2", "check_id": "ck2", "instance_id": "ck2",
            "app_code": "IB_WEB", "deploy_url": "https://ib2.local/",
            "status": "failed", "first_run_ts": 1000.0, "last_run_ts": 3000.0,
        }
    )
    apps = list_run_apps()
    assert len(apps) == 1
    app = apps[0]
    assert app["app_code"] == "IB_WEB"
    assert app["first_run_ts"] == 1000.0  # минимальный из двух
    assert app["last_run_ts"] == 3000.0   # максимальный
    urls = sorted(d["deploy_url"] for d in app["deploys"])
    assert urls == ["https://ib.local/", "https://ib2.local/"]
