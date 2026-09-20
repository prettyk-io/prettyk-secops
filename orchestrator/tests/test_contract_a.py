# -*- coding: utf-8 -*-
"""Unit tests for Contract A: StudioRunOutput DTO and Hub Intake protocol (PK-C-009)."""
from datetime import datetime, timezone
import pytest
from pydantic import ValidationError

from orchestrator.contracts.studio_run_output import (
    ARTIFACT_SCHEME,
    CONTRACT_VERSION,
    FINGERPRINT_SCHEME,
    FindingSeverity,
    BoxVerdict,
    QwenSuggestion,
    StudioFinding,
    StudioRunSummary,
    StudioProvenance,
    FuzzCorrelation,
    StudioRunOutput,
    HubIntakeResponse,
    canonical_artifact_ref,
    compute_act_ref,
    compute_scan_dedup_key,
    is_artifact_ref,
    make_fuzz_correlation,
)
from orchestrator.reports import (
    GOSTAct,
    GOSTActHeader,
    GOSTActObject,
    GOSTFinding,
)


def test_minimal_studio_run_output():
    """Minimal valid StudioRunOutput envelope."""
    payload = StudioRunOutput(
        scan_id="a3f19c2b7e04",
        run_id="a3f19c2b7e04",
        session_name="juice_smoke",
        project_id="exp01-baseline",
        box_verdict=BoxVerdict.pass_verdict,
        exit_code=0,
        started_at=datetime.now(timezone.utc),
        provenance=StudioProvenance(
            project_id="exp01-baseline",
            wired_hash="w_abc123",
            target_scope_hash="t_scope456",
            scan_profile="standard",
        ),
    )
    assert payload.contract_version == CONTRACT_VERSION
    assert payload.scan_id == "a3f19c2b7e04"
    assert payload.box_verdict == BoxVerdict.pass_verdict
    assert payload.exit_code == 0
    assert payload.findings == []


def test_full_studio_run_output_with_findings_and_evidence():
    """Complete StudioRunOutput payload with all fields populated."""
    qwen = QwenSuggestion(
        likely_false_positive=0.08,
        confidence=0.92,
        reason="Time-based blind SQLi confirmed by repeated 5.0s sleep",
        model_version="qwen3-1.7b",
        model_suggestion_ref="qwen-a3f19c2b7e04-f01",
    )
    finding = StudioFinding(
        fingerprint="finding:finding-v1:98a72b3c4d5e6f1011121314",
        fingerprint_scheme="finding-v1",
        title="SQL Injection in /api/login",
        severity=FindingSeverity.critical,
        rule_id="CWE-89",
        cwe="CWE-89",
        type="dast",
        location="POST /api/login:password",
        method="POST",
        parameter="password",
        component="auth-service",
        description="Blind SQL Injection detected on login authentication",
        evidence_ref="artifact://scanner.xml#alert/40012/instance/0",
        dojo_id=42,
        qwen_suggestion=qwen,
    )
    summary = StudioRunSummary(
        total=1,
        critical=1,
        high=0,
        medium=0,
        low=0,
        info=0,
        scenarios_passed=5,
        scenarios_failed=1,
    )
    provenance = StudioProvenance(
        project_id="exp01-baseline",
        release_domain="deploydomain- owasp",
        wired_hash="w_hash789",
        target_scope_hash="t_hash123",
        scan_profile="deep",
        fingerprint_version="finding-v1",
        assessment_purpose="pre_release",
        debug_mode=False,
        admission_void=False,
    )
    fuzz = FuzzCorrelation(
        parent_run_id="a3f19c2b7e04",
        module_id="juice_search_q",
        fuzz_run_id="fuzz-juice_search_q-05d2e9a3be97",
        anomalies_total=0,
    )

    act_data = {
        "header": {"project_name": "exp01-baseline", "organization": "Банк"},
        "object": {"name": "Juice Shop"},
    }
    calculated_act_ref = compute_act_ref(act_data)

    output = StudioRunOutput(
        scan_id="a3f19c2b7e04",
        run_id="a3f19c2b7e04",
        session_name="juice_full_pipeline",
        project_id="exp01-baseline",
        build_id="build-987",
        commit_sha="e854ffa12345",
        release_id="rel-2026-09-04",
        box_verdict=BoxVerdict.fail,
        exit_code=2,
        started_at=datetime.fromisoformat("2026-09-04T10:00:00+00:00"),
        finished_at=datetime.fromisoformat("2026-09-04T10:05:00+00:00"),
        duration_seconds=300.0,
        findings=[finding],
        summary=summary,
        evidence_refs=[
            "s3://prettyk-runs/a3f19c2b7e04/report.json",
            "s3://prettyk-runs/a3f19c2b7e04/session.har",
        ],
        act_ref=calculated_act_ref,
        gost_act=act_data,
        provenance=provenance,
        fuzz_correlation=fuzz,
    )

    assert output.findings[0].severity == FindingSeverity.critical
    assert output.findings[0].qwen_suggestion.confidence == 0.92
    assert output.box_verdict == BoxVerdict.fail
    assert output.fuzz_correlation.parent_run_id == "a3f19c2b7e04"
    assert output.act_ref.startswith("sha256:")

    # Round-trip JSON test
    json_str = output.model_dump_json()
    reloaded = StudioRunOutput.model_validate_json(json_str)
    assert reloaded.scan_id == output.scan_id
    assert len(reloaded.findings) == 1
    assert reloaded.findings[0].fingerprint == finding.fingerprint


