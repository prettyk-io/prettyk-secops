# -*- coding: utf-8 -*-
"""Infra health & bootstrap: PostgreSQL + Valkey.

Запуск:
  .\\.venv\\Scripts\\python.exe orchestrator\\tools\\infra_health.py
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import redis

REPO = Path(__file__).resolve().parents[2]
LIVE_DIR = REPO / "reports" / "live"
CHECKS_JSON = LIVE_DIR / "checks_registry.json"


def _pg():
    return psycopg2.connect(
        host="127.0.0.1", port=5432,
        user="prettyk", password="prettyk", dbname="prettyk"
    )


def _vk():
    return redis.Redis(host="127.0.0.1", port=6379, decode_responses=True)


# ── PostgreSQL health ──────────────────────────────────────

def pg_health() -> dict:
    conn = _pg()
    cur = conn.cursor()
    cur.execute("SELECT version();")
    version = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM users;")
    user_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM checks;")
    check_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM runs;")
    run_count = cur.fetchone()[0]
    cur.close()
    conn.close()
    return {"version": version[:80], "users": user_count, "checks": check_count, "runs": run_count}


# ── Valkey health ──────────────────────────────────────────

def valkey_health() -> dict:
    vk = _vk()
    pong = vk.ping()
    # Write + read test
    vk.set("prettyk:health:ts", datetime.now(timezone.utc).isoformat())
    ts = vk.get("prettyk:health:ts")
    vk.delete("prettyk:health:ts")
    return {"ping": pong, "health_ts": ts}


# ── Migrate checks_registry.json → PostgreSQL ──────────────

def migrate_checks_registry() -> int:
    """Читает старый JSON и заливает в PostgreSQL (idempotent)."""
    if not CHECKS_JSON.exists():
        print(f"[infra] checks_registry.json not found at {CHECKS_JSON} — skipping")
        return 0

    raw = json.loads(CHECKS_JSON.read_text(encoding="utf-8"))
    items = raw if isinstance(raw, list) else [raw]
    if not items:
        print("[infra] checks_registry.json empty — skipping")
        return 0

    conn = _pg()
    cur = conn.cursor()
    migrated = 0

    for item in items:
        cid = item.get("id") or item.get("check_id") or ""
        name = item.get("name") or item.get("label") or cid
        desc = item.get("description") or item.get("desc") or ""
        kind = item.get("kind") or item.get("check_kind") or "security"
        status = item.get("status") or "draft"
        target = item.get("target_url") or item.get("url") or ""
        meta = {k: v for k, v in item.items()
                if k not in ("id", "check_id", "name", "label", "description", "desc",
                              "kind", "check_kind", "status", "target_url", "url")}

        cur.execute(
            """INSERT INTO checks (id, name, description, check_kind, status, target_url, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (id) DO UPDATE SET
                 name = EXCLUDED.name,
                 description = EXCLUDED.description,
                 check_kind = EXCLUDED.check_kind,
                 status = EXCLUDED.status,
                 target_url = EXCLUDED.target_url,
                 metadata = EXCLUDED.metadata""",
            (cid, name, desc, kind, status, target, json.dumps(meta, ensure_ascii=False))
        )
        migrated += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"[infra] migrated {migrated} checks from JSON → PostgreSQL")
    return migrated


# ── Valkey: set baseline keys ──────────────────────────────

def valkey_baseline():
    vk = _vk()
    vk.set("prettyk:stack:postgres", "16-alpine")
    vk.set("prettyk:stack:valkey", "8-alpine")
    vk.set("prettyk:deployed_at", datetime.now(timezone.utc).isoformat())
    vk.set("prettyk:canon:infra", "sanctuary/pure/infra-stack.md")
    print("[infra] valkey baseline keys set")


if __name__ == "__main__":
    print("=== PostgreSQL ===")
    pg = pg_health()
    for k, v in pg.items():
        print(f"  {k}: {v}")

    print("=== Valkey ===")
    vk = valkey_health()
    for k, v in vk.items():
        print(f"  {k}: {v}")

    valkey_baseline()
    migrated = migrate_checks_registry()
    print(f"\n=== STATUS ===")
    print(f"  PostgreSQL: OK ({pg['checks']} checks, {pg['runs']} runs)")
    print(f"  Valkey:     OK ({vk['ping']})")
    print(f"  Migrated:   {migrated} items")
    print(f"  STACK:      READY")