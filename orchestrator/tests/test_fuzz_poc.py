# -*- coding: utf-8 -*-
"""FZ-B1…B4: Campaign / Evidence / History helper / corpus / Live projection."""
from __future__ import annotations

import json
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
    FuzzAdapter,
    FuzzCampaignRunner,
    FuzzLocation,
    FuzzMessage,
    FuzzPolicy,
    FuzzRunner,
    SuiteFuzzerRunner,
    apply_location,
    assert_same_origin,
    anomaly_reasons,
    build_audit_digest,
    count_anomaly_reasons,
    evidence_contains_raw_payload,
    live_projection_titles,
    load_corpus_file,
    load_string_corpus,
    ResponseMetrics,
    merge_request_headers,
    parse_http_request_headers,
    parse_zap_history_message,
    pick_message_from_history,
    session_bound_meta,
    sha256_text,
    write_audit_digest,
)
from core.method_id import render_execution_title, resolve_call
from models.wired import TestDataConstructorModule as DataModule


class _FakeStream:
    def __init__(self, corpus):
        self._corpus = corpus

    def get_path(self, name):
        return self._corpus

    def resolve_arg(self, value):
        return value


class _FakeZap:
    def __init__(self, *, boom_marker="boom", messages=None):
        self.calls = []
        self._boom = boom_marker
        self._messages = list(messages or [])

    def zap_http_request(
        self, method, url, headers=None, body=None, follow_redirects=False
    ):
        self.calls.append((method, url, dict(headers or {})))
        status = 500 if self._boom in url else 200
        return {"status": status, "body": "body-" * 4}

    def get_messages(self, context_name=None):
        return list(self._messages)


def _module(corpus_name="fuzz_payloads", **limits):
    return DataModule(
        id="q_fuzz",
        module_type="Фаззер",
        fuzzing_fields={
            "request": {"url": "http://juice-shop:3000/rest/products/search"},
            "injection": {"query_param": "q", "corpus": corpus_name},
            "limits": {"requests_per_second": 1.0, "max_requests": 25, **limits},
        },
    )


def _manifest(module, *, base="http://juice-shop:3000"):
    return SimpleNamespace(
        test_suites=SimpleNamespace(test_data_constructor=[module]),
        security_configuration=SimpleNamespace(base_url_override=base),
    )


@pytest.fixture(autouse=True)
def _no_sleep_and_tmp_reports(monkeypatch, tmp_path):
    monkeypatch.setattr(fuzzing.time, "sleep", lambda *_a, **_k: None)
    monkeypatch.setattr(fuzzing, "REPORTS_DIR", tmp_path / "fuzz")


# --- FZ-B1: Campaign / Evidence / policy ---


def test_runner_flags_server_error_and_writes_evidence():
    corpus = ["safe-1", "boom-payload", "safe-2"]
    zap = _FakeZap()
    stream = _FakeStream(corpus)
    summary = FuzzRunner(_manifest(_module()), zap, stream).run("q_fuzz")

    assert summary["cases_total"] == 3
    assert summary["anomalies_total"] == 1
    assert summary["message_source"] == "template"
    assert summary["location"] == {"kind": "query_param", "name": "q"}
    flagged = [c for c in summary["cases"] if c["anomaly_reasons"]]
    assert flagged and flagged[0]["anomaly_reasons"] == [
        "status_changed",
        "server_error",
    ]
    assert flagged[0]["deltas"] == ["status_changed", "server_error"]
    assert summary["reason_counts"]["server_error"] == 1
    assert summary["reason_counts"]["status_changed"] == 1
    assert len(zap.calls) == 4

    evidence = Path(summary["evidence_path"])
    assert evidence.is_file()
    saved = json.loads(evidence.read_text(encoding="utf-8"))
    assert saved["run_id"] == summary["run_id"]
    assert "rows" in saved and len(saved["rows"]) == 3
    assert "boom-payload" not in evidence.read_text(encoding="utf-8")
    assert not evidence_contains_raw_payload(saved, corpus)


def test_runner_bounds_corpus_by_max_requests():
    corpus = [f"p{i}" for i in range(50)]
    zap = _FakeZap(boom_marker="__never__")
    stream = _FakeStream(corpus)
    summary = FuzzRunner(_manifest(_module(max_requests=5)), zap, stream).run("q_fuzz")
    assert summary["cases_total"] == 5


