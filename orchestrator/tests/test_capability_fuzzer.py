"""COS-L10: Тесты FuzzerCapabilityBroker."""
import pytest
from orchestrator.adapters.capability_fuzzer import (
    FuzzerCapabilityBroker, FuzzerSession,
    SQLI_PAYLOADS, XSS_PAYLOADS, CMDI_PAYLOADS, PATH_TRAVERSAL_PAYLOADS,
)


class TestDictionaries:
    def test_sqli_has_payloads(self):
        assert len(SQLI_PAYLOADS) >= 5
        assert "' OR '1'='1" in SQLI_PAYLOADS

    def test_xss_has_payloads(self):
        assert len(XSS_PAYLOADS) >= 5
        assert "<script>alert(1)</script>" in XSS_PAYLOADS

    def test_cmdi_has_payloads(self):
        assert len(CMDI_PAYLOADS) >= 4
        assert "; ls -la" in CMDI_PAYLOADS

    def test_path_traversal_has_payloads(self):
        assert len(PATH_TRAVERSAL_PAYLOADS) >= 4
        assert "../../../etc/passwd" in PATH_TRAVERSAL_PAYLOADS


class TestFuzzerSession:
    def test_default_stats(self):
        s = FuzzerSession(session_id="fuzz-1", run_id="run-1")
        assert s.stats["injected"] == 0
        assert s.stats["hits"] == 0


class TestFuzzerBroker:
    def test_start_default(self):
        broker = FuzzerCapabilityBroker()
        session = broker.start_fuzzer("run-1")
        assert session.run_id == "run-1"
        assert "sqli" in session.dictionaries
        assert "xss" in session.dictionaries
        assert "cmdi" in session.dictionaries
        assert "path_traversal" in session.dictionaries

    def test_start_custom_dicts(self):
        broker = FuzzerCapabilityBroker()
        session = broker.start_fuzzer("run-2", ["sqli", "xss"])
        assert "sqli" in session.dictionaries
        assert "xss" in session.dictionaries
        assert "cmdi" not in session.dictionaries

    def test_record_injection(self):
        broker = FuzzerCapabilityBroker()
        session = broker.start_fuzzer("run-3")
        broker.record_injection(session, hit=False)
        broker.record_injection(session, hit=True)
        assert session.stats["injected"] == 2
        assert session.stats["hits"] == 1

    def test_teardown(self):
        broker = FuzzerCapabilityBroker()
        session = broker.start_fuzzer("run-4")
        broker.record_injection(session, hit=True)
        stats = broker.teardown(session)
        assert stats["injected"] == 1
        assert stats["hits"] == 1
        assert "run-4" not in broker._sessions