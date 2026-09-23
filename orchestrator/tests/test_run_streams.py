# RUN-CTL-5: тесты RunStreamCoordinator — Valkey Streams + Consumer Groups.
#
# Стратегия: fakeredis — полноценная in-memory реализация Streams-команд
# (XREADGROUP / XACK / XPENDING / XAUTOCLAIM). Это не мок: та же семантика
# сообщений, что у живого Valkey 8. Смысловой сдвиг времени idle в тестах
# не эмулируем — механику перехвата проверяем min_idle_ms=1, а окно 60с
# зафиксировано константой DEFAULT_MIN_IDLE_MS (unit-проверка контракта).
from __future__ import annotations

import time

import fakeredis
import pytest

from orchestrator.infra.run_streams import (
    DEFAULT_MIN_IDLE_MS,
    DEFAULT_STREAM_PREFIX,
    RunStreamCoordinator,
)


@pytest.fixture()
def client():
    return fakeredis.FakeStrictRedis()


@pytest.fixture()
def coord(client):
    return RunStreamCoordinator(client)


STREAM = "runs"
GROUP = "run-workers"


def _enqueue_run(coord, run_id="run-1", target="http://juice.local"):
    return coord.enqueue(STREAM, {"run_id": run_id, "target": target})


# ── Consumer groups ─────────────────────────────────────────────────────────

def test_create_consumer_group_created(coord):
    """Acceptance: create_consumer_group → группа создана."""
    assert coord.create_consumer_group(STREAM, GROUP) is True
    groups = coord._client.xinfo_groups(coord.full_key(STREAM))
    # fakeredis/redis-py: ключи str, значения bytes
    assert any(g["name"] == GROUP.encode() for g in groups)


def test_create_consumer_group_idempotent(coord):
    """Повторное создание той же группы — False, без исключения."""
    assert coord.create_consumer_group(STREAM, GROUP) is True
    assert coord.create_consumer_group(STREAM, GROUP) is False


def test_all_stream_keys_have_prettyk_prefix(coord, client):
    """Acceptance: все Streams-ключи с префиксом prettyk:run:."""
    coord.create_consumer_group(STREAM, GROUP)
    _enqueue_run(coord)

    keys = client.keys("*")
    assert keys, "streams должны существовать"
    assert all(k.decode().startswith("prettyk:run:") for k in keys)
    assert coord.full_key(STREAM) == "prettyk:run:runs"


def test_default_min_idle_matches_lease_window():
    """Контракт: окно перехвата = 60с, согласовано с RunLeaseBridge."""
    assert DEFAULT_MIN_IDLE_MS == 60_000


# ── XADD / XREADGROUP ───────────────────────────────────────────────────────

def test_worker_reads_new_message_via_xreadgroup(coord, client):
    """Acceptance: XREADGROUP → worker читает сообщение."""
    coord.create_consumer_group(STREAM, GROUP)
    mid = _enqueue_run(coord, run_id="run-read")

    messages = coord.read_new(STREAM, GROUP, "worker-1")

    assert len(messages) == 1
    got_mid, payload = messages[0]
    got_id = got_mid.decode() if isinstance(got_mid, bytes) else str(got_mid)
    want_id = mid.decode() if isinstance(mid, bytes) else str(mid)
    assert got_id == want_id
    assert payload["run_id"] == "run-read"
    assert payload["target"] == "http://juice.local"


def test_message_delivered_to_exactly_one_consumer(coord):
    """Два worker'а в группе: сообщение получает ровно один (не дублируется)."""
    coord.create_consumer_group(STREAM, GROUP)
    _enqueue_run(coord, run_id="run-solo")

    got_1 = coord.read_new(STREAM, GROUP, "worker-1")
    got_2 = coord.read_new(STREAM, GROUP, "worker-2")

    total = len(got_1) + len(got_2)
    assert total == 1, "одно задание не должно доставаться двум worker'ам"
    winner = got_1 or got_2
    assert winner[0][1]["run_id"] == "run-solo"


# ── XACK / XPENDING ─────────────────────────────────────────────────────────

def test_xack_confirms_message(coord):
    """Acceptance: XACK подтверждает сообщение (PEL группы пустеет)."""
    coord.create_consumer_group(STREAM, GROUP)
    _enqueue_run(coord)

    messages = coord.read_new(STREAM, GROUP, "worker-1")
    mid, _payload = messages[0]

    assert coord.ack(STREAM, GROUP, mid) == 1
    assert coord.pending_summary(STREAM, GROUP)["pending"] == 0


def test_unacked_message_visible_in_xpending(coord):
    """Acceptance: XPENDING показывает непризнанные сообщения."""
    coord.create_consumer_group(STREAM, GROUP)
    _enqueue_run(coord)

    coord.read_new(STREAM, GROUP, "worker-1")  # прочитано, но не ACK

    summary = coord.pending_summary(STREAM, GROUP)
    assert summary["pending"] == 1
    assert summary["min"] is not None