def test_policy_clamps_above_poc_ceiling():
    policy = FuzzPolicy(max_requests=100, requests_per_second=10.0).clamped()
    assert policy.max_requests == fuzzing.POC_MAX_REQUESTS
    assert policy.requests_per_second == fuzzing.POC_MAX_RPS


def test_runner_rejects_out_of_origin_url():
    module = DataModule(
        id="q_fuzz",
        module_type="Фаззер",
        fuzzing_fields={
            "request": {"url": "http://evil.example.com/x"},
            "injection": {"query_param": "q", "corpus": "fuzz_payloads"},
        },
    )
    with pytest.raises(WiredError, match="origin"):
        FuzzRunner(_manifest(module), _FakeZap(), _FakeStream(["a"])).run("q_fuzz")


def test_assert_same_origin_helper():
    assert_same_origin("http://juice-shop:3000/a", "http://juice-shop:3000/")
    with pytest.raises(WiredError, match="origin"):
        assert_same_origin("https://evil/x", "http://juice-shop:3000/")


def test_mask_location_and_reject_host_escape():
    base = "http://juice-shop:3000"
    campaign = Campaign(
        message=FuzzMessage(
            source="template",
            url="http://juice-shop:3000/rest/products/search?q=" + fuzzing.POC_DEFAULT_MASK,
        ),
        location=FuzzLocation(kind="mask", name=fuzzing.POC_DEFAULT_MASK),
        payloads=["ok", "http://evil.example.com/"],
        policy=FuzzPolicy(max_requests=2),
        module_id="mask_esc",
    )
    # Второй payload меняет origin через маску в query — urlencode не применяется к mask.
    # Маска в query-value: подстановка абсолютного URL остаётся same-origin host.
    # Явный escape host: маска в netloc.
    bad = Campaign(
        message=FuzzMessage(
            source="template",
            url=f"http://{fuzzing.POC_DEFAULT_MASK}:3000/x",
        ),
        location=FuzzLocation(kind="mask", name=fuzzing.POC_DEFAULT_MASK),
        payloads=["evil.example.com"],
        policy=FuzzPolicy(max_requests=1),
        module_id="mask_host",
    )
    with pytest.raises(WiredError, match="origin"):
        FuzzCampaignRunner(_FakeZap(boom_marker="__never__")).run(bad, base_url=base)

    summary = FuzzCampaignRunner(_FakeZap(boom_marker="__never__")).run(
        campaign, base_url=base
    )
    assert summary["cases_total"] == 2
    assert summary["location"]["kind"] == "mask"


def test_apply_location_query_and_mask():
    url = "http://juice-shop:3000/search?x=1"
    q = apply_location(url, FuzzLocation(kind="query_param", name="q"), "ab")
    assert "q=ab" in q
    masked = apply_location(
        "http://juice-shop:3000/x?q=" + fuzzing.POC_DEFAULT_MASK,
        FuzzLocation(kind="mask", name=fuzzing.POC_DEFAULT_MASK),
        "zz",
    )
    assert masked.endswith("q=zz")


# --- FZ-B2: message source (template + History helper) ---


def test_campaign_template_juice_search_style():
    zap = _FakeZap(boom_marker="__never__")
    campaign = Campaign(
        message=FuzzMessage(
            source="template",
            url="http://juice-shop:3000/rest/products/search",
        ),
        location=FuzzLocation(kind="query_param", name="q"),
        payloads=["apple"],
        module_id="search",
    )
    summary = FuzzCampaignRunner(zap).run(
        campaign, base_url="http://juice-shop:3000"
    )
    assert summary["message_source"] == "template"
    assert summary["cases_total"] == 1
    assert summary["target_origin"] == "http://juice-shop:3000"
    assert any("/rest/products/search" in url for _, url, _hdr in zap.calls)


