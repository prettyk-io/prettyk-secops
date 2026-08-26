# -*- coding: utf-8 -*-
"""
ART-4: RetentionPolicy store — artifact TTL days.

Separate from GatePolicy (admission counts). Live file + env override.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

from utils.paths import LIVE_DIR, ensure_live_dir

logger = logging.getLogger(__name__)

RETENTION_POLICY_JSON = LIVE_DIR / "retention_policy.json"
DEFAULT_RETENTION_DAYS = 90


def retention_policy_path() -> Path:
    raw = (pk_env("RETENTION_POLICY_PATH") or "").strip()
    return Path(raw).resolve() if raw else RETENTION_POLICY_JSON


def default_retention_policy() -> Dict[str, Any]:
    return {
        "version": 1,
        "artifact_retention_days": DEFAULT_RETENTION_DAYS,
    }


def load_retention_policy() -> Dict[str, Any]:
    path = retention_policy_path()
    if not path.is_file():
        return default_retention_policy()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default_retention_policy()
    if not isinstance(raw, dict):
        return default_retention_policy()
    days = raw.get("artifact_retention_days", DEFAULT_RETENTION_DAYS)
    try:
        days_i = max(1, int(days))
    except (TypeError, ValueError):
        days_i = DEFAULT_RETENTION_DAYS
    return {"version": 1, "artifact_retention_days": days_i}


def save_retention_policy(policy: Dict[str, Any]) -> Path:
    path = retention_policy_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.parent == LIVE_DIR:
        ensure_live_dir()
    days = policy.get("artifact_retention_days", DEFAULT_RETENTION_DAYS)
    try:
        days_i = max(1, int(days))
    except (TypeError, ValueError):
        days_i = DEFAULT_RETENTION_DAYS
    out = {"version": 1, "artifact_retention_days": days_i}
    path.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    logger.info("retention_policy saved days=%s path=%s", days_i, path)
    return path


def retention_days() -> int:
    return int(load_retention_policy()["artifact_retention_days"])
