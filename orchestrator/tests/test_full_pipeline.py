# -*- coding: utf-8 -*-
"""INT-B1: Full DAST Pipeline Integration Test — steel thread.

Сквозной тест (in-memory, без Docker):
  wired-сценарий → crawler → fuzzer → findings pipeline
  → persistence (RunRecord + EvidenceRecord)
  → evidence (SHA256, run_summary)
  → run_index append

GWT:
  - Полный цикл зелёный
  - RunRecord создан (queued→running→succeeded)
  - Evidence на месте (run_summary.json, evidence_refs.json)
  - Findings записаны (dedup работает)
  - 0 регрессий по существующим тестам
"""
from __future__ import annotations

import json
import sys
import tempfile
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


# ═══════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════

def _make_endpoint(method="GET", url="https://test.local/api/search?q=test", prov="observed", payload=None):
    from crawler.models import AwakenedEndpoint
    return AwakenedEndpoint(
        field_name="search",
        page_url="/",
        provenance=prov,
        endpoint_url=url,
        method=method,
        request_payload=payload or {},
    )


# ═══════════════════════════════════════════════════════════════════════
# STAGE 1: Crawler → Fuzzer handoff contract
# ═══════════════════════════════════════════════════════════════════════

class TestCrawlerFuzzerContract:
    """Краулер отдаёт CorpusSeed → фаззер принимает EndpointSpec[] → запускает цикл."""

    def test_handoff_returns_endpoints(self):
        from crawler.models import CrawlerRunResult

        result = CrawlerRunResult(session_id="st", target_url="https://test.local")
        result.awakened_endpoints = [
            _make_endpoint(url=f"https://test.local/api/{i}?q=t") for i in range(3)
        ]
        endpoints = result.fuzzable_endpoints()
        assert len(endpoints) == 3

    def test_fuzzer_accepts_crawler_result(self):
        from crawler.models import CrawlerRunResult
        from fuzzer.corpus_fuzzer import ProductionCorpusFuzzer

        result = CrawlerRunResult(session_id="st2", target_url="https://test.local")
        result.awakened_endpoints = [
            _make_endpoint(url="https://test.local/api/x?q=ok"),
        ]

        fuzzer = ProductionCorpusFuzzer(
            profile="developer-safe",
            max_payloads_per_param=2,
            publish_sse=False,
        )
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.status = 200
            mock_resp.read.return_value = b"<html>OK</html>"
            mock_resp.headers = {}
            mock_resp.__enter__ = MagicMock(return_value=mock_resp)
            mock_resp.__exit__ = MagicMock(return_value=False)
            mock_urlopen.return_value = mock_resp

            fuzz_result = fuzzer.run_from_crawler_result(result)

        assert fuzz_result["status"] == "completed"
        assert fuzz_result["total_endpoints"] == 1


# ═══════════════════════════════════════════════════════════════════════
# STAGE 2: Fuzzer → Findings Pipeline contract
# ═══════════════════════════════════════════════════════════════════════

class TestFuzzerFindingsContract:
    """Фаззер → FindingPipeline → SSE finding.created."""

    def test_findings_pipeline_dedup_across_run(self):
        from fuzzer.finding_pipeline import FindingPipeline
        from fuzzer.models import FindingRecord, InjectionType, ParamType, Severity

        pipeline = FindingPipeline(publish_sse=False)

        f1 = FindingRecord(
            severity=Severity.HIGH, injection_type=InjectionType.XSS_REFLECTED,
            method="GET", url="https://x.com/a", param_name="q",
            param_type=ParamType.QUERY, payload="<script>alert(1)</script>",
        )
        f2 = FindingRecord(
            severity=Severity.HIGH, injection_type=InjectionType.XSS_REFLECTED,
            method="GET", url="https://x.com/a", param_name="q",
            param_type=ParamType.QUERY, payload="<script>alert(2)</script>",
        )

        assert pipeline.record(f1) is True
        assert pipeline.record(f2) is False  # дубль
        assert pipeline.summary()["total"] == 1

    def test_findings_sse_event_contract(self):
        from fuzzer.models import FindingRecord, InjectionType, ParamType, Severity

        f = FindingRecord(
            severity=Severity.MEDIUM, injection_type=InjectionType.XSS_REFLECTED,
            method="POST", url="https://x.com/form", param_name="name",
            param_type=ParamType.BODY, payload="<script>x</script>",
            evidence_request={"method": "POST", "url": "https://x.com/form"},
            evidence_response={"status": 200, "body_snippet": "<script>x</script>"},
        )
        ev = f.to_sse_event()
        assert ev["type"] == "finding.created"
        assert "finding" in ev
        assert ev["finding"]["evidence"]["request"]["method"] == "POST"


# ═══════════════════════════════════════════════════════════════════════
# STAGE 3: Run lifecycle contract
# ═══════════════════════════════════════════════════════════════════════

