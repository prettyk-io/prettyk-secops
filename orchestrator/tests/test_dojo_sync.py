# -*- coding: utf-8 -*-
"""DEFECTDOJO-BIDIRECTIONAL-SYNC: dojo_sync модуль.

Покрытие:
  - fingerprint (FNV-1a) и unique_id (SHA256) стабильны;
  - finding → Dojo payload (severity/cwe/tags/unique_id);
  - push: dedup по существующему unique_id (инкремент, не дубликат);
  - push: сетевые ошибки / HTTP 5xx → retry → fail (без падения пачки);
  - pull: статусы False Positive / mitigated → suppressed;
  - apply_dojo_suppressions: разбиение active/suppressed.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.dojo_sync import (  # noqa: E402
    apply_dojo_suppressions,
    finding_fingerprint,
    finding_to_dojo_payload,
    finding_unique_id,
    fnv1a_32,
    pull_dojo_statuses,
    push_findings_to_dojo,
)


def _finding(**overrides):
    base = {
        "title": "Server error на эндпоинте (фаззинг)",
        "severity": "high",
        "kind": "server_error",
        "url": "http://x/api",
        "param": "q",
        "payload": "",
        "evidence": "HTTP 500",
        "cwe": "CWE-20",
        "rule_id": "pk_fuzz_server_error",
        "confidence": 2,
        "tags": ["fuzz", "server_error"],
    }
    base.update(overrides)
    return base


# ── fingerprinting ──


def test_fnv1a_32_known_vector():
    # FNV-1a 32 известный вектор: пустая строка = 0x811c9dc5
    assert fnv1a_32("") == "811c9dc5"


def test_fingerprint_stable():
    a = _finding()
    b = _finding()
    assert finding_fingerprint(a) == finding_fingerprint(b)
    assert len(finding_fingerprint(a)) == 8


def test_unique_id_stable_and_different_on_param():
    a = _finding()
    b = _finding(param="other")
    assert finding_unique_id(a) == finding_unique_id(a)  # NOSONAR — idempotency check: same input → same output
    assert finding_unique_id(a) != finding_unique_id(b)
    assert finding_unique_id(a).startswith("pk-")


# ── payload mapping ──


def test_finding_to_dojo_payload():
    p = finding_to_dojo_payload(_finding(), test_id=7)
    assert p["test"] == 7
    assert p["severity"] == "High"
    assert p["cwe"] == 20
    assert p["unique_id_from_tool"] == finding_unique_id(_finding())
    assert p["false_p"] is False
    assert p["active"] is True
    assert "fuzz" in p["tags"]


def test_finding_to_dojo_payload_severity_info():
    p = finding_to_dojo_payload(_finding(severity="informational"), test_id=1)
    assert p["severity"] == "Info"


def test_finding_to_dojo_payload_cwe_variants():
    assert finding_to_dojo_payload(_finding(cwe="79"), test_id=1)["cwe"] == 79
    assert finding_to_dojo_payload(_finding(cwe=None), test_id=1)["cwe"] == 0


# ── push / pull (mock requests) ──


class _FakeResp:
    def __init__(self, status_code=200, body=None):
        self.status_code = status_code
        self._body = body if body is not None else {}

    def json(self):
        return self._body


def _capture(method, status_code=201, body=None):
    calls = {"n": 0, "last": None}

    def fake(method_, url, **kwargs):
        calls["n"] += 1
        calls["last"] = (method_, url, kwargs)
        return _FakeResp(status_code, body)

    return fake, calls


def test_push_not_configured(monkeypatch):
    monkeypatch.delenv("PK_DEFECTDOJO_URL", raising=False)
    monkeypatch.delenv("PK_DEFECTDOJO_TOKEN", raising=False)
    monkeypatch.setattr("services.dojo_sync._config", lambda: ("", ""))
    res = push_findings_to_dojo([_finding()], test_id=1)
    assert res["ok"] is False
    assert res["errors"] == ["not_configured"]


def test_push_creates_and_dedupes(monkeypatch):
    monkeypatch.setattr("services.dojo_sync._config", lambda: ("http://dojo", "tok"))

    # GET (existing) вернёт ничего → создаём; на второй находке GET вернёт id=9
    seq = []

    def fake_find_existing(unique_id, test_id, dojo_url, token, timeout):
        return 9 if seq else None

    def fake_get(method, url, headers=None, params=None, json=None, timeout=None):
        return _FakeResp(200, {"results": []})

    def fake_post(method, url, headers=None, params=None, json=None, timeout=None):
        return _FakeResp(201, {"id": 11})

    # первый вызов существующей проверки — не находим (создаём), второй — находим (dedup)
    from services import dojo_sync

    monkeypatch.setattr(dojo_sync, "_find_existing_finding", lambda *a, **k: 9 if seq else None)

    def fake_request(method, url, **kwargs):
        if method == "POST":
            seq.append("create")
            return _FakeResp(201, {"id": 11})
        seq.append("get")
        return _FakeResp(200, {"results": []})

    monkeypatch.setattr(dojo_sync, "_request_with_retry", fake_request)

    res = push_findings_to_dojo([_finding(), _finding()], test_id=1)
    assert res["created"] == 1
    assert res["deduped"] == 1
    assert res["failed"] == 0
    assert res["ok"] is True


def test_push_retries_then_fails(monkeypatch):
    from services import dojo_sync

    monkeypatch.setattr(dojo_sync, "_config", lambda: ("http://dojo", "tok"))
    monkeypatch.setattr(dojo_sync, "_find_existing_finding", lambda *a, **k: None)

    calls = {"n": 0}

    def fake_request(method, url, **kwargs):
        calls["n"] += 1
        raise __import__("requests").exceptions.ConnectionError("boom")

    monkeypatch.setattr(dojo_sync, "_request_with_retry", fake_request)
    monkeypatch.setattr(dojo_sync.time, "sleep", lambda s: None)

    res = push_findings_to_dojo([_finding()], test_id=1, timeout=1)
    assert res["failed"] == 1
    assert res["created"] == 0
    assert calls["n"] == 1  # _request_with_retry делает все retry внутри (замокан)
    assert "boom" in res["errors"][0] or res["errors"]


def test_request_with_retry_backoff_on_5xx(monkeypatch):
    from services import dojo_sync

    calls = {"n": 0}

    class _Resp:
        status_code = 500

        def json(self):
            return {}

    def fake_request(method, url, **kwargs):
        calls["n"] += 1
        return _Resp()

    monkeypatch.setattr(dojo_sync.requests, "request", fake_request)
    monkeypatch.setattr(dojo_sync.time, "sleep", lambda s: None)

    with pytest.raises(Exception):
        dojo_sync._request_with_retry("GET", "http://dojo/x", retries=2, backoff_base=1, timeout=1)
    assert calls["n"] == 3  # initial + 2 retries


# ── pull / suppressions ──


def test_pull_dojo_statuses_suppresses_false_positive(monkeypatch):
    from services import dojo_sync

    monkeypatch.setattr(dojo_sync, "_config", lambda: ("http://dojo", "tok"))

    def fake_request(method, url, **kwargs):
        return _FakeResp(200, {"results": [{"id": 3, "active": True, "false_p": True, "is_mitigated": False, "severity": "High"}]})

    monkeypatch.setattr(dojo_sync, "_request_with_retry", fake_request)

    statuses = pull_dojo_statuses([_finding()], test_id=1)
    assert statuses["ok"] is True
    assert statuses["suppressed_count"] == 1
    assert finding_fingerprint(_finding()) in statuses["suppressed"]


def test_apply_dojo_suppressions_split():
    f1 = _finding()
    f2 = _finding(param="other")
    statuses = {
        "suppressed": [finding_fingerprint(f1)],
        "active_count": 1,
        "suppressed_count": 1,
    }
    active, suppressed = apply_dojo_suppressions([f1, f2], statuses)
    assert len(active) == 1
    assert len(suppressed) == 1
    assert active[0]["param"] == "other"
