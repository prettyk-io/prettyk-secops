# PROFILES-1: честный контракт Pure Box как самодостаточного режима.
#
# Pure Box не требует PostgreSQL / Valkey / очереди / worker pool. Системные
# слои Enterprise (queue / dispatch(worker pool) / lease + health / telemetry)
# не инициализируются и не зовут внешние сервисы в режиме Pure Box.
#
# Контракт: при старте Pure Box код не пытается подключиться к внешним сервисам.
import pytest

from infra.profiles import (
    ENTERPRISE_PROFILE,
    PURE_BOX_PROFILE,
    enterprise_health_requirements,
    is_enterprise,
    is_pure_box,
    pure_box_health,
    requires_postgres,
    requires_queue,
    requires_valkey,
    requires_worker_pool,
    resolve_profile,
)


def test_default_profile_is_enterprise():
    assert resolve_profile() == ENTERPRISE_PROFILE
    assert is_enterprise() is True
    assert is_pure_box() is False


def test_pure_box_profile_recognized(monkeypatch):
    monkeypatch.setenv("PK_DEPLOY_PROFILE", "pure-box")
    assert resolve_profile() == PURE_BOX_PROFILE
    assert is_pure_box() is True
    assert is_enterprise() is False


def test_unknown_profile_falls_back_to_enterprise(monkeypatch):
    monkeypatch.setenv("PK_DEPLOY_PROFILE", "banana")
    assert resolve_profile() == ENTERPRISE_PROFILE


def test_enterprise_requires_all_external_layers():
    assert requires_postgres() is True
    assert requires_valkey() is True
    assert requires_queue() is True
    assert requires_worker_pool() is True


def test_pure_box_requires_nothing(monkeypatch):
    monkeypatch.setenv("PK_DEPLOY_PROFILE", "pure-box")
    assert requires_postgres() is False
    assert requires_valkey() is False
    assert requires_queue() is False
    assert requires_worker_pool() is False


def test_pure_box_health_self_contained(monkeypatch):
    monkeypatch.setenv("PK_DEPLOY_PROFILE", "pure-box")
    h = pure_box_health()
    assert h["live"] is True
    assert h["ready"] is True
    assert h["draining"] is False
    assert h["profile"] == "pure-box"
    deps = h["dependencies"]
    assert deps["postgres"] is False
    assert deps["valkey"] is False
    assert deps["queue"] is False
    assert deps["worker_pool"] is False
    assert deps["filesystem"] is True


def test_enterprise_health_requirements_full():
    reqs = enterprise_health_requirements()
    for dep in ("postgres", "valkey", "queue", "worker_pool"):
        assert dep in reqs


def test_pure_box_health_registers_only_filesystem():
    from infra.cosmo_health import build_cosmo_health

    h = build_cosmo_health(PURE_BOX_PROFILE)
    status = h.ready()
    # В Pure Box не регистрируются внешние проверки — только filesystem.
    assert set(status.checks.keys()) == {"filesystem"}
    assert status.ready is True


def test_pure_box_queue_selects_in_memory_backend(monkeypatch):
    monkeypatch.setenv("PK_DEPLOY_PROFILE", "pure-box")
    from infra.run_queue import InMemoryQueueBackend, RunQueue

    q = RunQueue()  # без valkey client — не должен упасть в Pure Box
    assert isinstance(q._backend, InMemoryQueueBackend)
    q.enqueue("run-1")
    q.enqueue("run-2")
    assert q.dequeue() == "run-1"  # строгий FIFO
    assert q.depth() == 1


def test_enterprise_queue_requires_client(monkeypatch):
    monkeypatch.delenv("PK_DEPLOY_PROFILE", raising=False)
    from infra.run_queue import RunQueue

    with pytest.raises(ValueError):
        RunQueue()  # enterprise без valkey client → явная ошибка, не тихая деградация


def test_pure_box_worker_pool_is_in_memory(monkeypatch):
    monkeypatch.setenv("PK_DEPLOY_PROFILE", "pure-box")
    from infra.run_dispatch import WorkerRegistry

    reg = WorkerRegistry()
    reg.register("w1", {"chrome"})
    r = reg.execution_readiness({"chrome"})
    assert r.ready is True
    assert r.free_slots == 1