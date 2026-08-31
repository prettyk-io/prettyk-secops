# -*- coding: utf-8 -*-
"""PERS-B2: EvidenceRecord — метаданные evidence-артефактов.

Таблица evidence_records: один артефакт (видео, скриншот, HAR, лог, отчёт) —
одна строка. Связь с run_records через run_id.
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


class EvidenceRecord(Base):
    __tablename__ = "evidence_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: uuid.uuid4().hex[:12])
    run_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    artifact_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # video | screenshot | har | log | report_html | report_xml | report_json

    artifact_name: Mapped[str] = mapped_column(String(512), nullable=False)
    # Исходное имя файла (e.g. "screenshot_step3.png")

    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    # SHA-256 хеш содержимого (hex)

    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Размер в байтах

    content_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    # MIME-тип

    # Storage backend
    storage_backend: Mapped[str] = mapped_column(String(20), default="local")
    # local | minio

    local_path: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    # Путь на диске (Pure Box fallback)

    presigned_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # MinIO presigned URL (TTL = 1h, кешируется)

    presigned_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Когда истекает presigned URL

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "run_id": self.run_id,
            "artifact_type": self.artifact_type,
            "artifact_name": self.artifact_name,
            "sha256": self.sha256,
            "size_bytes": self.size_bytes,
            "content_type": self.content_type,
            "storage_backend": self.storage_backend,
            "local_path": self.local_path,
            "presigned_url": self.presigned_url,
            "uploaded_at": self.uploaded_at.isoformat() if self.uploaded_at else None,
        }