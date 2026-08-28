# -*- coding: utf-8 -*-
"""
ART-1: Artifact index — check_id → runs → disk/Dojo/hooks paths.

See docs/artifact-cleanup-epic.md. Not GatePolicy; not evidence_refs.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from utils.paths import LIVE_DIR, RUNS_DIR, ensure_live_dir

logger = logging.getLogger(__name__)

ARTIFACT_INDEX_JSON = LIVE_DIR / "artifact_index.json"
INDEX_VERSION = 1


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def artifact_index_path() -> Path:
    raw = (pk_env("ARTIFACT_INDEX_PATH") or "").strip()
    return Path(raw).resolve() if raw else ARTIFACT_INDEX_JSON


def _empty() -> Dict[str, Any]:
    return {"version": INDEX_VERSION, "checks": {}}


def load_artifact_index() -> Dict[str, Any]:
    path = artifact_index_path()
    if not path.is_file():
        return _empty()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _empty()
    if not isinstance(raw, dict) or int(raw.get("version") or 0) != INDEX_VERSION:
        return _empty()
    checks = raw.get("checks")
    if not isinstance(checks, dict):
        return _empty()
    return {"version": INDEX_VERSION, "checks": checks}


def save_artifact_index(snapshot: Dict[str, Any]) -> Path:
    path = artifact_index_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.parent == LIVE_DIR:
        ensure_live_dir()
    out = {
        "version": INDEX_VERSION,
        "checks": snapshot.get("checks")
        if isinstance(snapshot.get("checks"), dict)
        else {},
    }
    path.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def get_check_entry(check_id: str) -> Optional[Dict[str, Any]]:
    cid = (check_id or "").strip()
    if not cid:
        return None
    snap = load_artifact_index()
    entry = snap["checks"].get(cid)
    return entry if isinstance(entry, dict) else None


def _paths_for_finalize(
    *,
    rid: str,
    run_dir: Optional[Path],
    scanner_xml: Optional[Path],
    allure_results_dir: Optional[Path],
) -> Dict[str, str]:
    paths: Dict[str, str] = {}
    if run_dir is not None:
        paths["run_dir"] = str(Path(run_dir))
    elif (RUNS_DIR / rid).is_dir():
        paths["run_dir"] = str(RUNS_DIR / rid)
    if scanner_xml is not None and Path(scanner_xml).exists():
        paths["scanner_xml"] = str(Path(scanner_xml))
    if allure_results_dir is not None:
        paths["allure_results_dir"] = str(Path(allure_results_dir))
    return paths


def _subset_meta(src: Optional[Dict[str, Any]], keys: tuple[str, ...]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if not isinstance(src, dict):
        return out
    for key in keys:
        if src.get(key) is not None:
            out[key] = src.get(key)
    return out


def record_finalize_artifacts(
    *,
    check_id: Optional[str],
    run_id: Optional[str] = None,
    run_dir: Optional[Path] = None,
    scanner_xml: Optional[Path] = None,
    allure_results_dir: Optional[Path] = None,
    allure_report_url: Optional[str] = None,
    dojo: Optional[Dict[str, Any]] = None,
    hooks: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Upsert one run under checks[check_id].runs[].
    Missing check_id → no-op (None).
    """
    cid = (check_id or "").strip()
    if not cid:
        return None

    rid = (run_id or "").strip() or f"run-{int(time.time())}"
    paths = _paths_for_finalize(
        rid=rid,
        run_dir=run_dir,
        scanner_xml=scanner_xml,
        allure_results_dir=allure_results_dir,
    )
    dojo_meta = _subset_meta(
        dojo,
        ("test_id", "engagement_id", "product_id", "test_url", "engagement_url"),
    )
    hooks_meta = _subset_meta(hooks, ("allure", "dojo", "scanner"))
    if allure_report_url:
        hooks_meta.setdefault("allure", allure_report_url)

    run_rec: Dict[str, Any] = {
        "run_id": rid,
        "recorded_at": _now_iso(),
        "paths": paths,
        "dojo": dojo_meta,
        "hooks": hooks_meta,
    }

    snap = load_artifact_index()
    entry = snap["checks"].get(cid)
    if not isinstance(entry, dict):
        entry = {"check_id": cid, "runs": []}
    runs = entry.get("runs")
    if not isinstance(runs, list):
        runs = []
    # replace same run_id
    runs = [r for r in runs if not (isinstance(r, dict) and r.get("run_id") == rid)]
    runs.append(run_rec)
    entry["check_id"] = cid
    entry["runs"] = runs
    entry["updated_at"] = _now_iso()
    snap["checks"][cid] = entry
    save_artifact_index(snap)
    logger.info("artifact_index record check_id=%s run_id=%s", cid, rid)
    return entry


