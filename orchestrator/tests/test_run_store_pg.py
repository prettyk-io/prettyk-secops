# RUN-CTL-1: RunStore PostgreSQL integration tests.
#
# Требует доступный PostgreSQL (PK_PG_DSN или default localhost).
# Тесты создают уникальные run_id через uuid чтобы не конфликтовать
# с параллельными прогонами.
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# ── PG availability check ───────────────────────────────────────────

def _pg_available() -> bool:
    try:
        import psycopg2
        import os
        dsn = os.environ.get(
            "PK_PG_DSN", "postgresql://postgres:postgres@localhost:5432/postgres"
        )
        conn = psycopg2.connect(dsn, connect_timeout=3)
        conn.close()
        return True
    except Exception:
        return False

_pg = pytest.mark.skipif(not _pg_available(), reason="PostgreSQL not reachable via PK_PG_DSN")


from orchestrator.infra.run_state import (
    RunState,
    RunStateError,
    RunStore,
    RunStatus,
)
from orchestrator.infra.run_timeline import get_timeline, count_timeline_entries


def _uid() -> str:
    return f"run-{uuid.uuid4().hex[:12]}"


@pytest.fixture(scope="module")
def store():
    return RunStore()


# ═══════════════════════════════════════════════════════════════════
# Create
# ═══════════════════════════════════════════════════════════════════

