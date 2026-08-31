# -*- coding: utf-8 -*-
"""CF-B3: интеграционный тест — краулер → фаззер → finding."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, patch

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

from crawler.models import (
    AwakenedEndpoint,
    CrawlerConfig,
    CrawlerRunResult,
    CrawlerState,
)
from fuzzer.models import EndpointSpec, FuzzParam, ParamType
from fuzzer.corpus_fuzzer import ProductionCorpusFuzzer, _awakened_to_endpoint_spec


def _make_crawler_result(endpoints: list[AwakenedEndpoint]) -> CrawlerRunResult:
    result = CrawlerRunResult(session_id="test", target_url="https://test.local")
    result.awakened_endpoints = endpoints
    return result


def _make_endpoint(method="GET", url="https://test.local/api", name="search", payload=None):
    return AwakenedEndpoint(
        field_name=name,
        page_url="/",
        provenance="observed",
        endpoint_url=url,
        method=method,
        request_payload=payload or {},
    )


class TestAwakenedToEndpointSpec:
    def test_basic_conversion(self):
        ep = _make_endpoint(url="https://test.local/api?q=test&page=1")
        spec = _awakened_to_endpoint_spec(ep)
        assert spec.method == "GET"
        assert spec.url == "https://test.local/api?q=test&page=1"
        assert len(spec.params) == 2  # q + page

    def test_post_with_body(self):
        ep = _make_endpoint(
            method="POST",
            url="https://test.local/api/submit",
            payload={"name": "user", "email": "user@test.com"},
        )
        spec = _awakened_to_endpoint_spec(ep)
        assert spec.method == "POST"
        assert len(spec.params) == 2  # name + email
        assert all(p.param_type == ParamType.BODY for p in spec.params)

    def test_json_content_type_for_dict_values(self):
        ep = _make_endpoint(
            method="POST",
            url="https://test.local/api/data",
            payload={"nested": {"key": "value"}},
        )
        spec = _awakened_to_endpoint_spec(ep)
        assert "json" in spec.content_type


class TestCrawlerToFuzzerIntegration:
    @patch("urllib.request.urlopen")
    def test_crawler_result_to_fuzzer_run(self, mock_urlopen):
        """CrawlerRunResult → run_from_crawler_result() → findings."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b"<html>OK</html>"
        mock_resp.headers = {}
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        endpoints = [
            _make_endpoint(url=f"https://test.local/api/{i}?q=test") for i in range(5)
        ]
        crawler_result = _make_crawler_result(endpoints)

        fuzzer = ProductionCorpusFuzzer(
            profile="developer-safe",
            max_payloads_per_param=3,
            publish_sse=False,
        )
        result = fuzzer.run_from_crawler_result(crawler_result)

        assert result["status"] == "completed"
        assert result["total_endpoints"] == 5
        assert result["total_requests"] > 0

    def test_empty_crawler_result_skipped(self):
        crawler_result = _make_crawler_result([])
        fuzzer = ProductionCorpusFuzzer(profile="developer-safe", publish_sse=False)
        result = fuzzer.run_from_crawler_result(crawler_result)
        assert result["total_endpoints"] == 0
        assert result["findings"] == 0

    @patch("urllib.request.urlopen")
    def test_synthetic_not_fuzzed(self, mock_urlopen):
        """synthetic_candidate не должен попадать в фаззер."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b"<html>OK</html>"
        mock_resp.headers = {}
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        synthetic = AwakenedEndpoint(
            field_name="hidden",
            page_url="/",
            provenance="synthetic_candidate",
            endpoint_url="https://test.local/secret",
            method="GET",
        )
        observed = _make_endpoint(url="https://test.local/api?q=ok")
        crawler_result = _make_crawler_result([synthetic, observed])

        fuzzer = ProductionCorpusFuzzer(
            profile="developer-safe",
            max_payloads_per_param=3,
            publish_sse=False,
        )
        result = fuzzer.run_from_crawler_result(crawler_result)
        # Только observed должен быть обработан
        assert result["total_endpoints"] == 1

    @patch("urllib.request.urlopen")
    def test_operator_approved_is_fuzzed(self, mock_urlopen):
        """operator_approved должен обрабатываться наравне с observed."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b"<html>OK</html>"
        mock_resp.headers = {}
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        approved = AwakenedEndpoint(
            field_name="approved_field",
            page_url="/",
            provenance="operator_approved",
            endpoint_url="https://test.local/api/approved?q=check",
            method="GET",
        )
        crawler_result = _make_crawler_result([approved])

        fuzzer = ProductionCorpusFuzzer(
            profile="developer-safe",
            max_payloads_per_param=5,
            publish_sse=False,
        )
        result = fuzzer.run_from_crawler_result(crawler_result)
        assert result["total_endpoints"] == 1


