# -*- coding: utf-8 -*-
"""PERS-B1: create run_records table.

Revision ID: 001_run_records
Create Date: 2026-08-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001_run_records"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "run_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("check_id", sa.String(36), nullable=True, index=True),
        sa.Column("session_name", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued", index=True),
        sa.Column("profile", sa.String(50), nullable=True),
        sa.Column("target_url", sa.String(2048), nullable=True),
        sa.Column("findings_count", sa.Integer, nullable=True),
        sa.Column("duration_seconds", sa.Float, nullable=True),
        sa.Column("exit_code", sa.Integer, nullable=True),
        sa.Column("verdict", sa.String(20), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                   server_default=sa.text("(datetime('now'))")),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("wired_path", sa.String(1024), nullable=True),
        sa.Column("log_path", sa.String(1024), nullable=True),
        sa.Column("owner_user_id", sa.String(128), nullable=True),
    )
    op.create_index("ix_run_records_created_at", "run_records", ["created_at"])
    op.create_index("ix_run_records_status_created", "run_records", ["status", "created_at"])


def downgrade() -> None:
    op.drop_table("run_records")