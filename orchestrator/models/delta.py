# -*- coding: utf-8 -*-
"""QWEN3-ALERT-ASSISTANT W1: delta schemas.

Deterministic delta (always) + AI advisory delta (optional, fail-closed).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class ComparisonStatus(str, Enum):
    comparable = "comparable"
    incomparable = "incomparable"
    baseline_missing = "baseline_missing"
    current_missing = "current_missing"
    artifact_incomplete = "artifact_incomplete"


class AiDeltaDecision(str, Enum):
    narrative_ready = "narrative_ready"
    abstain = "abstain"
    invalid_model_output = "invalid_model_output"
    llm_unavailable = "llm_unavailable"


class Confidence(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


@dataclass
class DeltaProvenance:
    baseline_id: str = ""
    current_run_id: str = ""
    current_check_id: str = ""
    wired_hash: str = ""
    target_scope_hash: str = ""
    scan_profile: str = ""
    finding_schema_version: str = "finding-v1"


@dataclass
class DeltaChangedEntry:
    finding_id: str = ""
    before: dict = field(default_factory=dict)
    after: dict = field(default_factory=dict)
    evidence_refs: list[str] = field(default_factory=list)


@dataclass
class DeltaMetrics:
    baseline_findings: int = 0
    current_findings: int = 0
    newly_observed: int = 0
    not_observed: int = 0
    changed: int = 0


@dataclass
class DeltaResult:
    schema_version: str = "delta-v1"
    baseline_id: str = ""
    current_run_id: str = ""
    comparison_status: ComparisonStatus = ComparisonStatus.incomparable
    fingerprint_version: str = "finding-v1"
    newly_observed: list[dict] = field(default_factory=list)
    not_observed: list[dict] = field(default_factory=list)
    changed: list[DeltaChangedEntry] = field(default_factory=list)
    metrics: DeltaMetrics = field(default_factory=DeltaMetrics)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "baseline_id": self.baseline_id,
            "current_run_id": self.current_run_id,
            "comparison_status": self.comparison_status.value,
            "fingerprint_version": self.fingerprint_version,
            "newly_observed": self.newly_observed,
            "not_observed": self.not_observed,
            "changed": [
                {
                    "finding_id": c.finding_id,
                    "before": c.before,
                    "after": c.after,
                    "evidence_refs": c.evidence_refs,
                }
                for c in self.changed
            ],
            "metrics": {
                "baseline_findings": self.metrics.baseline_findings,
                "current_findings": self.metrics.current_findings,
                "newly_observed": self.metrics.newly_observed,
                "not_observed": self.metrics.not_observed,
                "changed": self.metrics.changed,
            },
            "warnings": self.warnings,
        }


@dataclass
class AiDeltaSuggestion:
    code: str = ""
    text: str = ""
    support: str = "evidence_backed"
    evidence_refs: list[str] = field(default_factory=list)


@dataclass
class AiDeltaModelInfo:
    name: str = "Qwen3-1.7B"
    prompt_version: str = "delta-v1"
    runtime_version: str = ""


class AiSchemaError(ValueError):
    """Raised when AI output fails schema validation. NOT a pass-through default."""


@dataclass
class AiDeltaResponse:
    schema_version: str = "ai-delta-v1"
    decision: AiDeltaDecision = AiDeltaDecision.llm_unavailable
    confidence: Confidence = Confidence.low
    narrative_ru: str = ""
    suggestions: list[AiDeltaSuggestion] = field(default_factory=list)
    unsupported_claims: list[str] = field(default_factory=list)
    model: AiDeltaModelInfo = field(default_factory=AiDeltaModelInfo)

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "decision": self.decision.value,
            "confidence": self.confidence.value,
            "narrative_ru": self.narrative_ru,
            "suggestions": [
                {
                    "code": s.code,
                    "text": s.text,
                    "support": s.support,
                    "evidence_refs": s.evidence_refs,
                }
                for s in self.suggestions
            ],
            "unsupported_claims": self.unsupported_claims,
            "model": {
                "name": self.model.name,
                "prompt_version": self.model.prompt_version,
                "runtime_version": self.model.runtime_version,
            },
        }