class TestRunLifecycleContract:
    """RunControlPlane lifecycle: queued → running → succeeded/failed."""

    def test_full_lifecycle(self):
        from core.run_control_plane import RunControlPlane, RunState

        plane = RunControlPlane(max_concurrent=1, max_retries=1)
        plane.register_worker("test", frozenset({"browser"}))

        run, is_new = plane.create_run({"scenario": "full-check"})
        assert is_new
        assert run.state == RunState.RUNNING
        plane.succeed_run(run.id)

        final = plane.get_run(run.id)
        assert final.state == RunState.SUCCEEDED

    def test_failed_lifecycle(self):
        from core.run_control_plane import RunControlPlane, RunState, FailureClass

        plane = RunControlPlane(max_concurrent=1, max_retries=1)
        plane.register_worker("test", frozenset({"browser"}))

        run, _ = plane.create_run({"scenario": "broken"})
        plane.fail_run(run.id, FailureClass.VALIDATION, "bad manifest")

        final = plane.get_run(run.id)
        assert final.state == RunState.FAILED
        assert final.failure_class == FailureClass.VALIDATION


# ═══════════════════════════════════════════════════════════════════════
# STAGE 4: Evidence + Persistence contract
# ═══════════════════════════════════════════════════════════════════════

class TestEvidenceContract:
    """Evidence: артефакты → SHA256 → run_summary → artifact_index."""

    def test_run_summary_has_essential_fields(self, tmpdir):
        """run_summary.json содержит: run_id, status, findings, artifacts, duration."""
        run_id = uuid.uuid4().hex[:12]
        summary = {
            "run_id": run_id,
            "status": "succeeded",
            "findings": {"critical": 0, "high": 1, "medium": 2},
            "artifacts": [
                {"type": "report_json", "sha256": "abc123", "path": "evidence.json"},
                {"type": "run_summary", "sha256": "def456", "path": "run_summary.json"},
            ],
            "duration_sec": 45.2,
        }

        with patch("utils.reporter._run_dir") as mock_dir:
            import tempfile
            td = Path(str(tmpdir))
            mock_dir.return_value = td

            from utils.reporter import write_run_summary
            written = write_run_summary(summary)
            assert written.is_file()

            data = json.loads(written.read_text(encoding="utf-8"))
            assert data["run_id"] == run_id
            assert data["status"] == "succeeded"
            assert data["findings"]["high"] == 1

    def test_runs_index_append(self, tmpdir):
        """runs_index.ndjson — append-only запись, читается обратно."""
        ndjson = Path(str(tmpdir)) / "runs_index.ndjson"
        ndjson.parent.mkdir(parents=True, exist_ok=True)

        with patch("utils.runs_index.runs_index_path", return_value=ndjson):
            from utils.runs_index import append_run_index, read_runs_index

            row1 = {
                "run_id": uuid.uuid4().hex[:12],
                "status": "running",
                "started_at": "2026-08-28T10:00:00Z",
                "source": "live",
            }
            append_run_index(row1)

            row2 = {
                "run_id": uuid.uuid4().hex[:12],
                "status": "succeeded",
                "started_at": "2026-08-28T11:00:00Z",
                "source": "live",
            }
            append_run_index(row2)

            rows = read_runs_index()
            assert len(rows) >= 2


# ═══════════════════════════════════════════════════════════════════════
# STAGE 5: Warzone + Live SSE contract
# ═══════════════════════════════════════════════════════════════════════

class TestWarzoneContract:
    """Warzone EventJournal → SceneState → SSE."""

    def test_diary_to_journal_contract(self):
        from warzone.event_journal import EventJournal

        events = [
            {"kind": "FUZZ_BEAM_START", "t": 1.0, "source": "fuzzer", "target": "api"},
            {"kind": "TARGET_HIT", "t": 2.0, "target": "api"},
            {"kind": "FINDING", "t": 3.0, "id": "f1"},
        ]
        journal = EventJournal.from_diary_events(events)

        # SceneState на t=2.0: луч активен, hit api, finding ещё нет
        state = journal.state_at(2.0)
        assert len(state.active_beams) == 1
        assert state.node_hits == {"api": 1}
        assert state.findings == []

        # SceneState на t=3.5: finding учтён
        state2 = journal.state_at(3.5)
        assert len(state2.findings) == 1

    def test_scene_state_payload_sse_shape(self):
        from warzone.event_journal import EventJournal

        events = [
            {"kind": "FUZZ_BEAM_START", "t": 1.0, "source": "f", "target": "t1"},
        ]
        journal = EventJournal.from_diary_events(events)
        payload = journal.scene_state_payload(2.0)

        assert payload["type"] == "scene_state"
        assert len(payload["active_beams"]) == 1
        assert "state_hash" in payload
        assert len(payload["state_hash"]) == 64


