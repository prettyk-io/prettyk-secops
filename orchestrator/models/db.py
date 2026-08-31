# -*- coding: utf-8 -*-
"""Единая точка подключения к БД (SQLite / PostgreSQL через SQLAlchemy).

Без FastAPI/SQLModel — чистый SQLAlchemy 2.x Core + ORM.
Pure Box: SQLite в reports/pk.db. При PK_DATABASE_URL — PostgreSQL.
"""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.sql import text

from utils.env_dual import pk_env

# ── Engine ──

_engine: Engine | None = None
_SessionLocal: sessionmaker | None = None


def _db_url() -> str:
    """PK_DATABASE_URL или SQLite по умолчанию (Pure Box)."""
    url = (pk_env("DATABASE_URL") or "").strip()
    if url:
        return url
    db_path = Path(__file__).resolve().parents[1] / "reports" / "pk.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path}"


def _enable_wal(dbapi_connection, connection_record):
    """SQLite: включаем WAL-режим для конкурентного чтения."""
    import sqlite3
    if isinstance(dbapi_connection, sqlite3.Connection):
        dbapi_connection.execute("PRAGMA journal_mode=WAL")
        dbapi_connection.execute("PRAGMA foreign_keys=ON")


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = _db_url()
        _engine = create_engine(
            url,
            echo=False,
            connect_args={"check_same_thread": False} if url.startswith("sqlite") else {},
        )
        if url.startswith("sqlite"):
            event.listen(_engine, "connect", _enable_wal)
    return _engine


def get_session() -> Session:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), autoflush=False, autocommit=False)
    return _SessionLocal()


def db_table_exists(name: str) -> bool:
    """Проверить существование таблицы (для миграций)."""
    engine = get_engine()
    insp = __import__("sqlalchemy").inspect(engine)
    return insp.has_table(name)


# ── Create all (dev bootstrap) ──

def create_all():
    """Создать все таблицы (dev / первый старт без Alembic)."""
    from models.run_record import Base as RunBase
    from models.evidence_record import Base as EvBase
    RunBase.metadata.create_all(bind=get_engine())
    EvBase.metadata.create_all(bind=get_engine())