def test_parse_and_pick_history_message():
    messages = [
        {
            "requestHeader": "GET http://juice-shop:3000/rest/products/search?q=a HTTP/1.1\r\nHost: juice-shop:3000\r\n\r\n",
        },
        {
            "requestHeader": "POST http://juice-shop:3000/rest/user/login HTTP/1.1\r\n\r\n",
        },
        {
            "url": "http://juice-shop:3000/rest/products/search?q=b",
            "method": "GET",
        },
    ]
    parsed = parse_zap_history_message(messages[0])
    assert parsed["method"] == "GET"
    assert "products/search" in parsed["url"]
    assert "Host" not in parsed["headers"]

    picked = pick_message_from_history(
        messages,
        url_contains="/rest/products/search",
        method="GET",
        base_url="http://juice-shop:3000",
    )
    # последнее совпадение
    assert picked["url"].endswith("q=b")

    with pytest.raises(WiredError, match="нет сообщений"):
        pick_message_from_history(
            messages, url_contains="/missing", method="GET"
        )


def test_parse_http_request_headers_cookie_and_skip_host():
    raw = (
        "GET http://juice-shop:3000/rest/products/search?q=x HTTP/1.1\r\n"
        "Host: juice-shop:3000\r\n"
        "Cookie: token=secret-value\r\n"
        "Cookie: refresh=r1\r\n"
        "Authorization: Bearer TOPSECRET\r\n"
        "Accept: application/json\r\n"
        "Content-Length: 0\r\n"
        "\r\n"
    )
    headers = parse_http_request_headers(raw)
    assert "Host" not in headers
    assert "Content-Length" not in headers
    assert headers["Cookie"] == "token=secret-value; refresh=r1"
    assert headers["Authorization"] == "Bearer TOPSECRET"
    assert headers["Accept"] == "application/json"

    parsed = parse_zap_history_message({"requestHeader": raw})
    assert parsed["headers"]["Cookie"].startswith("token=")
    meta = session_bound_meta(parsed["headers"])
    assert meta["has_cookie"] is True
    assert meta["has_authorization"] is True
    assert "Cookie" in meta["request_header_names"]


def test_parse_zap_history_method_url_from_request_line():
    """method/url из request-line, если поля сообщения пусты (SQ-BE-2g)."""
    parsed = parse_zap_history_message(
        {
            "requestHeader": (
                "POST https://juice.local/rest/user/login HTTP/1.1\r\n"
                "Host: juice.local\r\n"
                "\r\n"
            )
        }
    )
    assert parsed["method"] == "POST"
    assert parsed["url"] == "https://juice.local/rest/user/login"


def test_merge_request_headers_override_wins():
    merged = merge_request_headers(
        {"Cookie": "a=1", "Accept": "text/plain"},
        {"cookie": "b=2", "X-Trace": "1"},
    )
    assert merged["cookie"] == "b=2" or merged.get("Cookie") == "b=2"
    assert "b=2" in merged.values()
    assert merged.get("Accept") == "text/plain" or any(
        k.lower() == "accept" and v == "text/plain" for k, v in merged.items()
    )
    assert any(k.lower() == "x-trace" for k in merged)


def test_campaign_from_history_replays_session_headers():
    cookie = "token=session-secret-abc"
    messages = [
        {
            "requestHeader": (
                "GET http://juice-shop:3000/rest/products/search?q=seed HTTP/1.1\r\n"
                "Host: juice-shop:3000\r\n"
                f"Cookie: {cookie}\r\n"
                "Accept: application/json\r\n"
                "\r\n"
            ),
        }
    ]
    zap = _FakeZap(boom_marker="__never__", messages=messages)
    campaign = Campaign(
        message=FuzzMessage(
            source="history",
            history_url_contains="/rest/products/search",
            history_method="GET",
        ),
        location=FuzzLocation(kind="query_param", name="q"),
        payloads=["one", "two"],
        module_id="from_hist",
    )
    summary = FuzzCampaignRunner(zap).run(
        campaign, base_url="http://juice-shop:3000"
    )
    assert summary["message_source"] == "history"
    assert summary["cases_total"] == 2
    assert summary["has_cookie"] is True
    assert summary["session_bound"] is True
    assert "Cookie" in summary["request_header_names"]
    # baseline + 2 cases — Cookie уходит в sender
    assert len(zap.calls) == 3
    for _method, _url, hdr in zap.calls:
        assert hdr.get("Cookie") == cookie
        assert hdr.get("Accept") == "application/json"
    # evidence без значений секрета
    evidence_text = Path(summary["evidence_path"]).read_text(encoding="utf-8")
    assert cookie not in evidence_text
    assert "session-secret" not in evidence_text
    assert evidence_contains_raw_payload(summary, [cookie]) is False
    # POC-B: digest рядом, тоже без Cookie
    digest_path = Path(summary["digest_path"])
    assert digest_path.name.endswith(".digest.json")
    digest_text = digest_path.read_text(encoding="utf-8")
    assert cookie not in digest_text
    assert "session-secret" not in digest_text
    assert summary["method"] == "GET"
    assert "max_requests" in summary["policy"]


