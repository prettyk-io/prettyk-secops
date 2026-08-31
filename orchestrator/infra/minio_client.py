# -*- coding: utf-8 -*-
"""PERS-D1: MinIO S3-совместимое хранилище для evidence-артефактов.

Pure Box (MINIO_ENDPOINT не задан): возвращает NotImplemented, вызывающий код
делает fallback на локальную файловую систему.
"""
from __future__ import annotations

import hashlib
import io
import logging
from datetime import timedelta
from typing import Optional

from utils.env_dual import pk_env

logger = logging.getLogger("orchestrator")

_MINIO_ENDPOINT = ""
_MINIO_ACCESS_KEY = ""
_MINIO_SECRET_KEY = ""
_MINIO_BUCKET = "prettyk-evidence"
_MINIO_SECURE = False
_client: Optional[object] = None


def _init_config():
    global _MINIO_ENDPOINT, _MINIO_ACCESS_KEY, _MINIO_SECRET_KEY, _MINIO_BUCKET, _MINIO_SECURE
    _MINIO_ENDPOINT = (pk_env("MINIO_ENDPOINT") or "").strip()
    _MINIO_ACCESS_KEY = (pk_env("MINIO_ACCESS_KEY") or "minioadmin").strip()
    _MINIO_SECRET_KEY = (pk_env("MINIO_SECRET_KEY") or "minioadmin").strip()
    _MINIO_BUCKET = (pk_env("MINIO_BUCKET") or "prettyk-evidence").strip()
    _MINIO_SECURE = (pk_env("MINIO_SECURE") or "0").strip() in ("1", "true", "yes")


_init_config()


def is_available() -> bool:
    """Можно ли использовать MinIO (настроен endpoint)."""
    return bool(_MINIO_ENDPOINT)


def _get_client():
    global _client
    if not _MINIO_ENDPOINT:
        return None
    if _client is None:
        try:
            from minio import Minio
            _client = Minio(
                _MINIO_ENDPOINT,
                access_key=_MINIO_ACCESS_KEY,
                secret_key=_MINIO_SECRET_KEY,
                secure=_MINIO_SECURE,
            )
            # Ensure bucket exists
            if not _client.bucket_exists(_MINIO_BUCKET):
                _client.make_bucket(_MINIO_BUCKET)
                logger.info("MinIO bucket created: %s", _MINIO_BUCKET)
        except Exception as exc:
            logger.warning("MinIO client init failed: %s", exc)
            _client = None
    return _client


def sha256_content(content: bytes) -> str:
    """SHA-256 hex digest от произвольных байт."""
    return hashlib.sha256(content).hexdigest()


def sha256_file(path: str) -> str:
    """SHA-256 hex digest от файла на диске."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def upload(artifact_id: str, content: bytes, content_type: str = "application/octet-stream") -> Optional[str]:
    """
    Загрузить артефакт в MinIO. Возвращает presigned URL (TTL 1 час).
    Если MinIO недоступен — возвращает None (fallback на filesystem).
    """
    client = _get_client()
    if client is None:
        return None
    try:
        data = io.BytesIO(content)
        client.put_object(
            _MINIO_BUCKET,
            artifact_id,
            data,
            length=len(content),
            content_type=content_type,
        )
        url = client.presigned_get_object(_MINIO_BUCKET, artifact_id, expires=timedelta(hours=1))
        return url
    except Exception as exc:
        logger.warning("MinIO upload failed for %s: %s", artifact_id, exc)
        return None


def download(artifact_id: str) -> Optional[bytes]:
    """Скачать артефакт из MinIO."""
    client = _get_client()
    if client is None:
        return None
    try:
        response = client.get_object(_MINIO_BUCKET, artifact_id)
        data = response.read()
        response.close()
        response.release_conn()
        return data
    except Exception as exc:
        logger.warning("MinIO download failed for %s: %s", artifact_id, exc)
        return None


def delete(artifact_id: str) -> bool:
    """Удалить артефакт из MinIO."""
    client = _get_client()
    if client is None:
        return False
    try:
        client.remove_object(_MINIO_BUCKET, artifact_id)
        return True
    except Exception as exc:
        logger.warning("MinIO delete failed for %s: %s", artifact_id, exc)
        return False


def presigned_url(artifact_id: str, expires_hours: int = 1) -> Optional[str]:
    """Сгенерировать presigned URL без загрузки (если артефакт уже в MinIO)."""
    client = _get_client()
    if client is None:
        return None
    try:
        return client.presigned_get_object(
            _MINIO_BUCKET, artifact_id, expires=timedelta(hours=expires_hours)
        )
    except Exception as exc:
        logger.warning("MinIO presigned_url failed for %s: %s", artifact_id, exc)
        return None


def health_check() -> dict:
    """Проверить доступность MinIO."""
    client = _get_client()
    if client is None:
        return {"available": False, "reason": "not_configured"}
    try:
        buckets = client.list_buckets()
        return {
            "available": True,
            "endpoint": _MINIO_ENDPOINT,
            "bucket": _MINIO_BUCKET,
            "buckets_count": len(buckets),
        }
    except Exception as exc:
        return {"available": False, "reason": str(exc)}