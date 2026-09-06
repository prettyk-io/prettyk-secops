# RUN-CTL-6: Retry executor — execute_with_retry с классификацией ошибок.
"""
Обёртка вокруг функции run:
  - fn успех → RunStore.transition(SUCCEEDED)
  - fn падает → classify → should_retry?
      Да → ждать backoff_s → повторить (attempt + 1)
      Нет → RunStore.transition(FAILED, error=reason)
  - Исчерпаны попытки → RunStore.transition(FAILED, error="max retries")
  - Каждая попытка → run_timeline: event="retry_attempt_N"

Зависимость от run_state.py (контракт Boss):
  RunStore.transition(run_id, status, error=...)   # Duck-typed
  RunStore.timeline_append(run_id, event=...)      # Duck-typed, optional
  RunStore мягкий: если run_state.py ещё не готов, используется NoopRunStore.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Callable, Protocol

from orchestrator.infra.retry_policy import (
    ErrorClass,
    RetryPolicy,
    classify_error,
    should_retry,
)


class RunStoreProtocol(Protocol):
    """Duck-typed контракт run_state.py (Boss). Только то, что мы вызываем."""

    def transition(self, run_id: str, status: str, error: str | None = None) -> None: ...
    def timeline_append(self, run_id: str, event: str, payload: dict | None = None) -> None: ...


class NoopRunStore:
    """Fallback если run_state.py ещё не подключён. Ничего не делает."""

    def transition(self, run_id: str, status: str, error: str | None = None) -> None:
        pass

    def timeline_append(self, run_id: str, event: str, payload: dict | None = None) -> None:
        pass


def _get_run_store() -> Any:
    """Мягкий импорт run_state (Boss). Любая ошибка → NoopRunStore.

    RunStore может требовать PG (:5432) — в unit-тестах БД нет,
    поэтому любые исключения при инстанцировании глотаются.
    """
    try:
        from orchestrator.infra.run_state import RunStore  # type: ignore
        return RunStore()
    except Exception:
        return NoopRunStore()


class RetryExhausted(Exception):
    """Исчерпаны попытки retry (все попали в INFRASTRUCTURE)."""

    def __init__(self, run_id: str, attempts: int, last_error: BaseException) -> None:
        self.run_id = run_id
        self.attempts = attempts
        self.last_error = last_error
        super().__init__(f"max retries ({attempts}) exhausted for run {run_id}")


class ValidationFailed(Exception):
    """Ошибка валидации — мгновенный fail без retry."""

    def __init__(self, run_id: str, error_class: str, original: BaseException) -> None:
        self.run_id = run_id
        self.error_class = error_class
        self.original = original
        super().__init__(f"{error_class} for run {run_id}: {original}")


def execute_with_retry(
    run_id: str,
    fn: Callable[[], Any],
    policy: RetryPolicy | None = None,
    store: RunStoreProtocol | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> Any:
    """Выполнить fn с retry по политике.

    Инфраструктурный сбой → retry до max_attempts с фиксированным backoff.
    Ошибка валидации / цель недоступна → мгновенный fail.
    Каждая попытка пишется в run_timeline: event="retry_attempt_N".

    Args:
        run_id:  ID запуска
        fn:      функция без аргументов (замыкание над run)
        policy:  RetryPolicy (default: max 3 попытки, backoff 30с)
        store:   RunStore (default: мягкий импорт run_state.py)
        sleep:   функция ожидания (в тестах подменяют на мгновенную)

    Returns:
        Результат fn при успехе.

    Raises:
        RetryExhausted: INFRASTRUCTURE во всех попытках
        ValidationFailed: VALIDATION/TARGET — мгновенный fail
        Exception: UNKNOWN (fail-closed, без retry)
    """
    pol = policy or RetryPolicy()
    st = store or _get_run_store()

    attempt = 0
    while True:
        attempt += 1
        st.timeline_append(run_id, f"retry_attempt_{attempt}")

        try:
            result = fn()
            st.transition(run_id, "SUCCEEDED")
            return result

        except Exception as exc:
            error_class = classify_error(exc)
            st.timeline_append(run_id, "error_classified", {"class": error_class})

            # Retrable?
            if should_retry(error_class, attempt, pol.max_attempts):
                st.timeline_append(run_id, "retry_scheduled", {
                    "attempt": attempt, "backoff_s": pol.backoff_s,
                })
                sleep_fn(pol.backoff_s)
                continue

            # Non-retryable: VALIDATION / TARGET → мгновенный fail
            if error_class in (ErrorClass.VALIDATION.value, ErrorClass.TARGET.value):
                reason = f"{error_class}: {exc}"
                st.transition(run_id, "FAILED", error=reason)
                raise ValidationFailed(run_id, error_class, exc) from exc

            # UNKNOWN (fail-closed) или исчерпаны попытки
            if attempt >= pol.max_attempts:
                st.transition(run_id, "FAILED", error="max retries")
                raise RetryExhausted(run_id, attempt, exc) from exc

            # UNKNOWN до исчерпания попыток — fail-closed, мгновенный fail
            reason = f"{error_class}: {exc}"
            st.transition(run_id, "FAILED", error=reason)
            raise
