# -*- coding: utf-8 -*-
from pathlib import Path

from utils.artifact_index import (
    get_check_entry,
    load_artifact_index,
    record_finalize_artifacts,
    unlink_check,
)


def test_record_and_load_roundtrip(tmp_path, monkeypatch):
    idx = tmp_path / "artifact_index.json"
    monkeypatch.setenv("PK_ARTIFACT_INDEX_PATH", str(idx))
    scanner = tmp_path / "scanner.xml"
    scanner.write_text("<xml/>", encoding="utf-8")
    run_dir = tmp_path / "runs" / "r1"
    run_dir.mkdir(parents=True)

    entry = record_finalize_artifacts(
        check_id="chk_a",
        run_id="r1",
        run_dir=run_dir,
        scanner_xml=scanner,
        allure_results_dir=tmp_path / "allure-results",
        allure_report_url="http://127.0.0.1:5050/",
        dojo={"test_id": 9, "engagement_id": 3, "engagement_url": "http://dd/e/3"},
        hooks={"allure": "http://127.0.0.1:5050/"},
    )
    assert entry is not None
    assert entry["check_id"] == "chk_a"
    assert len(entry["runs"]) == 1
    run = entry["runs"][0]
    assert run["run_id"] == "r1"
    assert run["paths"]["scanner_xml"] == str(scanner)
    assert run["dojo"]["test_id"] == 9

    loaded = load_artifact_index()
    assert "chk_a" in loaded["checks"]
    again = get_check_entry("chk_a")
    assert again and again["runs"][0]["hooks"]["allure"]

    # second finalize same run_id replaces
    record_finalize_artifacts(
        check_id="chk_a",
        run_id="r1",
        scanner_xml=scanner,
        dojo={"test_id": 10},
    )
    assert len(get_check_entry("chk_a")["runs"]) == 1
    assert get_check_entry("chk_a")["runs"][0]["dojo"]["test_id"] == 10

    assert unlink_check("chk_a") is True
    assert get_check_entry("chk_a") is None


def test_missing_check_id_noop(tmp_path, monkeypatch):
    monkeypatch.setenv("PK_ARTIFACT_INDEX_PATH", str(tmp_path / "i.json"))
    assert record_finalize_artifacts(check_id="", run_id="x") is None
