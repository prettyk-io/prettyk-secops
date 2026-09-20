# -*- coding: utf-8 -*-
"""Contract A: Studio Outputs DTO for Hub Intake (PK-C-009).

Source of Truth for hand-off between PrettyK SecOps (Коробка) and PrettyK Hub.
Formalized after inventory in docs/research/2026-09-03-studio-outputs-contract-a-inventory.md.
Closes gaps G1 (fuzz correlation), G2 (act_ref), G3 (artifact:// URI), G6 (provenance tuple).
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from enum import Enum
from typing import Any, List, Literal, Optional, Tuple
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CONTRACT_VERSION = "1.0"
FINGERPRINT_SCHEME = "finding-v1"

# G3: каноническая схема ссылок на raw evidence.
ARTIFACT_SCHEME = "artifact"
_ARTIFACT_RE = re.compile(
    r"^artifact://(?P<source>[^#\s]+)(?:#(?P<pointer>[^\s]+))?$",
    re.IGNORECASE,
)


def compute_scan_dedup_key(scan_id: str, contract_version: str = CONTRACT_VERSION) -> str:
    """G5: стабильный ключ идемпотентности интейка по ``scan_id``.

    Один и тот же ``scan_id`` всегда даёт один ключ — Hub дедуплицирует
    повторную доставку (обновляет Occurrence, не создаёт дубль Finding).
    """
    raw = f"{scan_id}:{contract_version}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def is_artifact_ref(ref: str) -> bool:
    """Является ли строка канонической ``artifact://`` ссылкой (G3)."""
    return bool(isinstance(ref, str) and _ARTIFACT_RE.match(ref.strip()))


def canonical_artifact_ref(ref: str) -> str:
    """G3: канонизировать ``artifact://<source>#<pointer>``.

    Схема регистронезависима, ведущие/дублирующиеся слэши в ``source``
    схлопываются, фрагмент (pointer) сохраняется как есть. Невалидная
    ссылка → ``ValueError`` (fail-closed, а не молчаливое пропускание).
    """
    if not isinstance(ref, str):
        raise ValueError(f"artifact ref must be a string, got {type(ref).__name__}")
    match = _ARTIFACT_RE.match(ref.strip())
    if match is None:
        raise ValueError(f"not a canonical artifact:// ref: {ref!r}")
    source = re.sub(r"/{2,}", "/", match.group("source").strip("/"))
    pointer = match.group("pointer")
    canonical = f"{ARTIFACT_SCHEME}://{source}"
    if pointer:
        canonical += f"#{pointer}"
    return canonical


class FindingSeverity(str, Enum):
    """Canonical lowercase severity levels for findings."""
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    info = "info"

    @classmethod
    def _missing_(cls, value: object) -> Optional["FindingSeverity"]:
        if isinstance(value, str):
            val_lower = value.strip().lower()
            for member in cls:
                if member.value == val_lower:
                    return member
        return None


class BoxVerdict(str, Enum):
    """Box execution & admission verdict.
    
    pass: All scenarios passed, security policy satisfied, exit_code=0.
    fail: Quality gate failed or findings exceed threshold, exit_code=2.
    inconclusive: Test execution interrupted or timeout occurred.
    void: Debug mode or admission void; results have no clearance authority.
    """
    pass_verdict = "pass"
    fail = "fail"
    inconclusive = "inconclusive"
    void = "void"

    @classmethod
    def _missing_(cls, value: object) -> Optional["BoxVerdict"]:
        if isinstance(value, str):
            val_lower = value.strip().lower()
            if val_lower == "pass":
                return cls.pass_verdict
            for member in cls:
                if member.value == val_lower:
                    return member
        return None


class QwenSuggestion(BaseModel):
    """QWEN alert assistant evaluation of finding validity."""
    model_config = ConfigDict(extra="ignore")

    likely_false_positive: float = Field(..., ge=0.0, le=1.0, description="Probability (0.0 to 1.0) of false positive")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence score")
    reason: str = Field(..., min_length=1, description="Justification explanation")
    model_version: str = Field(..., min_length=1, description="Model identifier, e.g. qwen3-1.7b")
    model_suggestion_ref: Optional[str] = Field(default=None, description="Reference ID of AI evaluation record")


