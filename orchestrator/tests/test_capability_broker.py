# -*- coding: utf-8 -*-
# PoC — NOT production. Cosmoport boundary. Do not import into DAST runtime.
"""COSMOPORT-2: CapabilityBroker (COS-004) + tool ctl (COS-009) tests."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


from infra.capability_broker import (
    Capability, CapabilityBroker, ResourceHealth,
)
from infra.tool_ctl import RunCapabilities, scannerCtl, PlaywrightCtl


# ═══════════════════════════════════════════════════════════════════════════
# COS-004: CapabilityBroker
# ═══════════════════════════════════════════════════════════════════════════

class TestCapabilityBrokerAcquire:
    def test_acquire_returns_port(self):
        b = CapabilityBroker()
        a = b.acquire("run-1", Capability.scanner)
        assert a is not None
        assert a.port == 8080
        assert a.run_id == "run-1"

    def test_acquire_idempotent_same_run(self):
        """Идемпотентно: тот же run_id → тот же порт."""
        b = CapabilityBroker()
        a1 = b.acquire("run-1", Capability.scanner)
        a2 = b.acquire("run-1", Capability.scanner)
        assert a1.port == a2.port

    def test_two_runs_different_ports(self):
        """Два run не могут получить один порт одновременно."""
        b = CapabilityBroker()
        a1 = b.acquire("run-1", Capability.scanner)
        a2 = b.acquire("run-2", Capability.scanner)
        assert a1.port != a2.port

    def test_different_capabilities_different_ports(self):
        b = CapabilityBroker()
        scanner = b.acquire("run-1", Capability.scanner)
        pw = b.acquire("run-1", Capability.PLAYWRIGHT)
        assert scanner.port == 8080
        assert pw.port == 9222
        assert scanner.port != pw.port


class TestCapabilityBrokerRelease:
    def test_release_frees_port(self):
        b = CapabilityBroker()
        b.acquire("run-1", Capability.scanner)
        count = b.release("run-1", Capability.scanner)
        assert count == 1
        # Порт снова свободен
        a = b.acquire("run-2", Capability.scanner)
        assert a.port == 8080

    def test_release_all_capabilities(self):
        b = CapabilityBroker()
        b.acquire("run-1", Capability.scanner)
        b.acquire("run-1", Capability.PLAYWRIGHT)
        count = b.release("run-1")  # все
        assert count == 2

    def test_release_all_broker(self):
        b = CapabilityBroker()
        b.acquire("run-1", Capability.scanner)
        b.acquire("run-2", Capability.PLAYWRIGHT)
        total = b.release_all()
        assert total == 2


class TestCapabilityBrokerHealth:
    def test_health_default_healthy(self):
        b = CapabilityBroker()
        assert b.get_health(Capability.scanner) == ResourceHealth.HEALTHY

    def test_set_health(self):
        b = CapabilityBroker()
        b.set_health(Capability.scanner, ResourceHealth.DEGRADED)
        assert b.get_health(Capability.scanner) == ResourceHealth.DEGRADED

    def test_health_snapshot(self):
        b = CapabilityBroker()
        snap = b.health_snapshot()
        assert "scanner" in snap
        assert snap["scanner"] == "healthy"


class TestCapabilityBrokerLease:
    def test_lease_expiry_recovery(self):
        """Зависший run освобождается по истечении lease."""
        b = CapabilityBroker(lease_seconds=0.01)  # 10ms lease
        b.acquire("run-stale", Capability.scanner)
        time.sleep(0.05)
        expired = b.recover_expired()
        assert len(expired) == 1
        assert expired[0].run_id == "run-stale"

    def test_lease_renewed_on_reacquire(self):
        b = CapabilityBroker(lease_seconds=1.0)
        a1 = b.acquire("run-1", Capability.scanner)
        time.sleep(0.01)
        b.acquire("run-1", Capability.scanner)  # re-acquire → renew lease
        assert a1.lease_expires_at > time.time()

    def test_is_leased(self):
        b = CapabilityBroker()
        b.acquire("run-1", Capability.scanner)
        assert b.is_leased("run-1", Capability.scanner)
        assert not b.is_leased("run-2", Capability.scanner)


# ═══════════════════════════════════════════════════════════════════════════
# COS-009: scanner/PW ctl через брокер
# ═══════════════════════════════════════════════════════════════════════════

class TestscannerCtl:
    def test_start_scanner_allocates_port(self):
        broker = CapabilityBroker()
        ctl = scannerCtl(broker)
        s = ctl.start_scanner("run-1", "http://example.com")
        assert s is not None
        assert s.port == 8080
        assert s.status == "running"

    def test_scanner_status(self):
        broker = CapabilityBroker()
        ctl = scannerCtl(broker)
        ctl.start_scanner("run-1", "http://example.com")
        assert ctl.scanner_status("run-1") == "running"
        assert ctl.scanner_status("run-2") is None

    def test_stop_scanner_releases(self):
        broker = CapabilityBroker()
        ctl = scannerCtl(broker)
        ctl.start_scanner("run-1", "http://example.com")
        ctl.stop_scanner("run-1")
        assert ctl.scanner_status("run-1") is None
        # порт свободен
        assert broker.acquire("run-2", Capability.scanner).port == 8080


class TestPlaywrightCtl:
    def test_start_playwright_allocates_port(self):
        broker = CapabilityBroker()
        ctl = PlaywrightCtl(broker)
        s = ctl.start_playwright("run-1")
        assert s is not None
        assert s.port == 9222

    def test_isolation_two_runs(self):
        """Два run не мешают друг другу (изоляция)."""
        broker = CapabilityBroker()
        ctl = PlaywrightCtl(broker)
        s1 = ctl.start_playwright("run-1")
        s2 = ctl.start_playwright("run-2")
        assert s1.port != s2.port

    def test_stop_playwright_releases(self):
        broker = CapabilityBroker()
        ctl = PlaywrightCtl(broker)
        ctl.start_playwright("run-1")
        ctl.stop_playwright("run-1")
        assert ctl.playwright_status("run-1") is None


class TestRunCapabilities:
    def test_teardown_run_releases_all(self):
        rc = RunCapabilities()
        rc.scanner.start_scanner("run-1", "http://example.com")
        rc.playwright.start_playwright("run-1")
        rc.teardown_run("run-1")
        # Все ресурсы освобождены
        b = rc.broker()
        assert not b.is_leased("run-1", Capability.scanner)
        assert not b.is_leased("run-1", Capability.PLAYWRIGHT)

    def test_broker_singleton(self):
        from infra.capability_broker import get_broker
        b1 = get_broker()
        b2 = get_broker()
        assert b1 is b2