def test_history_rejects_other_origin():
    messages = [
        {
            "url": "http://evil.example.com/rest/products/search",
            "method": "GET",
        }
    ]
    with pytest.raises(WiredError, match="нет сообщений"):
        pick_message_from_history(
            messages,
            url_contains="search",
            method="GET",
            base_url="http://juice-shop:3000",
        )


# --- FZ-B3: corpus of strings ≠ URL crawl list ---


def test_load_string_corpus_truncate_and_empty():
    assert load_string_corpus(["a", "b", "c"], limit=2) == ["a", "b"]
    with pytest.raises(WiredError, match="пуст"):
        load_string_corpus([], limit=5)
    with pytest.raises(WiredError, match="списком строк"):
        load_string_corpus("not-a-list", limit=5)
    with pytest.raises(WiredError, match="списком строк"):
        load_string_corpus([1, 2], limit=5)


def test_empty_corpus_via_runner():
    with pytest.raises(WiredError, match="пуст"):
        FuzzRunner(_manifest(_module()), _FakeZap(), _FakeStream([])).run("q_fuzz")


def test_corpus_hard_cap_even_if_list_huge():
    huge = [f"p{i}" for i in range(100)]
    bounded = load_string_corpus(huge, limit=1000)
    assert len(bounded) == fuzzing.POC_MAX_REQUESTS


# --- FZ-B4: projection / redact / titles ---


def test_redact_skips_short_payload_markers():
    """Одиночные кавычки не должны валить redact на JSON-разметке."""
    summary = {
        "run_id": "x",
        "cases": [{"payload_sha256": "abc", "note": "LEAKED-PAYLOAD-XYZ", "status": 200}],
    }
    assert not evidence_contains_raw_payload(summary, ["'", '"', "ab"])
    assert evidence_contains_raw_payload(summary, ["LEAKED-PAYLOAD-XYZ"])


def test_live_projection_titles_redact_payloads():
    corpus = ["SECRET-PAYLOAD-XYZ", "safe"]
    summary = FuzzRunner(_manifest(_module()), _FakeZap(), _FakeStream(corpus)).run(
        "q_fuzz"
    )
    titles = live_projection_titles(summary)
    assert titles[0].startswith("Fuzz q_fuzz:")
    blob = "\n".join(titles)
    assert "SECRET-PAYLOAD-XYZ" not in blob
    # аномалия только для boom — здесь boom_marker default "boom", corpus без boom
    assert summary["anomalies_total"] == 0
    assert summary.get("digest_path")
    assert any(t.startswith("Audit digest:") for t in titles)
    assert len(titles) == 2  # summary + digest (без anomaly-строк)

    # с аномалией
    summary2 = FuzzRunner(
        _manifest(_module()), _FakeZap(), _FakeStream(["boom-x"])
    ).run("q_fuzz")
    titles2 = live_projection_titles(summary2)
    assert len(titles2) == 3  # summary + digest + anomaly
    assert any(t.startswith("Audit digest:") for t in titles2)
    anomaly_line = next(t for t in titles2 if t.startswith("Отклонение"))
    assert "server_error" in anomaly_line
    assert "status_changed" in anomaly_line
    assert "sha256=" in anomaly_line
    assert "boom-x" not in anomaly_line
    assert sha256_text("boom-x")[:12] in anomaly_line
    assert "server_error×1" in titles2[0]


def test_live_projection_titles_session_bound_marker():
    titles = live_projection_titles(
        {
            "module_id": "s",
            "cases_total": 2,
            "anomalies_total": 0,
            "has_cookie": True,
            "cases": [],
        }
    )
    assert titles[0].endswith("(session-bound)")
    titles_h = live_projection_titles(
        {
            "module_id": "s",
            "cases_total": 1,
            "anomalies_total": 0,
            "message_source": "history",
            "has_cookie": False,
            "cases": [],
        }
    )
    assert "(history)" in titles_h[0]


