# -*- coding: utf-8 -*-
"""DF-10: session_replay fallback, session_missing hard-fail, session_lost streak."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core import fuzzing
from core.errors import WiredError
from core.fuzzing import (
    Campaign,
    FuzzCampaignRunner,
    FuzzLocation,
    FuzzMessage,
    FuzzPolicy,
    SuiteFuzzerRunner,
    headers_have_session,
    pick_session_headers_from_history,
    session_bound_meta,
)


class _FakeStream:
    def get_path(self, name):
        return ["a", "b", "c", "d", "e"]

    def resolve_arg(self, value):
        return value


class _FakeZap:
    def __init__(self, *, messages=None, status=200, status_sequence=None):
        self.calls = []
        self._messages = list(messages or [])
        self._status = status
        self._status_sequence = list(status_sequence or [])

    def zap_http_request(
        self, method, url, headers=None, body=None, follow_redirects=False
    ):
        self.calls.append((method, url, dict(headers or {})))
        if self._status_sequence:
            status = self._status_sequence.pop(0)
        else:
            status = self._status
        return {"status": status, "body": "ok-body"}

    def get_messages(self, context_name=None):
        return list(self._messages)


def _wave_manifest(*, session_replay=True, headers=None, message=None, base="http://juice-shop:3000"):
    fuzzer = SimpleNamespace(
        id="df10_wave",
        algorithm="triples",
        targets=[
            {
                "url": f"{base}/rest/products/search?q=",
                "method": "GET",
                "corpus": "intent_boundary",
            }
        ],
        policy=SimpleNamespace(
            max_requests=5,
            requests_per_second=1.0,
            alert_on_server_error=True,
            latency_multiplier=3.0,
            size_ratio=3.0,
            size_abs_delta=2048,
        ),
        session_replay=session_replay,
        headers=dict(headers or {}),
        follow_redirects=True,
        message=message,
    )
    return SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer], test_data_constructor=[]),
        security_configuration=SimpleNamespace(base_url_override=base),
    )


@pytest.fixture(autouse=True)
def _no_sleep_tmp(monkeypatch, tmp_path):
    monkeypatch.setattr(fuzzing.time, "sleep", lambda *_a, **_k: None)
    monkeypatch.setattr(fuzzing, "REPORTS_DIR", tmp_path / "fuzz")
    # intent corpus → tiny in-memory via monkeypatch load
    monkeypatch.setattr(
        fuzzing.SuiteFuzzerRunner,
        "_load_payloads",
        lambda self, name, *, limit, mask_slots=1: [f"p{i}" for i in range(limit)],
    )


def test_headers_have_session_and_meta():
    assert headers_have_session({"Cookie": "t=1"}) is True
    assert headers_have_session({"Authorization": "Bearer x"}) is True
    assert headers_have_session({"X-XSRF-TOKEN": "abc"}) is True
    assert headers_have_session({"Accept": "application/json"}) is False
    meta = session_bound_meta({"Accept": "application/json"})
    assert meta["session_bound"] is False
    meta2 = session_bound_meta({"Cookie": "t=1", "Accept": "*/*"})
    assert meta2["session_bound"] is True
    assert meta2["has_cookie"] is True


def test_pick_session_headers_fallback_same_origin():
    messages = [
        {
            "requestHeader": (
                "GET http://evil.example/api HTTP/1.1\r\n"
                "Cookie: bad=1\r\n\r\n"
            ),
        },
        {
            "requestHeader": (
                "GET http://juice-shop:3000/rest/user/whoami HTTP/1.1\r\n"
                "Host: juice-shop:3000\r\n"
                "Authorization: Bearer LIVE-TOKEN\r\n"
                "Accept: application/json\r\n\r\n"
            ),
        },
        {
            "requestHeader": (
                "GET http://juice-shop:3000/assets/x.js HTTP/1.1\r\n"
                "Accept: */*\r\n\r\n"
            ),
        },
    ]
    headers = pick_session_headers_from_history(
        messages, base_url="http://juice-shop:3000"
    )
    assert headers.get("Authorization") == "Bearer LIVE-TOKEN"


def test_pick_session_headers_url_contains_without_creds_fails():
    messages = [
        {
            "url": "http://juice-shop:3000/rest/products/search?q=1",
            "method": "GET",
            "requestHeader": "GET http://juice-shop:3000/rest/products/search?q=1 HTTP/1.1\r\nAccept: */*\r\n\r\n",
        }
    ]
    with pytest.raises(WiredError, match="без Cookie"):
        pick_session_headers_from_history(
            messages,
            base_url="http://juice-shop:3000",
            url_contains="/rest/products/search",
            method="GET",
        )


def test_suite_wave_session_replay_fallback_merges_headers():
    token = "session-secret-df10"
    messages = [
        {
            "requestHeader": (
                "GET http://juice-shop:3000/rest/products/search?q=seed HTTP/1.1\r\n"
                f"Cookie: token={token}\r\n"
                "Accept: application/json\r\n\r\n"
            ),
        }
    ]
    zap = _FakeZap(messages=messages)
    summary = SuiteFuzzerRunner(
        _wave_manifest(session_replay=True, message=None),
        zap,
        _FakeStream(),
    ).run("df10_wave")
    assert summary["session_bound"] is True
    assert summary["has_cookie"] is True
    assert any(
        (hdr.get("Cookie") == f"token={token}") for _m, _u, hdr in zap.calls
    )
    evidence = Path(summary["evidence_path"]).read_text(encoding="utf-8")
    assert token not in evidence


def test_suite_wave_session_missing_hard_fail():
    zap = _FakeZap(messages=[])
    with pytest.raises(WiredError, match="session_missing"):
        SuiteFuzzerRunner(
            _wave_manifest(session_replay=True),
            zap,
            _FakeStream(),
        ).run("df10_wave")
    assert zap.calls == []


def test_suite_wave_explicit_cookie_skips_history():
    zap = _FakeZap(messages=[])
    summary = SuiteFuzzerRunner(
        _wave_manifest(
            session_replay=True,
            headers={"Cookie": "token=explicit"},
        ),
        zap,
        _FakeStream(),
    ).run("df10_wave")
    assert summary["session_bound"] is True
    assert any(hdr.get("Cookie") == "token=explicit" for _m, _u, hdr in zap.calls)


def test_campaign_session_lost_stops_after_streak():
    # baseline 200, then three 401 → stop (SESSION_LOST_STREAK=3)
    zap = _FakeZap(status_sequence=[200, 401, 401, 401, 200, 200])
    campaign = Campaign(
        message=FuzzMessage(
            source="template",
            method="GET",
            url="http://juice-shop:3000/rest/products/search?q=",
            headers={"Cookie": "token=x"},
        ),
        location=FuzzLocation(kind="query_param", name="q"),
        payloads=["a", "b", "c", "d", "e"],
        policy=FuzzPolicy(max_requests=5, requests_per_second=1.0),
        module_id="lost",
    )
    summary = FuzzCampaignRunner(zap).run(
        campaign, base_url="http://juice-shop:3000"
    )
    assert summary["stopped_reason"] == "session_lost"
    assert summary["verdict"] == "session_lost"
    assert summary["cases_total"] == 3
    assert "session_lost" in (summary.get("reason_counts") or {})
    # baseline + 3 attacks (not 5)
    assert len(zap.calls) == 4
