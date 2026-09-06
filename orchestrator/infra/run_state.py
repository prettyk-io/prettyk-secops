# RUN-CTL-1: Run State Machine — общий контракт жизненного цикла запуска.
#
# Run проходит через фиксированные состояния:
#   pending → queued → running → succeeded | failed | cancelled | expired
#
# Инварианты:
#   - Переходы атомарны (состояние + timeline в одной транзакции PG).
#   - Запрещённый переход → RunStateError (исключение, не silent fail).
#   - Каждый переход пишется в run_timeline (from, to, event, reason, ts).
#   - list_active() возвращает только pending/queued/running.
#   - list_stale(timeout) находит running с просроченным lease.
#
# Этот модуль — ОБЩИЙ КОНТРАКТ. Flash, Luna и Buddy импортируют
# RunState, RunStatus и RunStore из него. НЕ ЛОМАТЬ API.
from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


# ── Состояния жизненного цикла Run ──────────────────────────────────

class RunState(str, Enum):
    """Фиксированные состояния запуска DAST-сканера."""
    PENDING = "pending"        # создан, ожидает постановки в очередь
    QUEUED = "queued"          # в очереди, ждёт свободного worker'а
    RUNNING = "running"        # исполняется на worker'е
    SUCCEEDED = "succeeded"    # успешно завершён
    FAILED = "failed"          # завершён с ошибкой
    CANCELLED = "cancelled"    # отменён оператором
    EXPIRED = "expired"        # lease истёк, run признан мёртвым


# ── Таблица допустимых переходов ────────────────────────────────────

_VALID_TRANSITIONS: dict[RunState, frozenset[RunState]] = {
    RunState.PENDING:   frozenset({RunState.QUEUED, RunState.CANCELLED, RunState.EXPIRED}),
    RunState.QUEUED:    frozenset({RunState.RUNNING, RunState.CANCELLED, RunState.EXPIRED}),
    RunState.RUNNING:   frozenset({RunState.SUCCEEDED, RunState.FAILED,
                                    RunState.CANCELLED, RunState.EXPIRED}),
    RunState.SUCCEEDED: frozenset(),  # terminal
    RunState.FAILED:    frozenset(),  # terminal
    RunState.CANCELLED: frozenset(),  # terminal
    RunState.EXPIRED:   frozenset(),  # terminal
}

_TERMINAL_STATES = frozenset({RunState.SUCCEEDED, RunState.FAILED,
                               RunState.CANCELLED, RunState.EXPIRED})
_ACTIVE_STATES = frozenset({RunState.PENDING, RunState.QUEUED, RunState.RUNNING})


class RunStateError(Exception):
    """Запрещённый переход между состояниями."""

    def __init__(self, run_id: str, from_state: RunState, to_state: RunState):
        self.run_id = run_id
        self.from_state = from_state
        self.to_state = to_state
        super().__init__(
            f"Invalid transition for run '{run_id}': "
            f"{from_state.value} → {to_state.value} is not allowed"
        )


# ── RunStatus dataclass ─────────────────────────────────────────────

@dataclass
class RunStatus:
    """Текущее состояние одного Run."""
    run_id: str
    state: RunState
    correlation_id: str = ""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    attempts: int = 0
    error: Optional[str] = None
    worker_id: Optional[str] = None
    lease_expires_at: Optional[float] = None

    @property
    def is_terminal(self) -> bool:
        return self.state in _TERMINAL_STATES

    @property
    def is_active(self) -> bool:
        return self.state in _ACTIVE_STATES

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "state": self.state.value,
            "correlation_id": self.correlation_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "attempts": self.attempts,
            "error": self.error,
            "worker_id": self.worker_id,
            "lease_expires_at": self.lease_expires_at,
        }


# ── DDL ─────────────────────────────────────────────────────────────

