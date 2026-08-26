# -*- coding: utf-8 -*-
"""W1 acceptance: deterministic delta builder."""
import pytest
from models.finding import CanonicalFinding
from models.delta import ComparisonStatus, DeltaProvenance
from utils.baseline_delta import (
    comparability_check,
    compute_deterministic_delta,
)


def _make_finding(fid: str, title: str, severity: str = "medium", **kw):
    return CanonicalFinding(finding_id=fid, title=title, severity=severity, **kw)


PROV_A = DeltaProvenance(
    baseline_id="exp01",
    current_run_id="run-001",
    wired_hash="sha256:aaa",
    target_scope_hash="sha256:bbb",
    scan_profile="zap-demon-chrome",
    finding_schema_version="finding-v1",
)

PROV_B = DeltaProvenance(
    baseline_id="exp01",
    current_run_id="run-002",
    wired_hash="sha256:zzz",  # different wired
    target_scope_hash="sha256:bbb",
    finding_schema_version="finding-v1",
)

PROV_INCOMPLETE = DeltaProvenance(
    baseline_id="exp01",
    current_run_id="run-003",
    wired_hash="",
    target_scope_hash="sha256:bbb",
    finding_schema_version="finding-v1",
)


class TestComparabilityGate:
    def test_comparable_when_all_match(self):
        assert comparability_check(PROV_A, PROV_A) == ComparisonStatus.comparable

    def test_incomparable_different_Wired(self):
        assert comparability_check(PROV_A, PROV_B) == ComparisonStatus.incomparable

    def test_artifact_incomplete_missing_hash(self):
        assert comparability_check(PROV_A, PROV_INCOMPLETE) == ComparisonStatus.artifact_incomplete

    def test_baseline_missing(self):
        assert comparability_check(None, PROV_A) == ComparisonStatus.baseline_missing

    def test_current_missing(self):
        assert comparability_check(PROV_A, None) == ComparisonStatus.current_missing


class TestDelta:
    def test_same_findings_different_order_empty_delta(self):
        a = [
            _make_finding("f:z", "Zeta", "low"),
            _make_finding("f:a", "Alpha", "high"),
        ]
        b = [
            _make_finding("f:a", "Alpha", "high"),
            _make_finding("f:z", "Zeta", "low"),
        ]
        delta = compute_deterministic_delta(a, b, PROV_A)
        assert delta.comparison_status == ComparisonStatus.comparable
        assert delta.metrics.newly_observed == 0
        assert delta.metrics.not_observed == 0
        assert delta.metrics.changed == 0

    def test_newly_observed(self):
        baseline = [_make_finding("f:1", "XSS", "medium")]
        current = [_make_finding("f:1", "XSS", "medium"), _make_finding("f:2", "SQLI", "high")]
        delta = compute_deterministic_delta(baseline, current, PROV_A)
        assert delta.metrics.newly_observed == 1
        assert delta.metrics.not_observed == 0
        assert delta.newly_observed[0]["finding_id"] == "f:2"

    def test_not_observed_not_fixed(self):
        baseline = [_make_finding("f:1", "XSS", "medium"), _make_finding("f:2", "SQLI", "high")]
        current = [_make_finding("f:1", "XSS", "medium")]
        delta = compute_deterministic_delta(baseline, current, PROV_A)
        # Not observed — NOT called FIXED
        assert delta.metrics.not_observed == 1
        assert delta.metrics.newly_observed == 0
        assert "FIXED" not in delta.to_dict().get("comparison_status", "")

    def test_severity_changed(self):
        baseline = [_make_finding("f:1", "XSS", "high")]
        current = [_make_finding("f:1", "XSS", "medium")]
        delta = compute_deterministic_delta(baseline, current, PROV_A)
        assert delta.metrics.changed == 1
        assert delta.changed[0].before["severity"] == "high"
        assert delta.changed[0].after["severity"] == "medium"

    def test_incomparable_does_not_pretend_comparable(self):
        delta = compute_deterministic_delta([], [], PROV_A)
        # Comparing identical provenance twice — should be comparable with empty
        assert delta.comparison_status == ComparisonStatus.comparable

    def test_metrics_counts(self):
        baseline = [_make_finding(f"f:{c}", str(c), "low") for c in range(5)]
        current = [_make_finding(f"f:{c}", str(c), "low") for c in range(3, 8)]
        delta = compute_deterministic_delta(baseline, current, PROV_A)
        assert delta.metrics.baseline_findings == 5
        assert delta.metrics.current_findings == 5
        assert delta.metrics.newly_observed == 3  # f:5, f:6, f:7
        assert delta.metrics.not_observed == 3   # f:0, f:1, f:2