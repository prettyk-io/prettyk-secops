"""
COS-B1: SQLAlchemy ORM модели Cosmoport Domain Model.

Таблицы:
  domains, apps, groups, repo_bindings,
  pipeline_bricks, pipeline_plans, plan_bricks,
  batches, plan_batches,
  gates, plan_gates, gate_policy_rules,
  runs, evidence_ledger_entries
"""
from __future__ import annotations

import uuid
from datetime import datetime

try:
    from sqlalchemy import (
        Column, String, Integer, Boolean, DateTime, Text, JSON,
        ForeignKey, CheckConstraint, Index, UniqueConstraint,
    )
    from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

    class Base(DeclarativeBase):
        pass
except ImportError:
    # SQLAlchemy not installed in dev — stub for syntax checks
    Base = object  # type: ignore
    Column = lambda *a, **kw: None  # type: ignore
    String = Integer = Boolean = DateTime = Text = JSON = lambda *a: ""  # type: ignore
    ForeignKey = CheckConstraint = Index = UniqueConstraint = lambda *a, **kw: None  # type: ignore
    Mapped = lambda *a: None  # type: ignore
    mapped_column = lambda *a, **kw: None  # type: ignore
    relationship = lambda *a, **kw: None  # type: ignore


def _uid():
    return uuid.uuid4().hex[:12]


# ---------------------------------------------------------------------------


class Domain(Base):  # type: ignore[valid-type]
    __tablename__ = "domains"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    forge_type: Mapped[str] = mapped_column(String(32), default="gitea", nullable=False)
    forge_url: Mapped[str] = mapped_column(String(512), nullable=False)
    forge_token_ref: Mapped[str] = mapped_column(String(128), nullable=False)
    rbac_config: Mapped[dict] = mapped_column(JSON, default=dict)
    quota_max_runs: Mapped[int] = mapped_column(Integer, default=50)
    quota_max_storage_gb: Mapped[int] = mapped_column(Integer, default=100)
    quota_max_cpu: Mapped[int] = mapped_column(Integer, default=8)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    apps: Mapped[list["Application"]] = relationship(back_populates="domain")
    groups: Mapped[list["Group"]] = relationship(back_populates="domain")
    runs: Mapped[list["Run"]] = relationship(back_populates="domain")


