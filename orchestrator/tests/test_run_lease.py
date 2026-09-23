# RUN-CTL-5: тесты RunLeaseBridge — мост LeaseController ↔ RunStore.
#
# Стратегия:
#   - LeaseController — НАСТОЯЩИЙ (register/heartbeat/get sync, без фонового
#     loop'а: start() не вызывается, он не нужен для этих сценариев).
#   - RunStore — in-memory test double контракта (Boss пишет run_state.py
#     параллельно; протокол: transition/get/list_stale [+ опц. heartbeat]).
#   - Docker label recovery — подмена asyncio.create_subprocess_exec,
#     чтобы не требовать реальный docker в тестовом окружении.
from __future__ import annotations

import asyncio
import time

import pytest

from orchestrator.infra.lease_controller import LeaseController
from orchestrator.infra.run_lease import RunLeaseBridge


# ── Test doubles ────────────────────────────────────────────────────────────

ACTIVE_STATES = frozenset({"pending", "queued", "running"})


class MemoryRunStore:
    """Test double контракта RunStore (см. RunStoreProtocol в run_lease.py)."""

    def __init__(self) -> None:
        self.runs: dict[str, dict] = {}
        self.transitions: list[tuple[str, str, str]] = []

    def create(self, run_id: str, status: str = "pending") -> None:
        self.runs[run_id] = {
            "state": status,
            "last_activity": time.time(),
            "history": [(status, time.time())],
        }

    def transition(self, run_id: str, new_status: str) -> bool:
        record = self.runs[run_id]  # KeyError для неизвестного run — честно
        previous = record["state"]
        record["state"] = new_status
        record["last_activity"] = time.time()
        record["history"].append((new_status, time.time()))
        self.transitions.append((run_id, previous, new_status))
        return True

    def get(self, run_id: str) -> dict | None:
        return self.runs.get(run_id)

    def list_stale(self, threshold_seconds: float) -> list[str]:
        now = time.time()
        return [
            run_id
            for run_id, record in self.runs.items()
            if record["state"] in ACTIVE_STATES
            and now - record["last_activity"] > threshold_seconds
        ]

    def heartbeat(self, run_id: str, lease_seconds: float = 90.0) -> bool:
        """Сигнатура согласована с run_state.py (Boss): (run_id, lease_seconds)."""
        self.runs[run_id]["last_activity"] = time.time()
        return True

    # ── Тестовые манипуляции ──

    def age_last_activity(self, run_id: str, seconds: float) -> None:
        """Сделать так, будто worker молчал N секунд (без реального ожидания)."""
        self.runs[run_id]["last_activity"] -= seconds


class FakeProvider:
    """Test double RuntimeProvider: фиксирует release_session_bundle."""

    def __init__(self) -> None:
        self.released: list[tuple[str, bool]] = []

    async def release_session_bundle(self, session_id: str, force: bool = False) -> None:
        self.released.append((session_id, force))


def make_bridge(store: MemoryRunStore | None = None,
                provider: FakeProvider | None = None
                ) -> tuple[RunLeaseBridge, MemoryRunStore, FakeProvider]:
    lease = LeaseController(default_lease_seconds=90.0, grace_period_seconds=60.0)
    store = store or MemoryRunStore()
    provider = provider or FakeProvider()
    bridge = RunLeaseBridge(
        lease_controller=lease,
        run_store=store,
        provider=provider,
        lease_seconds=60.0,
        stale_after_seconds=60.0,
    )
    return bridge, store, provider


def registered(bridge: RunLeaseBridge, store: MemoryRunStore, run_id: str, **kwargs):
    """Реальный флоу: run создан в PENDING (RUN-CTL-1), затем register_run
    переводит его в QUEUED. Вспомогалка фиксирует обе половины."""
    store.create(run_id, status="pending")
    return bridge.register_run(run_id, **kwargs)


# ── register_run ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_run_creates_lease_in_controller():
    """Acceptance: register_run('abc') → lease существует в LeaseController."""
    bridge, store, _ = make_bridge()
    lease = await registered(bridge, store, "abc")

    assert bridge.is_leased("abc") is True
    assert lease.generation == 1
    assert lease.status == "active"


@pytest.mark.asyncio
async def test_register_run_transitions_to_queued():
    """Acceptance: register_run создаёт lease + run переходит в QUEUED."""
    bridge, store, _ = make_bridge()
    await registered(bridge, store, "run-1")

    assert store.get("run-1")["state"] == "queued"
    assert ("run-1", "pending", "queued") in store.transitions


@pytest.mark.asyncio
async def test_register_run_failure_keeps_store_consistent():
    """Если RunStore отклонил переход — исключение поднимается наверх,
    run НЕ остаётся в QUEUED (переход не зафиксирован)."""

    class ExplodingStore(MemoryRunStore):
        def transition(self, run_id, new_status):
            raise RuntimeError("db down")

    exploding = ExplodingStore()
    lease_ctrl = LeaseController(default_lease_seconds=90.0)
    bridge2 = RunLeaseBridge(lease_ctrl, exploding, lease_seconds=60.0)

    with pytest.raises(RuntimeError):
        await bridge2.register_run("boom")

    assert exploding.get("boom") is None  # переход не зафиксирован
    # Lease остался, но истечёт через zombie GC — в snapshot видно.