def test_severity_case_insensitivity():
    """FindingSeverity handles uppercase and mixed case strings gracefully."""
    f1 = StudioFinding(
        fingerprint="finding:finding-v1:111122223333444455556666",
        title="XSS",
        severity="CRITICAL",
        rule_id="CWE-79",
        location="GET /search:q",
        evidence_ref="artifact://scanner.xml#alert/1/instance/0",
    )
    assert f1.severity == FindingSeverity.critical

    f2 = StudioFinding(
        fingerprint="finding:finding-v1:222233334444555566667777",
        title="Info disclosure",
        severity="High",
        rule_id="CWE-200",
        location="GET /metrics",
        evidence_ref="artifact://scanner.xml#alert/2/instance/0",
    )
    assert f2.severity == FindingSeverity.high


def test_box_verdict_coercion():
    """BoxVerdict enum parsing and coercion."""
    assert BoxVerdict("pass") == BoxVerdict.pass_verdict
    assert BoxVerdict("fail") == BoxVerdict.fail
    assert BoxVerdict("inconclusive") == BoxVerdict.inconclusive
    assert BoxVerdict("void") == BoxVerdict.void


def test_scan_id_and_run_id_mismatch_raises():
    """run_id must equal scan_id (invariant: 1:1 runner identity)."""
    with pytest.raises(ValidationError) as exc:
        StudioRunOutput(
            scan_id="a3f19c2b7e04",
            run_id="different_id123",
            session_name="test",
            project_id="test",
            box_verdict=BoxVerdict.pass_verdict,
            started_at=datetime.now(timezone.utc),
            provenance=StudioProvenance(
                project_id="test",
                wired_hash="w_hash",
                target_scope_hash="t_hash",
            ),
        )
    assert "must match scan_id" in str(exc.value)


def test_hub_intake_response_parsing():
    """Hub intake response model validation."""
    response_json = """{
        "accepted": true,
        "scan_id": "a3f19c2b7e04",
        "findings_processed": 1,
        "new_findings": 1,
        "new_occurrences": 1,
        "rejected_count": 0,
        "errors": []
    }"""
    resp = HubIntakeResponse.model_validate_json(response_json)
    assert resp.accepted is True
    assert resp.scan_id == "a3f19c2b7e04"
    assert resp.findings_processed == 1
    assert resp.errors == []


def _minimal_output(scan_id: str = "a3f19c2b7e04", wired_hash: str = "w_hash") -> StudioRunOutput:
    return StudioRunOutput(
        scan_id=scan_id,
        run_id=scan_id,
        session_name="juice_smoke",
        project_id="exp01-baseline",
        box_verdict=BoxVerdict.pass_verdict,
        started_at=datetime.now(timezone.utc),
        provenance=StudioProvenance(
            project_id="exp01-baseline",
            wired_hash=wired_hash,
            target_scope_hash="t_hash",
        ),
    )


# ── PRD-2: G1 / G2 / G3 / G5 / G6 ──


