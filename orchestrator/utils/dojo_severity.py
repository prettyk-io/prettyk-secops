# -*- coding: utf-8 -*-
"""
ADM-DOJO-1: per-project severity snapshot for Live `/api/dojo/severity`.

Delegates product lookup + ACTIVE counts to dojo_program; adds cheap daily series.
Honesty: unconfigured / down / not_found → stats null (no green zeros).
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional

from utils.dojo_program import aggregate_dojo_for_project, counts_from_findings

_SEV_KEYS = ("critical", "high", "medium", "low", "info")


def _severity_bucket(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    text = str(raw).strip().lower()
    if text in _SEV_KEYS:
        return text
    if text in {"informational", "information"}:
        return "info"
    return None


def series_from_findings(findings: List[Dict[str, Any]], *, max_points: int = 8) -> List[Dict[str, Any]]:
    by_day: Dict[str, Dict[str, int]] = defaultdict(lambda: {k: 0 for k in _SEV_KEYS})
    for row in findings:
        if not isinstance(row, dict):
            continue
        bucket = _severity_bucket(row.get("severity"))
        if not bucket:
            continue
        raw = row.get("date") or row.get("created") or ""
        day = str(raw)[:10]
        if len(day) < 10:
            continue
        by_day[day][bucket] += 1
    days = sorted(by_day.keys())[-max_points:]
    out: List[Dict[str, Any]] = []
    for day in days:
        tallies = by_day[day]
        out.append(
            {
                "at": f"{day}T00:00:00Z",
                "label": day[5:],
                "critical": int(tallies.get("critical") or 0),
                "high": int(tallies.get("high") or 0),
                "medium": int(tallies.get("medium") or 0),
                "low": int(tallies.get("low") or 0),
            }
        )
    return out


def fetch_severity_for_project(project_id: str) -> Dict[str, Any]:
    """
    Envelope for FE:
      ok, status (ok|unconfigured|down|not_found|error|bad_request),
      project_id, stats|null, series, engagement_url, product_id, …
    """
    row = aggregate_dojo_for_project(project_id)
    status = str(row.get("status") or "error")
    # Align naming for FE honesty tags
    if status == "product_missing":
        status = "not_found"
    out: Dict[str, Any] = {
        "ok": bool(row.get("ok")),
        "status": status,
        "project_id": row.get("project_id") or (project_id or "").strip(),
        "stats": row.get("stats") if row.get("ok") else None,
        "series": [],
        "product_id": row.get("product_id"),
        "engagement_id": row.get("engagement_id"),
        "engagement_url": row.get("engagement_url") or "",
        "findings_n": row.get("findings_n") or 0,
        "fetched_at": row.get("at"),
    }
    if row.get("error"):
        out["error"] = row.get("error")
    if not row.get("ok"):
        return out

    # Re-list findings only for series when we already succeeded (cheap path via stored n).
    # Prefer building series without second round-trip: re-call list with same product.
    try:
        from adapters.defectdojo_client import list_findings_for_gate

        listed = list_findings_for_gate(
            product_id=row.get("product_id"),
            limit=500,
            max_pages=10,
        )
        if listed.get("ok"):
            findings = [f for f in (listed.get("findings") or []) if isinstance(f, dict)]
            out["series"] = series_from_findings(findings)
            # Keep counts consistent with series source
            out["stats"] = counts_from_findings(findings)
            out["findings_n"] = len(findings)
    except Exception:  # noqa: BLE001
        out["series"] = []
    return out