def test_anomaly_reasons_status_latency_size():
    """POC-C: Intruder/ffuf-метрики в стабильном порядке."""
    baseline = ResponseMetrics(
        status=200,
        latency_ms=100,
        body_bytes=1000,
        body_sha256="aa",
    )
    assert anomaly_reasons(
        baseline,
        ResponseMetrics(status=500, latency_ms=100, body_bytes=1000, body_sha256="bb"),
        "",
        alert_on_server_error=True,
        latency_multiplier=3.0,
    ) == ["status_changed", "server_error"]
    assert anomaly_reasons(
        baseline,
        ResponseMetrics(status=200, latency_ms=400, body_bytes=1000, body_sha256="aa"),
        "",
        alert_on_server_error=True,
        latency_multiplier=3.0,
    ) == ["latency_outlier"]
    assert anomaly_reasons(
        baseline,
        ResponseMetrics(status=200, latency_ms=100, body_bytes=5000, body_sha256="cc"),
        "",
        alert_on_server_error=True,
        latency_multiplier=3.0,
        size_ratio=3.0,
        size_abs_delta=2048,
    ) == ["size_outlier"]
    assert anomaly_reasons(
        baseline,
        None,
        "timeout",
        alert_on_server_error=True,
        latency_multiplier=3.0,
    ) == ["transport_error"]
    # abs_delta без ratio (тело чуть сдвинуто, но порог байт сработал)
    assert anomaly_reasons(
        baseline,
        ResponseMetrics(status=200, latency_ms=100, body_bytes=1000 + 2500, body_sha256="dd"),
        "",
        alert_on_server_error=False,
        latency_multiplier=10.0,
        size_ratio=100.0,
        size_abs_delta=2048,
    ) == ["size_outlier"]


def test_live_anomaly_detail_cap():
    cases = [
        {
            "case_id": f"i={i}",
            "payload_sha256": sha256_text(f"p{i}"),
            "anomaly_reasons": ["status_changed"],
        }
        for i in range(1, 9)
    ]
    titles = live_projection_titles(
        {
            "module_id": "cap",
            "cases_total": 8,
            "anomalies_total": 8,
            "cases": cases,
            "reason_counts": count_anomaly_reasons({"cases": cases}),
        },
        anomaly_detail_cap=5,
    )
    detail = [t for t in titles if t.startswith("Отклонение")]
    assert len(detail) == 5
    assert any(t.startswith("Ещё отклонений: 3") for t in titles)


def test_load_corpus_file_skips_comments(tmp_path):
    path = tmp_path / "c.txt"
    path.write_text("# lab only\n\none\n# skip\ntwo\n", encoding="utf-8")
    assert load_corpus_file(path) == ["one", "two"]


def test_lab_intent_corpora_loadable():
    root = Path(__file__).resolve().parents[1] / "data" / "fuzz"
    for name in (
        "juice_search_lab.txt",
        "intent_boundary.txt",
        "intent_sqli_smoke.txt",
        "intent_xss_smoke.txt",
    ):
        payloads = load_corpus_file(root / name)
        assert 1 <= len(payloads) <= fuzzing.POC_MAX_REQUESTS
        assert all(isinstance(p, str) and p.strip() for p in payloads)


def test_build_audit_digest_redacts_payload_and_cookie():
    """POC-B: digest — короткий pack; без сырых payload и Cookie values."""
    secret_cookie = "token=audit-digest-secret-xyz"
    payload = "RAW-PAYLOAD-FOR-DIGEST"
    summary = {
        "run_id": "fuzz-digest-ut-1",
        "module_id": "ut",
        "message_source": "history",
        "method": "GET",
        "target_origin": "http://juice-shop:3000",
        "location": {"kind": "query_param", "name": "q"},
        "policy": {"max_requests": 2, "requests_per_second": 1.0},
        "session_bound": True,
        "has_cookie": True,
        "has_authorization": False,
        "request_header_names": ["Cookie", "Accept"],
        "baseline": {
            "status": 200,
            "latency_ms": 10.0,
            "body_bytes": 100,
            "body_sha256": "aa",
        },
        "cases_total": 1,
        "anomalies_total": 1,
        "verdict": "observations_require_review",
        "evidence_path": "reports/fuzz/fuzz-digest-ut-1.json",
        "cases": [
            {
                "case_id": "i=1",
                "payload_sha256": sha256_text(payload),
                "anomaly_reasons": ["status_changed"],
                "status": 500,
                "latency_ms": 12.0,
                "body_bytes": 20,
            }
        ],
    }
    digest = build_audit_digest(summary)
    assert digest["kind"] == "kdt_fuzz_audit_digest"
    assert digest["run_id"] == "fuzz-digest-ut-1"
    assert digest["anomalies_total"] == 1
    assert len(digest["anomalies"]) == 1
    assert digest["reason_counts"] == {"status_changed": 1}
    prefix = digest["anomalies"][0]["payload_sha256_prefix"]
    assert prefix == sha256_text(payload)[:12]
    assert len(prefix) == 12
    blob = json.dumps(digest, ensure_ascii=False)
    assert payload not in blob
    assert secret_cookie not in blob
    assert "audit-digest-secret" not in blob
    assert evidence_contains_raw_payload(digest, [payload, secret_cookie]) is False