def test_g5_idempotency_key_is_stable_per_scan_id():
    """G5: один scan_id → один детерминированный ключ дедупа; разные — разные."""
    a1 = _minimal_output("a3f19c2b7e04")
    a2 = _minimal_output("a3f19c2b7e04")
    b = _minimal_output("ffffffffffff")

    assert a1.idempotency_key == a2.idempotency_key
    assert a1.idempotency_key == compute_scan_dedup_key("a3f19c2b7e04")
    assert len(a1.idempotency_key) == 32
    assert a1.idempotency_key != b.idempotency_key


def test_g5_explicit_idempotency_key_preserved():
    """G5: явно заданный ключ не перетирается авто-выводом."""
    out = StudioRunOutput(
        scan_id="a3f19c2b7e04",
        run_id="a3f19c2b7e04",
        session_name="s",
        project_id="p",
        box_verdict=BoxVerdict.pass_verdict,
        started_at=datetime.now(timezone.utc),
        idempotency_key="caller-supplied",
        provenance=StudioProvenance(project_id="p", wired_hash="w_hash", target_scope_hash="t_hash"),
    )
    assert out.idempotency_key == "caller-supplied"


def test_g1_fuzz_correlation_parent_is_runner_run_id():
    """G1: фабрика жёстко связывает fuzz-сессию с run_id раннера."""
    correlation = make_fuzz_correlation("a3f19c2b7e04", "juice_search_q")

    assert correlation.parent_run_id == "a3f19c2b7e04"
    assert correlation.fuzz_run_id.startswith("fuzz-juice_search_q-")
    assert correlation.anomalies_total == 0

    explicit = make_fuzz_correlation(
        "A3F19C2B7E04", "juice_search_q", fuzz_run_id="fuzz-custom-01", anomalies_total=3
    )
    assert explicit.parent_run_id == "a3f19c2b7e04"
    assert explicit.fuzz_run_id == "fuzz-custom-01"
    assert explicit.anomalies_total == 3


def test_g1_fuzz_correlation_rejects_non_hex_parent():
    """G1: parent_run_id обязан быть 12-hex runner run_id."""
    with pytest.raises(ValidationError):
        FuzzCorrelation(
            parent_run_id="not-a-run-id",
            module_id="m",
            fuzz_run_id="fuzz-m-01",
        )


def test_g3_artifact_ref_canonicalization():
    """G3: artifact:// канонизируется; мусор отвергается."""
    assert canonical_artifact_ref("artifact://scanner.xml#alert/40012/instance/0") == (
        "artifact://scanner.xml#alert/40012/instance/0"
    )
    assert canonical_artifact_ref("ARTIFACT:///zap//report.xml#alert/1/instance/0") == (
        "artifact://zap/report.xml#alert/1/instance/0"
    )
    assert canonical_artifact_ref("artifact://scanner.xml") == "artifact://scanner.xml"

    assert is_artifact_ref("artifact://scanner.xml#alert/1/instance/0") is True
    assert is_artifact_ref("s3://bucket/report.json") is False

    with pytest.raises(ValueError):
        canonical_artifact_ref("s3://bucket/report.json")
    with pytest.raises(ValueError):
        canonical_artifact_ref("artifact://")


def test_g6_scope_tuple_comparability():
    """G6: сопоставимость вердикта — строго по кортежу scope."""
    base = _minimal_output()
    same = _minimal_output()
    different_wired = _minimal_output(wired_hash="w_other")

    assert base.scope_tuple() == same.scope_tuple()
    assert base.is_comparable_with(same) is True
    assert base.is_comparable_with(different_wired) is False

    base.provenance.scan_profile = "deep"
    assert base.is_comparable_with(same) is False


def test_g2_attach_gost_act_persists_act_ref():
    """G2: act_ref персистентно выводится из ГОСТ-акта и проверяется обратно."""
    act = GOSTAct(
        header=GOSTActHeader(project_name="exp01-baseline"),
        object=GOSTActObject(name="Juice Shop"),
        findings_table=[GOSTFinding(severity="Critical", title="SQLi")],
    )
    out = _minimal_output()

    ref = out.attach_gost_act(act)

    assert ref.startswith("sha256:")
    assert out.act_ref == ref
    assert out.gost_act["header"]["project_name"] == "exp01-baseline"
    assert out.verify_act_ref() is True

    # повторный attach с иным актом → иной ref
    other = GOSTAct(
        header=GOSTActHeader(project_name="exp02"),
        object=GOSTActObject(name="Other"),
    )
    assert out.attach_gost_act(other) != ref
