# RUN-CTL-1: Run Timeline — история всех переходов состояния.
#
# Таблица run_timeline хранит запись для КАЖДОГО перехода:
#   run_id, from_state, to_state, event, reason, timestamp
#
# Атомарность гарантируется RunStore.transition(): UPDATE runs +
# INSERT run_timeline выполняются в одной транзакции PostgreSQL.
#
# Этот модуль предоставляет DDL и standalone-хелперы для работы с
# timeline напрямую (аудит, отладка, восстановление).
from __future__ import annotations

import os
from typing import Optional


RUN_TIMELINE_DDL = """
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
CREATE INDEX IF NOT EXISTS ix_run_timeline_ts ON run_timeline(timestamp);
"""


def get_dsn() -> str:
    return os.environ.get(
        "PK_PG_DSN", "postgresql://postgres:postgres@localhost:5432/postgres"
    )


def ensure_timeline_table(dsn: Optional[str] = None) -> None:
    """Создать таблицу run_timeline если её ещё нет."""
    import psycopg2

    _dsn = dsn or get_dsn()
    conn = psycopg2.connect(_dsn, connect_timeout=5)
    try:
        with conn.cursor() as cur:
            cur.execute(RUN_TIMELINE_DDL)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def insert_timeline_entry(
    run_id: str,
    from_state: str,
    to_state: str,
    event: str = "transition",
    reason: Optional[str] = None,
    dsn: Optional[str] = None,
) -> None:
    """Вставить одну запись в run_timeline.

    NOTE: Для атомарных переходов используйте RunStore.transition() —
    он выполняет INSERT timeline + UPDATE runs в одной транзакции.
    Этот метод — standalone-хелпер для аудита и отладки.
    """
    import psycopg2

    _dsn = dsn or get_dsn()
    conn = psycopg2.connect(_dsn, connect_timeout=5)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO run_timeline
                       (run_id, from_state, to_state, event, reason, timestamp)
                   VALUES (%s, %s, %s, %s, %s, now())""",
                (run_id, from_state, to_state, event, reason),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_timeline(run_id: str, dsn: Optional[str] = None) -> list[dict]:
    """Получить всю историю переходов для run_id (ordered by timestamp)."""
    import psycopg2
    from psycopg2.extras import RealDictCursor

    _dsn = dsn or get_dsn()
    conn = psycopg2.connect(_dsn, connect_timeout=5)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT id, run_id, from_state, to_state, event, reason, timestamp
                   FROM run_timeline WHERE run_id = %s
                   ORDER BY timestamp ASC, id ASC""",
                (run_id,),
            )
            return [
                {
                    "id": r["id"],
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


def count_timeline_entries(run_id: str, dsn: Optional[str] = None) -> int:
    """Количество записей в timeline для run_id."""
    import psycopg2

    _dsn = dsn or get_dsn()
    conn = psycopg2.connect(_dsn, connect_timeout=5)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM run_timeline WHERE run_id = %s", (run_id,)
            )
            return cur.fetchone()[0]
    finally:
        conn.close()