class Application(Base):
    __tablename__ = "apps"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    domain_id: Mapped[str] = mapped_column(String(64), ForeignKey("domains.id"), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    group_id: Mapped[str] = mapped_column(String(64), ForeignKey("groups.id"), nullable=True)
    pipeline_plan_id: Mapped[str] = mapped_column(String(64), ForeignKey("pipeline_plans.id"), nullable=True)

    domain: Mapped["Domain"] = relationship(back_populates="apps")
    group: Mapped["Group"] = relationship(back_populates="apps")
    repo_bindings: Mapped[list["RepositoryBinding"]] = relationship(back_populates="app")
    plan: Mapped["PipelinePlan"] = relationship(back_populates="app")

    __table_args__ = (
        CheckConstraint("level >= 0 AND level <= 3", name="ck_apps_level"),
    )


class RepositoryBinding(Base):
    __tablename__ = "repo_bindings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uid)
    app_id: Mapped[str] = mapped_column(String(64), ForeignKey("apps.id"), nullable=False)
    forge_id: Mapped[str] = mapped_column(String(64), nullable=False)
    repo_path: Mapped[str] = mapped_column(String(256), nullable=False)
    default_branch: Mapped[str] = mapped_column(String(128), default="main")
    webhook_id: Mapped[str] = mapped_column(String(128), nullable=True)

    app: Mapped["Application"] = relationship(back_populates="repo_bindings")


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    domain_id: Mapped[str] = mapped_column(String(64), ForeignKey("domains.id"), nullable=False)
    parent_group_id: Mapped[str] = mapped_column(String(64), ForeignKey("groups.id"), nullable=True)
    level: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    domain: Mapped["Domain"] = relationship(back_populates="groups")
    apps: Mapped[list["Application"]] = relationship(back_populates="group")

    __table_args__ = (
        CheckConstraint("level >= 0 AND level <= 3", name="ck_groups_level"),
    )


# ---------------------------------------------------------------------------
# Pipeline Bricks & Plans
# ---------------------------------------------------------------------------


class PipelineBrick(Base):
    __tablename__ = "pipeline_bricks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    source: Mapped[str] = mapped_column(String(256), nullable=False)
    definition_json: Mapped[dict] = mapped_column(JSON, default=dict)
    depends_on: Mapped[list] = mapped_column(JSON, default=list)
    gates: Mapped[list] = mapped_column(JSON, default=list)


class PipelinePlan(Base):
    __tablename__ = "pipeline_plans"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    app_id: Mapped[str] = mapped_column(String(64), ForeignKey("apps.id"), nullable=False)
    level: Mapped[str] = mapped_column(String(32), nullable=False, default="app")
    scope_id: Mapped[str] = mapped_column(String(64), nullable=False)
    compiled_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    compiled_hash: Mapped[str] = mapped_column(String(128), nullable=False)

    app: Mapped["Application"] = relationship(back_populates="plan")
    bricks: Mapped[list["PlanBrick"]] = relationship(back_populates="plan")
    batches: Mapped[list["Batch"]] = relationship(back_populates="plan")
    gates: Mapped[list["Gate"]] = relationship(back_populates="plan")


class PlanBrick(Base):
    """M:N связь: кирпич в контексте плана (порядок, override)."""
    __tablename__ = "plan_bricks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uid)
    plan_id: Mapped[str] = mapped_column(String(64), ForeignKey("pipeline_plans.id"), nullable=False)
    brick_id: Mapped[str] = mapped_column(String(64), ForeignKey("pipeline_bricks.id"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    plan: Mapped["PipelinePlan"] = relationship(back_populates="bricks")


# ---------------------------------------------------------------------------
# Batches
# ---------------------------------------------------------------------------


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    plan_id: Mapped[str] = mapped_column(String(64), ForeignKey("pipeline_plans.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    bricks_refs: Mapped[list] = mapped_column(JSON, default=list)
    artifacts: Mapped[list] = mapped_column(JSON, default=list)
    evidence_refs: Mapped[list] = mapped_column(JSON, default=list)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    plan: Mapped["PipelinePlan"] = relationship(back_populates="batches")
    run: Mapped["Run"] = relationship(back_populates="batch", uselist=False)

    __table_args__ = (
        Index("ix_batch_plan_id", "plan_id"),
    )


# ---------------------------------------------------------------------------
# Gates
# ---------------------------------------------------------------------------


class Gate(Base):
    __tablename__ = "gates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    plan_id: Mapped[str] = mapped_column(String(64), ForeignKey("pipeline_plans.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(32), default="automatic")
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    policy_json: Mapped[dict] = mapped_column(JSON, default=dict)
    decision: Mapped[str] = mapped_column(String(32), nullable=True)
    decided_by: Mapped[str] = mapped_column(String(128), nullable=True)
    signature: Mapped[str] = mapped_column(String(512), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    plan: Mapped["PipelinePlan"] = relationship(back_populates="gates")


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uid)
    plan_id: Mapped[str] = mapped_column(String(64), ForeignKey("pipeline_plans.id"), nullable=False)
    trigger: Mapped[str] = mapped_column(String(32), nullable=False)
    initiator_user_id: Mapped[str] = mapped_column(String(128), default="system")
    initiator_role: Mapped[str] = mapped_column(String(64), default="system")
    domain_id: Mapped[str] = mapped_column(String(64), ForeignKey("domains.id"), nullable=False)
    batch_id: Mapped[str] = mapped_column(String(64), ForeignKey("batches.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    findings_refs: Mapped[list] = mapped_column(JSON, default=list)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    domain: Mapped["Domain"] = relationship(back_populates="runs")
    batch: Mapped["Batch"] = relationship(back_populates="run")


# ---------------------------------------------------------------------------
# Evidence Ledger
# ---------------------------------------------------------------------------


class EvidenceLedgerEntry(Base):
    __tablename__ = "evidence_ledger"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uid)
    run_id: Mapped[str] = mapped_column(String(64), ForeignKey("runs.id"), nullable=False)
    batch_id: Mapped[str] = mapped_column(String(64), ForeignKey("batches.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    content_ref: Mapped[str] = mapped_column(String(512), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(128), nullable=True)
    provenance_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_evidence_run_id", "run_id"),
        CheckConstraint(
            "type IN ('screenshot','raw_request','raw_response','log','alert','finding','decision')",
            name="ck_evidence_type",
        ),
    )