# -*- coding: utf-8 -*-
"""PERS-B2: create evidence_records table.

Revision ID: 002_evidence_records
Create Date: 2026-08-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002_evidence_records"
down_revision: Union[str, None] = "001_run_records"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "evidence_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("run_id", sa.String(36), nullable=False, index=True),
        sa.Column("artifact_type", sa.String(50), nullable=False),
        sa.Column("artifact_name", sa.String(512), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=True),
        sa.Column("content_type", sa.String(128), nullable=True),
        sa.Column("storage_backend", sa.String(20), nullable=False, server_default="local"),
        sa.Column("local_path", sa.String(2048), nullable=True),
        sa.Column("presigned_url", sa.Text, nullable=True),
        sa.Column("presigned_expires_at", sa.DateTime, nullable=True),
        sa.Column("uploaded_at", sa.DateTime, nullable=False,
                   server_default=sa.text("(datetime('now'))")),
    )
    op.create_index("ix_evidence_run_type", "evidence_records", ["run_id", "artifact_type"])


def downgrade() -> None:
    op.drop_table("evidence_records")