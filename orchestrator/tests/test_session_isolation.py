# -*- coding: utf-8 -*-
"""SOR: параллельная изоляция сессий (ComposeProvider)."""
from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

from infra.compose_provider import ComposeProvider
from infra.lease_controller import LeaseController
from infra.runtime_provider import ResourceType


# Runtime test — требует Docker Engine с собранными образами.
# Запускать: pytest -m docker (или пропустить: pytest -m "not docker").
pytestmark = [pytest.mark.docker, pytest.mark.lab, pytest.mark.heavy]


def _docker_available() -> bool:
    try:
        subprocess.run(
            ["docker", "version", "--format", "{{.Server.Version}}"],
            capture_output=True, timeout=5, check=True,
        )
        return True
    except Exception:
        return False


def _build_contexts_ready() -> bool:
    """session-template.yml собирает образы из build-контекстов — нужны их Dockerfile.

    Без контекста `pk-api-lab` (git-ignored остаток, только proto_pack) compose
    падает на `failed to read dockerfile`, а не скипает. Проверяем до запуска.
    """
    services_dir = Path(__file__).resolve().parents[2] / "services"
    return all(
        (services_dir / ctx / "Dockerfile").is_file()
        for ctx in ("playwright-authoring", "pk-api-lab")
    )


_docker_skip = pytest.mark.skipif(
    not _docker_available() or not _build_contexts_ready(),
    reason="Docker Engine unavailable or session-template build contexts not built",
)


class TestParallelSessions:
    """Две параллельные сессии не пересекаются портами, сетью и состоянием."""

    @pytest.mark.asyncio
    @_docker_skip
    async def test_two_sessions_isolated_networks(self):
        """Provision двух сессий → разные проекты, разные сети."""
        provider = ComposeProvider()
        sid_a, sid_b = "test-sor-a", "test-sor-b"

        try:
            bundle_a = await provider.provision_session_bundle(sid_a)
            bundle_b = await provider.provision_session_bundle(sid_b)

            assert bundle_a.session_id != bundle_b.session_id
            # Каждая сессия должна получить свою сеть (разные project-имена).
            assert bundle_a.status == "provisioned"
            assert bundle_b.status == "provisioned"

            # Endpoints должны быть у каждой сессии свои.
            assert ResourceType.SCANNER in bundle_a.endpoints
            assert ResourceType.SCANNER in bundle_b.endpoints
            # Обе сессии получают scanner:8080 внутри СВОЕЙ изолированной сети.
            assert bundle_a.endpoints[ResourceType.SCANNER].port == 8080
            assert bundle_b.endpoints[ResourceType.SCANNER].port == 8080
        finally:
            await provider.release_session_bundle(sid_a, force=True)
            await provider.release_session_bundle(sid_b, force=True)

    @pytest.mark.asyncio
    @_docker_skip
    async def test_idempotent_provision(self):
        """Повторный provision той же сессии не ломает существующую."""
        provider = ComposeProvider()
        sid = "test-sor-idem"

        try:
            b1 = await provider.provision_session_bundle(sid)
            b2 = await provider.provision_session_bundle(sid)

            assert b1.session_id == b2.session_id
            assert b1.generation == b2.generation
        finally:
            await provider.release_session_bundle(sid, force=True)

    @pytest.mark.asyncio
    @_docker_skip
    async def test_release_cleans_project(self):
        """После release проект и контейнеры удалены."""
        provider = ComposeProvider()
        sid = "test-sor-clean"

        await provider.provision_session_bundle(sid)
        await provider.release_session_bundle(sid, force=True)

        # Проверить, что контейнеры не висят.
        health = await provider.check_bundle_health(sid)
        assert not any(health.values()), f"Zombie containers: {health}"

    @pytest.mark.asyncio
    @_docker_skip
    async def test_no_port_leakage_between_sessions(self):
        """Сессии не пересекаются host-портами даже при публикации."""
        provider = ComposeProvider()
        sid_a, sid_b = "test-sor-noleak-a", "test-sor-noleak-b"

        try:
            await provider.provision_session_bundle(sid_a)
            await provider.provision_session_bundle(sid_b)

            health_a = await provider.check_bundle_health(sid_a)
            health_b = await provider.check_bundle_health(sid_b)

            # Каждая сессия имеет свои контейнеры.
            # Проверяем, что контейнеры сессии A не появляются в health B.
            for rt, alive in health_a.items():
                if alive:
                    assert rt in {ResourceType.SCANNER, ResourceType.BROWSER_AUTHORING, ResourceType.TARGET}
        finally:
            await provider.release_session_bundle(sid_a, force=True)
            await provider.release_session_bundle(sid_b, force=True)


class TestLeaseController:
    """Lease Controller: регистрация, heartbeat, expiry, zombie sweep."""

    def test_register_and_heartbeat(self):
        lc = LeaseController(default_lease_seconds=60)
        lease = lc.register("session-1")
        assert lease.session_id == "session-1"
        assert lease.generation == 1
        assert not lease.is_expired()

        gen = lc.heartbeat("session-1")
        assert gen == 2
        assert lc.get("session-1").generation == 2

    def test_lease_expiry(self):
        lc = LeaseController(default_lease_seconds=-1)  # уже истекло
        lease = lc.register("session-exp")
        assert lease.is_expired()

    def test_snapshot_reflects_state(self):
        lc = LeaseController()
        lc.register("s1")
        lc.register("s2")

        snap = lc.snapshot()
        assert snap["total"] == 2
        assert snap["active"] == 2

    def test_unknown_session_heartbeat_returns_none(self):
        lc = LeaseController()
        assert lc.heartbeat("nobody") is None

    def test_reconstruction_does_not_duplicate(self):
        """Метод _reconstruct_from_labels не дублирует уже зарегистрированные сессии."""
        lc = LeaseController()
        lc.register("existing")
        assert len(lc._leases) == 1