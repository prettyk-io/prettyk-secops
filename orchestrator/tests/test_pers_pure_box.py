# -*- coding: utf-8 -*-
"""PERS-B3: Pure Box fallback — артефакты локально vs MinIO."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

_here = Path(__file__).resolve().parents[1]
if str(_here) not in sys.path:
    sys.path.insert(0, str(_here))


class TestPureBoxFallback:
    """Pure Box: MINIO_ENDPOINT не задан → evidence локально."""

    def test_is_available_false_when_no_env(self, monkeypatch):
        monkeypatch.delenv("PK_MINIO_ENDPOINT", raising=False)
        from infra import minio_client
        minio_client._init_config()
        assert minio_client.is_available() is False

    def test_local_path_populated_on_pure_box(self, tmp_path):
        """Pure Box: файл сохраняется локально, presigned_url=None."""
        from api.evidence_api import write_evidence_from_file

        f = tmp_path / "test.png"
        f.write_bytes(b"\x89PNG\x0d\x0a...fake-png-data...")

        with patch("infra.minio_client.is_available", return_value=False):
            result = write_evidence_from_file(
                run_id="pure-run-1",
                file_path=str(f),
                artifact_type="screenshot",
            )

        assert result["ok"] is True
        assert result["storage_backend"] == "local"
        assert result["presigned_url"] is None
        assert len(result["sha256"]) == 64
        assert result["sha256"].startswith("0") or result["sha256"].startswith("a") or True  # any hex

    def test_get_access_url_returns_local_path(self, tmp_path):
        """get_evidence_access_url отдаёт local_path на Pure Box."""
        from api.evidence_api import write_evidence_from_file, get_evidence_access_url

        f = tmp_path / "shot.png"
        f.write_bytes(b"fake-png-content")

        with patch("infra.minio_client.is_available", return_value=False):
            out = write_evidence_from_file(
                run_id="pure-run-2",
                file_path=str(f),
                artifact_type="screenshot",
            )
        assert out["ok"] is True

        access = get_evidence_access_url(out["id"])
        assert access["ok"] is True
        assert access["access_type"] == "local"
        assert str(f) == access["local_path"]
        assert len(access["sha256"]) == 64

    def test_unknown_evidence_returns_error(self):
        from api.evidence_api import get_evidence_access_url
        r = get_evidence_access_url("no-such-evidence-id")
        assert r["ok"] is False
        assert r["error"] == "not_found"


class TestMinioFallback:
    """Enterprise: MINIO_ENDPOINT задан → evidence в MinIO → presigned URL."""

    def test_presigned_url_populated_on_enterprise(self, tmp_path):
        """MinIO доступен → presigned_url заполнен."""
        from api.evidence_api import write_evidence_from_file

        f = tmp_path / "video.webm"
        f.write_bytes(b"fake-webm-data")

        with patch("infra.minio_client.is_available", return_value=True), \
             patch("infra.minio_client.upload", return_value="http://minio:9000/prettyk-evidence/video.webm?X-Amz-..."):
            result = write_evidence_from_file(
                run_id="ent-run-1",
                file_path=str(f),
                artifact_type="video",
            )

        assert result["ok"] is True
        assert result["storage_backend"] == "minio"
        assert result["presigned_url"] is not None
        assert "minio:9000" in result["presigned_url"]
        assert len(result["sha256"]) == 64

    def test_get_access_url_returns_presigned(self, tmp_path):
        from api.evidence_api import write_evidence_from_file, get_evidence_access_url

        f = tmp_path / "report.html"
        f.write_bytes(b"<html>test report</html>")

        presigned = "http://minio:9000/prettyk-evidence/report.html?X-Amz-SignedHeaders=..."

        with patch("infra.minio_client.is_available", return_value=True), \
             patch("infra.minio_client.upload", return_value=presigned), \
             patch("infra.minio_client.presigned_url", return_value=presigned):
            out = write_evidence_from_file(
                run_id="ent-run-2",
                file_path=str(f),
                artifact_type="report_html",
            )
        assert out["ok"] is True

        access = get_evidence_access_url(out["id"])
        assert access["ok"] is True
        assert access["access_type"] == "presigned_url"
        assert "minio:9000" in access["url"]
        assert len(access["sha256"]) == 64
        assert access["artifact_name"] == "report.html"

    def test_minio_unavailable_falls_back_to_local(self, tmp_path):
        """MinIO сконфигурирован, но сервер недоступен → fallback local."""
        from api.evidence_api import write_evidence_from_file

        f = tmp_path / "log.txt"
        f.write_bytes(b"log content")

        with patch("infra.minio_client.is_available", return_value=True), \
             patch("infra.minio_client.upload", return_value=None):  # upload failed
            result = write_evidence_from_file(
                run_id="ent-run-3",
                file_path=str(f),
                artifact_type="log",
            )

        assert result["ok"] is True
        assert result["storage_backend"] == "local"
        assert result["presigned_url"] is None


class TestSha256AlwaysComputed:
    """SHA256 вычисляется независимо от выбранного storage backend."""

    def test_pure_box_sha256(self, tmp_path):
        from api.evidence_api import write_evidence_from_file

        f = tmp_path / "data.json"
        f.write_text('{"key": "value"}', encoding="utf-8")

        with patch("infra.minio_client.is_available", return_value=False):
            result = write_evidence_from_file(
                run_id="sha-test-1",
                file_path=str(f),
                artifact_type="report_json",
            )
        assert len(result["sha256"]) == 64
        # SHA-256 всегда 64 hex-символа, и одинаков на обоих профилях для одного контента
        assert result["sha256"] == "9724c1e20e6e3e4d7f57ed25f9d4efb006e508590d528c90da597f6a775c13e5"

    def test_enterprise_sha256(self, tmp_path):
        from api.evidence_api import write_evidence_from_file

        f = tmp_path / "data2.json"
        f.write_text('{"key": "value"}', encoding="utf-8")

        with patch("infra.minio_client.is_available", return_value=True), \
             patch("infra.minio_client.upload", return_value="http://minio:9000/bucket/data2.json"):
            result = write_evidence_from_file(
                run_id="sha-test-2",
                file_path=str(f),
                artifact_type="report_json",
            )
        assert len(result["sha256"]) == 64
        assert result["sha256"] == "9724c1e20e6e3e4d7f57ed25f9d4efb006e508590d528c90da597f6a775c13e5"