class StudioFinding(BaseModel):
    """Individual security finding produced by SecOps scanners (DAST / Fuzz / Crawler)."""
    model_config = ConfigDict(extra="ignore")

    fingerprint: str = Field(
        ...,
        min_length=8,
        description="Stable finding identity: finding:finding-v1:<sha256[:24]> (Dojo ID is never included)"
    )
    fingerprint_scheme: str = Field(default=FINGERPRINT_SCHEME, description="Algorithm scheme used for fingerprint")
    title: str = Field(..., min_length=1, description="Human-readable title of the vulnerability")
    severity: FindingSeverity = Field(..., description="Canonical severity level")
    rule_id: str = Field(..., min_length=1, description="Scanner rule ID (e.g. CWE-89, pluginid 40012, or pk_fuzz_*)")
    cwe: Optional[str] = Field(default=None, description="CWE identifier if known (e.g. CWE-79)")
    type: str = Field(default="dast", description="Finding category: dast | fuzz | crawler")
    location: str = Field(..., min_length=1, description="Target endpoint or path, e.g. POST /api/login:password")
    method: Optional[str] = Field(default=None, description="HTTP method if applicable: GET, POST, etc.")
    parameter: Optional[str] = Field(default=None, description="Normalized parameter name")
    component: Optional[str] = Field(default=None, description="Target component or service name")
    description: Optional[str] = Field(default=None, description="Detailed vulnerability description")
    evidence_ref: str = Field(
        ...,
        min_length=1,
        description="URI pointing to raw evidence, e.g. artifact://scanner.xml#alert/40012/instance/0 or MinIO path"
    )
    dojo_id: Optional[int] = Field(default=None, description="DefectDojo database id (display only, never in identity)")
    qwen_suggestion: Optional[QwenSuggestion] = Field(default=None, description="AI assistant evaluation if available")


class StudioRunSummary(BaseModel):
    """Finding counts and scenario execution summary."""
    model_config = ConfigDict(extra="ignore")

    total: int = Field(default=0, ge=0)
    critical: int = Field(default=0, ge=0)
    high: int = Field(default=0, ge=0)
    medium: int = Field(default=0, ge=0)
    low: int = Field(default=0, ge=0)
    info: int = Field(default=0, ge=0)
    scenarios_passed: Optional[int] = Field(default=None, ge=0)
    scenarios_failed: Optional[int] = Field(default=None, ge=0)


class StudioProvenance(BaseModel):
    """Execution comparability tuple and provenance context (closes G6).
    
    A studio verdict is comparable with baseline ONLY when wired_hash,
    target_scope_hash, scan_profile, and fingerprint_version match.
    """
    model_config = ConfigDict(extra="ignore")

    project_id: str = Field(..., min_length=1, description="Project identifier, e.g. exp01-baseline")
    release_domain: Optional[str] = Field(default=None, description="Target release domain")
    wired_hash: str = Field(..., min_length=4, description="Hash of wired.json manifest defining scan scene")
    target_scope_hash: str = Field(..., min_length=4, description="Hash of targeted endpoints and host scope")
    scan_profile: str = Field(default="standard", description="Scan execution profile")
    fingerprint_version: str = Field(default=FINGERPRINT_SCHEME, description="Finding identity version")
    assessment_purpose: Optional[str] = Field(
        default=None,
        description="Assessment purpose: scheduled | pre_release | emergency | manual"
    )
    debug_mode: bool = Field(default=False, description="Whether scan ran in debug mode (forces void verdict)")
    admission_void: bool = Field(default=False, description="Whether admission was voided due to execution errors")

    def comparability_tuple(self) -> Tuple[str, str, str, str, str]:
        """G6: кортеж сопоставимости Studio PASS.

        Вердикт сравним с baseline ТОЛЬКО при полном совпадении кортежа.
        """
        return (
            self.project_id,
            self.wired_hash,
            self.target_scope_hash,
            self.scan_profile,
            self.fingerprint_version,
        )

    def is_comparable_with(self, other: "StudioProvenance") -> bool:
        """G6: одна ли область действия у двух прогонов."""
        return self.comparability_tuple() == other.comparability_tuple()


