"""COS-L9: Тесты scannerCapabilityBroker."""
import pytest
from orchestrator.adapters.capability_scanner import scannerSession, scannerCapabilityBroker


class TestscannerSession:
    def test_creation(self):
        s = scannerSession(
            session_id="scanner-test-1", run_id="run-1",
            proxy_host="host.docker.internal", proxy_port=8080,
            api_key="changeme",
        )
        assert s.run_id == "run-1"
        assert s.context_id is None

    def test_with_context(self):
        s = scannerSession(
            session_id="scanner-test-2", run_id="run-2",
            proxy_host="host.docker.internal", proxy_port=8080,
            api_key="key", context_id=42,
        )
        assert s.context_id == 42


class TestBroker:
    def test_init(self):
        broker = scannerCapabilityBroker("http://127.0.0.1:8080", "key")
        assert broker._scanner_url == "http://127.0.0.1:8080"

    def test_defaults(self):
        broker = scannerCapabilityBroker()
        assert broker._scanner_url == "http://127.0.0.1:8080"