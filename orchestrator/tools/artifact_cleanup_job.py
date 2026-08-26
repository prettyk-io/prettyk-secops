# -*- coding: utf-8 -*-
"""
ART-5/6 CLI: artifact cleanup job (dry-run default).

  py -3 orchestrator/tools/artifact_cleanup_job.py --dry-run
  py -3 orchestrator/tools/artifact_cleanup_job.py --execute --check-id chk_x
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))



def _cmd_orphans() -> int:
    from utils.artifact_cleanup import scan_orphan_run_dirs

    orphans = scan_orphan_run_dirs()
    print(
        json.dumps(
            {"ok": True, "orphan_count": len(orphans), "orphans": orphans},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def _cmd_audit(*, audit: bool, export: bool, limit: int) -> int:
    from utils.artifact_cleanup import export_cleanup_audit, read_cleanup_audit

    payload: dict = {"ok": True}
    if audit:
        events = read_cleanup_audit(limit=limit)
        payload["count"] = len(events)
        payload["events"] = events
    if export:
        payload["export"] = export_cleanup_audit()
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if payload.get("export", {}).get("ok", True) else 1


def _cmd_hold(*, check_id: str, hold: bool, release: bool, note: str) -> int:
    cid = check_id.strip()
    if not cid:
        print(json.dumps({"ok": False, "error": "check_id required"}, ensure_ascii=False))
        return 1
    if hold and release:
        print(
            json.dumps(
                {"ok": False, "error": "use --hold or --release-hold, not both"},
                ensure_ascii=False,
            )
        )
        return 1
    from utils.artifact_index import set_check_legal_hold

    entry = set_check_legal_hold(cid, bool(hold), note=str(note or ""))
    print(
        json.dumps(
            {
                "ok": True,
                "check_id": cid,
                "legal_hold": bool((entry or {}).get("legal_hold")),
                "legal_hold_note": (entry or {}).get("legal_hold_note") or "",
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="PK artifact cleanup (ART)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="list candidates / planned deletes (default)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="actually delete (implies not dry-run)",
    )
    parser.add_argument("--check-id", default="", help="purge one check_id")
    parser.add_argument(
        "--hold",
        action="store_true",
        help="SURVEY-3: set legal_hold on --check-id (skip retention/purge)",
    )
    parser.add_argument(
        "--release-hold",
        action="store_true",
        help="SURVEY-3: clear legal_hold on --check-id",
    )
    parser.add_argument(
        "--hold-note",
        default="",
        help="optional note with --hold",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="override retention days for candidate listing",
    )
    parser.add_argument(
        "--orphans",
        action="store_true",
        help="ART-10: list run dirs under reports/runs not in index",
    )
    parser.add_argument(
        "--audit",
        action="store_true",
        help="ART-12: print last cleanup audit events",
    )
    parser.add_argument(
        "--audit-limit",
        type=int,
        default=50,
        help="max audit lines (with --audit)",
    )
    parser.add_argument(
        "--export-audit",
        action="store_true",
        help="copy audit ndjson to live/exports/",
    )
    args = parser.parse_args(argv)
    dry = not bool(args.execute)

    if args.orphans:
        return _cmd_orphans()
    if args.audit or args.export_audit:
        return _cmd_audit(
            audit=bool(args.audit),
            export=bool(args.export_audit),
            limit=args.audit_limit,
        )
    if args.hold or args.release_hold:
        return _cmd_hold(
            check_id=args.check_id,
            hold=bool(args.hold),
            release=bool(args.release_hold),
            note=str(args.hold_note or ""),
        )

    if args.check_id.strip():
        from utils.artifact_cleanup import purge_check_artifacts

        result = purge_check_artifacts(
            args.check_id.strip(), dry_run=dry, include_dojo=True
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result.get("ok") else 1

    return _cmd_retention_batch(days=args.days, dry=dry)


def _cmd_retention_batch(*, days: int | None, dry: bool) -> int:
    from utils.artifact_cleanup import (
        count_held_checks,
        list_retention_candidates,
        purge_check_artifacts,
    )
    from utils.retention_policy import retention_days

    cut = days if days is not None else retention_days()
    candidates = list_retention_candidates(days=cut)
    payload = {
        "ok": True,
        "dry_run": dry,
        "retention_days": cut,
        "candidate_count": len(candidates),
        "held_skipped": count_held_checks(),
        "candidates": candidates,
    }
    if not dry:
        executed = []
        for c in candidates:
            cid = str(c.get("check_id") or "")
            if not cid:
                continue
            executed.append(purge_check_artifacts(cid, dry_run=False))
        payload["executed"] = executed
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