class FuzzCorrelation(BaseModel):
    """Correlation link connecting fuzz session with runner run (closes G1)."""
    model_config = ConfigDict(extra="ignore")

    parent_run_id: str = Field(..., min_length=4, description="Parent runner run_id (12 hex)")
    module_id: str = Field(..., min_length=1, description="Fuzzer target module name")
    fuzz_run_id: str = Field(..., min_length=1, description="Fuzzer session ID: fuzz-<module>-<hash>")
    anomalies_total: int = Field(default=0, ge=0)

    @field_validator("parent_run_id")
    @classmethod
    def validate_parent_run_id(cls, v: str) -> str:
        """G1: parent_run_id обязан быть runner run_id (12 hex)."""
        value = v.strip().lower()
        if not re.fullmatch(r"[0-9a-f]{12}", value):
            raise ValueError(f"parent_run_id must be a 12-hex runner run_id, got {v!r}")
        return value


def make_fuzz_correlation(
    run_id: str,
    module_id: str,
    fuzz_run_id: Optional[str] = None,
    anomalies_total: int = 0,
) -> FuzzCorrelation:
    """G1: собрать fuzz↔runner связь для конкретного прогона раннера.

    ``parent_run_id`` всегда = ``run_id`` раннера. Если fuzzer не вернул
    собственный session id, он детерминированно выводится как
    ``fuzz-<module_id>-<sha256(run_id:module)[:12]>``.
    """
    parent = run_id.strip().lower()
    session = fuzz_run_id
    if not session:
        digest = hashlib.sha256(f"{parent}:{module_id}".encode("utf-8")).hexdigest()[:12]
        session = f"fuzz-{module_id}-{digest}"
    return FuzzCorrelation(
        parent_run_id=parent,
        module_id=module_id,
        fuzz_run_id=session,
        anomalies_total=anomalies_total,
    )