def test_write_audit_digest_and_live_line(tmp_path):
    payload = "LIVE-DIGEST-PAYLOAD"
    summary = {
        "run_id": "fuzz-digest-live-1",
        "module_id": "live_ut",
        "message_source": "template",
        "method": "GET",
        "target_origin": "http://example.test",
        "location": {"kind": "query_param", "name": "q"},
        "policy": {"max_requests": 1, "requests_per_second": 1.0},
        "session_bound": False,
        "has_cookie": False,
        "has_authorization": False,
        "request_header_names": [],
        "baseline": {"status": 200, "latency_ms": 1, "body_bytes": 1, "body_sha256": "b"},
        "cases_total": 1,
        "anomalies_total": 1,
        "verdict": "observations_require_review",
        "evidence_path": str(tmp_path / "fuzz-digest-live-1.json"),
        "cases": [
            {
                "case_id": "i=1",
                "payload_sha256": sha256_text(payload),
                "anomaly_reasons": ["server_error"],
                "status": 500,
                "latency_ms": 2,
                "body_bytes": 3,
            }
        ],
    }
    digest = build_audit_digest(summary)
    digest_path = write_audit_digest(digest, reports_dir=tmp_path)
    summary["digest_path"] = digest_path
    assert Path(digest_path).name == "fuzz-digest-live-1.digest.json"
    text = Path(digest_path).read_text(encoding="utf-8")
    assert payload not in text
    assert '"kind": "kdt_fuzz_audit_digest"' in text or '"kind":"kdt_fuzz_audit_digest"' in text
    titles = live_projection_titles(summary)
    assert any(t.startswith("Audit digest:") for t in titles)
    assert "fuzz-digest-live-1.digest.json" in titles[1]
    assert payload not in "\n".join(titles)


def test_execution_title_for_fuzz_run():
    title = render_execution_title("fuzz", "run", {"module_id": "q_fuzz"})
    assert "Фаззинг" in title
    assert "q_fuzz" in title


def test_adapter_requires_bound_stream():
    adapter = FuzzAdapter(_manifest(_module()), _FakeZap())
    with pytest.raises(WiredError, match="DataStream"):
        adapter.run("q_fuzz")


def test_adapter_run_delegates_after_bind():
    adapter = FuzzAdapter(_manifest(_module()), _FakeZap())
    adapter.bind(_FakeStream(["safe"]))
    summary = adapter.run("q_fuzz")
    assert summary["module_id"] == "q_fuzz"


def test_method_id_resolves_fuzz_run():
    assert resolve_call("ЗапуститьФаззер q_fuzz") == "fuzz|run|q_fuzz"


def test_method_id_resolves_fuzz_wave():
    assert resolve_call("ФаззингВолна juice_search_q") == "fuzz|wave|juice_search_q"


