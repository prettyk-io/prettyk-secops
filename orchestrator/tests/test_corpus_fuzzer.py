# -*- coding: utf-8 -*-
"""CF-B1/B2: тесты ProductionCorpusFuzzer — engine + профили + детекция + dedup."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

from fuzzer.models import (
    EndpointSpec,
    FindingRecord,
    FuzzParam,
    FuzzerProfile,
    InjectionType,
    ParamType,
    Severity,
)
from fuzzer.payload_generator import PayloadGenerator
from fuzzer.finding_pipeline import FindingPipeline
from fuzzer.profiles import filter_payloads_for_profile, requires_destructive_flag
from fuzzer.detectors import Detector, detect_all
from fuzzer.corpus_fuzzer import ProductionCorpusFuzzer
from fuzzer.payloads import XSS_PAYLOADS, SQLI_PAYLOADS, CMDI_PAYLOADS, SPECIAL_CHARS


# ═══════════════════════════════════════════════════════════════════════
# Помощники
# ═══════════════════════════════════════════════════════════════════════

def _make_endpoint(method="GET", url="https://test.local/api/search?q=test", **kwargs) -> EndpointSpec:
    from urllib.parse import urlparse
    p = urlparse(url)
    params = [
        FuzzParam(name="q", param_type=ParamType.QUERY, original_value="test"),
    ]
    if method.upper() in ("POST", "PUT"):
        params.append(FuzzParam(name="name", param_type=ParamType.BODY, original_value="user"))
    return EndpointSpec(
        method=method,
        url=url,
        path=p.path,
        params=params,
        **kwargs,
    )


# ═══════════════════════════════════════════════════════════════════════
# CF-B2: Profile filter tests
# ═══════════════════════════════════════════════════════════════════════

class TestProfileFiltering:
    def test_developer_safe_blocks_sqli(self):
        filtered = filter_payloads_for_profile(SQLI_PAYLOADS, "developer-safe")
        assert len(filtered) == 0, "developer-safe must block ALL SQLi payloads"

    def test_developer_safe_blocks_cmdi(self):
        filtered = filter_payloads_for_profile(CMDI_PAYLOADS, "developer-safe")
        assert len(filtered) == 0, "developer-safe must block ALL CMDi payloads"

    def test_developer_safe_allows_xss(self):
        filtered = filter_payloads_for_profile(XSS_PAYLOADS, "developer-safe")
        # Должно пропустить почти все XSS (допуск ±1 на false-positive фильтра)
        assert len(filtered) >= len(XSS_PAYLOADS) - 1, (
            f"developer-safe should allow most XSS, got {len(filtered)}/{len(XSS_PAYLOADS)}"
        )

    def test_developer_safe_allows_special_chars(self):
        filtered = filter_payloads_for_profile(SPECIAL_CHARS, "developer-safe")
        assert len(filtered) >= len(SPECIAL_CHARS) - 1

    def test_full_active_allows_all(self):
        filtered = filter_payloads_for_profile(SQLI_PAYLOADS + CMDI_PAYLOADS, "full-active")
        assert len(filtered) == len(SQLI_PAYLOADS) + len(CMDI_PAYLOADS)

    def test_drop_table_blocked_in_developer_safe(self):
        """DROP TABLE — деструктивный, заблокирован в developer-safe."""
        filtered = filter_payloads_for_profile(["DROP TABLE users--"], "developer-safe")
        assert len(filtered) == 0

    def test_requires_destructive_flag(self):
        assert requires_destructive_flag("intrusive-fuzz") is True
        assert requires_destructive_flag("full-active") is False
        assert requires_destructive_flag("developer-safe") is False

    def test_intrusive_fuzz_raises_without_flag(self):
        with pytest.raises(ValueError, match="allow_destructive"):
            ProductionCorpusFuzzer(profile="intrusive-fuzz", allow_destructive=False)

    def test_intrusive_fuzz_ok_with_flag(self):
        f = ProductionCorpusFuzzer(profile="intrusive-fuzz", allow_destructive=True)
        assert f.profile == "intrusive-fuzz"


# ═══════════════════════════════════════════════════════════════════════
# CF-B1: PayloadGenerator tests
# ═══════════════════════════════════════════════════════════════════════

class TestPayloadGenerator:
    def test_generates_payloads_for_query_param(self):
        gen = PayloadGenerator(profile="developer-safe")
        param = FuzzParam(name="q", param_type=ParamType.QUERY, original_value="test")
        pairs = list(gen.iter_payloads(param, max_per_param=5))
        assert len(pairs) > 0
        assert all(isinstance(pair[1], str) for pair in pairs)

    def test_path_param_gets_path_traversal_only(self):
        gen = PayloadGenerator(profile="full-active")
        param = FuzzParam(name="id", param_type=ParamType.PATH)
        pairs = list(gen.iter_payloads(param, max_per_param=5))
        assert len(pairs) > 0
        # Все payloads должны содержать path-traversal признаки
        for _, payload in pairs:
            assert any(kw in payload for kw in ("../", "etc/passwd", "windows")), \
                f"Path param should get traversal, got: {payload}"

    def test_developer_safe_generator_no_sqli(self):
        gen = PayloadGenerator(profile="developer-safe")
        param = FuzzParam(name="query", param_type=ParamType.QUERY)
        for _, payload in gen.iter_payloads(param, max_per_param=20):
            assert "sleep" not in payload.lower(), f"sleep payload leaked: {payload}"
            assert "DROP TABLE" not in payload.upper(), f"DESTRUCTIVE payload leaked: {payload}"


# ═══════════════════════════════════════════════════════════════════════
# CF-B1: Detector tests
# ═══════════════════════════════════════════════════════════════════════

class TestDetectors:
    def test_xss_reflected_detected(self):
        spec = _make_endpoint()
        param = FuzzParam(name="q", param_type=ParamType.QUERY)
        finding = Detector.detect_xss(
            spec, param, "<script>alert(1)</script>",
            response_body='<html>Search: <script>alert(1)</script></html>',
            response_status=200, response_headers={}, request_info={}, response_time=0.1,
        )
        assert finding is not None
        assert finding.injection_type == InjectionType.XSS_REFLECTED

    def test_xss_not_reflected_no_detect(self):
        spec = _make_endpoint()
        param = FuzzParam(name="q", param_type=ParamType.QUERY)
        finding = Detector.detect_xss(
            spec, param, "<script>alert(1)</script>",
            response_body='<html>No results</html>',
            response_status=200, response_headers={}, request_info={}, response_time=0.1,
        )
        assert finding is None

    def test_sqli_error_detected(self):
        spec = _make_endpoint()
        param = FuzzParam(name="q", param_type=ParamType.QUERY)
        finding = Detector.detect_sqli(
            spec, param, "' OR 1=1--",
            response_body='<html>You have an error in your SQL syntax</html>',
            response_status=500, response_headers={}, request_info={}, response_time=0.1,
        )
        assert finding is not None
        assert finding.injection_type == InjectionType.SQL_INJECTION

    def test_sqli_time_based_detected(self):
        spec = _make_endpoint()
        param = FuzzParam(name="q", param_type=ParamType.QUERY)
        finding = Detector.detect_sqli(
            spec, param, "1' AND (SELECT * FROM (SELECT(SLEEP(2)))a)--",
            response_body="OK",
            response_status=200, response_headers={}, request_info={}, response_time=2.5,
        )
        assert finding is not None
        assert finding.injection_type == InjectionType.SQL_INJECTION_BLIND

    def test_cmdi_output_detected(self):
        spec = _make_endpoint()
        param = FuzzParam(name="cmd", param_type=ParamType.QUERY)
        finding = Detector.detect_cmdi(
            spec, param, "; id",
            response_body="uid=1000(test) gid=1000(test) groups=1000(test)",
            response_status=200, response_headers={}, request_info={}, response_time=0.1,
        )
        assert finding is not None
        assert finding.injection_type == InjectionType.COMMAND_INJECTION

    def test_ssrf_metadata_detected(self):
        spec = _make_endpoint()
        param = FuzzParam(name="url", param_type=ParamType.QUERY)
        finding = Detector.detect_ssrf(
            spec, param, "http://169.254.169.254/latest/meta-data/",
            response_body='{"ami-id": "ami-12345", "instance-type": "t2.micro"}',
            response_status=200, response_headers={}, request_info={}, response_time=0.1,
        )
        assert finding is not None
        assert finding.injection_type == InjectionType.SSRF

    def test_detect_all_aggregates(self):
        spec = _make_endpoint()
        param = FuzzParam(name="q", param_type=ParamType.QUERY)
        findings = detect_all(
            spec, param, "<script>alert(1)</script>",
            "<html>SQL syntax error: <script>alert(1)</script></html>",
            500, {}, {}, 0.05,
        )
        # XSS reflected (payload in body) + SQL error → 2 findings
        assert len(findings) >= 1


# ═══════════════════════════════════════════════════════════════════════
# CF-B1: FindingPipeline + Dedup
# ═══════════════════════════════════════════════════════════════════════

class TestFindingPipeline:
    def test_records_new_finding(self):
        pipeline = FindingPipeline(publish_sse=False)
        spec = _make_endpoint()
        finding = FindingRecord(
            severity=Severity.MEDIUM,
            injection_type=InjectionType.XSS_REFLECTED,
            method=spec.method, url=spec.url, param_name="q",
            param_type=ParamType.QUERY, payload="<script>alert(1)</script>",
        )
        assert pipeline.record(finding) is True
        assert len(pipeline.all_findings()) == 1

    def test_dedup_blocks_duplicate(self):
        pipeline = FindingPipeline(publish_sse=False)
        spec = _make_endpoint()

        f1 = FindingRecord(
            severity=Severity.MEDIUM,
            injection_type=InjectionType.XSS_REFLECTED,
            method=spec.method, url=spec.url, param_name="q",
            param_type=ParamType.QUERY, payload="<script>alert(1)</script>",
        )
        f2 = FindingRecord(
            severity=Severity.MEDIUM,
            injection_type=InjectionType.XSS_REFLECTED,
            method=spec.method, url=spec.url, param_name="q",
            param_type=ParamType.QUERY, payload="<script>alert(2)</script>",
        )
        assert pipeline.record(f1) is True
        assert pipeline.record(f2) is False, "Duplicate should be blocked"
        assert len(pipeline.all_findings()) == 1

    def test_different_params_no_duplicate(self):
        pipeline = FindingPipeline(publish_sse=False)
        spec = _make_endpoint()

        f1 = FindingRecord(
            severity=Severity.MEDIUM,
            injection_type=InjectionType.XSS_REFLECTED,
            method=spec.method, url=spec.url, param_name="q",
            param_type=ParamType.QUERY, payload="xss",
        )
        f2 = FindingRecord(
            severity=Severity.MEDIUM,
            injection_type=InjectionType.XSS_REFLECTED,
            method=spec.method, url=spec.url, param_name="name",
            param_type=ParamType.BODY, payload="xss2",
        )
        assert pipeline.record(f1) is True
        assert pipeline.record(f2) is True, "Different param should NOT be duplicate"
        assert len(pipeline.all_findings()) == 2

    def test_is_duplicate_check(self):
        pipeline = FindingPipeline(publish_sse=False)
        spec = _make_endpoint()
        f = FindingRecord(
            severity=Severity.HIGH,
            injection_type=InjectionType.SQL_INJECTION,
            method=spec.method, url=spec.url, param_name="id",
            param_type=ParamType.PATH, payload="' OR 1=1--",
        )
        assert pipeline.is_duplicate(f) is False
        pipeline.record(f)
        assert pipeline.is_duplicate(f) is True

    def test_severity_counts(self):
        pipeline = FindingPipeline(publish_sse=False)
        spec = _make_endpoint()
        for i, (sev, inj, pname) in enumerate([
            (Severity.CRITICAL, InjectionType.COMMAND_INJECTION, "cmd"),
            (Severity.HIGH, InjectionType.SQL_INJECTION, "id"),
            (Severity.HIGH, InjectionType.SSRF, "url"),
            (Severity.MEDIUM, InjectionType.XSS_REFLECTED, "name"),
            (Severity.MEDIUM, InjectionType.XSS_REFLECTED, "search"),
        ]):
            pipeline.record(FindingRecord(
                severity=sev, injection_type=inj, method=spec.method,
                url=f"{spec.url}#{i}", param_name=pname,
                param_type=ParamType.QUERY, payload=sev.value,
            ))
        counts = pipeline.count_by_severity()
        assert counts.get("critical") == 1
        assert counts.get("high") == 2
        assert counts.get("medium") == 2

    def test_summary(self):
        pipeline = FindingPipeline(publish_sse=False)
        spec = _make_endpoint()
        pipeline.record(FindingRecord(
            severity=Severity.HIGH, injection_type=InjectionType.SQL_INJECTION,
            method=spec.method, url=spec.url, param_name="x",
            param_type=ParamType.QUERY, payload="test",
        ))
        s = pipeline.summary()
        assert s["total"] == 1
        assert "high" in s["by_severity"]
        assert s["unique_signatures"] == 1


# ═══════════════════════════════════════════════════════════════════════
# CF-B1: ProductionCorpusFuzzer
# ═══════════════════════════════════════════════════════════════════════

class TestProductionCorpusFuzzer:
    def test_empty_endpoints(self):
        fuzzer = ProductionCorpusFuzzer(profile="developer-safe")
        result = fuzzer.run([])
        assert result["status"] == "completed"
        assert result["findings"] == 0

    @patch("urllib.request.urlopen")
    def test_run_cycles_over_endpoints(self, mock_urlopen):
        """Фаззер обходит все эндпоинты (мок HTTP)."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b"<html>OK</html>"
        mock_resp.headers = {}
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        fuzzer = ProductionCorpusFuzzer(
            profile="developer-safe",
            max_payloads_per_param=3,
            publish_sse=False,
        )
        endpoints = [_make_endpoint(url=f"https://test/api/{i}?q=test") for i in range(3)]
        result = fuzzer.run(endpoints)
        assert result["total_endpoints"] == 3
        assert result["total_requests"] > 0
        assert result["status"] == "completed"

    def test_developer_safe_default(self):
        fuzzer = ProductionCorpusFuzzer()
        assert fuzzer.profile == "developer-safe"

    def test_full_active_no_restrictions(self):
        fuzzer = ProductionCorpusFuzzer(profile="full-active")
        assert fuzzer.profile == "full-active"

    def test_pipeline_accessible(self):
        fuzzer = ProductionCorpusFuzzer(profile="developer-safe", publish_sse=False)
        assert fuzzer.pipeline is not None


