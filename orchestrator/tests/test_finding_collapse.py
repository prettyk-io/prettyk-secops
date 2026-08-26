# -*- coding: utf-8 -*-
from __future__ import annotations

from core.finding_collapse import (
    collapse_filtered_findings,
    collapse_findings,
    is_systemic_finding,
    normalize_endpoint,
)


def test_normalize_endpoint_strips_query_and_ids():
    assert (
        normalize_endpoint("https://ex.test/users/42/profile?x=1#h")
        == "/users/{id}/profile"
    )


def test_five_header_lows_collapse_to_one_systemic():
    findings = [
        {
            "title": "Missing Anti-clickjacking Header",
            "severity": "Low",
            "active": True,
            "url": f"https://app.test/page{i}",
            "pluginid": "10020",
            "alertRef": "10020-1",
        }
        for i in range(5)
    ]
    result = collapse_findings(findings)
    assert result.raw_count == 5
    assert len(result.clusters) == 1
    cluster = result.clusters[0]
    assert cluster.systemic is True
    assert cluster.instance_count == 5
    assert cluster.severity == "low"
    assert len(cluster.sample_endpoints) <= 5
    assert result.totals["low"] == 1
    payload = result.as_dict()
    assert payload["top_findings"][0]["count"] == 5


def test_different_plugin_ids_do_not_merge():
    findings = [
        {
            "title": "Missing Anti-clickjacking Header",
            "severity": "Low",
            "url": "https://a/1",
            "alertRef": "10020-1",
        },
        {
            "title": "Content Security Policy (CSP) Header Not Set",
            "severity": "Low",
            "url": "https://a/1",
            "alertRef": "10038-1",
        },
    ]
    result = collapse_findings(findings)
    assert len(result.clusters) == 2


def test_high_xss_different_paths_not_systemic_merged():
    findings = [
        {
            "title": "Cross Site Scripting (Reflected)",
            "severity": "High",
            "url": "https://app.test/search",
            "param": "q",
            "alertRef": "40012",
        },
        {
            "title": "Cross Site Scripting (Reflected)",
            "severity": "High",
            "url": "https://app.test/comment",
            "param": "body",
            "alertRef": "40012",
        },
    ]
    assert not is_systemic_finding(findings[0])
    result = collapse_findings(findings)
    assert len(result.clusters) == 2
    assert all(c.instance_count == 1 for c in result.clusters)


def test_same_xss_same_path_param_merges():
    findings = [
        {
            "title": "Cross Site Scripting (Reflected)",
            "severity": "High",
            "url": "https://app.test/search?q=1",
            "param": "q",
            "alertRef": "40012",
        },
        {
            "title": "Cross Site Scripting (Reflected)",
            "severity": "High",
            "url": "https://app.test/search?q=2",
            "param": "q",
            "alertRef": "40012",
        },
    ]
    result = collapse_findings(findings)
    assert len(result.clusters) == 1
    assert result.clusters[0].instance_count == 2


def test_collapse_filtered_drops_inactive():
    findings = [
        {
            "title": "Missing Anti-clickjacking Header",
            "severity": "Low",
            "active": True,
            "url": "https://a/1",
            "alertRef": "10020-1",
        },
        {
            "title": "Missing Anti-clickjacking Header",
            "severity": "Low",
            "active": False,
            "url": "https://a/2",
            "alertRef": "10020-1",
        },
    ]
    result = collapse_filtered_findings(findings)
    assert result.raw_count == 1
    assert result.clusters[0].instance_count == 1


def test_classify_systemic_returns_systemic():
    from core.finding_collapse import classify_finding

    finding = {
        "title": "Missing Anti-clickjacking Header",
        "severity": "Low",
    }
    assert classify_finding(finding) == "systemic"


def test_classify_noise_candidate_timestamp():
    from core.finding_collapse import classify_finding

    finding = {
        "title": "Timestamp Disclosure — Unix",
        "severity": "Info",
    }
    assert classify_finding(finding) == "noise_candidate"


def test_classify_noise_candidate_server_leaks():
    from core.finding_collapse import classify_finding

    finding = {
        "title": "Server Leaks Information via X-Powered-By",
        "severity": "info",
    }
    assert classify_finding(finding) == "noise_candidate"


def test_classify_noise_candidate_no_rule_info():
    from core.finding_collapse import classify_finding

    finding = {
        "title": "Something anonymous",
        "severity": "Info",
    }
    assert classify_finding(finding) == "noise_candidate"


def test_classify_location_for_xss():
    from core.finding_collapse import classify_finding

    finding = {
        "title": "Cross Site Scripting (Reflected)",
        "severity": "High",
        "alertRef": "40012",
    }
    assert classify_finding(finding) == "location"


def test_classify_systemic_over_noise():
    from core.finding_collapse import classify_finding

    finding = {
        "title": "Content Security Policy Header Not Set",
        "severity": "Low",
        "alertRef": "10038",
    }
    assert classify_finding(finding) == "systemic"
