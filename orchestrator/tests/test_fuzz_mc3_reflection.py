# -*- coding: utf-8 -*-
"""MC-3: reflection anomaly without raw payload in evidence."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.fuzzing import (
    Campaign,
    FuzzCampaignRunner,
    FuzzLocation,
    FuzzMessage,
    FuzzPolicy,
    ResponseMetrics,
    anomaly_reasons,
    payload_reflected_in_body,
)


class _EchoZap:
    """Ответ всегда содержит payload из query q= — для reflection."""

    def __init__(self):
        self.calls = []

    def zap_http_request(
        self, method, url, headers=None, body=None, follow_redirects=False
    ):
        self.calls.append({"url": url, "body": body})
        q = ""
        if "q=" in url:
            q = url.split("q=", 1)[1].split("&", 1)[0]
        from urllib.parse import unquote

        q = unquote(q)
        return {"status": 200, "body": f'{{"echo":"{q}","ok":true}}'}

    def get_alerts(self, *a, **k):
        return []

    def get_messages(self, *a, **k):
        return []


def test_payload_reflected_literal_and_decoded():
    assert payload_reflected_in_body("abcd", 'prefix abcd suffix')
    assert not payload_reflected_in_body("x", "xxx")  # below min_len
    assert payload_reflected_in_body(
        "%3Cscript%3Ealert(1)%3C/script%3E",
        "body <script>alert(1)</script> tail",
    )
    assert payload_reflected_in_body(("aa", "marker42"), "nope marker42 here")


def test_anomaly_reasons_appends_reflection():
    baseline = ResponseMetrics(
        status=200, latency_ms=10, body_bytes=10, body_sha256="a"
    )
    current = ResponseMetrics(
        status=200, latency_ms=10, body_bytes=10, body_sha256="a"
    )
    assert anomaly_reasons(
        baseline,
        current,
        "",
        alert_on_server_error=True,
        latency_multiplier=3.0,
        reflected=True,
    ) == ["reflection"]


def test_campaign_flags_reflection_and_redacts(tmp_path):
    zap = _EchoZap()
    runner = FuzzCampaignRunner(zap)
    marker = "<b>pk-reflect</b>"
    summary = runner.run(
        Campaign(
            message=FuzzMessage(
                source="template",
                method="GET",
                url="http://juice-shop:3000/rest/products/search?q={MASK}",
            ),
            location=FuzzLocation(kind="mask", name="{MASK}"),
            payloads=[marker],
            policy=FuzzPolicy(max_requests=5, requests_per_second=100.0),
            module_id="mc3_reflect",
        ),
        base_url="http://juice-shop:3000",
        reports_dir=tmp_path,
    )
    reasons = []
    for case in summary["cases"]:
        reasons.extend(case.get("anomaly_reasons") or [])
    assert "reflection" in reasons
    evidence = json.loads(Path(summary["evidence_path"]).read_text(encoding="utf-8"))
    blob = json.dumps(evidence, ensure_ascii=False)
    assert marker not in blob
    assert summary["reason_counts"].get("reflection", 0) >= 1