class TestFuzzPhaseLabRun:
    """CF-B3: run_fuzz_phase в lab_run."""

    @patch("urllib.request.urlopen")
    def test_run_fuzz_phase_with_endpoints(self, mock_urlopen):
        from utils.lab_run import run_fuzz_phase

        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b"<html>OK</html>"
        mock_resp.headers = {}
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        endpoints = [
            _make_endpoint(url=f"https://test.local/api/{i}?q=test") for i in range(2)
        ]
        crawler_result = _make_crawler_result(endpoints)

        result = run_fuzz_phase(
            crawler_result,
            profile="developer-safe",
            max_payloads_per_param=3,
            publish_sse=False,
        )
        assert result["status"] == "completed"
        assert result["endpoints_fuzzed"] == 2

    def test_run_fuzz_phase_empty(self):
        from utils.lab_run import run_fuzz_phase

        crawler_result = _make_crawler_result([])
        result = run_fuzz_phase(crawler_result)
        assert result["status"] == "skipped"

    @patch("urllib.request.urlopen")
    def test_run_fuzz_phase_background(self, mock_urlopen):
        from utils.lab_run import run_fuzz_phase_background

        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b"<html>OK</html>"
        mock_resp.headers = {}
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        endpoints = [_make_endpoint(url="https://test.local/api?q=bg")]
        crawler_result = _make_crawler_result(endpoints)

        t = run_fuzz_phase_background(
            crawler_result,
            profile="developer-safe",
        )
        t.join(timeout=30)
        assert not t.is_alive()


class TestFindingsModule:
    """CF-B3: fuzzer/findings.py — in-memory state."""

    def teardown_method(self):
        import fuzzer.findings as fmod
        fmod.clear_findings()

    def test_append_finding(self):
        import fuzzer.findings as fmod
        fmod.append_finding({"type": "finding", "severity": "high"})
        assert len(fmod._LAST_FINDINGS) == 1

    def test_update_fuzz_result(self):
        import fuzzer.findings as fmod
        fmod.update_fuzz_result({"status": "running", "findings": 5})
        assert fmod._LAST_FUZZ_RESULT["status"] == "running"

    def test_clear_findings(self):
        import fuzzer.findings as fmod
        fmod.append_finding({"test": 1})
        fmod.clear_findings()
        assert fmod._LAST_FINDINGS == []


class TestProgressCallback:
    @patch("urllib.request.urlopen")
    def test_progress_fires_for_each_endpoint(self, mock_urlopen):
        from fuzzer.models import EndpointSpec, FuzzParam, ParamType

        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b"<html>OK</html>"
        mock_resp.headers = {}
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        calls = []

        def on_progress(status, completed, total):
            calls.append((status, completed, total))

        endpoints = [
            EndpointSpec(
                method="GET", url=f"https://test/api/{i}?q=x", path=f"/api/{i}",
                params=[FuzzParam(name="q", param_type=ParamType.QUERY, original_value="x")],
            )
            for i in range(2)
        ]
        fuzzer = ProductionCorpusFuzzer(
            profile="developer-safe",
            max_payloads_per_param=2,
            publish_sse=False,
        )
        fuzzer.run(endpoints, on_progress=on_progress)

        # started + in_progress × 2 + completed = 4 вызова
        assert len(calls) >= 3  # at least started, 1 in_progress, completed
        statuses = [c[0] for c in calls]
        assert "fuzzing.started" in statuses
        assert "fuzzing.completed" in statuses