# ── heartbeat ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_heartbeat_extends_lease_and_generation():
    """Acceptance: heartbeat → lease_expires_at сдвинулся вперёд, generation +1."""
    bridge, store, _ = make_bridge()
    await registered(bridge, store, "run-h", lease_seconds=10.0)

    lease_before = bridge._lease.get("run-h")
    expires_before = lease_before.lease_expires_at
    gen_before = lease_before.generation

    # Явно длинный lease: expires заведомо дальше, чем при коротком lease.
    generation = bridge.heartbeat("run-h", lease_seconds=500.0)

    lease_after = bridge._lease.get("run-h")
    assert generation == 2
    assert lease_after.generation == gen_before + 1
    assert lease_after.lease_expires_at > expires_before


@pytest.mark.asyncio
async def test_heartbeat_unknown_run_returns_none():
    bridge, _, _ = make_bridge()
    assert bridge.heartbeat("ghost") is None


@pytest.mark.asyncio
async def test_heartbeat_touches_run_store_activity():
    """heartbeat продлевает и окно stale-детекции в RunStore (если умеет)."""
    bridge, store, _ = make_bridge()
    await registered(bridge, store, "run-t")
    store.age_last_activity("run-t", 80.0)

    bridge.heartbeat("run-t")

    # Активность обновлена → не stale даже при запасе 80с против окна 60с.
    assert "run-t" not in store.list_stale(60.0)


# ── sweep_stale ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sweep_stale_marks_silent_run_expired():
    """Acceptance: worker замолчал 60+с → sweep_stale → transition(EXPIRED)."""
    bridge, store, _ = make_bridge()
    await registered(bridge, store, "run-dead")
    store.age_last_activity("run-dead", 200.0)  # молчал 200с > 60с

    expired = await bridge.sweep_stale()

    assert expired == ["run-dead"]
    assert store.get("run-dead")["state"] == "expired"


@pytest.mark.asyncio
async def test_sweep_stale_marks_stuck_within_threshold():
    """Acceptance: зависший (stuck) run помечается за ≤ порог (61с > 60с)."""
    bridge, store, _ = make_bridge()
    await registered(bridge, store, "run-stuck")
    store.age_last_activity("run-stuck", 61.0)  # едва за порогом 60с

    expired = await bridge.sweep_stale()

    assert expired == ["run-stuck"]
    assert store.get("run-stuck")["state"] == "expired"


@pytest.mark.asyncio
async def test_sweep_stale_does_not_mark_below_threshold():
    """Acceptance: run, молчавший меньше порога (≤ 60с), НЕ помечается stuck."""
    bridge, store, _ = make_bridge()
    await registered(bridge, store, "run-fresh")
    store.age_last_activity("run-fresh", 59.0)  # внутри окна 60с

    expired = await bridge.sweep_stale()

    assert expired == []
    assert store.get("run-fresh")["state"] == "queued"


@pytest.mark.asyncio
async def test_sweep_stale_leaves_active_run_alone():
    """Acceptance: активный run (молчал 5с) не трогается."""
    bridge, store, _ = make_bridge()
    await registered(bridge, store, "run-live")
    store.age_last_activity("run-live", 5.0)

    expired = await bridge.sweep_stale()

    assert expired == []
    assert store.get("run-live")["state"] == "queued"


@pytest.mark.asyncio
async def test_sweep_stale_releases_resources_via_provider():
    """EXPIRED run освобождает ресурсы (provider.release_session_bundle, force)."""
    bridge, store, provider = make_bridge()
    await registered(bridge, store, "run-res")
    store.age_last_activity("run-res", 200.0)

    await bridge.sweep_stale()

    assert ("run-res", True) in provider.released


@pytest.mark.asyncio
async def test_sweep_stale_ignores_terminal_runs():
    """Sweep не должен трогать завершённые run'ы — только не-активные stale."""
    bridge, store, provider = make_bridge()
    await registered(bridge, store, "run-done")
    store.transition("run-done", "succeeded")  # терминальный статус
    store.age_last_activity("run-done", 500.0)

    expired = await bridge.sweep_stale()

    assert expired == []  # succeeded не в ACTIVE_STATES → не stale
    assert provider.released == []


