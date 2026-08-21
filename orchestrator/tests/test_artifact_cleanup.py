# -*- coding: utf-8 -*-
from datetime import datetime, timedelta, timezone
from pathlib import Path

from utils.artifact_cleanup import (
    count_held_checks,
    list_retention_candidates,
    purge_check_artifacts,
    purge_disk_for_check,
    purge_dojo_for_check,
    read_cleanup_audit,
    scan_orphan_run_dirs,
)
from utils.artifact_index import (
    record_finalize_artifacts,
    set_check_legal_hold,
    summarize_checks_for_badges,
)
from utils.retention_policy import save_retention_policy


def test_retention_candidates_and_disk_purge(tmp_path, monkeypatch):
    monkeypatch.setenv("KDT_ARTIFACT_INDEX_PATH", str(tmp_path / "idx.json"))
    monkeypatch.setenv("KDT_RETENTION_POLICY_PATH", str(tmp_path / "ret.json"))
    save_retention_policy({"artifact_retention_days": 7})

    run_dir = tmp_path / "reports" / "runs" / "old"
    run_dir.mkdir(parents=True)
    (run_dir / "x.txt").write_text("x", encoding="utf-8")
    zap = tmp_path / "reports" / "zap-results" / "z.xml"
    zap.parent.mkdir(parents=True)
    zap.write_text("<z/>", encoding="utf-8")

    from utils import artifact_index as ai
    import utils.paths as paths_mod

    monkeypatch.setattr(paths_mod, "REPORTS_DIR", tmp_path / "reports")
    monkeypatch.setattr(paths_mod, "RUNS_DIR", tmp_path / "reports" / "runs")
    monkeypatch.setattr(paths_mod, "ZAP_RESULTS_DIR", tmp_path / "reports" / "zap-results")
    monkeypatch.setattr(
        paths_mod, "ALLURE_RESULTS_DIR", tmp_path / "reports" / "allure-results"
    )

    entry = record_finalize_artifacts(
        check_id="chk_old",
        run_id="old",
        run_dir=run_dir,
        zap_xml=zap,
    )
    # age the recorded_at
    snap = ai.load_artifact_index()
    old_ts = (datetime.now(timezone.utc) - timedelta(days=30)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    snap["checks"]["chk_old"]["runs"][0]["recorded_at"] = old_ts
    ai.save_artifact_index(snap)

    cands = list_retention_candidates(days=7)
    assert any(c["check_id"] == "chk_old" for c in cands)

    dry = purge_disk_for_check("chk_old", dry_run=True)
    assert dry["ok"]
    assert dry["deleted"]

    live = purge_disk_for_check("chk_old", dry_run=False)
    assert live["ok"]
    assert not run_dir.exists()


def test_dojo_purge_skips_fixed_mode(tmp_path, monkeypatch):
    monkeypatch.setenv("KDT_ARTIFACT_INDEX_PATH", str(tmp_path / "idx.json"))
    monkeypatch.setenv("KDT_DEFECTDOJO_ENGAGEMENT_MODE", "fixed")
    record_finalize_artifacts(
        check_id="chk_d",
        run_id="r",
        dojo={"test_id": 1},
    )
    res = purge_dojo_for_check("chk_d", dry_run=True)
    assert res["ok"]
    assert "skip_dojo_mode_fixed" in str(res.get("skipped"))


def test_orphan_scan_and_badges_and_audit(tmp_path, monkeypatch):
    monkeypatch.setenv("KDT_ARTIFACT_INDEX_PATH", str(tmp_path / "idx.json"))
    monkeypatch.setenv("KDT_ARTIFACT_AUDIT_PATH", str(tmp_path / "audit.ndjson"))
    runs = tmp_path / "reports" / "runs"
    known = runs / "known"
    orphan = runs / "orphan_x"
    known.mkdir(parents=True)
    orphan.mkdir(parents=True)
    (orphan / "f.txt").write_text("o", encoding="utf-8")

    import utils.paths as paths_mod

    monkeypatch.setattr(paths_mod, "RUNS_DIR", runs)
    monkeypatch.setattr(paths_mod, "REPORTS_DIR", tmp_path / "reports")

    record_finalize_artifacts(
        check_id="chk_known",
        run_id="known",
        run_dir=known,
    )
    orphans = scan_orphan_run_dirs(runs_root=runs)
    assert any(o["run_id_guess"] == "orphan_x" for o in orphans)
    assert not any(o["run_id_guess"] == "known" for o in orphans)

    badges = summarize_checks_for_badges()
    assert badges["chk_known"]["has_artifacts"] is True

    # write audit via purge dry path append — use disk purge execute empty skip
    from utils.artifact_cleanup import _append_audit

    _append_audit({"action": "purge_disk", "check_id": "chk_known", "dry_run": True})
    events = read_cleanup_audit(limit=10)
    assert events and events[0].get("action") == "purge_disk"


def test_legal_hold_skips_retention_and_refuses_purge(tmp_path, monkeypatch):
    monkeypatch.setenv("KDT_ARTIFACT_INDEX_PATH", str(tmp_path / "idx.json"))
    monkeypatch.setenv("KDT_RETENTION_POLICY_PATH", str(tmp_path / "ret.json"))
    save_retention_policy({"artifact_retention_days": 7})

    run_dir = tmp_path / "reports" / "runs" / "held"
    run_dir.mkdir(parents=True)
    (run_dir / "x.txt").write_text("x", encoding="utf-8")

    import utils.paths as paths_mod

    monkeypatch.setattr(paths_mod, "REPORTS_DIR", tmp_path / "reports")
    monkeypatch.setattr(paths_mod, "RUNS_DIR", tmp_path / "reports" / "runs")
    monkeypatch.setattr(paths_mod, "ZAP_RESULTS_DIR", tmp_path / "reports" / "zap-results")
    monkeypatch.setattr(
        paths_mod, "ALLURE_RESULTS_DIR", tmp_path / "reports" / "allure-results"
    )

    from utils import artifact_index as ai

    record_finalize_artifacts(check_id="chk_hold", run_id="held", run_dir=run_dir)
    snap = ai.load_artifact_index()
    old_ts = (datetime.now(timezone.utc) - timedelta(days=30)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    snap["checks"]["chk_hold"]["runs"][0]["recorded_at"] = old_ts
    ai.save_artifact_index(snap)

    set_check_legal_hold("chk_hold", True, note="bank matter")
    assert count_held_checks() == 1
    assert not any(c["check_id"] == "chk_hold" for c in list_retention_candidates(days=7))

    refused = purge_check_artifacts("chk_hold", dry_run=False)
    assert refused["ok"] is False
    assert refused.get("error") == "legal_hold"
    assert run_dir.exists()

    badges = summarize_checks_for_badges()
    assert badges["chk_hold"]["legal_hold"] is True

    set_check_legal_hold("chk_hold", False)
    assert any(c["check_id"] == "chk_hold" for c in list_retention_candidates(days=7))
    live = purge_disk_for_check("chk_hold", dry_run=False)
    assert live["ok"]
    assert not run_dir.exists()