def test_pending_by_consumer_counts_per_worker(coord):
    coord.create_consumer_group(STREAM, GROUP)
    _enqueue_run(coord, run_id="run-a")
    _enqueue_run(coord, run_id="run-b")

    coord.read_new(STREAM, GROUP, "worker-1", count=1)
    coord.read_new(STREAM, GROUP, "worker-2", count=1)

    assert coord.pending_by_consumer(STREAM, GROUP, "worker-1") == 1
    assert coord.pending_by_consumer(STREAM, GROUP, "worker-2") == 1


# ── XAUTOCLAIM: перехват зависших заданий ───────────────────────────────────

def test_xautoclaim_takes_over_stale_message(coord):
    """Acceptance: XCLAIM/XAUTOCLAIM → другой worker перехватывает задание."""
    coord.create_consumer_group(STREAM, GROUP)
    _enqueue_run(coord, run_id="run-stale")

    # worker-1 прочитал задание и «замолчал» (не ACK)
    coord.read_new(STREAM, GROUP, "worker-1")
    assert coord.pending_by_consumer(STREAM, GROUP, "worker-1") == 1

    # Idle должен накопиться реальным временем: delivery была <1ms назад.
    time.sleep(0.05)  # 50ms >> min_idle 1ms

    # worker-2 перехватывает сообщения, idle которых > 1ms
    claimed = coord.claim_stale(STREAM, GROUP, "worker-2", min_idle_ms=1)

    assert len(claimed) == 1
    claimed_mid, payload = claimed[0]
    assert payload["run_id"] == "run-stale"
    # Задание теперь в PEL worker-2, а не worker-1
    assert coord.pending_by_consumer(STREAM, GROUP, "worker-2") == 1
    assert coord.pending_by_consumer(STREAM, GROUP, "worker-1") == 0


def test_xautoclaim_skips_fresh_messages(coord):
    """Свежие сообщения (idle < min_idle) не перехватываются — worker ещё жив."""
    coord.create_consumer_group(STREAM, GROUP)
    _enqueue_run(coord, run_id="run-fresh")

    coord.read_new(STREAM, GROUP, "worker-1")  # только что прочитано

    claimed = coord.claim_stale(STREAM, GROUP, "worker-2", min_idle_ms=60_000)
    assert claimed == []
    assert coord.pending_by_consumer(STREAM, GROUP, "worker-1") == 1


def test_claimed_message_not_delivered_twice_before_ack(coord):
    """Перехваченное сообщение числится за новым consumer'ом: третий worker
    при XAUTOCLAIM не получит его повторно, пока нет ACK и idle мал."""
    coord.create_consumer_group(STREAM, GROUP)
    _enqueue_run(coord, run_id="run-claim-once")

    coord.read_new(STREAM, GROUP, "worker-1")
    time.sleep(0.05)  # idle накопился до порога перехвата
    claimed = coord.claim_stale(STREAM, GROUP, "worker-2", min_idle_ms=1)
    assert len(claimed) == 1

    # worker-3 пытается перехватить то же самое, но idle пересчитывается с
    # момента последней доставки — сообщение не дублируется.
    claimed_again = coord.claim_stale(STREAM, GROUP, "worker-3", min_idle_ms=60_000)
    assert claimed_again == []


# ── Полный цикл worker'а ────────────────────────────────────────────────────

def test_full_cycle_enqueue_read_process_ack(coord):
    """Acceptance: полный цикл read → process → ack, PEL пуст."""
    coord.create_consumer_group(STREAM, GROUP)
    mid = _enqueue_run(coord, run_id="run-cycle")

    # worker читает
    messages = coord.read_new(STREAM, GROUP, "worker-1")
    assert [p["run_id"] for _, p in messages] == ["run-cycle"]

    # …выполняет run (heartbeat в RunLeaseBridge — вне этого теста)…

    # подтверждает
    assert coord.ack(STREAM, GROUP, mid) == 1
    assert coord.pending_summary(STREAM, GROUP)["pending"] == 0


def test_worker_resumes_own_pending_after_restart(coord):
    """Worker после рестарта дочитывает СВОИ недоделанные сообщения (id '0')."""
    coord.create_consumer_group(STREAM, GROUP)
    _enqueue_run(coord, run_id="run-restart")

    before = coord.read_new(STREAM, GROUP, "worker-1")
    assert len(before) == 1

    # «Рестарт»: тот же consumer снова читает, но с id '0' (read_pending)
    resumed = coord.read_pending(STREAM, GROUP, "worker-1")
    assert len(resumed) == 1
    assert resumed[0][1]["run_id"] == "run-restart"


def test_claim_then_ack_completes_handover(coord):
    """Перехват → обработка → ACK новым worker'ом: PEL группы пустеет."""
    coord.create_consumer_group(STREAM, GROUP)
    _enqueue_run(coord, run_id="run-handover")

    coord.read_new(STREAM, GROUP, "dead-worker")  # замолчал

    time.sleep(0.05)  # idle накопился реальным временем

    claimed = coord.claim_stale(STREAM, GROUP, "rescuer", min_idle_ms=1)
    claimed_mid, payload = claimed[0]
    assert payload["run_id"] == "run-handover"

    assert coord.ack(STREAM, GROUP, claimed_mid) == 1
    assert coord.pending_summary(STREAM, GROUP)["pending"] == 0
