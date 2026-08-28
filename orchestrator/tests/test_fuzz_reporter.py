# -*- coding: utf-8 -*-
"""CD-8: fuzz_reporter — аномалии → findings → admission → Allure3."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from corpus.fuzz_reporter import (
    FuzzAnomaly,
    Finding,
    anomaly_to_finding,
    anomalies_to_findings,
    attach_findings_to_run_summary,
    build_allure_categories,
    classify_anomaly,
    dedupe_findings,
    fuzz_findings_report,
    merge_allure_categories,
    severity_counts,
)


def test_anomaly_to_finding_server_error():
    a = FuzzAnomaly(kind="server_error", url="http://x/api", status=500)
    f = anomaly_to_finding(a)
    assert f.kind == "server_error"
    assert f.severity == "high"
    assert f.cwe == "CWE-20"
    assert f.rule_id == "pk_fuzz_server_error"
    assert "fuzz" in f.tags


def test_anomaly_to_finding_reflection():
    a = FuzzAnomaly(kind="reflection", url="http://x", param="q", payload="<script>alert(1)</script>", reflection=True)
    f = anomaly_to_finding(a)
    assert f.severity == "medium"
    assert f.cwe == "CWE-79"


def test_anomaly_to_finding_time_based():
    a = FuzzAnomaly(kind="time_based", url="http://x", latency_ms=3000)
    f = anomaly_to_finding(a)
    assert f.severity == "medium"
    assert f.cwe == "CWE-89"


def test_classify_server_error():
    a = classify_anomaly(500)
    assert a is not None
    assert a.kind == "server_error"


def test_classify_reflection():
    a = classify_anomaly(200, reflected_payload="<script>alert(1)</script>")
    assert a is not None
    assert a.kind == "reflection"


def test_classify_time_delay():
    a = classify_anomaly(200, latency_ms=3000, baseline_latency_ms=1000)
    assert a is not None
    assert a.kind == "time_based"


def test_classify_body_diff():
    a = classify_anomaly(200, body_diff=True)
    assert a is not None
    assert a.kind == "anomaly"


def test_classify_normal():
    assert classify_anomaly(200, baseline_latency_ms=1000, latency_ms=100) is None


def test_anomalies_to_findings_batch():
    anomalies = [
        FuzzAnomaly(kind="server_error", url="http://x/a", status=503),
        FuzzAnomaly(kind="reflection", url="http://x/b", param="q", reflection=True),
    ]
    findings = anomalies_to_findings(anomalies)
    assert len(findings) == 2
    assert all(isinstance(f, Finding) for f in findings)


def test_dedupe_findings():
    a = FuzzAnomaly(kind="server_error", url="http://x", status=500)
    f1 = anomaly_to_finding(a)
    f2 = anomaly_to_finding(a)
    assert len(dedupe_findings([f1, f2])) == 1


def test_severity_counts():
    findings = [
        anomaly_to_finding(FuzzAnomaly(kind="server_error", url="u", status=500)),
        anomaly_to_finding(FuzzAnomaly(kind="server_error", url="u", status=503)),
    ]
    counts = severity_counts(findings)
    assert counts["high"] == 2


def test_attach_findings_to_run_summary():
    findings = [
        anomaly_to_finding(FuzzAnomaly(kind="reflection", url="u", param="q", reflection=True))
    ]
    summary = {"exit_code": 0, "gate": "pass"}
    updated = attach_findings_to_run_summary(summary, findings)
    assert "fuzz_findings" in updated
    assert updated["fuzz_findings"]["total"] == 1
    assert updated["fuzz_findings"]["severity"]["medium"] == 1
    # исходный summary не мутирован
    assert "fuzz_findings" not in summary


def test_attach_findings_merges():
    f = anomaly_to_finding(FuzzAnomaly(kind="reflection", url="u", param="q", reflection=True))
    summary = {"fuzz_findings": {"total": 0, "severity": {}, "items": []}}
    updated = attach_findings_to_run_summary(summary, [f], replace=False)
    assert updated["fuzz_findings"]["total"] == 1


def test_build_allure_categories():
    findings = [
        anomaly_to_finding(FuzzAnomaly(kind="server_error", url="u", status=500))
    ]
    cats = build_allure_categories(findings)
    assert len(cats) >= 1
    assert any(c["name"] for c in cats)
    # fallback "Прочее" присутствует
    assert cats[-1]["name"] == "Прочее"


def test_merge_allure_categories_no_dupes():
    existing = [
        {"name": "scanner / security", "messageRegex": ".*", "matchedStatuses": ["failed"]}
    ]
    findings = [
        anomaly_to_finding(FuzzAnomaly(kind="server_error", url="u", status=500))
    ]
    merged = merge_allure_categories(existing, findings)
    names = [c["name"] for c in merged]
    assert len(names) == len(set(names))
    assert "scanner / security" in names


def test_fuzz_findings_report_shape():
    anomalies = [FuzzAnomaly(kind="server_error", url="u", status=500)]
    report = fuzz_findings_report(anomalies, run_id="r1")
    assert report["kind"] == "pk_fuzz_findings_pack"
    assert report["total"] == 1
    assert "severity" in report
    assert "allure_categories" in report


def test_admission_filter_integration():
    from core.admission_filter import admit_fuzz_findings

    findings = [
        anomaly_to_finding(FuzzAnomaly(kind="server_error", url="u", status=500)).to_dict()
    ]
    counts, audit, kept = admit_fuzz_findings(findings)
    assert counts["high"] == 1
    assert audit.kept == 1
    assert len(kept) == 1