def unlink_check(check_id: str) -> bool:
    """Remove check entry from index (registry unlink companion). Does not delete disk."""
    cid = (check_id or "").strip()
    if not cid:
        return False
    snap = load_artifact_index()
    if cid not in snap["checks"]:
        return False
    del snap["checks"][cid]
    save_artifact_index(snap)
    return True


def check_legal_hold(check_id: str) -> bool:
    """SURVEY-3: hold suspends retention/purge for this check."""
    entry = get_check_entry(check_id)
    if not entry:
        return False
    return bool(entry.get("legal_hold"))


def set_check_legal_hold(
    check_id: str,
    held: bool,
    *,
    note: str = "",
) -> Optional[Dict[str, Any]]:
    """
    Soft legal hold on check (industry: hold overrides retention TTL).
    Creates stub entry if missing so hold can be set before first run.
    """
    cid = (check_id or "").strip()
    if not cid:
        return None
    snap = load_artifact_index()
    entry = snap["checks"].get(cid)
    if not isinstance(entry, dict):
        entry = {"check_id": cid, "runs": []}
    entry["check_id"] = cid
    entry["legal_hold"] = bool(held)
    entry["legal_hold_note"] = (note or "").strip()[:500]
    entry["legal_hold_at"] = _now_iso() if held else ""
    entry["updated_at"] = _now_iso()
    snap["checks"][cid] = entry
    save_artifact_index(snap)
    logger.info("artifact_index legal_hold check_id=%s held=%s", cid, held)
    return entry


def list_run_paths(check_id: str) -> List[Path]:
    entry = get_check_entry(check_id)
    if not entry:
        return []
    out: List[Path] = []
    for run in entry.get("runs") or []:
        if not isinstance(run, dict):
            continue
        paths = run.get("paths") if isinstance(run.get("paths"), dict) else {}
        for key in ("run_dir", "scanner_xml", "allure_results_dir"):
            raw = paths.get(key)
            if raw:
                out.append(Path(str(raw)))
    return out


def _add_resolved_path(out: Set[str], raw: Any) -> None:
    if not raw:
        return
    try:
        out.add(str(Path(str(raw)).resolve()))
    except OSError:
        out.add(str(raw))


def indexed_path_set() -> Set[str]:
    """All path strings recorded in the index (resolved where possible)."""
    snap = load_artifact_index()
    out: Set[str] = set()
    for entry in (snap.get("checks") or {}).values():
        if not isinstance(entry, dict):
            continue
        for run in entry.get("runs") or []:
            if not isinstance(run, dict):
                continue
            paths = run.get("paths") if isinstance(run.get("paths"), dict) else {}
            for raw in paths.values():
                _add_resolved_path(out, raw)
    return out


def summarize_checks_for_badges() -> Dict[str, Dict[str, Any]]:
    """
    ART-11: check_id → {runs, has_artifacts} for History badge.
    has_artifacts = есть запись runs[] в index (пути могли уже снести).
    """
    snap = load_artifact_index()
    out: Dict[str, Dict[str, Any]] = {}
    for cid, entry in (snap.get("checks") or {}).items():
        if not isinstance(entry, dict):
            continue
        runs = entry.get("runs") if isinstance(entry.get("runs"), list) else []
        n = len(runs)
        held = bool(entry.get("legal_hold"))
        if n <= 0 and not held:
            continue
        out[str(cid)] = {
            "runs": n,
            "has_artifacts": n > 0,
            "updated_at": entry.get("updated_at"),
            "legal_hold": held,
        }
    return out
