# -*- coding: utf-8 -*-
from datetime import datetime, timezone

from core.admission_filter import (
    FilterPolicy,
    WaiverEntry,
    filter_findings_for_gate,
    finding_passes_filter,
)


def test_filter_keeps_active_high_drops_fp_dup_mitigated():
    findings = [
        {"severity": "High", "active": True, "false_p": False, "duplicate": False},
        {"severity": "High", "active": True, "false_p": True},
        {"severity": "Critical", "active": False},
        {"severity": "Medium", "active": True, "duplicate": True},
        {"severity": "Low", "active": True, "is_mitigated": True},
        {"severity": "Info", "active": True},
    ]
    counts, audit = filter_findings_for_gate(findings)
    assert counts["high"] == 1
    assert counts["critical"] == 0
    assert counts["medium"] == 0
    assert counts["low"] == 0
    assert counts["info"] == 1
    assert audit.raw == 6
    assert audit.kept == 2
    assert audit.dropped_fp == 1
    assert audit.dropped_dup == 1
    assert audit.dropped_mitigated == 1
    assert audit.dropped_inactive == 1


def test_finding_passes_policy_defaults():
    pol = FilterPolicy()
    assert finding_passes_filter(
        {
            "severity": "High",
            "active": True,
            "false_p": False,
            "duplicate": False,
        },
        pol,
    )
    assert not finding_passes_filter(
        {"severity": "High", "active": True, "false_p": True}, pol
    )


def test_filter_v2_verified_min_severity_tags_age():
    findings = [
        {
            "severity": "High",
            "active": True,
            "verified": True,
            "tags": ["in-scope"],
            "date": "2026-08-01",
        },
        {
            "severity": "Low",
            "active": True,
            "verified": True,
            "tags": ["in-scope"],
            "date": "2026-08-01",
        },
        {
            "severity": "High",
            "active": True,
            "verified": False,
            "tags": ["in-scope"],
            "date": "2026-08-01",
        },
        {
            "severity": "High",
            "active": True,
            "verified": True,
            "tags": ["noise"],
            "date": "2026-08-01",
        },
        {
            "severity": "High",
            "active": True,
            "verified": True,
            "tags": ["in-scope"],
            "date": "2020-01-01",
        },
    ]
    pol = FilterPolicy(
        verified_only=True,
        min_severity="high",
        exclude_tags=("noise",),
        require_tags=("in-scope",),
        max_age_days=30,
    )
    now = datetime(2026, 8, 10, tzinfo=timezone.utc)
    counts, audit = filter_findings_for_gate(findings, pol, now=now)
    assert counts["high"] == 1
    assert audit.dropped_verified >= 1
    assert audit.dropped_severity >= 1
    assert audit.dropped_tags >= 1
    assert audit.dropped_age >= 1


def test_waiver_excludes_until_expiry():
    findings = [
        {
            "title": "SQL Injection",
            "severity": "High",
            "active": True,
            "cwe": "89",
        }
    ]
    waiver = WaiverEntry(
        title="SQL Injection",
        severity="high",
        cwe="89",
        expires_at="2026-08-15",
    )
    now = datetime(2026, 8, 10, tzinfo=timezone.utc)
    counts, audit = filter_findings_for_gate(
        findings, waivers=[waiver], now=now
    )
    assert counts["high"] == 0
    assert audit.dropped_waiver == 1

    expired = WaiverEntry(
        title="SQL Injection",
        severity="high",
        cwe="89",
        expires_at="2026-08-01",
    )
    counts2, audit2 = filter_findings_for_gate(
        findings, waivers=[expired], now=now
    )
    assert counts2["high"] == 1
    assert audit2.dropped_waiver == 0


def test_confidence_low_drops_on_min_medium():
    findings = [
        {
            "severity": "High",
            "active": True,
            "scanner_confidence": "Low",
        },
        {
            "severity": "High",
            "active": True,
            "scanner_confidence": "Medium",
        },
        {
            "severity": "Critical",
            "active": True,
            "confidence": "high",
        },
    ]
    pol = FilterPolicy(min_confidence=2)
    counts, audit = filter_findings_for_gate(findings, pol)
    assert counts["high"] == 1
    assert audit.dropped_confidence == 1  # Low < 2
    assert audit.kept == 2  # Medium + High

    # min_confidence=0 → off, все проходят
    pol2 = FilterPolicy(min_confidence=0)
    counts2, audit2 = filter_findings_for_gate(findings, pol2)
    assert counts2["high"] == 2
    assert audit2.dropped_confidence == 0


