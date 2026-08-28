"""COS-L11: Тесты EvidenceChain."""
import json

import pytest
from orchestrator.evidence import EvidenceEntry, EvidenceLedger


class TestEvidenceLedger:
    def test_genesis_empty(self):
        ledger = EvidenceLedger()
        assert ledger.length == 0
        assert len(ledger.entries) == 0
        assert ledger.verify_chain()

    def test_add_entry_returns_entry(self):
        ledger = EvidenceLedger()
        entry = ledger.add_entry("screenshot", {"url": "http://example.com"}, "run-1/batch-1/step-1")
        assert entry.index == 0
        assert entry.type == "screenshot"
        assert entry.provenance == "run-1/batch-1/step-1"
        assert len(entry.hash) == 64  # SHA-256 hex

    def test_chain_verifies_after_add(self):
        ledger = EvidenceLedger()
        ledger.add_entry("finding", {"severity": "Critical"}, "run-1")
        ledger.add_entry("log", {"line": "scan complete"}, "run-1")
        assert ledger.verify_chain()

    def test_chain_breaks_on_tamper(self):
        ledger = EvidenceLedger()
        ledger.add_entry("finding", {"severity": "High"}, "run-1")
        ledger.add_entry("log", {"line": "ok"}, "run-1")
        assert ledger.verify_chain()

        # Tamper with entry 0
        ledger.tamper(0, "type", "tampered")
        assert not ledger.verify_chain()

    def test_chain_breaks_on_content_change(self):
        ledger = EvidenceLedger()
        ledger.add_entry("finding", {"count": 1}, "run-1")
        assert ledger.verify_chain()

        ledger.tamper(0, "content", {"count": 999})
        assert not ledger.verify_chain()

    def test_index_must_match(self):
        ledger = EvidenceLedger()
        ledger.add_entry("log", {}, "run-1")
        ledger.add_entry("log", {}, "run-1")
        assert ledger.verify_chain()

        ledger.tamper(0, "index", 5)
        assert not ledger.verify_chain()

    def test_prev_hash_chain(self):
        ledger = EvidenceLedger()
        e1 = ledger.add_entry("log", {"step": 1}, "run-1")
        e2 = ledger.add_entry("log", {"step": 2}, "run-1")

        assert e1.hash == e2.prev_hash
        assert ledger.verify_chain()

    def test_to_dict(self):
        ledger = EvidenceLedger()
        ledger.add_entry("finding", {"severity": "Critical"}, "run-1")
        d = ledger.to_dict()
        assert d["length"] == 1
        assert len(d["entries"]) == 1
        assert d["verified"] is True
        assert len(d["last_hash"]) == 64