@pytest.mark.asyncio
async def test_sweep_stale_survives_transition_error():
    """Один сбойный run не останавливает sweep остальных."""
    store = MemoryRunStore()
    provider = FakeProvider()
    lease_ctrl = LeaseController(default_lease_seconds=90.0)

    class OneBadRunStore(MemoryRunStore):
        def __init__(self) -> None:
            super().__init__()
            self.poison = False  # включается после регистрации run-bad

        def transition(self, run_id, new_status):
            if run_id == "run-bad" and self.poison:
                raise RuntimeError("poisoned record")
            return super().transition(run_id, new_status)

    store = OneBadRunStore()
    bridge = RunLeaseBridge(lease_ctrl, store, provider=provider,
                            lease_seconds=60.0, stale_after_seconds=60.0)

    await registered(bridge, store, "run-bad")
    await registered(bridge, store, "run-good")
    store.age_last_activity("run-bad", 200.0)
    store.age_last_activity("run-good", 200.0)
    store.poison = True  # отравляем только для sweep-фазы

    expired = await bridge.sweep_stale()

    assert "run-good" in expired
    assert ("run-good", True) in provider.released


# ── snapshot / интроспекция ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_snapshot_contains_runs_and_leases():
    bridge, store, _ = make_bridge()
    await registered(bridge, store, "run-s")

    snap = bridge.snapshot()

    assert snap["total_leases"] == 1
    assert "run-s" in snap["runs"]
    assert snap["runs"]["run-s"]["run_state"] == "queued"
    assert snap["stale_after_seconds"] == 60.0


# ── Docker label recovery ───────────────────────────────────────────────────

class _FakeProc:
    async def communicate(self):
        # docker ps --format: "session-id generation"
        return (b"run-restored-1 5\nrun-restored-2 2\n", b"")


@pytest.mark.asyncio
async def test_label_recovery_reconstructs_sessions(monkeypatch):
    """Acceptance: после рестарта контейнеры с com.prettyk.session-id
    восстанавливаются как lease'ы (через LeaseController._reconstruct_from_labels)."""

    async def _fake_exec(*args, **kwargs):
        return _FakeProc()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_exec)

    lease_ctrl = LeaseController(default_lease_seconds=90.0)
    await lease_ctrl._reconstruct_from_labels()

    recovered_1 = lease_ctrl.get("run-restored-1")
    recovered_2 = lease_ctrl.get("run-restored-2")
    assert recovered_1 is not None
    assert recovered_1.generation == 5
    assert recovered_2 is not None
    assert recovered_2.generation == 2
    assert not recovered_1.is_expired()


@pytest.mark.asyncio
async def test_label_recovery_docker_missing_is_safe(monkeypatch):
    """docker не установлен → reconstruction тихо пропускается, без исключения."""

    def _no_docker(*args, **kwargs):
        raise FileNotFoundError("docker")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _no_docker)

    lease_ctrl = LeaseController(default_lease_seconds=90.0)
    await lease_ctrl._reconstruct_from_labels()  # не должно бросить
    assert lease_ctrl.snapshot()["total"] == 0


# ── Совместимость с реальным run_state.py (Boss) ────────────────────────────

def test_boss_run_store_satisfies_protocol():
    """Реальный RunStore (run_state.py) удовлетворяет RunStoreProtocol моста.

    Проверяется структурно (наличие методов), без PostgreSQL-подключения:
    конструктор не вызывается, только класс.
    """
    from orchestrator.infra.run_lease import RunStoreProtocol
    from orchestrator.infra.run_state import RunStore

    assert issubclass(RunStore, RunStoreProtocol)


def test_to_state_normalizes_to_boss_enum():
    """_to_state('queued') → RunState.QUEUED (контракт Boss), а не сырая строка."""
    from orchestrator.infra.run_lease import _to_state
    from orchestrator.infra.run_state import RunState

    assert _to_state("queued") is RunState.QUEUED
    assert _to_state("expired") is RunState.EXPIRED


def test_run_id_of_accepts_boss_runstatus():
    """list_stale у Boss возвращает RunStatus-объекты — мост извлекает run_id."""
    from orchestrator.infra.run_lease import _run_id_of
    from orchestrator.infra.run_state import RunState, RunStatus

    status = RunStatus(run_id="run-boss", state=RunState.RUNNING)
    assert _run_id_of(status) == "run-boss"
    assert _run_id_of("plain-string-id") == "plain-string-id"
    assert _run_id_of({"run_id": "dict-id"}) == "dict-id"
    assert _run_id_of(None) is None
    assert _run_id_of(42) is None


# ── Полный жизненный цикл ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_full_lifecycle_register_heartbeat_silence_expire():
    """E2E моста: register → heartbeat → тишина 60+с → sweep → EXPIRED."""
    bridge, store, provider = make_bridge()
    await registered(bridge, store, "run-e2e")

    # Worker жив и работает
    assert bridge.heartbeat("run-e2e") == 2
    store.age_last_activity("run-e2e", 30.0)
    assert await bridge.sweep_stale() == []  # ещё жив (молчал 30с)

    # Worker замолчал
    store.age_last_activity("run-e2e", 200.0)
    expired = await bridge.sweep_stale()

    assert expired == ["run-e2e"]
    assert store.get("run-e2e")["state"] == "expired"
    assert ("run-e2e", True) in provider.released