_RUNS_DDL = """
CREATE TABLE IF NOT EXISTS runs (
    run_id          TEXT PRIMARY KEY,
    correlation_id  TEXT NOT NULL DEFAULT '',
    state           TEXT NOT NULL DEFAULT 'pending',
    attempts        INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    worker_id       TEXT,
    lease_expires_at DOUBLE PRECISION,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

_RUN_TIMELINE_DDL = """
CREATE TABLE IF NOT EXISTS run_timeline (
    id          BIGSERIAL PRIMARY KEY,
    run_id      TEXT NOT NULL,
    from_state  TEXT NOT NULL,
    to_state    TEXT NOT NULL,
    event       TEXT NOT NULL DEFAULT 'transition',
    reason      TEXT,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_run_timeline_run_id ON run_timeline(run_id);
"""

_RUNS_INDEX_DDL = """
CREATE INDEX IF NOT EXISTS ix_runs_state ON runs(state);
CREATE INDEX IF NOT EXISTS ix_runs_lease_expires ON runs(lease_expires_at) WHERE state = 'running';
"""


def _get_dsn() -> str:
    return os.environ.get(
        "PK_PG_DSN", "postgresql://postgres:postgres@localhost:5432/postgres"
    )


# ── RunStore — PostgreSQL-бекенд ────────────────────────────────────

class RunStore:
    """PostgreSQL-backed store для жизненного цикла Run.

    Каждый вызов transition() атомарен: UPDATE runs + INSERT run_timeline
    в одной транзакции. Если транзакция падает — ни состояние, ни timeline
    не изменяются.
    """

    def __init__(self, dsn: Optional[str] = None):
        self._dsn = dsn or _get_dsn()
        self._lock = threading.Lock()
        self._ensure_tables()

    def _ensure_tables(self) -> None:
        """Создать таблицы runs и run_timeline если их ещё нет."""
        import psycopg2

        conn = psycopg2.connect(self._dsn, connect_timeout=5)
        try:
            with conn.cursor() as cur:
                cur.execute(_RUNS_DDL)
                cur.execute(_RUN_TIMELINE_DDL)
                cur.execute(_RUNS_INDEX_DDL)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _fetch_one(self, run_id: str) -> Optional[RunStatus]:
        import psycopg2
        from psycopg2.extras import RealDictCursor

        conn = psycopg2.connect(self._dsn, connect_timeout=5)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM runs WHERE run_id = %s", (run_id,)
                )
                row = cur.fetchone()
                if row is None:
                    return None
                return self._row_to_status(row)
        finally:
            conn.close()

    @staticmethod
    def _row_to_status(row) -> RunStatus:
        return RunStatus(
            run_id=row["run_id"],
            state=RunState(row["state"]),
            correlation_id=row.get("correlation_id", "") or "",
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
            attempts=row.get("attempts", 0) or 0,
            error=row.get("error"),
            worker_id=row.get("worker_id"),
            lease_expires_at=row.get("lease_expires_at"),
        )

    # ── Public API ──────────────────────────────────────────────────

    def create(self, run_id: str, correlation_id: str = "") -> RunStatus:
        """Создать новый Run в состоянии PENDING.

        Args:
            run_id: уникальный идентификатор запуска.
            correlation_id: сквозной ID для трассировки.

        Returns:
            RunStatus с state=PENDING.

        Raises:
            RuntimeError: если run_id уже существует (PK conflict).
        """
        import psycopg2

        now = datetime.now(timezone.utc)
        conn = psycopg2.connect(self._dsn, connect_timeout=5)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO runs (run_id, correlation_id, state, attempts,
                                          created_at, updated_at)
                       VALUES (%s, %s, %s, 0, %s, %s)""",
                    (run_id, correlation_id, RunState.PENDING.value, now, now),
                )
                # Начальная запись в timeline
                cur.execute(
                    """INSERT INTO run_timeline (run_id, from_state, to_state,
                                                  event, reason, timestamp)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (run_id, "__init__", RunState.PENDING.value,
                     "created", "run created", now),
                )
            conn.commit()
        except psycopg2.IntegrityError:
            conn.rollback()
            raise RuntimeError(f"Run '{run_id}' already exists")
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        return RunStatus(
            run_id=run_id, state=RunState.PENDING,
            correlation_id=correlation_id, created_at=now, updated_at=now,
        )

    def transition(
        self,
        run_id: str,
        to_state: RunState,
        error: Optional[str] = None,
        worker_id: Optional[str] = None,
        reason: str = "",
    ) -> RunStatus:
        """Атомарный переход: UPDATE runs + INSERT run_timeline в одной транзакции.

        Args:
            run_id: идентификатор запуска.
            to_state: целевое состояние.
            error: текст ошибки (для FAILED).
            worker_id: ID worker'а (для RUNNING).
            reason: причина перехода (пишется в timeline).

        Returns:
            Обновлённый RunStatus.

        Raises:
            RunStateError: если переход запрещён.
            LookupError: если run не найден.
        """
        import psycopg2
        from psycopg2.extras import RealDictCursor

        with self._lock:
            conn = psycopg2.connect(self._dsn, connect_timeout=5)
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # 1. Read current state (SELECT ... FOR UPDATE для атомарности)
                    cur.execute(
                        "SELECT * FROM runs WHERE run_id = %s FOR UPDATE",
                        (run_id,),
                    )
                    row = cur.fetchone()
                    if row is None:
                        raise LookupError(f"Run '{run_id}' not found")

                    current = RunState(row["state"])
                    if to_state not in _VALID_TRANSITIONS.get(current, frozenset()):
                        raise RunStateError(run_id, current, to_state)

                    # 2. UPDATE runs
                    now = datetime.now(timezone.utc)
                    attempts = (row.get("attempts") or 0)
                    if to_state == RunState.RUNNING:
                        attempts += 1

                    cur.execute(
                        """UPDATE runs
                           SET state = %s, updated_at = %s, attempts = %s,
                               error = %s, worker_id = %s
                           WHERE run_id = %s""",
                        (to_state.value, now, attempts, error, worker_id, run_id),
                    )

                    # 3. INSERT run_timeline (та же транзакция)
                    event = f"{current.value}->{to_state.value}"
                    cur.execute(
                        """INSERT INTO run_timeline (run_id, from_state, to_state,
                                                      event, reason, timestamp)
                           VALUES (%s, %s, %s, %s, %s, %s)""",
                        (run_id, current.value, to_state.value,
                         event, reason or error or "", now),
                    )

                conn.commit()
            except RunStateError:
                conn.rollback()
                raise
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()

        return self._fetch_one(run_id)  # type: ignore[return-value]

    def get(self, run_id: str) -> Optional[RunStatus]:
        """Получить актуальное состояние Run или None."""
        return self._fetch_one(run_id)

    def list_active(self) -> list[RunStatus]:
        """Все Run в состояниях pending/queued/running."""
        import psycopg2
        from psycopg2.extras import RealDictCursor

        conn = psycopg2.connect(self._dsn, connect_timeout=5)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """SELECT * FROM runs
                       WHERE state IN ('pending', 'queued', 'running')
                       ORDER BY created_at ASC"""
                )
                return [self._row_to_status(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def list_stale(self, lease_timeout_s: float) -> list[RunStatus]:
        """Running-запуски с lease, просроченным более чем на lease_timeout_s.

        Args:
            lease_timeout_s: сколько секунд назад должен был быть продлён lease.

        Returns:
            Список RunStatus в состоянии RUNNING с updated_at (или lease_expires_at)
            старше указанного порога.
        """
        import psycopg2
        import time
        from psycopg2.extras import RealDictCursor

        cutoff = time.time() - lease_timeout_s
        conn = psycopg2.connect(self._dsn, connect_timeout=5)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """SELECT * FROM runs
                       WHERE state = 'running'
                         AND COALESCE(lease_expires_at,
                                      EXTRACT(EPOCH FROM updated_at)::DOUBLE PRECISION)
                             < %s""",
                    (cutoff,),
                )
                return [self._row_to_status(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def list_timeline(self, run_id: str) -> list[dict]:
        """История переходов для одного Run."""
        import psycopg2
        from psycopg2.extras import RealDictCursor

        conn = psycopg2.connect(self._dsn, connect_timeout=5)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """SELECT run_id, from_state, to_state, event, reason, timestamp
                       FROM run_timeline WHERE run_id = %s
                       ORDER BY timestamp ASC, id ASC""",
                    (run_id,),
                )
                return [
                    {
                        "run_id": r["run_id"],
                        "from_state": r["from_state"],
                        "to_state": r["to_state"],
                        "event": r["event"],
                        "reason": r["reason"],
                        "timestamp": r["timestamp"].isoformat() if r["timestamp"] else None,
                    }
                    for r in cur.fetchall()
                ]
        finally:
            conn.close()

    def heartbeat(self, run_id: str, lease_seconds: float = 3600.0) -> bool:
        """Продлить lease для running-запуска (для worker'ов)."""
        import psycopg2
        import time

        conn = psycopg2.connect(self._dsn, connect_timeout=5)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE runs
                       SET lease_expires_at = %s, updated_at = now()
                       WHERE run_id = %s AND state = 'running'""",
                    (time.time() + lease_seconds, run_id),
                )
                updated = cur.rowcount
            conn.commit()
            return updated > 0
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
