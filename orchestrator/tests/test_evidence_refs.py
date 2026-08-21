# -*- coding: utf-8 -*-
from utils import evidence_refs as er


def test_upsert_and_list_for_deploy(monkeypatch, tmp_path):
    path = tmp_path / "refs.json"
    monkeypatch.setenv("KDT_EVIDENCE_REFS_PATH", str(path))
    import importlib

    importlib.reload(er)

    er.upsert_check_evidence(
        {
            "check_id": "chk_a",
            "deploy_id": "dep_1",
            "source": "finalize",
            "allure": {
                "report_url": "http://x/projects/chk_a/reports/latest/",
                "allure_project_id": "chk_a",
                "status": "ok",
            },
        }
    )
    er.upsert_check_evidence(
        {
            "check_id": "chk_b",
            "deploy_id": "dep_2",
            "source": "manual",
        }
    )
    items = er.list_evidence_for_deploy("dep_1")
    assert len(items) == 1
    assert items[0]["check_id"] == "chk_a"
    assert items[0]["allure"]["allure_project_id"] == "chk_a"

    hist = er.append_evidence_history(
        "chk_a",
        {"gate": "watch", "note": "High", "dojo_stats": {"high": 1}},
    )
    assert hist is not None
    assert len(hist["history"]) == 1
    assert hist["history"][0]["gate"] == "watch"
    # upsert without history must keep prior timeline
    er.upsert_check_evidence(
        {
            "check_id": "chk_a",
            "deploy_id": "dep_1",
            "source": "finalize",
            "dojo": {"stats": {"high": 1}},
        }
    )
    kept = er.get_check_evidence("chk_a")
    assert kept is not None
    assert len(kept["history"]) == 1
    assert er.list_all_evidence()
