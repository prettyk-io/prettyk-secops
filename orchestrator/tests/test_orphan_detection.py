# -*- coding: utf-8 -*-
"""INT-B2 / PERS-B7: Orphan detection tests — целостность артефактов."""
from __future__ import annotations

import json
import sys
import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

from utils.integrity import (
    CrawlerSessionState,
    IntegrityReport,
    scan_orphan_files,
    verify_evidence_refs,
    verify_run_integrity,
    save_crawler_session,
    load_crawler_session,
    list_crawler_sessions,
    delete_crawler_session,
)


# ═══════════════════════════════════════════════════════════════════════
# PERS-B7: Run Integrity
# ═══════════════════════════════════════════════════════════════════════

class TestVerifyRunIntegrity:
    def test_missing_run_dir_reported(self, tmpdir):
        """Run-директория не существует → ok=False, issues содержат missing_run_dir."""
        with patch("utils.integrity.RUNS_DIR", Path(str(tmpdir))):
            report = verify_run_integrity("ghost-run")
            assert report.ok is False
            assert any(i["type"] == "missing_run_dir" for i in report.issues)

    def test_valid_run_with_artifacts(self, tmpdir):
        """Run-директория с ключевыми артефактами → ok=True."""
        run_dir = Path(str(tmpdir)) / "healthy-run"
        run_dir.mkdir(parents=True)
        (run_dir / "wired.json").write_text('{"test": true}', encoding="utf-8")
        (run_dir / "runner.log").write_text("log line 1\nlog line 2\n", encoding="utf-8")
        (run_dir / "run_summary.json").write_text('{"status": "ok"}', encoding="utf-8")

        with patch("utils.integrity.RUNS_DIR", Path(str(tmpdir))):
            report = verify_run_integrity("healthy-run")
            assert report.ok is True

    def test_zero_size_artifact_reported(self, tmpdir):
        """Пустой артефакт → issue zero_size_artifact."""
        run_dir = Path(str(tmpdir)) / "bad-run"
        run_dir.mkdir(parents=True)
        (run_dir / "wired.json").write_text("", encoding="utf-8")  # zero size
        (run_dir / "runner.log").write_text("ok", encoding="utf-8")
        (run_dir / "run_summary.json").write_text("{}", encoding="utf-8")

        with patch("utils.integrity.RUNS_DIR", Path(str(tmpdir))):
            report = verify_run_integrity("bad-run")
            assert any(i["type"] == "zero_size_artifact" for i in report.issues)

    def test_missing_artifact_reported(self, tmpdir):
        """wired.json отсутствует → missing_artifact issue."""
        run_dir = Path(str(tmpdir)) / "incomplete-run"
        run_dir.mkdir(parents=True)
        # нет wired.json
        (run_dir / "runner.log").write_text("ok", encoding="utf-8")
        (run_dir / "run_summary.json").write_text("{}", encoding="utf-8")

        with patch("utils.integrity.RUNS_DIR", Path(str(tmpdir))):
            report = verify_run_integrity("incomplete-run")
            assert report.artifacts_missing >= 1
            assert any(i["type"] == "missing_artifact" for i in report.issues)

    def test_artifact_count_tracking(self, tmpdir):
        """report.artifacts_found считает реальные файлы."""
        run_dir = Path(str(tmpdir)) / "count-run"
        run_dir.mkdir(parents=True)
        (run_dir / "wired.json").write_text("{}", encoding="utf-8")
        (run_dir / "runner.log").write_text("ok", encoding="utf-8")
        (run_dir / "run_summary.json").write_text("{}", encoding="utf-8")
        (run_dir / "extra.txt").write_text("bonus", encoding="utf-8")

        with patch("utils.integrity.RUNS_DIR", Path(str(tmpdir))):
            report = verify_run_integrity("count-run")
            assert report.artifacts_found == 4


# ═══════════════════════════════════════════════════════════════════════
# PERS-B7: Evidence Ref Integrity
# ═══════════════════════════════════════════════════════════════════════

class TestVerifyEvidenceRefs:
    def test_missing_run_dir(self, tmpdir):
        with patch("utils.integrity.RUNS_DIR", Path(str(tmpdir))):
            report = verify_evidence_refs("no-dir")
            assert report.ok is False

    def test_orphan_file_detected(self, tmpdir):
        """Файл на диске, но не в evidence_refs.json → orphan_file."""
        run_dir = Path(str(tmpdir)) / "orphan-test"
        run_dir.mkdir(parents=True)
        (run_dir / "orphan_file.txt").write_text("orphan", encoding="utf-8")
        (run_dir / "evidence_refs.json").write_text('{"artifacts": []}', encoding="utf-8")

        with patch("utils.integrity.RUNS_DIR", Path(str(tmpdir))):
            report = verify_evidence_refs("orphan-test")
            assert report.orphan_files >= 1
            assert any(i["type"] == "orphan_file" for i in report.issues)

    def test_evidence_missing_file(self, tmpdir):
        """EvidenceRecord ссылается на файл, которого нет на диске."""
        run_dir = Path(str(tmpdir)) / "missing-ev"
        run_dir.mkdir(parents=True)
        refs = {
            "artifacts": [
                {"path": "ghost.png", "sha256": "abc123"},
            ]
        }
        (run_dir / "evidence_refs.json").write_text(json.dumps(refs), encoding="utf-8")

        with patch("utils.integrity.RUNS_DIR", Path(str(tmpdir))):
            report = verify_evidence_refs("missing-ev")
            assert any(i["type"] == "evidence_missing_file" for i in report.issues)

    def test_sha_mismatch_detected(self, tmpdir):
        """SHA256 файла не совпадает с EvidenceRecord."""
        run_dir = Path(str(tmpdir)) / "sha-mismatch"
        run_dir.mkdir(parents=True)
        (run_dir / "data.json").write_text("actual content", encoding="utf-8")
        refs = {
            "artifacts": [
                {"path": "data.json", "sha256": "wrong_sha"},
            ]
        }
        (run_dir / "evidence_refs.json").write_text(json.dumps(refs), encoding="utf-8")

        with patch("utils.integrity.RUNS_DIR", Path(str(tmpdir))):
            report = verify_evidence_refs("sha-mismatch")
            assert any(i["type"] == "evidence_sha_mismatch" for i in report.issues)

    def test_clean_run_no_issues(self, tmpdir):
        """Все артефакты совпадают → ok=True."""
        import hashlib

        run_dir = Path(str(tmpdir)) / "clean-run"
        run_dir.mkdir(parents=True)

        content = b"clean content"
        sha = hashlib.sha256(content).hexdigest()
        (run_dir / "artifact.json").write_bytes(content)

        refs = {
            "artifacts": [
                {"path": "artifact.json", "sha256": sha},
            ]
        }
        (run_dir / "evidence_refs.json").write_text(json.dumps(refs), encoding="utf-8")

        with patch("utils.integrity.RUNS_DIR", Path(str(tmpdir))):
            report = verify_evidence_refs("clean-run")
            assert report.ok is True


