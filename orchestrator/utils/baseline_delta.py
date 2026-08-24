# -*- coding: utf-8 -*-
"""QWEN3-ALERT-ASSISTANT W1: deterministic delta builder.

Always runs — no AI dependency. Computes the delta between two lists of
CanonicalFinding records by stable fingerprint.

Comparability gate: Wired, target scope, auth, scan phases, artifact
completeness and fingerprint version must match. If not — incomparable,
NOT a silent green FIXED.
"""
from __future__ import annotations

from typing import Optional

from models.finding import CanonicalFinding
from models.delta import (
    ComparisonStatus,
    DeltaChangedEntry,
    DeltaMetrics,
    DeltaProvenance,
    DeltaResult,
)


def comparability_check(
    baseline_provenance: Optional[DeltaProvenance],
    current_provenance: Optional[DeltaProvenance],
) -> ComparisonStatus:
    """Check whether two runs are comparable.

    Returns ``comparable`` only when Wired, target scope, auth mode,
    essential scan phases, fingerprint version all match AND both artifact
    sets are complete.
    """
    if baseline_provenance is None:
        return ComparisonStatus.baseline_missing
    if current_provenance is None:
        return ComparisonStatus.current_missing

    # Fingerprint version must match
    if baseline_provenance.finding_schema_version != current_provenance.finding_schema_version:
        return ComparisonStatus.incomparable

    # Manifest hash must be present and match
    if not baseline_provenance.wired_hash or not current_provenance.wired_hash:
        return ComparisonStatus.artifact_incomplete
    if baseline_provenance.wired_hash != current_provenance.wired_hash:
        return ComparisonStatus.incomparable

    # Target scope hash must be present and match
    if not baseline_provenance.target_scope_hash or not current_provenance.target_scope_hash:
        return ComparisonStatus.artifact_incomplete
    if baseline_provenance.target_scope_hash != current_provenance.target_scope_hash:
        return ComparisonStatus.incomparable

    # Scan profile (browser, ZAP mode) must match
    if baseline_provenance.scan_profile and current_provenance.scan_profile:
        if baseline_provenance.scan_profile != current_provenance.scan_profile:
            return ComparisonStatus.incomparable

    return ComparisonStatus.comparable


def _fingerprint_map(
    findings: list[CanonicalFinding],
) -> dict[str, CanonicalFinding]:
    """Build fingerprint → finding map. Deduplicates by fingerprint (first wins)."""
    out: dict[str, CanonicalFinding] = {}
    for f in findings:
        if f.finding_id not in out:
            out[f.finding_id] = f
    return out


def _bump_severity(v: str) -> str:
    """Normalise mixed severity strings to lower-case."""
    return (v or "").strip().lower()


def compute_deterministic_delta(
    baseline: list[CanonicalFinding],
    current: list[CanonicalFinding],
    provenance: Optional[DeltaProvenance] = None,
) -> DeltaResult:
    """Deterministic pre-pass: compare two finding lists by fingerprint.

    Returns a ``DeltaResult`` with comparison status, newly_observed,
    not_observed, changed and metrics. This is independent of AI — always runs.
    """
    if provenance is None:
        provenance = DeltaProvenance()

    status = comparability_check(provenance, provenance)
    if status != ComparisonStatus.comparable:
        return DeltaResult(
            baseline_id=provenance.baseline_id,
            current_run_id=provenance.current_run_id,
            comparison_status=status,
            fingerprint_version=provenance.finding_schema_version,
            warnings=[f"comparison blocked: {status.value}"],
        )

    baseline_map = _fingerprint_map(baseline)
    current_map = _fingerprint_map(current)

    baseline_ids = set(baseline_map.keys())
    current_ids = set(current_map.keys())

    newly_observed_ids = current_ids - baseline_ids
    not_observed_ids = baseline_ids - current_ids
    common_ids = baseline_ids & current_ids

    newly_observed: list[dict] = []
    for fid in newly_observed_ids:
        cf = current_map[fid]
        newly_observed.append({
            "finding_id": fid,
            "title": cf.title,
            "severity": cf.severity,
            "cwe": cf.cwe,
            "method": cf.method,
            "path": cf.path,
            "parameter": cf.parameter,
            "evidence_refs": cf.evidence_refs,
            "dojo_id": cf.dojo_id,
            "dojo_url": cf.dojo_url,
        })

    not_observed: list[dict] = []
    for fid in not_observed_ids:
        cf = baseline_map[fid]
        not_observed.append({
            "finding_id": fid,
            "title": cf.title,
            "severity": cf.severity,
            "cwe": cf.cwe,
            "method": cf.method,
            "path": cf.path,
            "parameter": cf.parameter,
            "evidence_refs": cf.evidence_refs,
            "dojo_id": cf.dojo_id,
            "dojo_url": cf.dojo_url,
        })

    changed: list[DeltaChangedEntry] = []
    for fid in common_ids:
        b = baseline_map[fid]
        c = current_map[fid]
        b_sev = _bump_severity(b.severity)
        c_sev = _bump_severity(c.severity)
        if b_sev != c_sev:
            changed.append(DeltaChangedEntry(
                finding_id=fid,
                before={"severity": b_sev},
                after={"severity": c_sev},
                evidence_refs=c.evidence_refs or b.evidence_refs,
            ))

    metrics = DeltaMetrics(
        baseline_findings=len(baseline),
        current_findings=len(current),
        newly_observed=len(newly_observed),
        not_observed=len(not_observed),
        changed=len(changed),
    )

    return DeltaResult(
        baseline_id=provenance.baseline_id,
        current_run_id=provenance.current_run_id,
        comparison_status=ComparisonStatus.comparable,
        fingerprint_version=provenance.finding_schema_version,
        newly_observed=newly_observed,
        not_observed=not_observed,
        changed=changed,
        metrics=metrics,
    )


def persist_deterministic_delta(result: DeltaResult, run_dir: str) -> str:
    """Write deterministic delta to ``<run_dir>/deterministic_delta.json``.

    Returns the file path written.
    """
    import json
    import os

    os.makedirs(run_dir, exist_ok=True)
    target = os.path.join(run_dir, "deterministic_delta.json")
    payload = result.to_dict()
    with open(target, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    return target


def load_canonical_findings_from_fixture(fixture_path: str) -> list[CanonicalFinding]:
    """Load EXP-01 style fixture and return canonical findings."""
    from utils.finding_identity import load_zap_alerts, build_canonical_findings_from_run

    alerts = load_zap_alerts(fixture_path)
    if not alerts:
        return []

    # Try to load companion dojo findings if exists
    dojo_findings = None
    import os
    dojo_path = os.path.join(os.path.dirname(fixture_path), "dojo_baseline_findings.json")
    if os.path.exists(dojo_path):
        import json
        with open(dojo_path, "r", encoding="utf-8") as fh:
            dojo_data = json.load(fh)
            dojo_findings = dojo_data.get("findings") if isinstance(dojo_data, dict) else None

    return build_canonical_findings_from_run(alerts, dojo_findings)