# ═══════════════════════════════════════════════════════════════════════
# CF-B1: FindingRecord model
# ═══════════════════════════════════════════════════════════════════════

class TestFindingRecord:
    def test_signature_auto_generated(self):
        f = FindingRecord(
            severity=Severity.HIGH,
            injection_type=InjectionType.SQL_INJECTION,
            method="GET", url="https://x.com/api?id=1",
            param_name="id", param_type=ParamType.QUERY, payload="' OR 1=1--",
        )
        assert f.finding_signature
        assert len(f.dedup_key) == 32  # SHA-256 hex[:32]

    def test_to_dict_has_evidence(self):
        f = FindingRecord(
            severity=Severity.MEDIUM,
            injection_type=InjectionType.XSS_REFLECTED,
            method="POST", url="https://x.com/form",
            param_name="name", param_type=ParamType.BODY, payload="<script>x</script>",
            evidence_request={"method": "POST", "url": "https://x.com/form"},
            evidence_response={"status": 200, "body_snippet": "<script>x</script>"},
        )
        d = f.to_dict()
        assert d["type"] == "finding"
        assert d["evidence"]["request"]["method"] == "POST"
        assert d["evidence"]["response"]["status"] == 200
        assert len(d["payload"]) <= 500

    def test_to_sse_event(self):
        f = FindingRecord(
            severity=Severity.LOW,
            injection_type=InjectionType.INFORMATION_DISCLOSURE,
            method="GET", url="https://x.com/", param_name="debug",
            param_type=ParamType.QUERY, payload="true",
        )
        ev = f.to_sse_event()
        assert ev["type"] == "finding.created"
        assert "finding" in ev