# ═══════════════════════════════════════════════════════════════════════
# PERS-B7: Orphan scan
# ═══════════════════════════════════════════════════════════════════════

class TestScanOrphanFiles:
    def test_orphan_dirs_without_index(self, tmpdir):
        """run_dir существует, run_id не в runs_index → orphan."""
        runs_dir = Path(str(tmpdir)) / "runs"
        runs_dir.mkdir(parents=True)

        orphan_run = runs_dir / "orphan-run"
        orphan_run.mkdir(parents=True)
        (orphan_run / "wired.json").write_text("{}", encoding="utf-8")

        with patch("utils.integrity.RUNS_DIR", runs_dir):
            with patch("utils.integrity._known_run_ids", return_value={"known-run"}):
                orphans = scan_orphan_files()
                assert len(orphans) == 1
                assert orphans[0]["run_id"] == "orphan-run"


# ═══════════════════════════════════════════════════════════════════════
# PERS-B8: Session Recovery
# ═══════════════════════════════════════════════════════════════════════

class TestSessionRecovery:
    def test_save_and_load_session(self, tmpdir):
        """Сохранить → загрузить: поля совпадают."""
        with patch("utils.integrity._CRAWLER_SESSION_DIR", Path(str(tmpdir))):
            state = CrawlerSessionState(
                session_id="crawl-abc123",
                target_url="https://juice-shop.local",
                visited_urls=["https://juice-shop.local/", "https://juice-shop.local/login"],
                state_count=5,
                transition_count=12,
                last_state_key="state-0005",
                awakened_count=3,
                stop_reason="budget_exhausted",
                persona_name="anonymous",
            )
            saved = save_crawler_session(state)
            assert saved.is_file()

            loaded = load_crawler_session("crawl-abc123")
            assert loaded is not None
            assert loaded.session_id == state.session_id
            assert loaded.target_url == state.target_url
            assert loaded.state_count == 5
            assert loaded.stop_reason == "budget_exhausted"

    def test_load_nonexistent_session(self, tmpdir):
        with patch("utils.integrity._CRAWLER_SESSION_DIR", Path(str(tmpdir))):
            assert load_crawler_session("no-such-session") is None

    def test_list_sessions(self, tmpdir):
        with patch("utils.integrity._CRAWLER_SESSION_DIR", Path(str(tmpdir))):
            save_crawler_session(CrawlerSessionState(
                session_id="s1", target_url="https://a.com",
            ))
            save_crawler_session(CrawlerSessionState(
                session_id="s2", target_url="https://b.com",
            ))

            sessions = list_crawler_sessions()
            assert len(sessions) == 2
            urls = {s.target_url for s in sessions}
            assert "https://a.com" in urls
            assert "https://b.com" in urls

    def test_delete_session(self, tmpdir):
        with patch("utils.integrity._CRAWLER_SESSION_DIR", Path(str(tmpdir))):
            save_crawler_session(CrawlerSessionState(
                session_id="to-delete", target_url="https://x.com",
            ))
            assert delete_crawler_session("to-delete") is True
            assert load_crawler_session("to-delete") is None
            assert delete_crawler_session("to-delete") is False  # already gone

    def test_session_survives_reload(self, tmpdir):
        """После рестарта процесса — сессия читается с диска."""
        with patch("utils.integrity._CRAWLER_SESSION_DIR", Path(str(tmpdir))):
            restore_state = CrawlerSessionState(
                session_id="restore-me",
                target_url="https://restored.local",
                state_count=15,
                transition_count=40,
                visited_urls=["/a", "/b", "/c"],
                stop_reason="queue_empty",
            )
            save_crawler_session(restore_state)

        # Симуляция рестарта: повторная загрузка
        with patch("utils.integrity._CRAWLER_SESSION_DIR", Path(str(tmpdir))):
            recovered = load_crawler_session("restore-me")
            assert recovered is not None
            assert recovered.state_count == 15
            assert recovered.stop_reason == "queue_empty"
            assert len(recovered.visited_urls) == 3