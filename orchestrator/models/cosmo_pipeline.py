"""# PoC — NOT production. Cosmoport boundary. Do not import into DAST runtime.
COS-B2 дополнение: PipelinePlan, EvidenceLedgerEntry, PlanCompiler.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

StrictModel = ConfigDict(extra="ignore")


# ── PipelinePlan ───────────────────────────────────────────────────────────


class PlanBrickRef(BaseModel):
    """Кирпич в составе плана (со ссылкой и порядком)."""
    model_config = StrictModel
    brick_id: str = Field(..., min_length=1)
    sort_order: int = Field(default=0)


class PipelinePlan(BaseModel):
    """Скомпилированный план пайплайна для приложения/группы/группы-групп."""
    model_config = StrictModel

    id: str = Field(..., min_length=1)
    application_id: str = Field(..., min_length=1)
    level: str = Field(default="app")
    scope_id: str = Field(..., min_length=1)
    bricks: list[PlanBrickRef] = Field(default_factory=list)
    batches: list[dict] = Field(default_factory=list)
    compiled_at: datetime = Field(default_factory=datetime.utcnow)
    compiled_hash: str = Field(..., min_length=1)


# ── Evidence Ledger ────────────────────────────────────────────────────────


class EvidenceEntry(BaseModel):
    """Одна запись в иммутабельном Evidence Ledger."""
    model_config = StrictModel

    id: str = Field(..., min_length=1)
    run_id: str = Field(..., min_length=1)
    batch_id: str | None = None
    type: str = Field(..., min_length=1)
    content_ref: str | None = None
    content_hash: str | None = None
    provenance: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @model_validator(mode="after")
    def valid_evidence_type(self) -> "EvidenceEntry":
        allowed = {"screenshot", "raw_request", "raw_response", "log", "alert", "finding", "decision"}
        if self.type not in allowed:
            raise ValueError(f"Invalid evidence type: {self.type}")
        return self


class EvidenceLedger(BaseModel):
    """Иммутабельный лог evidence."""
    model_config = StrictModel

    run_id: str = Field(..., min_length=1)
    entries: list[EvidenceEntry] = Field(default_factory=list)


# ── Brick Catalog ──────────────────────────────────────────────────────────


class BrickCatalog:
    """Каталог кирпичей с domain-override (core → domain)."""

    def __init__(self, core_bricks: list[dict] | None = None):
        self._core: dict[str, dict] = {}
        self._overrides: dict[str, dict[str, dict]] = {}  # domain_id → brick_id → definition
        if core_bricks:
            for b in core_bricks:
                self._core[b["id"]] = b

    def register_core(self, brick: dict):
        self._core[brick["id"]] = brick

    def register_override(self, domain_id: str, brick: dict):
        self._overrides.setdefault(domain_id, {})[brick["id"]] = brick

    def resolve(self, brick_id: str, domain_id: str | None = None) -> dict | None:
        if domain_id and domain_id in self._overrides:
            override = self._overrides[domain_id].get(brick_id)
            if override:
                return override
        return self._core.get(brick_id)

    def resolve_all(self, brick_ids: list[str], domain_id: str | None = None) -> list[dict]:
        result: list[dict] = []
        for bid in brick_ids:
            brick = self.resolve(bid, domain_id)
            if brick:
                result.append(brick)
        return result

    def validate_dag(self, brick_ids: list[str]) -> list[str] | None:
        """Проверить отсутствие циклов в depends_on. Вернуть список ошибок."""
        bricks = {b[":id"]: b for bid in brick_ids if (b := self.resolve(bid))}
        errors: list[dict] = []
        for bid, brick in bricks.items():
            for dep_id in brick.get("depends_on", []):
                if dep_id not in bricks:
                    errors.append(f"Brick {bid} depends on unknown brick {dep_id}")
        return errors if errors else None