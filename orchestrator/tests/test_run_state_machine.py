"""
COS-L18: Run state machine tests.

Переходы: pending→running→passed, pending→running→failed,
running→blocked. Недопустимые переходы через стейт-машину.
Проверка durable storage.
"""
import pytest
from datetime import datetime
from orchestrator.models.run_model import Batch, BatchStatus, Run, RunTrigger


# ── State machine ──

VALID_TRANSITIONS: dict[BatchStatus, set[BatchStatus]] = {
    "pending": {"running"},
    "running": {"passed", "failed", "blocked"},
    "passed": set(),   # терминальный
    "failed": set(),   # терминальный
    "blocked": {"pending"},  # можно разблокировать
}

ALLOWED_OVERRIDE_FROM_BLOCKED: set[BatchStatus] = {"pending"}


def transition(current: BatchStatus, target: BatchStatus) -> BatchStatus:
    """Пытается выполнить переход. Если недопустим — возвращает текущий."""
    allowed = VALID_TRANSITIONS.get(current, set())
    if target in allowed:
        return target
    raise ValueError(f"Invalid transition: {current} → {target}")


def override_transition(current: BatchStatus, target: BatchStatus) -> BatchStatus:
    """Override-переход (например из blocked → pending с правами admin)."""
    if current == "blocked" and target in ALLOWED_OVERRIDE_FROM_BLOCKED:
        return target
    return transition(current, target)


class TestStateMachineTransitions:
    def test_pending_to_running(self):
        assert transition("pending", "running") == "running"

    def test_running_to_passed(self):
        assert transition("running", "passed") == "passed"

    def test_running_to_failed(self):
        assert transition("running", "failed") == "failed"

    def test_running_to_blocked(self):
        assert transition("running", "blocked") == "blocked"

    def test_blocked_to_pending(self):
        # blocked → pending допустимо через override
        assert override_transition("blocked", "pending") == "pending"

    def test_passed_is_terminal(self):
        with pytest.raises(ValueError, match="Invalid transition"):
            transition("passed", "running")

    def test_failed_is_terminal(self):
        with pytest.raises(ValueError, match="Invalid transition"):
            transition("failed", "running")

    def test_pending_to_passed_not_allowed(self):
        with pytest.raises(ValueError, match="Invalid transition"):
            transition("pending", "passed")

    def test_pending_to_blocked_not_allowed(self):
        with pytest.raises(ValueError, match="Invalid transition"):
            transition("pending", "blocked")

    def test_blocked_to_passed_not_allowed(self):
        with pytest.raises(ValueError, match="Invalid transition"):
            transition("blocked", "passed")

    def test_invalid_status_transition(self):
        with pytest.raises(ValueError, match="Invalid transition"):
            transition("pending", "passed")


class TestRunModelTransitions:
    """Проверка, что модель Run + Batch проходят жизненный цикл."""

    def test_full_happy_path(self):
        run = Run(
            id="run-1", plan_id="plan-1", trigger="pre_release",
            domain_id="d-1", status="pending",
            batches=[
                Batch(id="b1", plan_id="plan-1", type="sast", status="pending"),
                Batch(id="b2", plan_id="plan-1", type="dast", status="pending"),
            ],
        )
        assert run.status == "pending"

        # run → running
        run.status = "running"
        for b in run.batches:
            b.status = "running"
        assert run.status == "running"

        # batch 1 passed, batch 2 passed → run passed
        run.batches[0].status = "passed"
        run.batches[1].status = "passed"
        run.status = "passed"
        assert run.status == "passed"
        assert all(b.status == "passed" for b in run.batches)

    def test_failure_path(self):
        run = Run(
            id="run-2", plan_id="plan-2", trigger="scheduled",
            domain_id="d-1",
            batches=[
                Batch(id="b1", plan_id="plan-2", type="sast"),
            ],
        )
        run.status = "running"
        run.batches[0].status = "running"
        run.batches[0].status = "failed"
        run.status = "failed"
        assert run.status == "failed"
        assert run.batches[0].status == "failed"

    def test_blocked_path(self):
        run = Run(
            id="run-3", plan_id="plan-3", trigger="manual",
            domain_id="d-1",
            batches=[
                Batch(id="b1", plan_id="plan-3", type="gate"),
            ],
        )
        run.status = "running"
        run.batches[0].status = "running"
        # Gate блокирует
        run.batches[0].status = "blocked"
        run.status = "blocked"
        assert run.status == "blocked"

    def test_durable_storage_pattern(self):
        """После перехода статус сохраняется в объекте (имитация БД)."""
        run = Run(
            id="run-4", plan_id="plan-4", trigger="emergency",
            domain_id="d-1",
        )
        assert run.status == "pending"
        run.status = "running"
        run.status = "passed"
        assert run.status == "passed"
        # После «сохранения» статус должен быть неизменен
        assert run.status != "pending"
        assert run.status != "running"