class StudioRunOutput(BaseModel):
    """Contract A Envelope: SecOps Studio Run Output payload delivered to PrettyK Hub Intake.
    
    Sent to PrettyK Hub via HTTP POST :8200/api/v1/intake or via airgap artifact exchange.
    """
    model_config = ConfigDict(extra="ignore")

    contract_version: str = Field(default=CONTRACT_VERSION, description="Contract specification version")
    idempotency_key: str = Field(
        default="",
        description="G5: stable Hub dedup key derived from scan_id (repeat intake updates, never duplicates)",
    )
    scan_id: str = Field(
        ...,
        min_length=6,
        description="Canonical scan execution ID (equal to run_id, 12 hex)"
    )
    run_id: str = Field(
        ...,
        min_length=6,
        description="Studio runner run_id (12 hex, e.g. a3f19c2b7e04)"
    )
    session_name: str = Field(..., min_length=1, description="Descriptive session name, e.g. juice_smoke")
    project_id: str = Field(..., min_length=1, description="Project identifier, e.g. exp01-baseline")
    build_id: Optional[str] = Field(default=None, description="CI build identifier")
    commit_sha: Optional[str] = Field(default=None, description="Commit SHA being tested")
    release_id: Optional[str] = Field(default=None, description="Release identifier if triggered for a release")
    scanner: str = Field(default="prettyk", description="Scanner suite name")
    scanner_version: str = Field(default="2.4.0", description="SecOps runner version")
    ruleset_version: str = Field(default="2026-08-31", description="Scanner ruleset version")
    box_verdict: BoxVerdict = Field(..., description="Observed execution verdict of the box")
    exit_code: int = Field(default=0, description="Process exit code: 0=ok, 1=execution error, 2=gate fail")
    started_at: datetime = Field(..., description="Timestamp when scan started")
    finished_at: Optional[datetime] = Field(default=None, description="Timestamp when scan finished")
    duration_seconds: Optional[float] = Field(default=None, ge=0.0, description="Total execution duration in seconds")
    findings: List[StudioFinding] = Field(default_factory=list, description="List of observed security findings")
    summary: StudioRunSummary = Field(default_factory=StudioRunSummary, description="Summary counts")
    evidence_refs: List[str] = Field(
        default_factory=list,
        description="URIs of heavyweight evidence: HAR, Allure, SARIF, logs, video recordings"
    )
    act_ref: Optional[str] = Field(
        default=None,
        description="Cryptographic SHA-256 digest of GOST Act: sha256:<hex64> (closes G2)"
    )
    gost_act: Optional[dict[str, Any]] = Field(
        default=None,
        description="Optional structured GOST Act data if generated"
    )
    provenance: StudioProvenance = Field(..., description="Comparability tuple and execution parameters (closes G6)")
    fuzz_correlation: Optional[FuzzCorrelation] = Field(
        default=None,
        description="Fuzzing correlation link if fuzz modules were run (closes G1)"
    )

    @field_validator("run_id")
    @classmethod
    def validate_run_id_match(cls, v: str, info: Any) -> str:
        scan_id = info.data.get("scan_id")
        if scan_id and v != scan_id:
            # We enforce 1:1 mapping: scan_id is runner run_id
            raise ValueError(f"run_id ({v}) must match scan_id ({scan_id})")
        return v

    @model_validator(mode="after")
    def _ensure_idempotency_key(self) -> "StudioRunOutput":
        """G5: idempotency_key всегда выводится из scan_id, если не задан явно."""
        if not self.idempotency_key:
            object.__setattr__(
                self, "idempotency_key", compute_scan_dedup_key(self.scan_id)
            )
        return self

    def scope_tuple(self) -> Tuple[str, str, str, str, str]:
        """G6: кортеж сопоставимости прогона (делегирует provenance)."""
        return self.provenance.comparability_tuple()

    def is_comparable_with(self, other: "StudioRunOutput") -> bool:
        """G6: сравним ли вердикт этого прогона с другим (baseline)."""
        return self.provenance.is_comparable_with(other.provenance)

    def attach_gost_act(self, gost_act: Any) -> str:
        """G2: персистентно привязать ГОСТ-акт и вычислить ``act_ref``.

        ``act_ref = sha256(gost_model)``; возвращает вычисленный ref и
        проставляет ``gost_act``/``act_ref`` на этом же объекте.
        """
        ref = compute_act_ref(gost_act)
        payload = (
            gost_act.model_dump(mode="json")
            if hasattr(gost_act, "model_dump")
            else gost_act
        )
        object.__setattr__(self, "gost_act", payload)
        object.__setattr__(self, "act_ref", ref)
        return ref

    def verify_act_ref(self) -> bool:
        """G2: сходится ли сохранённый ``act_ref`` с ``gost_act``."""
        if self.gost_act is None or not self.act_ref:
            return False
        return compute_act_ref(self.gost_act) == self.act_ref


def compute_act_ref(gost_act_dict_or_model: Any) -> str:
    """Compute stable act_ref SHA-256 digest for GOST act (closes G2).

    Канонизация одинакова для модели и dict: модель приводится к JSON-dict,
    затем сериализуется с sorted keys. Это гарантирует, что ``act_ref``,
    посчитанный от ``GOSTAct``, совпадёт с пересчётом от сохранённого
    ``gost_act`` (dict) — иначе ссылка «плыла» бы между представлениями.
    """
    if hasattr(gost_act_dict_or_model, "model_dump"):
        gost_act_dict_or_model = gost_act_dict_or_model.model_dump(mode="json")
    if isinstance(gost_act_dict_or_model, str):
        payload = gost_act_dict_or_model
    elif isinstance(gost_act_dict_or_model, dict):
        payload = json.dumps(
            gost_act_dict_or_model, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        )
    else:
        raise ValueError(f"Unsupported act type: {type(gost_act_dict_or_model)}")
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


class HubIntakeErrorItem(BaseModel):
    """Detailed validation or processing error item."""
    model_config = ConfigDict(extra="ignore")

    finding_index: Optional[int] = None
    field: Optional[str] = None
    reason: str


class HubIntakeResponse(BaseModel):
    """Response returned by PrettyK Hub /api/v1/intake endpoint."""
    model_config = ConfigDict(extra="ignore")

    accepted: bool
    scan_id: str
    findings_processed: int = 0
    new_findings: int = 0
    new_occurrences: int = 0
    rejected_count: int = 0
    errors: List[HubIntakeErrorItem] = Field(default_factory=list)
