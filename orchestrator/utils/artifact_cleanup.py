# -*- coding: utf-8 -*-
"""
ART-5/6/7: cleanup candidates + disk/Dojo purge by artifact index.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import logging
import os
import shutil
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from utils.artifact_index import (
    check_legal_hold,
    get_check_entry,
    indexed_path_set,
    load_artifact_index,
    unlink_check,
)
from utils.paths import LIVE_DIR, RUNS_DIR, ensure_live_dir
from utils.retention_policy import retention_days

logger = logging.getLogger(__name__)

AUDIT_NDJSON = LIVE_DIR / "artifact_cleanup_audit.ndjson"


def audit_ndjson_path() -> Path:
    raw = (pk_env("ARTIFACT_AUDIT_PATH") or "").strip()
    return Path(raw).resolve() if raw else AUDIT_NDJSON


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(raw: str) -> Optional[datetime]:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _append_audit(event: Dict[str, Any]) -> None:
    ensure_live_dir()
    path = audit_ndjson_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps({**event, "ts": _now().strftime("%Y-%m-%dT%H:%M:%SZ")}, ensure_ascii=False)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def _dir_covered_by_index(child: Path, indexed: set) -> bool:
    try:
        resolved = str(child.resolve())
    except OSError:
        resolved = str(child)
    if resolved in indexed:
        return True
    for ip in indexed:
        try:
            Path(ip).relative_to(child.resolve())
            return True
        except (ValueError, OSError):
            continue
    return False


def _dir_bytes_hint(child: Path) -> int:
    size_hint = 0
    try:
        for pth in child.rglob("*"):
            if pth.is_file():
                try:
                    size_hint += pth.stat().st_size
                except OSError:
                    pass
    except OSError:
        pass
    return size_hint


def scan_orphan_run_dirs(*, runs_root: Optional[Path] = None) -> List[Dict[str, Any]]:
    """
    ART-10: dirs under reports/runs/ with no matching run_dir in index.
    Does not delete — inventory only.
    """
    root = Path(runs_root) if runs_root is not None else RUNS_DIR
    if not root.is_dir():
        return []
    indexed = indexed_path_set()
    orphans: List[Dict[str, Any]] = []
    try:
        children = sorted(root.iterdir(), key=lambda pth: pth.name)
    except OSError:
        return []
    for child in children:
        if not child.is_dir() or child.name.startswith("."):
            continue
        if _dir_covered_by_index(child, indexed):
            continue
        orphans.append(
            {
                "path": str(child),
                "run_id_guess": child.name,
                "bytes_hint": _dir_bytes_hint(child),
                "reason": "not_in_artifact_index",
            }
        )
    return orphans


def read_cleanup_audit(*, limit: int = 100) -> List[Dict[str, Any]]:
    """ART-12: last N audit events (newest last in file → return newest-first)."""
    path = audit_ndjson_path()
    if not path.is_file():
        return []
    lim = max(1, min(int(limit or 100), 2000))
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    events: List[Dict[str, Any]] = []
    for line in lines[-lim:]:
        st = line.strip()
        if not st:
            continue
        try:
            obj = json.loads(st)
        except json.JSONDecodeError:
            events.append({"raw": st, "parse_error": True})
            continue
        if isinstance(obj, dict):
            events.append(obj)
    events.reverse()
    return events


def export_cleanup_audit(*, dest: Optional[Path] = None) -> Dict[str, Any]:
    """Copy audit ndjson to dest (default live/exports/)."""
    from utils.paths import ensure_live_exports_dir

    src = audit_ndjson_path()
    if not src.is_file():
        return {"ok": False, "error": "no_audit_file", "path": None}
    out_dir = ensure_live_exports_dir() if dest is None else Path(dest).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    target = (
        Path(dest)
        if dest is not None
        else out_dir / f"artifact_cleanup_audit_{_now().strftime('%Y%m%dT%H%M%SZ')}.ndjson"
    )
    try:
        target.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    except OSError as exc:
        return {"ok": False, "error": str(exc), "path": None}
    return {"ok": True, "path": str(target), "error": None}


def purge_globally_enabled() -> bool:
    """PK_ARTIFACT_PURGE=0 → freeze all execute purge (SURVEY-3 global soft freeze)."""
    raw = (pk_env("ARTIFACT_PURGE") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def count_held_checks() -> int:
    """How many checks currently have legal_hold (SURVEY-3 ops visibility)."""
    snap = load_artifact_index()
    n = 0
    for cid, entry in (snap.get("checks") or {}).items():
        if not isinstance(entry, dict):
            continue
        if check_legal_hold(str(cid)) or bool(entry.get("legal_hold")):
            n += 1
    return n


def _run_past_cutoff(run: Dict[str, Any], cutoff: datetime) -> bool:
    recorded = _parse_iso(str(run.get("recorded_at") or ""))
    if recorded is None:
        return False
    if recorded.tzinfo is None:
        recorded = recorded.replace(tzinfo=timezone.utc)
    return recorded < cutoff


def list_retention_candidates(
    *,
    days: Optional[int] = None,
    now: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """Runs older than retention days (by recorded_at). Skips legal_hold checks."""
    cut_days = int(days if days is not None else retention_days())
    moment = now or _now()
    cutoff = moment - timedelta(days=cut_days)
    snap = load_artifact_index()
    out: List[Dict[str, Any]] = []
    for cid, entry in (snap.get("checks") or {}).items():
        if not isinstance(entry, dict):
            continue
        if check_legal_hold(str(cid)) or bool(entry.get("legal_hold")):
            continue
        for run in entry.get("runs") or []:
            if not isinstance(run, dict) or not _run_past_cutoff(run, cutoff):
                continue
            out.append(
                {
                    "check_id": cid,
                    "run_id": run.get("run_id"),
                    "recorded_at": run.get("recorded_at"),
                    "paths": run.get("paths") if isinstance(run.get("paths"), dict) else {},
                    "dojo": run.get("dojo") if isinstance(run.get("dojo"), dict) else {},
                }
            )
    return out


def _safe_unlink_path(path: Path, *, allow_roots: List[Path]) -> Tuple[bool, str]:
    try:
        resolved = path.resolve()
    except OSError as exc:
        return False, str(exc)
    allowed = False
    for root in allow_roots:
        try:
            resolved.relative_to(root.resolve())
            allowed = True
            break
        except ValueError:
            continue
    if not allowed:
        return False, "outside_reports_tree"
    # Never wipe entire allure-results root in one shot via bare dir name match
    from utils.paths import ALLURE_RESULTS_DIR, REPORTS_DIR

    if resolved == ALLURE_RESULTS_DIR.resolve():
        return False, "refuse_wipe_allure_results_root"
    if resolved == REPORTS_DIR.resolve():
        return False, "refuse_wipe_reports_root"
    if not resolved.exists():
        return True, "already_gone"
    try:
        if resolved.is_dir():
            shutil.rmtree(resolved)
        else:
            resolved.unlink()
        return True, "deleted"
    except OSError as exc:
        return False, str(exc)


def _purge_paths_from_entry(
    entry: Dict[str, Any],
    *,
    allow_roots: List[Path],
    dry_run: bool,
) -> Tuple[List[str], List[Dict[str, str]]]:
    deleted: List[str] = []
    skipped: List[Dict[str, str]] = []
    for run in entry.get("runs") or []:
        if not isinstance(run, dict):
            continue
        paths = run.get("paths") if isinstance(run.get("paths"), dict) else {}
        for _key, raw in paths.items():
            p = Path(str(raw))
            if dry_run:
                deleted.append(str(p))
                continue
            ok, reason = _safe_unlink_path(p, allow_roots=allow_roots)
            if ok and reason in ("deleted", "already_gone"):
                deleted.append(str(p))
            else:
                skipped.append({"path": str(p), "reason": reason})
    return deleted, skipped


def purge_disk_for_check(check_id: str, *, dry_run: bool = False) -> Dict[str, Any]:
    """Delete paths listed in index for check_id. Never wipe allure-results wholesale."""
    from utils.paths import REPORTS_DIR, ZAP_RESULTS_DIR, RUNS_DIR, ALLURE_RESULTS_DIR

    if check_legal_hold(check_id):
        return {
            "ok": False,
            "error": "legal_hold",
            "deleted": [],
            "skipped": [{"path": "*", "reason": "legal_hold"}],
        }
    if not purge_globally_enabled() and not dry_run:
        return {
            "ok": False,
            "error": "purge_disabled",
            "deleted": [],
            "skipped": [{"path": "*", "reason": "PK_ARTIFACT_PURGE=0"}],
        }
    entry = get_check_entry(check_id)
    if not entry:
        return {"ok": False, "error": "index_empty", "deleted": [], "skipped": []}
    allow = [REPORTS_DIR, RUNS_DIR, ZAP_RESULTS_DIR, ALLURE_RESULTS_DIR]
    deleted, skipped = _purge_paths_from_entry(entry, allow_roots=allow, dry_run=dry_run)
    event = {
        "action": "purge_disk",
        "check_id": check_id,
        "dry_run": dry_run,
        "deleted": deleted,
        "skipped": skipped,
    }
    if not dry_run:
        _append_audit(event)
    return {"ok": True, "error": None, **event}


def _delete_dojo_tests(
    entry: Dict[str, Any],
    *,
    url_base: str,
    token: str,
    dry_run: bool,
) -> tuple[List[Any], List[str]]:
    import requests

    timeout = int((pk_env("DEFECTDOJO_TIMEOUT_SEC") or "120").strip() or "120")
    deleted: List[Any] = []
    notes: List[str] = []
    for run in entry.get("runs") or []:
        if not isinstance(run, dict):
            continue
        dojo = run.get("dojo") if isinstance(run.get("dojo"), dict) else {}
        test_id = dojo.get("test_id")
        if test_id is None or test_id == "":
            notes.append("no_test_id")
            continue
        if dry_run:
            deleted.append(test_id)
            continue
        try:
            resp = requests.delete(
                f"{url_base}/api/v2/tests/{test_id}/",
                headers={"Authorization": f"Token {token}"},
                timeout=timeout,
            )
            if resp.status_code < 400 or resp.status_code == 404:
                deleted.append(test_id)
            else:
                notes.append(f"http_{resp.status_code}:{test_id}")
        except Exception as exc:
            notes.append(str(exc))
    return deleted, notes


def purge_dojo_for_check(check_id: str, *, dry_run: bool = False) -> Dict[str, Any]:
    """
    ART-7: delete Dojo test only when ENGAGEMENT_MODE=check (owned).
    fixed shared → skip.
    """
    from adapters.defectdojo_client import engagement_mode

    if check_legal_hold(check_id):
        return {
            "ok": False,
            "error": "legal_hold",
            "notes": ["legal_hold"],
            "deleted_tests": [],
        }
    entry = get_check_entry(check_id)
    if not entry:
        return {"ok": False, "error": "index_empty", "notes": ["no_index"]}
    mode = engagement_mode()
    if mode != "check":
        note = f"skip_dojo_mode_{mode}"
        if not dry_run:
            _append_audit(
                {"action": "purge_dojo", "check_id": check_id, "skipped": note}
            )
        return {"ok": True, "error": None, "skipped": note, "deleted_tests": []}

    url_base = (pk_env("DEFECTDOJO_URL") or "").strip().rstrip("/")
    token = (pk_env("DEFECTDOJO_TOKEN") or "").strip()
    if not url_base or not token:
        return {"ok": False, "error": "not_configured", "deleted_tests": []}

    deleted, notes = _delete_dojo_tests(
        entry, url_base=url_base, token=token, dry_run=dry_run
    )
    if not dry_run:
        _append_audit(
            {
                "action": "purge_dojo",
                "check_id": check_id,
                "deleted_tests": deleted,
                "notes": notes,
            }
        )
    return {
        "ok": True,
        "error": None,
        "deleted_tests": deleted,
        "notes": notes,
        "dry_run": dry_run,
    }


def purge_check_artifacts(
    check_id: str,
    *,
    dry_run: bool = False,
    include_dojo: bool = True,
    remove_index: bool = True,
) -> Dict[str, Any]:
    if check_legal_hold(check_id):
        return {
            "ok": False,
            "error": "legal_hold",
            "disk": {"ok": False, "error": "legal_hold"},
            "dojo": {"skipped": "legal_hold"},
            "index_removed": False,
            "dry_run": dry_run,
        }
    disk = purge_disk_for_check(check_id, dry_run=dry_run)
    dojo: Dict[str, Any] = {"skipped": "not_requested"}
    if include_dojo:
        dojo = purge_dojo_for_check(check_id, dry_run=dry_run)
    index_removed = False
    if remove_index and not dry_run and disk.get("ok"):
        index_removed = bool(unlink_check(check_id))
    return {
        "ok": bool(disk.get("ok")),
        "disk": disk,
        "dojo": dojo,
        "index_removed": index_removed,
        "dry_run": dry_run,
        "error": disk.get("error"),
    }
