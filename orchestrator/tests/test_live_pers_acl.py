# -*- coding: utf-8 -*-
from utils.live_pers_acl import (
    filter_evidence_list,
    filter_runs_for_caller,
    issue_monitor_token,
    may_view_owner,
    parse_caller_user,
    redact_meta_for_caller,
    resolve_run_owner_user_id,
    verify_monitor_token,
)


def test_resolve_run_owner_user_id(monkeypatch):
    monkeypatch.delenv("PK_OWNER_USER", raising=False)
    monkeypatch.delenv("PK_USER", raising=False)
    assert resolve_run_owner_user_id("  alice  ") == "alice"
    assert resolve_run_owner_user_id() is None
    monkeypatch.setenv("PK_USER", "from_user")
    assert resolve_run_owner_user_id() == "from_user"
    monkeypatch.setenv("PK_OWNER_USER", "from_owner")
    assert resolve_run_owner_user_id() == "from_owner"
    assert resolve_run_owner_user_id("explicit") == "explicit"


def test_parse_caller_and_matrix():
    assert parse_caller_user({"X-PK-User": "debug"}) == "debug"
    assert parse_caller_user({"Cookie": "a=1; pk_user=admin; b=2"}) == "admin"
    assert may_view_owner(caller="debug", owner="debug")
    assert not may_view_owner(caller="debug", owner="admin")
    assert may_view_owner(caller="admin", owner="debug")
    assert may_view_owner(caller="debug", owner="legacy")


def test_redact_and_filter():
    meta = redact_meta_for_caller(
        {"owner_user_id": "admin", "novnc_url": "http://n", "hooks": {"allure_report_url": "http://a"}},
        caller="debug",
    )
    assert meta["novnc_url"] is None
    assert meta["pers_redacted"] is True
    kept, hidden = filter_evidence_list(
        [
            {"check_id": "1", "owner_user_id": "debug"},
            {"check_id": "2", "owner_user_id": "admin"},
            {"check_id": "3"},
        ],
        caller="debug",
    )
    assert hidden == 1
    assert {r["check_id"] for r in kept} == {"1", "3"}


# ─────────────────────────── MON-13: bind-токен ───────────────────────────


def test_issue_and_verify_token_roundtrip():
    token = issue_monitor_token("run-abc", "alice", now=1000.0)
    assert token.count(".") == 1
    assert verify_monitor_token(token, "run-abc", now=1000.0) == "alice"


def test_verify_token_wrong_run_id():
    token = issue_monitor_token("run-abc", "alice", now=1000.0)
    assert verify_monitor_token(token, "run-xyz", now=1000.0) is None


def test_verify_token_expired():
    token = issue_monitor_token("run-abc", "alice", ttl=10, now=1000.0)
    assert verify_monitor_token(token, "run-abc", now=1000.0) == "alice"
    assert verify_monitor_token(token, "run-abc", now=1011.0) is None


def test_verify_token_tampered():
    token = issue_monitor_token("run-abc", "alice", now=1000.0)
    payload, _, sig = token.partition(".")
    forged = f"{payload}.{('0' * len(sig))}"
    assert verify_monitor_token(forged, "run-abc", now=1000.0) is None


def test_verify_token_garbage():
    assert verify_monitor_token("", "run-abc") is None
    assert verify_monitor_token("nope", "run-abc") is None
    assert verify_monitor_token("a.b.c", "run-abc") is None


def test_issue_token_requires_run_and_owner():
    import pytest

    with pytest.raises(ValueError):
        issue_monitor_token("", "alice")
    with pytest.raises(ValueError):
        issue_monitor_token("run-abc", "")


# ─────────────────────────── MH-7: ACL-черновик ───────────────────────────


def test_filter_runs_for_caller_no_caller_shows_all():
    runs = [
        {"run_id": "r1", "owner_user_id": "alice"},
        {"run_id": "r2", "owner_user_id": "bob"},
        {"run_id": "r3"},
    ]
    assert len(filter_runs_for_caller(runs, caller=None)) == 3


def test_filter_runs_for_caller_admin_sees_all():
    runs = [
        {"run_id": "r1", "owner_user_id": "alice"},
        {"run_id": "r2", "owner_user_id": "bob"},
    ]
    for admin in ("admin", "admin_appsec", "admin_abnormal"):
        assert len(filter_runs_for_caller(runs, caller=admin)) == 2


def test_filter_runs_for_caller_operator_sees_only_own():
    runs = [
        {"run_id": "r1", "owner_user_id": "alice"},
        {"run_id": "r2", "owner_user_id": "bob"},
        {"run_id": "r3"},  # legacy без owner — виден всем
    ]
    filtered = filter_runs_for_caller(runs, caller="alice")
    rids = {r["run_id"] for r in filtered}
    assert rids == {"r1", "r3"}


def test_filter_apps_by_caller_strips_empty_deploys():
    from utils.live_server import _filter_apps_by_caller

    apps = [
        {
            "app_code": "IB_WEB",
            "deploys": [
                {
                    "deploy_url": "https://ib.local/",
                    "instances": [
                        {"instance_id": "ck1", "owner": "alice"},
                        {"instance_id": "ck2", "owner": "bob"},
                    ],
                },
                {
                    "deploy_url": "https://ib2.local/",
                    "instances": [
                        {"instance_id": "ck3", "owner": "alice"},
                    ],
                },
            ],
        },
        {
            "app_code": "CRM",
            "deploys": [
                {
                    "deploy_url": "https://crm.local/",
                    "instances": [
                        {"instance_id": "ck4", "owner": "bob"},
                    ],
                },
            ],
        },
    ]
    filtered = _filter_apps_by_caller(apps, "alice")
    # CRM — все instance'ы bob → должен исчезнуть
    assert len(filtered) == 1
    assert filtered[0]["app_code"] == "IB_WEB"
    # IB_WEB: первый deploy — только ck1 (не ck2), второй deploy — ck3
    deploys = filtered[0]["deploys"]
    assert len(deploys) == 2
    insts0 = deploys[0]["instances"]
    assert len(insts0) == 1
    assert insts0[0]["instance_id"] == "ck1"
    insts1 = deploys[1]["instances"]
    assert len(insts1) == 1
    assert insts1[0]["instance_id"] == "ck3"
