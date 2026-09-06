# RUN-CTL-6: Тесты execute_with_retry.
import time

import pytest

from orchestrator.infra.retry_executor import (
    NoopRunStore,
    RetryExhausted,
    ValidationFailed,
    execute_with_retry,
)
from orchestrator.infra.retry_policy import RetryPolicy


class FakeRunStore:
    """Fake RunStore: пишет transitions и timeline в память."""

    def __init__(self) -> None:
        self.transitions: list[tuple[str, str, str | None]] = []
        self.timeline: list[tuple[str, str]] = []

    def transition(self, run_id: str, status: str, error: str | None = None) -> None:
        self.transitions.append((run_id, status, error))

    def timeline_append(self, run_id: str, event: str, payload: dict | None = None) -> None:
        self.timeline.append((run_id, event))


def fast_policy(backoff_s: float = 0.0, max_attempts: int = 3) -> RetryPolicy:
    """Политика с нулевым backoff для быстрых тестов."""
    return RetryPolicy(max_attempts=max_attempts, backoff_s=backoff_s)


class TestExecuteWithRetry:

    def test_infra_failure_then_retry_then_success(self):
        """fn падает INFRASTRUCTURE → retry → success (2 попытки всего)."""
        store = FakeRunStore()
        calls = {"n": 0}

        def flaky():
            calls["n"] += 1
            if calls["n"] == 1:
                raise TimeoutError("worker vanished")
            return "ok"

        result = execute_with_retry(
            "run-retry-ok",
            flaky,
            policy=fast_policy(backoff_s=0.01),
            store=store,
        )
        assert result == "ok"
        assert calls["n"] == 2
        # Последний transition — SUCCEEDED
        assert store.transitions[-1][1] == "SUCCEEDED"

    def test_infra_three_failures_fails_max_retries(self):
        """fn падает INFRASTRUCTURE 3 раза → FAILED (max retries)."""
        store = FakeRunStore()
        calls = {"n": 0}

        def always_infra():
            calls["n"] += 1
            raise TimeoutError("connection lost")

        with pytest.raises(RetryExhausted) as exc_info:
            execute_with_retry(
                "run-max-retries",
                always_infra,
                policy=fast_policy(backoff_s=0.001),
                store=store,
            )
        assert calls["n"] == 3
        assert exc_info.value.attempts == 3
        # Последний transition — FAILED с error="max retries"
        assert store.transitions[-1][1] == "FAILED"
        assert store.transitions[-1][2] == "max retries"

    def test_validation_fails_instantly_no_retry(self):
        """fn падает VALIDATION → мгновенно FAILED, 0 retry."""
        store = FakeRunStore()
        calls = {"n": 0}

        def invalid_manifest():
            calls["n"] += 1
            raise ValueError("invalid manifest")

        with pytest.raises(ValidationFailed):
            execute_with_retry(
                "run-validation",
                invalid_manifest,
                policy=fast_policy(),
                store=store,
            )
        assert calls["n"] == 1        # 0 retries
        assert store.transitions[-1][1] == "FAILED"
        assert "VALIDATION" in (store.transitions[-1][2] or "")

    def test_target_fails_instantly_no_retry(self):
        """fn падает TARGET → мгновенно FAILED."""
        store = FakeRunStore()
        calls = {"n": 0}

        def target_down():
            calls["n"] += 1
            raise ConnectionRefusedError()

        with pytest.raises(ValidationFailed) as exc_info:
            execute_with_retry(
                "run-target",
                target_down,
                policy=fast_policy(),
                store=store,
            )
        assert calls["n"] == 1
        assert exc_info.value.error_class == "TARGET"
        assert store.transitions[-1][1] == "FAILED"

    def test_backoff_is_respected_between_attempts(self):
        """Backoff 30с соблюдается между попытками (проверяем через счётчик sleep)."""
        store = FakeRunStore()
        sleeps: list[float] = []
        calls = {"n": 0}

        def fail_once():
            calls["n"] += 1
            if calls["n"] == 1:
                raise TimeoutError("conn")
            return "ok"

        # Подменяем sleep → пишем в список, не ждём
        result = execute_with_retry(
            "run-backoff",
            fail_once,
            policy=RetryPolicy(max_attempts=3, backoff_s=30.0),
            store=store,
            sleep_fn=lambda s: sleeps.append(s),
        )
        assert result == "ok"
        assert sleeps == [30.0]        # ровно один backoff 30с

    def test_timeline_records_attempts(self):
        """Каждая попытка пишется в run_timeline: event="retry_attempt_N"."""
        store = FakeRunStore()

        def fail_twice():
            raise TimeoutError("x")

        with pytest.raises(RetryExhausted):
            execute_with_retry(
                "run-timeline",
                fail_twice,
                policy=fast_policy(backoff_s=0.001, max_attempts=3),
                store=store,
            )
        events = [e for _, e in store.timeline if e.startswith("retry_attempt_")]
        assert events == ["retry_attempt_1", "retry_attempt_2", "retry_attempt_3"]

    def test_noop_store_used_when_run_state_missing(self):
        """Без store → мягкий NoopRunStore (run_state.py ещё не готов)."""
        def ok_fn():
            return 42

        result = execute_with_retry("run-noop", ok_fn, policy=fast_policy())
        assert result == 42

    def test_unknown_error_fails_without_retry(self):
        """UNKNOWN (fail-closed) → мгновенный fail, без retry."""
        store = FakeRunStore()
        calls = {"n": 0}

        class WeirdError(Exception):
            pass

        def weird():
            calls["n"] += 1
            raise WeirdError("something else entirely")

        with pytest.raises(WeirdError):
            execute_with_retry(
                "run-unknown",
                weird,
                policy=fast_policy(),
                store=store,
            )
        assert calls["n"] == 1
        assert store.transitions[-1][1] == "FAILED"


# Fixtures для тестов (замыкания с корректными именами)
def invalid_manifest():
    raise ValueError("invalid manifest structure")


def weird_error():
    raise RuntimeError("unforeseen")


# Тест, что fast_policy не обязателен — RetryPolicy default работает
def test_default_policy_is_30s_backoff_3_attempts():
    pol = RetryPolicy()
    assert pol.max_attempts == 3
    assert pol.backoff_s == 30.0


def test_retry_exhausted_attributes():
    err = RetryExhausted("run-x", 3, TimeoutError("last"))
    assert err.run_id == "run-x"
    assert err.attempts == 3
    assert "max retries (3)" in str(err)