def test_suite_fuzzer_runner_intent_corpus():
    fuzzer = SimpleNamespace(
        id="juice_search_q",
        label="Juice",
        session_replay=False,
        message=SimpleNamespace(
            source="template",
            method="GET",
            url="http://juice-shop:3000/rest/products/search?q=",
            history_url_contains="",
            history_method="GET",
            headers={},
            follow_redirects=True,
        ),
        location=SimpleNamespace(kind="query_param", name="q"),
        corpus="intent_boundary",
        policy=SimpleNamespace(
            max_requests=3,
            requests_per_second=1.0,
            alert_on_server_error=True,
            latency_multiplier=3.0,
            size_ratio=3.0,
            size_abs_delta=2048,
        ),
    )
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer], test_data_constructor=[]),
        security_configuration=SimpleNamespace(
            base_url_override="http://juice-shop:3000"
        ),
    )
    zap = _FakeZap(boom_marker="__never__")
    summary = SuiteFuzzerRunner(Wired, zap, _FakeStream([])).run("juice_search_q")
    assert summary["module_id"] == "juice_search_q"
    assert summary["cases_total"] >= 1
    assert summary["message_source"] == "template"
    assert "Cookie" not in json.dumps(summary)


def test_adapter_wave_delegates_after_bind():
    fuzzer = SimpleNamespace(
        id="wave1",
        label="w",
        session_replay=False,
        message=SimpleNamespace(
            source="template",
            method="GET",
            url="http://juice-shop:3000/rest/products/search?q=",
            history_url_contains="",
            history_method="GET",
            headers={},
            follow_redirects=True,
        ),
        location=SimpleNamespace(kind="query_param", name="q"),
        corpus="intent_sqli_smoke",
        policy=SimpleNamespace(
            max_requests=2,
            requests_per_second=1.0,
            alert_on_server_error=True,
            latency_multiplier=3.0,
            size_ratio=3.0,
            size_abs_delta=2048,
        ),
    )
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer]),
        security_configuration=SimpleNamespace(
            base_url_override="http://juice-shop:3000"
        ),
    )
    adapter = FuzzAdapter(Wired, _FakeZap())
    adapter.bind(_FakeStream([]))
    summary = adapter.wave("wave1")
    assert summary["module_id"] == "wave1"
    assert summary["cases_total"] >= 1


def test_suite_fuzzer_runner_multi_target_post():
    fuzzer = SimpleNamespace(
        id="wave_post_get",
        algorithm="triples",
        session_replay=False,
        policy=SimpleNamespace(
            max_requests=2,
            requests_per_second=1.0,
            alert_on_server_error=True,
            latency_multiplier=3.0,
            size_ratio=3.0,
            size_abs_delta=2048,
        ),
        targets=[
            {
                "url": "http://juice-shop:3000/rest/products/search?q=",
                "method": "GET",
                "corpus": "intent_boundary",
            },
            {
                "url": "http://juice-shop:3000/api/Users/login",
                "method": "POST",
                "corpus": "intent_sqli_smoke",
            },
        ],
    )
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer]),
        security_configuration=SimpleNamespace(
            base_url_override="http://juice-shop:3000"
        ),
    )
    zap = _FakeZap()
    summary = SuiteFuzzerRunner(Wired, zap, _FakeStream([])).run("wave_post_get")
    assert summary["fuzzer_id"] == "wave_post_get"
    assert summary["targets_count"] == 2
    assert summary["requests_count"] >= 2
    assert len(summary["target_summaries"]) == 2
    assert summary["target_summaries"][0]["method"] == "GET"
    assert summary["target_summaries"][1]["method"] == "POST"


def test_suite_fuzzer_post_body_numbered_masks():
    fuzzer = SimpleNamespace(
        id="post_json_masks",
        algorithm="triples",
        session_replay=False,
        policy=SimpleNamespace(
            max_requests=2,
            requests_per_second=1.0,
            alert_on_server_error=True,
            latency_multiplier=3.0,
            size_ratio=3.0,
            size_abs_delta=2048,
        ),
        targets=[
            {
                "url": "http://juice-shop:3000/api/Users/login",
                "method": "POST",
                "body": '{"email": "{MASK_1}", "password": "{MASK_2}"}',
                "corpus": "intent_boundary",
            },
        ],
    )
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer]),
        security_configuration=SimpleNamespace(
            base_url_override="http://juice-shop:3000"
        ),
    )
    zap = _FakeZap()
    summary = SuiteFuzzerRunner(Wired, zap, _FakeStream([])).run("post_json_masks")
    assert summary["fuzzer_id"] == "post_json_masks"
    assert summary["targets_count"] == 1
    assert len(summary["target_summaries"]) == 1
    assert summary["target_summaries"][0]["method"] == "POST"