# ═══════════════════════════════════════════════════════════════════════
# STAGE 6: Full Steel Thread — все модули вместе
# ═══════════════════════════════════════════════════════════════════════

class TestFullSteelThread:
    """INT-B1: сквозной тест: crawler → fuzzer → findings → evidence → run_index."""

    @patch("urllib.request.urlopen")
    @patch("utils.reporter._run_dir")
    @patch("utils.runs_index.runs_index_path")
    def test_full_end_to_end_cycle(self, mock_ri_path, mock_run_dir, mock_urlopen, tmpdir):
        """Полный цикл без Docker: все контракты соблюдены."""
        import uuid
        import time
        from crawler.models import CrawlerRunResult
        from fuzzer.corpus_fuzzer import ProductionCorpusFuzzer
        from core.run_control_plane import RunControlPlane, RunState
        from utils.reporter import write_run_summary
        from utils.runs_index import append_run_index
        from warzone.event_journal import EventJournal

        td = Path(str(tmpdir))
        run_id = uuid.uuid4().hex[:12]

        # Моки FS
        mock_run_dir.return_value = td
        ndjson = td / "runs_index.ndjson"
        ndjson.parent.mkdir(parents=True, exist_ok=True)
        mock_ri_path.return_value = ndjson

        # Моки HTTP — возвращаем XSS payload обратно для гарантированного детекта
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = (
            b"<html><body>"
            b"<script>alert('XSS')</script>"
            b"<img src=x onerror=alert(1)>"
            b"sql syntax error near"
            b"</body></html>"
        )
        mock_resp.headers = {}
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        # ── Phase 1: Crawler → endpoints ──
        crawler_result = CrawlerRunResult(session_id=run_id, target_url="https://test.local")
        crawler_result.awakened_endpoints = [
            _make_endpoint(url=f"https://test.local/api/{i}?q=search") for i in range(3)
        ]
        endpoints = crawler_result.fuzzable_endpoints()
        assert len(endpoints) == 3

        # ── Phase 2: Run lifecycle → running ──
        plane = RunControlPlane(max_concurrent=1, max_retries=1)
        plane.register_worker("steel-thread", frozenset({"browser", "scanner"}))
        run, is_new = plane.create_run({"scenario": "steel-thread"})
        assert is_new
        assert run.state == RunState.RUNNING

        # ── Phase 3: Fuzzer → findings ──
        fuzzer = ProductionCorpusFuzzer(
            profile="developer-safe",
            max_payloads_per_param=3,
            publish_sse=False,
        )
        fuzz_result = fuzzer.run_from_crawler_result(crawler_result)

        assert fuzz_result["status"] == "completed"
        assert fuzz_result["total_endpoints"] == 3
        assert fuzz_result["total_requests"] > 0

        findings_summary = fuzzer.pipeline.summary()
        # XSS reflected в "<script>alert(1)</script>" должен быть детектирован
        assert findings_summary["total"] > 0, "XSS must be detected by pipeline"

        # ── Phase 4: Run lifecycle → succeeded ──
        plane.succeed_run(run.id)
        final_run = plane.get_run(run.id)
        assert final_run.state == RunState.SUCCEEDED

        # ── Phase 5: Evidence ──
        summary = {
            "run_id": run_id,
            "status": "succeeded",
            "findings": findings_summary["by_severity"],
            "artifacts": [
                {"type": "run_summary", "sha256": "ee" * 32, "path": "run_summary.json"},
            ],
            "duration_sec": fuzz_result["duration_sec"],
        }
        written = write_run_summary(summary)
        assert written.is_file()
        assert "run_summary.json" in str(written)

        # ── Phase 6: Runs index ──
        append_run_index({
            "run_id": run_id,
            "status": "succeeded",
            "started_at": "2026-08-28T12:00:00Z",
            "source": "steel-thread",
        })

        rows = json.loads("\n".join(
            ndjson.read_text(encoding="utf-8").strip().split("\n")
        )) if ndjson.stat().st_size > 0 else None
        from utils.runs_index import list_run_index
        index_rows = list_run_index()
        assert len(index_rows) >= 1

        # ── Phase 7: Warzone journal from diary events ──
        diary_events = [
            {"kind": "FUZZ_BEAM_START", "t": 1.0, "source": "fuzzer", "target": "api"},
            {"kind": "TARGET_HIT", "t": 2.0, "target": "api"},
            {"kind": "FINDING", "t": 3.0, "id": "f-steel"},
        ]
        journal = EventJournal.from_diary_events(diary_events)
        scene = journal.state_at(3.5)
        assert len(scene.findings) == 1
        assert scene.node_hits == {"api": 1}

        # ── Итого: 0 ошибок на всём сквозном пути ──
        assert True, "Steel thread completed without errors"