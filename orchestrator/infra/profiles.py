"""
PROFILES-1: Честный контракт Pure Box.

Pure Box — single-process режим без PostgreSQL, Valkey, очереди и worker pool.
Все системные слои Enterprise-профиля не ломают Pure Box.

Контракт: при старте Pure Box код не пытается подключиться к внешним сервисам.
"""

from __future__ import annotations

import os

# ── Режимы развёртывания ──

PURE_BOX_PROFILE = "pure-box"
ENTERPRISE_PROFILE = "enterprise"


def resolve_profile() -> str:
    """Определить профиль развёртывания.

    PK_DEPLOY_PROFILE=pure-box → Pure Box (одиночный процесс)
    PK_DEPLOY_PROFILE=enterprise (или не задано) → Enterprise (PG + Valkey + очередь)
    """
    raw = (os.environ.get("PK_DEPLOY_PROFILE") or ENTERPRISE_PROFILE).strip().lower()
    return raw if raw in (PURE_BOX_PROFILE, ENTERPRISE_PROFILE) else ENTERPRISE_PROFILE


def is_pure_box() -> bool:
    """True если текущий профиль — Pure Box."""
    return resolve_profile() == PURE_BOX_PROFILE


def is_enterprise() -> bool:
    """True если текущий профиль — Enterprise."""
    return resolve_profile() == ENTERPRISE_PROFILE


# ── Feature gates — методы, которые должны вести себя по-разному
#    в зависимости от профиля, не ломая общий код. ──

def requires_postgres() -> bool:
    """Требует ли текущий профиль PostgreSQL."""
    return is_enterprise()


def requires_valkey() -> bool:
    """Требует ли текущий профиль Valkey."""
    return is_enterprise()


def requires_queue() -> bool:
    """Требует ли текущий профиль очередь (Run Control Plane)."""
    return is_enterprise()


def requires_worker_pool() -> bool:
    """Требует ли текущий профиль Worker Pool."""
    return is_enterprise()


# ── Контракт Pure Box — самодостаточный health ──

def pure_box_health() -> dict[str, bool]:
    """Health для Pure Box — всегда green без внешних зависимостей."""
    return {
        "live": True,
        "ready": True,
        "draining": False,
        "profile": "pure-box",
        "dependencies": {
            "postgres": False,   # не требуется
            "valkey": False,     # не требуется
            "queue": False,      # не требуется
            "worker_pool": False,  # не требуется
            "filesystem": True,
        },
    }


def enterprise_health_requirements() -> list[str]:
    """Список зависимостей, которые ДОЛЖНЫ быть доступны в Enterprise-режиме."""
    return ["postgres", "valkey", "queue", "worker_pool"]