# -*- coding: utf-8 -*-
"""PERS-B1: RunRecord — журнал запусков (SQLAlchemy ORM).

Таблица run_records: каждый запуск orchestartor'а — одна строка.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Column, DateTime, Float, Integer, String, Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class RunRecord(Base):
    __tablename__ = "run_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: uuid.uuid4().hex[:12])
    check_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    session_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Жизненный цикл
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    #  queued | running | succeeded | failed | cancelled

    # Метрики
    profile: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    findings_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exit_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Вердикт
    verdict: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    #  pass | fail | error | gate_fail

    # Таймстемпы
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Мета
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    wired_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    log_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    owner_user_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "check_id": self.check_id,
            "session_name": self.session_name,
            "status": self.status,
            "profile": self.profile,
            "target_url": self.target_url,
            "findings_count": self.findings_count,
            "duration_seconds": self.duration_seconds,
            "exit_code": self.exit_code,
            "verdict": self.verdict,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "error_message": self.error_message,
            "wired_path": self.wired_path,
            "log_path": self.log_path,
            "owner_user_id": self.owner_user_id,
        }