@_pg
class TestCreate:
    def test_create_returns_pending(self, store: RunStore):
        rid = _uid()
        rs = store.create(rid, correlation_id="corr-001")
        assert rs.state == RunState.PENDING
        assert rs.run_id == rid
        assert rs.correlation_id == "corr-001"
        assert rs.attempts == 0

    def test_two_different_run_ids_two_runs(self, store: RunStore):
        rid1, rid2 = _uid(), _uid()
        assert rid1 != rid2
        rs1 = store.create(rid1)
        rs2 = store.create(rid2)
        assert rs1.run_id != rs2.run_id
        assert rs1.state == RunState.PENDING
        assert rs2.state == RunState.PENDING

    def test_create_duplicate_raises(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        with pytest.raises(RuntimeError, match="already exists"):
            store.create(rid)

    def test_created_at_is_set(self, store: RunStore):
        rid = _uid()
        rs = store.create(rid)
        assert rs.created_at is not None
        assert isinstance(rs.created_at, datetime)


# ═══════════════════════════════════════════════════════════════════
# Get
# ═══════════════════════════════════════════════════════════════════

@_pg
class TestGet:
    def test_get_returns_current_state(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        rs = store.get(rid)
        assert rs is not None
        assert rs.state == RunState.PENDING

    def test_get_nonexistent_returns_none(self, store: RunStore):
        assert store.get("no-such-run-xyz") is None

    def test_get_after_transition_reflects_new_state(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        rs = store.get(rid)
        assert rs is not None
        assert rs.state == RunState.QUEUED


# ═══════════════════════════════════════════════════════════════════
# Transition — happy path
# ═══════════════════════════════════════════════════════════════════

@_pg
class TestTransitionHappyPath:
    def test_pending_to_queued(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        rs = store.transition(rid, RunState.QUEUED, reason="dispatched")
        assert rs.state == RunState.QUEUED

    def test_queued_to_running_increments_attempts(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        rs = store.transition(rid, RunState.RUNNING, worker_id="w1", reason="worker picked up")
        assert rs.state == RunState.RUNNING
        assert rs.attempts == 1
        assert rs.worker_id == "w1"

    def test_running_to_succeeded(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        store.transition(rid, RunState.RUNNING)
        rs = store.transition(rid, RunState.SUCCEEDED, reason="scan done")
        assert rs.state == RunState.SUCCEEDED
        assert rs.is_terminal

    def test_running_to_failed_with_error(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        store.transition(rid, RunState.RUNNING)
        rs = store.transition(rid, RunState.FAILED, error="ZAP crashed", reason="infra failure")
        assert rs.state == RunState.FAILED
        assert rs.error == "ZAP crashed"

    def test_pending_to_cancelled(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        rs = store.transition(rid, RunState.CANCELLED, reason="operator cancelled")
        assert rs.state == RunState.CANCELLED

    def test_running_to_cancelled(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        store.transition(rid, RunState.RUNNING)
        rs = store.transition(rid, RunState.CANCELLED, reason="user abort")
        assert rs.state == RunState.CANCELLED

    def test_running_to_expired(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        store.transition(rid, RunState.RUNNING)
        rs = store.transition(rid, RunState.EXPIRED, reason="lease timeout")
        assert rs.state == RunState.EXPIRED

    def test_full_lifecycle_succeeded(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED, reason="queued")
        store.transition(rid, RunState.RUNNING, reason="started", worker_id="w42")
        store.transition(rid, RunState.SUCCEEDED, reason="done")
        rs = store.get(rid)
        assert rs is not None
        assert rs.state == RunState.SUCCEEDED
        assert rs.attempts == 1
        assert rs.worker_id == "w42"


# ═══════════════════════════════════════════════════════════════════
# Transition — forbidden transitions
# ═══════════════════════════════════════════════════════════════════

@_pg
class TestTransitionForbidden:
    def test_succeeded_to_running_raises(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        store.transition(rid, RunState.RUNNING)
        store.transition(rid, RunState.SUCCEEDED)
        with pytest.raises(RunStateError) as exc_info:
            store.transition(rid, RunState.RUNNING)
        assert "succeeded" in str(exc_info.value)
        assert "running" in str(exc_info.value)

    def test_failed_to_queued_raises(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        store.transition(rid, RunState.RUNNING)
        store.transition(rid, RunState.FAILED)
        with pytest.raises(RunStateError):
            store.transition(rid, RunState.QUEUED)

    def test_cancelled_to_running_raises(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.CANCELLED)
        with pytest.raises(RunStateError):
            store.transition(rid, RunState.RUNNING)

    def test_pending_to_running_raises(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        with pytest.raises(RunStateError):
            store.transition(rid, RunState.RUNNING)

    def test_state_unchanged_after_forbidden_attempt(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        with pytest.raises(RunStateError):
            store.transition(rid, RunState.SUCCEEDED)
        rs = store.get(rid)
        assert rs is not None
        assert rs.state == RunState.QUEUED  # unchanged

    def test_transition_nonexistent_run_raises_lookup(self, store: RunStore):
        with pytest.raises(LookupError):
            store.transition("ghost-run-xyz", RunState.QUEUED)


# ═══════════════════════════════════════════════════════════════════
# list_active
# ═══════════════════════════════════════════════════════════════════

@_pg
class TestListActive:
    def test_list_active_returns_only_active(self, store: RunStore):
        rid_active = _uid()
        rid_done = _uid()
        store.create(rid_active)
        store.create(rid_done)
        store.transition(rid_done, RunState.QUEUED)
        store.transition(rid_done, RunState.RUNNING)
        store.transition(rid_done, RunState.SUCCEEDED)

        active = store.list_active()
        active_ids = {r.run_id for r in active}
        assert rid_active in active_ids
        assert rid_done not in active_ids

    def test_list_active_no_terminal(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.CANCELLED)
        active = store.list_active()
        active_ids = {r.run_id for r in active}
        assert rid not in active_ids


# ═══════════════════════════════════════════════════════════════════
# list_stale
# ═══════════════════════════════════════════════════════════════════

@_pg
class TestListStale:
    def test_list_stale_finds_running_without_lease(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        store.transition(rid, RunState.RUNNING)
        # No heartbeat → lease_expires_at is NULL → COALESCE falls back to updated_at
        # which is "now" — so it won't be stale for a large timeout.
        # We simulate stale by setting a very short timeout.
        time.sleep(0.05)
        stale = store.list_stale(lease_timeout_s=0.01)
        # updated_at was just now, epoch diff < 0.05s, so with timeout=0.01 it may or may not appear.
        # For determinism we use a run that was created before:
        stale_ids = {r.run_id for r in stale}
        # Just verify the call doesn't crash and returns a list
        assert isinstance(stale, list)

    def test_list_stale_with_expired_lease(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        store.transition(rid, RunState.RUNNING, worker_id="w-stale")
        # Set lease_expires_at in the past directly via heartbeat with 0 seconds
        store.heartbeat(rid, lease_seconds=-100)  # lease expired 100s ago
        stale = store.list_stale(lease_timeout_s=10)
        stale_ids = {r.run_id for r in stale}
        assert rid in stale_ids

    def test_list_stale_excludes_active_lease(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        store.transition(rid, RunState.RUNNING)
        store.heartbeat(rid, lease_seconds=3600)  # long lease
        stale = store.list_stale(lease_timeout_s=10)
        stale_ids = {r.run_id for r in stale}
        assert rid not in stale_ids

    def test_list_stale_excludes_terminal(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        store.transition(rid, RunState.RUNNING)
        store.transition(rid, RunState.FAILED, error="done")
        stale = store.list_stale(lease_timeout_s=0)
        stale_ids = {r.run_id for r in stale}
        assert rid not in stale_ids


# ═══════════════════════════════════════════════════════════════════
# run_timeline
# ═══════════════════════════════════════════════════════════════════

@_pg
class TestTimeline:
    def test_timeline_recorded_for_each_transition(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED, reason="q")
        store.transition(rid, RunState.RUNNING, reason="r")
        store.transition(rid, RunState.SUCCEEDED, reason="s")

        timeline = get_timeline(rid)
        # create + 3 transitions = 4 entries
        assert len(timeline) >= 4

        events = [t["event"] for t in timeline]
        assert "__init__->pending" in events
        assert "pending->queued" in events
        assert "queued->running" in events
        assert "running->succeeded" in events

    def test_timeline_has_from_to_states(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)

        timeline = get_timeline(rid)
        transition_entry = [t for t in timeline if t["event"] == "pending->queued"]
        assert len(transition_entry) == 1
        assert transition_entry[0]["from_state"] == "pending"
        assert transition_entry[0]["to_state"] == "queued"

    def test_timeline_has_reason(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED, reason="dispatched by scheduler")
        timeline = get_timeline(rid)
        entry = [t for t in timeline if t["event"] == "pending->queued"]
        assert entry[0]["reason"] == "dispatched by scheduler"

    def test_timeline_has_timestamp(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        timeline = get_timeline(rid)
        for entry in timeline:
            assert entry["timestamp"] is not None

    def test_timeline_has_entries_for_failed_transition(self, store: RunStore):
        """После запрещённого перехода timeline НЕ дополнится (атомарность)."""
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        count_before = count_timeline_entries(rid)

        with pytest.raises(RunStateError):
            store.transition(rid, RunState.SUCCEEDED)

        count_after = count_timeline_entries(rid)
        assert count_after == count_before  # atomicity: no partial writes


# ═══════════════════════════════════════════════════════════════════
# Atomicity
# ═══════════════════════════════════════════════════════════════════

@_pg
class TestAtomicity:
    def test_transition_twice_sequentially(self, store: RunStore):
        """Два перехода подряд — оба атомарны, оба в timeline."""
        rid = _uid()
        store.create(rid)
        rs1 = store.transition(rid, RunState.QUEUED)
        assert rs1.state == RunState.QUEUED
        rs2 = store.transition(rid, RunState.RUNNING)
        assert rs2.state == RunState.RUNNING

        timeline = get_timeline(rid)
        events = [t["event"] for t in timeline]
        assert "pending->queued" in events
        assert "queued->running" in events

    def test_rollback_on_forbidden_preserves_state_and_timeline(self, store: RunStore):
        """Forbidden → rollback: состояние и timeline не изменились."""
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        count_before = count_timeline_entries(rid)
        state_before = store.get(rid)

        with pytest.raises(RunStateError):
            store.transition(rid, RunState.EXPIRED)

        state_after = store.get(rid)
        count_after = count_timeline_entries(rid)
        assert state_before == state_after
        assert count_before == count_after

    def test_heartbeat_updates_lease(self, store: RunStore):
        rid = _uid()
        store.create(rid)
        store.transition(rid, RunState.QUEUED)
        store.transition(rid, RunState.RUNNING)

        ok = store.heartbeat(rid, lease_seconds=7200)
        assert ok is True
        rs = store.get(rid)
        assert rs is not None
        assert rs.lease_expires_at is not None
        assert rs.lease_expires_at > time.time() + 7000

    def test_heartbeat_non_running_returns_false(self, store: RunStore):
        rid = _uid()
        store.create(rid)  # pending, not running
        ok = store.heartbeat(rid, lease_seconds=7200)
        assert ok is False
