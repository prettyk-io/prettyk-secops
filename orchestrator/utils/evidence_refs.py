# -*- coding: utf-8 -*-
"""
EvidenceRegistry — persist CheckEvidenceRefs (links + thin meta).

See docs/check-evidence-refs.md.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils.paths import LIVE_DIR, ensure_live_dir

logger = logging.getLogger(__name__)

EVIDENCE_REFS_JSON = LIVE_DIR / "check_evidence_refs.json"


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def evidence_store_path() -> Path:
    raw = (pk_env("EVIDENCE_REFS_PATH") or "").strip()
    return Path(raw).resolve() if raw else EVIDENCE_REFS_JSON


def _empty() -> Dict[str, Any]:
    return {"version": 1, "items": {}}


def load_evidence_registry() -> Dict[str, Any]:
    path = evidence_store_path()
    if not path.is_file():
        return _empty()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _empty()
    if not isinstance(raw, dict) or raw.get("version") != 1:
        return _empty()
    items = raw.get("items")
    if not isinstance(items, dict):
        return _empty()
    return {"version": 1, "items": items}


def save_evidence_registry(snapshot: Dict[str, Any]) -> Path:
    path = evidence_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.parent == LIVE_DIR:
        ensure_live_dir()
    path.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def upsert_check_evidence(refs: Dict[str, Any]) -> Dict[str, Any]:
    """Merge one CheckEvidenceRefs by check_id."""
    check_id = str(refs.get("check_id") or "").strip()
    if not check_id:
        raise ValueError("check_id is required")
    snap = load_evidence_registry()
    prev = snap["items"].get(check_id) if isinstance(snap["items"].get(check_id), dict) else {}
    # Preserve prior history unless caller passed a full replacement list.
    incoming_history = refs.get("history")
    merged = {**prev, **refs, "check_id": check_id, "updated_at": _now_iso()}
    if incoming_history is None and isinstance(prev.get("history"), list):
        merged["history"] = list(prev["history"])
    snap["items"][check_id] = merged
    save_evidence_registry(snap)
    logger.info("evidence_refs upsert check_id=%s source=%s", check_id, merged.get("source"))
    return merged


def append_evidence_history(
    check_id: str,
    point: Dict[str, Any],
    *,
    max_points: int = 40,
) -> Optional[Dict[str, Any]]:
    """RES-3: append timeline point to existing CheckEvidenceRefs."""
    cid = (check_id or "").strip()
    if not cid:
        return None
    snap = load_evidence_registry()
    item = snap["items"].get(cid)
    if not isinstance(item, dict):
        item = {"check_id": cid, "source": "finalize", "history": []}
    history = list(item.get("history") or []) if isinstance(item.get("history"), list) else []
    row = dict(point)
    row.setdefault("at", _now_iso())
    row.setdefault("check_id", cid)
    history.append(row)
    if max_points > 0 and len(history) > max_points:
        history = history[-max_points:]
    item = {**item, "check_id": cid, "history": history, "updated_at": _now_iso()}
    snap["items"][cid] = item
    save_evidence_registry(snap)
    return item


def list_all_evidence() -> List[Dict[str, Any]]:
    items = load_evidence_registry()["items"]
    out = [dict(v) for v in items.values() if isinstance(v, dict)]
    out.sort(key=lambda r: str(r.get("updated_at") or ""), reverse=True)
    return out


def get_check_evidence(check_id: str) -> Optional[Dict[str, Any]]:
    item = load_evidence_registry()["items"].get(check_id)
    return dict(item) if isinstance(item, dict) else None


def list_evidence_for_deploy(deploy_id: str) -> List[Dict[str, Any]]:
    items = load_evidence_registry()["items"]
    out = [
        dict(v)
        for v in items.values()
        if isinstance(v, dict) and str(v.get("deploy_id") or "") == deploy_id
    ]
    out.sort(key=lambda r: str(r.get("updated_at") or ""), reverse=True)
    return out


def resolve_check_id_for_run() -> str:
    """Env KDT_CHECK_ID or synthetic run id — never meta.project_id."""
    explicit = (pk_env("CHECK_ID") or "").strip()
    if explicit:
        return explicit
    run_dir = (pk_env("RUN_DIR") or "").strip()
    if run_dir:
        return f"run_{Path(run_dir).name}"
    return f"run_{int(time.time())}"


def resolve_deploy_id_for_run() -> Optional[str]:
    raw = (pk_env("DEPLOY_ID") or "").strip()
    return raw or None
