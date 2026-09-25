# -*- coding: utf-8 -*-
"""AL3-FRESH-REPAIR live: default-генерация не сносит отчёты чеков; URL 200.

Гоняется на живом стенде (:5050); требует доступ к reports/ репы (в лабе это
те же bind-mount'ы, что видит контейнер).
"""
from __future__ import annotations

import json
import shutil
import time
import urllib.request
import uuid
from pathlib import Path

import pytest

BASE = "http://127.0.0.1:5050"
_REPO = Path(__file__).resolve().parents[2]
_RESULTS = _REPO / "reports" / "allure-results"
_REPORTS = _REPO / "reports" / "allure3-report"
_PROBE_ID = "al3-fresh-probe"


def _get(path: str, timeout: float = 90.0):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=timeout) as resp:
        return resp.status, resp.read()


def _healthy() -> bool:
    try:
        return _get("/health", timeout=3)[0] == 200
    except Exception:
        return False


pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not _healthy(), reason="allure3 :5050 не поднят"),
    pytest.mark.skipif(not _RESULTS.is_dir(), reason="reports/allure-results недоступен"),
]


def _minimal_result(result_uuid: str, name: str) -> dict:
    now = int(time.time() * 1000)
    return {
        "uuid": result_uuid,
        "historyId": f"al3-fresh:{name}",
        "name": name,
        "fullName": name,
        "status": "passed",
        "stage": "finished",
        "start": now,
        "stop": now + 5,
        "labels": [],
        "links": [],
        "parameters": [],
        "steps": [],
        "attachments": [],
    }


def test_default_generate_preserves_check_reports():
    scope_results = _RESULTS / _PROBE_ID
    scope_report = _REPORTS / _PROBE_ID
    try:
        scope_results.mkdir(parents=True, exist_ok=True)
        probe_uuid = uuid.uuid4().hex
        (scope_results / f"{probe_uuid}-result.json").write_text(
            json.dumps(_minimal_result(probe_uuid, "al3 fresh probe")),
            encoding="utf-8",
        )

        status, body = _get(f"/generate-report?project_id={_PROBE_ID}")
        assert status == 200, body[:300]
        assert json.loads(body)["status"] == "ok", body[:300]
        assert (scope_report / "index.html").is_file()

        check_url = f"/projects/{_PROBE_ID}/reports/latest/index.html"
        assert _get(check_url)[0] == 200

        # деструктивный кейс: default-генерация НЕ должна снести отчёт чека
        status, body = _get("/generate-report?project_id=default")
        assert status == 200, body[:300]
        assert (scope_report / "index.html").is_file(), "default generate wiped check report!"
        assert _get(check_url)[0] == 200
        # default-отчёт живёт в своей подпапке (AL3-FRESH layout)
        assert (_REPORTS / "default" / "index.html").is_file()
    finally:
        shutil.rmtree(scope_results, ignore_errors=True)
        shutil.rmtree(scope_report, ignore_errors=True)
