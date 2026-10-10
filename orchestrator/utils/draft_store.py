# -*- coding: utf-8 -*-
"""
PK-WB-S1/S2 — file-backed Draft persistence (Playground side).

Контракт фронта (frontend/src/checks/draftPersistence.ts + draftRevision.ts):
  GET    /api/checks/{checkId}/draft   → DraftPayload | 404
  PUT    /api/checks/{checkId}/draft   → 200 {revision} | 409 {conflict, revision, theirs}
  DELETE /api/checks/{checkId}/draft   → 200 {ok} | 404

Header PUT: X-Draft-Revision: <expectedRevision> (optimistic concurrency).

Хранение: reports/drafts/{checkId}.json  (обёртка {revision, payload}).
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from utils.paths import REPO_ROOT

# Patchable in tests (monkeypatch utils.draft_store.DRAFTS_DIR).
DRAFTS_DIR = str(REPO_ROOT / "reports" / "drafts")

DRAFT_VERSION = 1


def drafts_dir() -> Path:
    return Path(DRAFTS_DIR)


def _draft_path(check_id: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in check_id)
    return drafts_dir() / f"{safe}.json"


def _ensure_dir() -> None:
    drafts_dir().mkdir(parents=True, exist_ok=True)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_draft(check_id: str) -> Optional[Dict[str, Any]]:
    """Вернуть сохранённый DraftPayload (+ meta.revision из обёртки), или None.

    DRAFT-CONFLICT-TRUTH: revision обязан лететь в GET — иначе свежая сессия
    не может адоптировать серверную версию и вечно ловит 409.
    """
    path = _draft_path(check_id)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    payload = raw.get("payload")
    if not isinstance(payload, dict):
        return None
    revision = raw.get("revision")
    meta = payload.get("meta")
    if isinstance(revision, int) and isinstance(meta, dict):
        enriched = dict(payload)
        enriched["meta"] = {**meta, "revision": revision}
        return enriched
    return payload


def _load_wrapped(check_id: str) -> Tuple[int, Optional[Dict[str, Any]]]:
    """(revision, payload) из файла. Нет файла → (0, None)."""
    path = _draft_path(check_id)
    if not path.is_file():
        return 0, None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 0, None
    if not isinstance(raw, dict):
        return 0, None
    revision = raw.get("revision")
    payload = raw.get("payload")
    return int(revision) if isinstance(revision, int) else 0, (
        payload if isinstance(payload, dict) else None
    )


def save_draft(check_id: str, payload: Dict[str, Any], expected_revision: int) -> Tuple[int, Dict[str, Any]]:
    """Сохранить черновик с optimistic concurrency.

    Returns (http_code, response_payload):
      200 → {"ok": True, "revision": next}
      409 → {"ok": False, "conflict": True, "revision": server_rev, "theirs": DraftPayload}
    """
    _ensure_dir()
    server_rev, theirs = _load_wrapped(check_id)

    if expected_revision != server_rev:
        return 409, {
            "ok": False,
            "conflict": True,
            "revision": server_rev,
            "theirs": theirs,
        }

    next_rev = server_rev + 1
    path = _draft_path(check_id)
    path.write_text(
        json.dumps(
            {"version": DRAFT_VERSION, "revision": next_rev, "payload": payload, "saved_at": _now_iso()},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return 200, {"ok": True, "revision": next_rev}


def delete_draft(check_id: str) -> bool:
    """Удалить черновик. True если файл был и удалён, False если не было."""
    path = _draft_path(check_id)
    if not path.is_file():
        return False
    try:
        path.unlink()
        return True
    except OSError:
        return False