def test_confidence_numeric_values():
    findings = [
        {
            "severity": "High",
            "active": True,
            "scanner_confidence": 1,
        },
        {
            "severity": "High",
            "active": True,
            "scanner_confidence": 3,
        },
    ]
    pol = FilterPolicy(min_confidence=2)
    counts, audit = filter_findings_for_gate(findings, pol)
    assert counts["high"] == 1
    assert audit.dropped_confidence == 1


def test_confidence_missing_field_keeps():
    """Нет confidence → не наказываем (not our fault)."""
    findings = [
        {
            "severity": "High",
            "active": True,
        },
    ]
    pol = FilterPolicy(min_confidence=2)
    counts, audit = filter_findings_for_gate(findings, pol)
    assert audit.dropped_confidence == 0
    assert counts["high"] == 1


def test_registry_rules_drop_by_rule_id():
    findings = [
        {
            "severity": "High",
            "active": True,
            "pluginid": "10096",
            "title": "Timestamp Disclosure",
        },
        {
            "severity": "Medium",
            "active": True,
            "pluginid": "40012",
            "title": "Cross Site Scripting",
        },
    ]
    pol = FilterPolicy(
        registry_rules=(("10096", "", ""), ("10055", "", ""))
    )
    counts, audit = filter_findings_for_gate(findings, pol)
    assert counts["high"] == 0  # 10096 dropped by registry
    assert counts["medium"] == 1  # 40012 kept
    assert audit.dropped_registry == 1


def test_registry_rules_drop_by_severity_and_cwe():
    findings = [
        {
            "severity": "Low",
            "active": True,
            "cwe": "693",
            "title": "CORS header",
        },
        {
            "severity": "Info",
            "active": True,
            "cwe": "693",
            "title": "CORS header",
        },
    ]
    pol = FilterPolicy(
        registry_rules=(("", "info", "693"),)
    )
    counts, audit = filter_findings_for_gate(findings, pol)
    # Low+693: severity не совпал ("low" vs "info") → не дроп
    # Info+693: severity совпал → дроп
    assert audit.dropped_registry == 1
    assert audit.kept == 1


def test_registry_rule_overridden_by_waiver():
    findings = [
        {
            "severity": "Low",
            "active": True,
            "pluginid": "10020",
            "title": "Missing Anti-clickjacking Header",
        },
    ]
    pol = FilterPolicy(
        registry_rules=(("10020", "", ""),)
    )
    waiver = WaiverEntry(
        title="Missing Anti-clickjacking Header",
        severity="low",
        expires_at="2099-01-01",
    )
    now = datetime(2026, 8, 10, tzinfo=timezone.utc)
    counts, audit = filter_findings_for_gate(findings, pol, waivers=[waiver], now=now)
    # registry rule дропнул бы, но waiver override → kept
    assert counts["low"] == 1
    assert audit.dropped_registry == 0
    assert audit.kept == 1


def test_load_registry_rules(tmp_path):
    import json
    reg_path = tmp_path / "fp_registry.json"
    reg_path.write_text(
        json.dumps(
            {
                "rules": [
                    {"rule_id": "10096", "reason": "noise"},
                    {"cwe": "693", "severity": "info"},
                    {"rule_id": "10055", "severity": "low"},
                ]
            }
        ),
        encoding="utf-8",
    )
    from core.admission_filter import load_registry_rules

    rules = load_registry_rules(str(reg_path))
    assert len(rules) == 3
    assert ("10096", "", "") in rules
    assert ("", "info", "693") in rules
    assert ("10055", "low", "") in rules


def test_load_registry_rules_missing_file():
    from core.admission_filter import load_registry_rules

    assert load_registry_rules("nosuch/file.json") == ()
