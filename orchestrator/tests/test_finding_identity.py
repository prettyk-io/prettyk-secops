# -*- coding: utf-8 -*-
"""W1 acceptance: finding-v1 fingerprint identity."""
import pytest
from models.finding import CanonicalFinding, FINGERPRINT_VERSION
from utils.finding_identity import (
    build_canonical_finding,
    build_canonical_findings_from_run,
    compute_fingerprint,
    normalize_path,
    normalize_parameter,
)


class TestNormalizePath:
    def test_strips_query_string(self):
        result = normalize_path("http://juice-shop:3000/rest/products/search?q=test&page=2")
        assert result == "http://juice-shop:3000/rest/products/search"

    def test_dynamic_id_segment(self):
        result = normalize_path("http://host/api/users/42/profile")
        assert result == "http://host/api/users/{id}/profile"

    def test_empty(self):
        assert normalize_path("") == ""
        assert normalize_parameter("") == ""


class TestFingerprint:
    def test_same_input_same_fingerprint(self):
        a = compute_fingerprint("zap", "10035", "10035-1", "GET", "/api/search", "q")
        b = compute_fingerprint("zap", "10035", "10035-1", "GET", "/api/search", "q")
        assert a == b
        assert a.startswith(f"finding:{FINGERPRINT_VERSION}:")
        assert len(a) > 30

    def test_different_plugin_different_fingerprint(self):
        a = compute_fingerprint("zap", "10035", "10035-1", "GET", "/api/search", "q")
        b = compute_fingerprint("zap", "40018", "40018", "GET", "/api/search", "q")
        assert a != b

    def test_normalized_path_affects_fingerprint(self):
        raw_a = normalize_path("http://x/api/1")
        raw_b = normalize_path("http://x/api/2")
        a = compute_fingerprint("zap", "10035", "10035-1", "GET", raw_a, "q")
        b = compute_fingerprint("zap", "10035", "10035-1", "GET", raw_b, "q")
        assert a == b  # both normalize to /api/{id}

    def test_different_method_different_fingerprint(self):
        a = compute_fingerprint("zap", "10035", "10035-1", "GET", "/x", "")
        b = compute_fingerprint("zap", "10035", "10035-1", "POST", "/x", "")
        assert a != b


class TestBuildCanonical:
    def test_from_zap_alert_with_instance(self):
        alert = {
            "name": "SQL Injection",
            "pluginid": "40018",
            "alertRef": "40018",
            "risk": "high",
            "cwe": "89",
            "instances": [{"uri": "http://host/rest/products/search?q=test", "param": "q", "method": "GET"}],
        }
        cf = build_canonical_finding(alert)
        assert cf is not None
        assert cf.title == "SQL Injection"
        assert cf.plugin_id == "40018"
        assert cf.severity == "high"
        assert cf.cwe == "89"
        assert cf.method == "GET"
        assert "q" in cf.parameter
        assert cf.finding_id.startswith(f"finding:{FINGERPRINT_VERSION}:")

    def test_no_pluginid_returns_none(self):
        assert build_canonical_finding({"name": "x"}) is None

    def test_build_from_run(self):
        alerts = [
            {
                "name": "HSTS",
                "pluginid": "10035",
                "alertRef": "10035-1",
                "risk": "low",
                "cwe": "319",
                "instances": [{"uri": "http://juice-shop:3000/", "param": "", "method": "GET"}],
            },
        ]
        results = build_canonical_findings_from_run(alerts)
        assert len(results) == 1

    def test_build_from_run_multiple_instances(self):
        alerts = [
            {
                "name": "XSS",
                "pluginid": "40012",
                "alertRef": "40012",
                "risk": "medium",
                "cwe": "79",
                "instances": [
                    {"uri": "http://host/a?x=1", "param": "x", "method": "GET"},
                    {"uri": "http://host/b?y=2", "param": "y", "method": "POST"},
                ],
            },
        ]
        results = build_canonical_findings_from_run(alerts)
        assert len(results) == 2
        assert results[0].finding_id != results[1].finding_id