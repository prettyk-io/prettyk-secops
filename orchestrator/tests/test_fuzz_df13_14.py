# -*- coding: utf-8 -*-
"""DF-13 zap_alert + DF-14 findings/digest export."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.fuzzing import (
    Campaign,
    EvidenceRow,
    FuzzCampaignRunner,
    FuzzLocation,
    FuzzMessage,
    FuzzPolicy,
    apply_zap_alerts_to_rows,
    build_audit_digest,
    export_fuzz_security_artifacts,
    new_alerts_for_origin,
    sha256_text,
    snapshot_alert_fingerprints,
)


class _ZapWithAlerts:
    def __init__(self, alerts=None):
        self._alerts = list(alerts or [])
        self.calls = []

    def zap_http_request(
        self, method, url, headers=None, body=None, follow_redirects=False
    ):
        self.calls.append({"method": method, "url": url, "body": body})
        # После первого attack — «новый» alert на этот URL.
        if len(self.calls) > 1:
            self._alerts.append(
                {
                    "pluginId": "10021",
                    "name": "X-Content-Type-Options Header Missing",
                    "risk": "Low",
                    "url": url,
                    "param": "",
                }
            )
        return {"status": 200, "body": "ok"}

    def get_alerts(self, context_name=None, risk=None, url=None):
        return list(self._alerts)

    def get_messages(self, context_name=None):
        return []


def test_snapshot_and_new_alerts_for_origin():
    zap = _ZapWithAlerts(
        [
            {
                "pluginId": "1",
                "name": "old",
                "risk": "Info",
                "url": "http://juice-shop:3000/old",
                "param": "",
            }
        ]
    )
    before = snapshot_alert_fingerprints(zap)
    zap._alerts.append(
        {
            "pluginId": "2",
            "name": "new",
            "risk": "Low",
            "url": "http://juice-shop:3000/rest/products/search?q=x",
            "param": "q",
        }
    )
    fresh = new_alerts_for_origin(
        zap, origin="http://juice-shop:3000", before=before
    )
    assert len(fresh) == 1
    assert fresh[0]["name"] == "new"


def test_apply_zap_alerts_matches_url_hash():
    url = "http://juice-shop:3000/rest/products/search?q=evil"
    row = EvidenceRow(
        index=1,
        payload_sha256="aa",
        payload_length=4,
        status=200,
        latency_ms=10,
        body_bytes=2,
        body_sha256="bb",
        deltas=("status_changed",),
        request_url_sha256=sha256_text(url),
    )
    out = apply_zap_alerts_to_rows(
        [row],
        [
            {
                "url_sha256": sha256_text(url),
                "url_path": "/rest/products/search",
                "name": "X",
                "risk": "Low",
                "param": "",
                "pluginId": "1",
            }
        ],
    )
    assert "zap_alert" in out[0].deltas
    assert "status_changed" in out[0].deltas


def test_campaign_wires_zap_alert_and_findings(tmp_path):
    zap = _ZapWithAlerts()
    runner = FuzzCampaignRunner(zap)
    campaign = Campaign(
        message=FuzzMessage(
            source="template",
            method="GET",
            url="http://juice-shop:3000/rest/products/search?q={MASK}",
        ),
        location=FuzzLocation(kind="mask", name="{MASK}"),
        payloads=["one", "two"],
        policy=FuzzPolicy(max_requests=5, requests_per_second=100.0),
        module_id="df13_smoke",
    )
    summary = runner.run(
        campaign,
        base_url="http://juice-shop:3000",
        reports_dir=tmp_path,
    )
    assert summary["zap_alerts_total"] >= 1
    reasons = []
    for case in summary["cases"]:
        reasons.extend(case.get("anomaly_reasons") or [])
    assert "zap_alert" in reasons
    assert Path(summary["digest_path"]).is_file()
    assert Path(summary["findings_path"]).is_file()
    digest = json.loads(Path(summary["digest_path"]).read_text(encoding="utf-8"))
    assert digest["zap_alerts_total"] >= 1
    findings = json.loads(Path(summary["findings_path"]).read_text(encoding="utf-8"))
    assert findings["kind"] == "kdt_fuzz_findings_pack"


def test_export_findings_without_allure_context(tmp_path):
    summary = {
        "run_id": "fuzz-export-test",
        "module_id": "m",
        "target_origin": "http://juice-shop:3000",
        "digest_path": "",
        "evidence_path": "",
        "reason_counts": {"zap_alert": 1},
        "zap_alerts": [{"name": "n", "risk": "Low", "url": "u", "param": "", "pluginId": "1"}],
        "anomalies_total": 1,
    }
    meta = export_fuzz_security_artifacts(summary, reports_dir=tmp_path)
    assert Path(meta["findings_path"]).is_file()
    assert meta["dojo_pack"] == "findings_json"


def test_build_audit_digest_includes_zap_alerts():
    digest = build_audit_digest(
        {
            "run_id": "r1",
            "module_id": "m",
            "cases": [],
            "zap_alerts_total": 2,
            "zap_alerts": [{"name": "a"}, {"name": "b"}],
            "baseline": {},
            "location": {},
            "policy": {},
        }
    )
    assert digest["zap_alerts_total"] == 2
    assert len(digest["zap_alerts"]) == 2
