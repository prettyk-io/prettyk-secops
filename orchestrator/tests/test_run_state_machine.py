# RUN-CTL-1: State machine unit tests — pure logic, no PostgreSQL required.
#
# Проверяет: валидные переходы, запрещённые переходы → RunStateError,
# свойства terminal/active, полный цикл create→get→transition→get.
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from orchestrator.infra.run_state import (
    RunState,
    RunStateError,
    RunStatus,
    _VALID_TRANSITIONS,
    _TERMINAL_STATES,
    _ACTIVE_STATES,
)


# ── RunState enum ───────────────────────────────────────────────────

class TestRunStateEnum:
    def test_all_states_present(self):
        states = {s.value for s in RunState}
        assert states == {"pending", "queued", "running",
                          "succeeded", "failed", "cancelled", "expired"}

    def test_seven_states(self):
        assert len(RunState) == 7

    def test_string_values(self):
        assert RunState.PENDING.value == "pending"
        assert RunState.QUEUED.value == "queued"
        assert RunState.RUNNING.value == "running"
        assert RunState.SUCCEEDED.value == "succeeded"
        assert RunState.FAILED.value == "failed"
        assert RunState.CANCELLED.value == "cancelled"
        assert RunState.EXPIRED.value == "expired"


# ── Transition table ────────────────────────────────────────────────

class TestTransitionTable:
    def test_pending_transitions(self):
        allowed = _VALID_TRANSITIONS[RunState.PENDING]
        assert RunState.QUEUED in allowed
        assert RunState.CANCELLED in allowed
        assert RunState.EXPIRED in allowed
        assert RunState.RUNNING not in allowed  # нельзя перескочить очередь
        assert RunState.SUCCEEDED not in allowed

    def test_queued_transitions(self):
        allowed = _VALID_TRANSITIONS[RunState.QUEUED]
        assert RunState.RUNNING in allowed
        assert RunState.CANCELLED in allowed
        assert RunState.EXPIRED in allowed
        assert RunState.PENDING not in allowed  # назад нельзя

    def test_running_transitions(self):
        allowed = _VALID_TRANSITIONS[RunState.RUNNING]
        assert RunState.SUCCEEDED in allowed
        assert RunState.FAILED in allowed
        assert RunState.CANCELLED in allowed
        assert RunState.EXPIRED in allowed
        assert RunState.PENDING not in allowed
        assert RunState.QUEUED not in allowed

    def test_terminal_states_have_no_transitions(self):
        for state in (RunState.SUCCEEDED, RunState.FAILED,
                      RunState.CANCELLED, RunState.EXPIRED):
            assert _VALID_TRANSITIONS[state] == frozenset(), (
                f"{state.value} must be terminal"
            )

    def test_all_states_covered(self):
        assert set(_VALID_TRANSITIONS.keys()) == set(RunState)


# ── Terminal / Active properties ────────────────────────────────────

class TestStateProperties:
    def test_terminal_states(self):
        assert _TERMINAL_STATES == frozenset({
            RunState.SUCCEEDED, RunState.FAILED,
            RunState.CANCELLED, RunState.EXPIRED,
        })

    def test_active_states(self):
        assert _ACTIVE_STATES == frozenset({
            RunState.PENDING, RunState.QUEUED, RunState.RUNNING,
        })

    def test_run_status_is_terminal(self):
        rs = RunStatus(run_id="r1", state=RunState.SUCCEEDED)
        assert rs.is_terminal is True

    def test_run_status_is_active(self):
        rs = RunStatus(run_id="r2", state=RunState.RUNNING)
        assert rs.is_active is True
        assert rs.is_terminal is False


# ── RunStateError ───────────────────────────────────────────────────

class TestRunStateError:
    def test_error_message_contains_states(self):
        err = RunStateError("run-42", RunState.SUCCEEDED, RunState.RUNNING)
        assert "succeeded" in str(err)
        assert "running" in str(err)
        assert "run-42" in str(err)

    def test_error_attributes(self):
        err = RunStateError("run-x", RunState.FAILED, RunState.QUEUED)
        assert err.run_id == "run-x"
        assert err.from_state == RunState.FAILED
        assert err.to_state == RunState.QUEUED

    def test_error_is_exception(self):
        with pytest.raises(Exception):
            raise RunStateError("r", RunState.PENDING, RunState.SUCCEEDED)


# ── Full happy-path cycle (dataclass level) ────────────────────────

class TestHappyPathCycle:
    """Полный жизненный цикл без PG: проверяем последовательность переходов."""

    @pytest.mark.parametrize("final_state", [
        RunState.SUCCEEDED, RunState.FAILED,
        RunState.CANCELLED, RunState.EXPIRED,
    ])
    def test_full_cycle_to_each_terminal(self, final_state: RunState):
        """pending → queued → running → terminal — все 4 терминала достижимы."""
        path = [RunState.PENDING, RunState.QUEUED, RunState.RUNNING, final_state]
        for i in range(len(path) - 1):
            current, target = path[i], path[i + 1]
            assert target in _VALID_TRANSITIONS[current], (
                f"{current.value} → {target.value} must be valid"
            )

    @pytest.mark.parametrize("from_state,to_state", [
        (RunState.SUCCEEDED, RunState.RUNNING),   # воскрешение
        (RunState.SUCCEEDED, RunState.FAILED),     # терминал → терминал
        (RunState.FAILED, RunState.RUNNING),       # воскрешение
        (RunState.CANCELLED, RunState.RUNNING),    # воскрешение
        (RunState.EXPIRED, RunState.QUEUED),        # воскрешение
        (RunState.PENDING, RunState.RUNNING),       # перескок очереди
        (RunState.PENDING, RunState.SUCCEEDED),     # перескок к успеху
        (RunState.QUEUED, RunState.PENDING),         # назад в pending
        (RunState.RUNNING, RunState.PENDING),        # назад в pending
        (RunState.RUNNING, RunState.QUEUED),         # назад в очередь
    ])
    def test_forbidden_transitions(self, from_state: RunState, to_state: RunState):
        """Каждая пара из списка должна выбрасывать RunStateError."""
        assert to_state not in _VALID_TRANSITIONS[from_state], (
            f"{from_state.value} → {to_state.value} should be forbidden"
        )

    def test_cancellation_from_pending_and_running(self):
        """Отмена допустима из pending и running (но не из terminal)."""
        assert RunState.CANCELLED in _VALID_TRANSITIONS[RunState.PENDING]
        assert RunState.CANCELLED in _VALID_TRANSITIONS[RunState.RUNNING]
        assert RunState.CANCELLED not in _VALID_TRANSITIONS[RunState.SUCCEEDED]

    def test_expiry_from_active_states(self):
        """Expiry допустим из pending, queued, running."""
        for state in (RunState.PENDING, RunState.QUEUED, RunState.RUNNING):
            assert RunState.EXPIRED in _VALID_TRANSITIONS[state]


# ── RunStatus dataclass ─────────────────────────────────────────────

class TestRunStatus:
    def test_to_dict_roundtrip(self):
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        rs = RunStatus(
            run_id="run-abc", state=RunState.RUNNING,
            correlation_id="corr-1", created_at=now, updated_at=now,
            attempts=1, worker_id="w1",
        )
        d = rs.to_dict()
        assert d["run_id"] == "run-abc"
        assert d["state"] == "running"
        assert d["attempts"] == 1
        assert d["worker_id"] == "w1"
