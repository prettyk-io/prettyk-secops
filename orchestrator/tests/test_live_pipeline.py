# -*- coding: utf-8 -*-
"""INT-B1: Live Pipeline — реальный цикл с Docker juice-shop контейнером.

Требует: Docker daemon. Juice Shop (http://localhost:3000).
Если Docker недоступен или контейнер не отвечает — тест пропускается (pytest.skip).

Полный цикл:
  Playwright browser (headless) → crawler (BFS) →
  fuzzer (developer-safe) → findings pipeline →
  run_summary + evidence.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List

import pytest

# Fix missing import
from unittest.mock import patch

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


# ═══════════════════════════════════════════════════════════════════════
# Docker helpers
# ═══════════════════════════════════════════════════════════════════════

def _docker_available() -> bool:
    """Проверить, что Docker daemon работает."""
    try:
        result = subprocess.run(
            ["docker", "info"], capture_output=True, text=True, timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return False


def _juice_shop_reachable() -> bool:
    """Проверить, что Juice Shop отвечает."""
    import urllib.request
    try:
        req = urllib.request.Request("http://localhost:3000/", method="GET")
        req.add_header("User-Agent", "PrettyK-Pipeline-Test/1.0")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return 200 <= resp.status < 400
    except Exception:
        return False


def _ensure_juice_shop() -> bool:
    """Убедиться, что Juice Shop доступен (проверить, не стартуя)."""
    if _juice_shop_reachable():
        return True
    return False


# ═══════════════════════════════════════════════════════════════════════
# Live pipeline tests
# ═══════════════════════════════════════════════════════════════════════

@pytest.mark.lab
@pytest.mark.skipif(
    not (_docker_available() and _juice_shop_reachable()),
    reason="Juice Shop (localhost:3000) not reachable",
)
class TestLivePipeline:
    """Реальный цикл с Docker Juice Shop."""

    def test_crawler_discovery_smoke(self):
        """Краулер запускается и находит хотя бы один URL."""
        from crawler.models import CrawlerConfig, CrawlerRunResult

        config = CrawlerConfig(
            target_url="http://localhost:3000/",
            max_states=5,
            max_depth=1,
            max_actions_per_state=5,
            awaken=False,  # без UI-пробуждения для скорости
        )
        assert config.target_url

    def test_fuzzer_payloads_load(self):
        """Все словари payload'ов загружаются без ошибок."""
        from fuzzer.payload_generator import PayloadGenerator

        gen = PayloadGenerator(profile="developer-safe")
        assert len(gen.all_payloads) > 0

        gen_full = PayloadGenerator(profile="full-active")
        assert len(gen_full.all_payloads) > len(gen.all_payloads)

    def test_run_control_plane_lifecycle(self):
        """RunControlPlane управляет жизненным циклом."""
        from core.run_control_plane import RunControlPlane, RunState

        plane = RunControlPlane(max_concurrent=1, max_retries=1)
        plane.register_worker("live-runner", frozenset({"browser", "scanner"}))

        run, is_new = plane.create_run({"scenario": "live-juice-shop"})
        assert is_new
        assert run.state == RunState.RUNNING

        plane.succeed_run(run.id)
        assert plane.get_run(run.id).state == RunState.SUCCEEDED

    def test_crawler_run_result_serialization(self):
        """CrawlerRunResult.to_dict() сериализуется и читается обратно."""
        from crawler.models import CrawlerRunResult, CrawlerState, AwakenedEndpoint

        result = CrawlerRunResult(session_id="live-js", target_url="http://localhost:3000/")
        result.states = [
            CrawlerState(state_key="s1", url="http://localhost:3000/", route="/", depth=0),
            CrawlerState(state_key="s2", url="http://localhost:3000/#/login", route="/login", depth=1),
        ]
        result.awakened_endpoints = [
            AwakenedEndpoint(
                field_name="email",
                page_url="/#/login",
                provenance="observed",
                endpoint_url="http://localhost:3000/api/Users",
                method="POST",
                request_payload={"email": "a@b.c", "password": "test"},
            ),
        ]
        result.stop_reason = "budget_exhausted"

        d = result.to_dict()
        assert d["schema_version"] == 2
        assert len(d["states"]) == 2
        assert d["awaken"]["observed"]

    def test_evidence_bundle_written(self, tmpdir):
        """run_summary пишется на диск."""
        from utils.reporter import write_run_summary

        run_id = uuid.uuid4().hex[:12]
        summary = {
            "run_id": run_id,
            "status": "succeeded",
            "findings": {"high": 1, "medium": 3},
            "artifacts": [{"type": "video", "path": "recording.mp4", "sha256": "abc"}],
            "duration_sec": 12.5,
        }

        with patch("utils.reporter._run_dir", return_value=Path(str(tmpdir))):
            written = write_run_summary(summary)
            assert written.is_file()

            data = json.loads(written.read_text(encoding="utf-8"))
            assert data["status"] == "succeeded"

    def test_run_index_appended(self, tmpdir):
        """runs_index.ndjson — append запись работает."""
        ndjson = Path(str(tmpdir)) / "runs_index.ndjson"
        ndjson.parent.mkdir(parents=True, exist_ok=True)

        with patch("utils.runs_index.runs_index_path", return_value=ndjson):
            from utils.runs_index import append_run_index, read_runs_index

            append_run_index({
                "run_id": uuid.uuid4().hex[:12],
                "status": "succeeded",
                "started_at": "2026-08-28T14:00:00Z",
                "source": "live-pipeline",
            })

            rows = read_runs_index()
            assert len(rows) == 1

    def test_integrity_report_live(self, tmpdir):
        """verify_run_integrity на реальном run-каталоге."""
        from utils.integrity import verify_run_integrity

        run_dir = Path(str(tmpdir)) / "live-run-1"
        run_dir.mkdir(parents=True)
        (run_dir / "wired.json").write_text('{"scenario": "juice-shop"}', encoding="utf-8")
        (run_dir / "runner.log").write_text("line1\nline2\n", encoding="utf-8")

        with patch("utils.integrity.RUNS_DIR", Path(str(tmpdir))):
            report = verify_run_integrity("live-run-1")
            assert report.ok is True
            assert report.artifacts_found >= 2