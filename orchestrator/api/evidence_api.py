# -*- coding: utf-8 -*-
"""PERS-B2: API для evidence-артефактов.

Используется reporter.py для записи, фронтендом для чтения.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from models.db import create_all, get_session
from models.evidence_record import EvidenceRecord


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _ensure_tables():
    try:
        create_all()
    except Exception:
        pass


def write_evidence(
    *,
    run_id: str,
    artifact_type: str,
    artifact_name: str,
    sha256: str,
    size_bytes: int | None = None,
    content_type: str | None = None,
    local_path: str | None = None,
    presigned_url: str | None = None,
) -> str:
    """Записать evidence-запись в БД. Возвращает id."""
    _ensure_tables()
    s = get_session()
    try:
        rec = EvidenceRecord(
            run_id=run_id,
            artifact_type=artifact_type,
            artifact_name=artifact_name,
            sha256=sha256,
            size_bytes=size_bytes,
            content_type=content_type,
            storage_backend="minio" if presigned_url else "local",
            local_path=local_path,
            presigned_url=presigned_url,
            presigned_expires_at=(
                _utcnow() + __import__("datetime").timedelta(hours=1)
                if presigned_url else None
            ),
        )
        s.add(rec)
        s.commit()
        return rec.id
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def list_evidence_for_run(run_id: str) -> list[dict]:
    """Все evidence-записи для прогона."""
    _ensure_tables()
    s = get_session()
    try:
        rows = (
            s.query(EvidenceRecord)
            .filter(EvidenceRecord.run_id == run_id)
            .order_by(EvidenceRecord.uploaded_at)
            .all()
        )
        return [r.to_dict() for r in rows]
    finally:
        s.close()


def get_evidence(evidence_id: str) -> dict | None:
    """Одна evidence-запись по id."""
    _ensure_tables()
    s = get_session()
    try:
        r = s.query(EvidenceRecord).filter(EvidenceRecord.id == evidence_id).first()
        return r.to_dict() if r else None
    finally:
        s.close()


def write_evidence_from_file(
    *,
    run_id: str,
    file_path: str,
    artifact_type: str,
    artifact_name: str = "",
) -> dict:
    """
    Прочитать файл → SHA256 → MinIO (если доступен) или local →
    записать EvidenceRecord.
    """
    from infra.minio_client import is_available, sha256_file, upload

    path = str(file_path)
    if not os.path.isfile(path):
        return {"ok": False, "error": "file_not_found", "path": path}

    name = artifact_name or os.path.basename(path)
    size = os.path.getsize(path)
    sha = sha256_file(path)

    presigned = None
    storage = "local"
    local_path = path

    if is_available():
        with open(path, "rb") as f:
            content = f.read()
        content_type = _mime_from_extension(name)
        presigned = upload(name, content, content_type=content_type)
        if presigned:
            storage = "minio"

    try:
        eid = write_evidence(
            run_id=run_id,
            artifact_type=artifact_type,
            artifact_name=name,
            sha256=sha,
            size_bytes=size,
            content_type=_mime_from_extension(name),
            local_path=local_path,
            presigned_url=presigned,
        )
        return {
            "ok": True,
            "id": eid,
            "sha256": sha,
            "storage_backend": storage,
            "presigned_url": presigned,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "sha256": sha}


def _mime_from_extension(name: str) -> str:
    ext = os.path.splitext(name)[1].lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webm": "video/webm",
        ".mp4": "video/mp4",
        ".har": "application/json",
        ".html": "text/html",
        ".xml": "application/xml",
        ".json": "application/json",
        ".log": "text/plain",
        ".txt": "text/plain",
    }.get(ext, "application/octet-stream")


def get_evidence_access_url(evidence_id: str) -> dict:
    """
    Получить URL для доступа к артефакту (presigned или local).

    Pure Box (storage_backend='local'): возвращает file:// путь + SHA256.
    Enterprise (storage_backend='minio'): возвращает presigned URL + SHA256.
    Пресigned URL с истекшим TTL — перегенерируется свежим вызовом presigned_url().
    """
    rec = get_evidence(evidence_id)
    if rec is None:
        return {"ok": False, "error": "not_found"}

    if rec.get("storage_backend") == "minio" and rec.get("presigned_url"):
        # Проверить свежесть presigned URL
        from infra.minio_client import presigned_url as gen_presigned
        fresh = gen_presigned(rec["artifact_name"], expires_hours=1)
        return {
            "ok": True,
            "access_type": "presigned_url",
            "url": fresh or rec["presigned_url"],
            "sha256": rec["sha256"],
            "content_type": rec.get("content_type", "application/octet-stream"),
            "artifact_name": rec["artifact_name"],
        }
    if rec.get("local_path"):
        import os as _os
        local = rec["local_path"]
        if not _os.path.isfile(local):
            return {"ok": False, "error": "local_file_missing", "path": local}
        return {
            "ok": True,
            "access_type": "local",
            "local_path": local,
            "sha256": rec["sha256"],
            "content_type": rec.get("content_type", "application/octet-stream"),
            "artifact_name": rec["artifact_name"],
        }
    return {"ok": False, "error": "no_access_path", "backend": rec.get("storage_backend")}