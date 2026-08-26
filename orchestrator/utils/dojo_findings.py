# -*- coding: utf-8 -*-
"""
ADM-DOJO-FULL-1: thin active findings list for Live `/api/dojo/findings`.

Delegates product lookup to dojo_program; returns thin rows (not full Dojo UI).
Honesty: unconfigured / down / product_missing -> findings null (no green zeros).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from utils.dojo_program import lookup_product_by_project_id

_SEV_KEYS = ("critical", "high", "medium", "low", "info")


def _sev_key(raw: Any) -> Optional[str]:
    from core.gate_policy import normalize_severity

    low = normalize_severity(str(raw) if raw is not None else "").lower()
    if low == "informational":
        return "info"
    if low in _SEV_KEYS:
        return low
    return None


def _boolish(raw: Any) -> bool:
    if isinstance(raw, bool):
        return raw
    return str(raw).lower() in {"1", "true", "yes", "on"}


def thin_findings_from_rows(
    rows: List[Dict[str, Any]],
    *,
    max_findings: int = 200,
) -> List[Dict[str, Any]]:
    """Map raw Dojo finding rows to thin FE-safe objects."""
    out: List[Dict[str, Any]] = []
    for row in rows[:max_findings]:
        if not isinstance(row, dict):
            continue
        sev = _sev_key(row.get("severity"))
        if not sev:
            continue
        engaged = row.get("test_engagement") or row.get("engagement")
        out.append(
            {
                "id": row.get("id"),
                "title": str(row.get("title") or "").strip(),
                "severity": sev,
                "cwe": row.get("cwe") if row.get("cwe") is not None else None,
                "active": _boolish(row.get("active")),
                "verified": _boolish(row.get("verified")),
                "false_p": _boolish(row.get("false_p")),
                "duplicate": _boolish(row.get("duplicate")),
                "is_mitigated": _boolish(row.get("is_mitigated")),
                "date": str(row.get("date") or row.get("created") or "")[:10],
                "url": str(row.get("url") or row.get("endpoints") or "") or None,
                "test_engagement": engaged if engaged is not None and engaged != "" else None,
            }
        )
    return out


def verified_false_p_counts(
    rows: List[Dict[str, Any]],
) -> Dict[str, int]:
    """verified=true and false_p=true tallies (independent of severity aggregation)."""
    from utils.dojo_program import counts_from_findings

    verified = [r for r in rows if isinstance(r, dict) and _boolish(r.get("verified"))]
    false_p = [r for r in rows if isinstance(r, dict) and _boolish(r.get("false_p"))]
    return {
        "verified": counts_from_findings(verified),
        "false_p": counts_from_findings(false_p),
    }


def fetch_findings_for_project(
    project_id: str,
    *,
    dojo_url: Optional[str] = None,
    token: Optional[str] = None,
    limit: int = 500,
    max_findings: int = 200,
) -> Dict[str, Any]:
    """
    Envelope for FE:
      ok, status (ok|unconfigured|down|not_found|bad_request|error),
      project_id, findings|null, verified, false_p, product_id, engagement_url
    """
    from adapters.defectdojo_client import (
        _env,
        _load_lab_env,
        build_dojo_engagement_url,
        defectdojo_configured,
        list_findings_for_gate,
    )
    import time

    pid = (project_id or "").strip()
    at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    base: Dict[str, Any] = {
        "ok": False,
        "status": "error",
        "project_id": pid,
        "at": at,
        "findings": None,
        "verified": None,
        "false_p": None,
        "product_id": None,
        "engagement_url": None,
        "findings_n": 0,
    }
    if not pid:
        return {**base, "status": "bad_request", "error": "project_id_required"}

    _load_lab_env()
    if not defectdojo_configured():
        return {**base, "status": "unconfigured", "error": "not_configured"}

    product = lookup_product_by_project_id(pid, dojo_url=dojo_url, token=token)
    if not product.get("ok"):
        status = str(product.get("status") or "error")
        if status == "product_missing":
            status = "not_found"
        return {
            **base,
            "status": status,
            "error": product.get("error"),
        }

    product_id = product.get("product_id")
    listed = list_findings_for_gate(
        product_id=product_id,
        dojo_url=dojo_url,
        token=token,
        limit=limit,
        max_pages=10,
    )
    if not listed.get("ok"):
        return {
            **base,
            "status": "down",
            "product_id": product_id,
            "error": listed.get("error") or "findings_failed",
        }

    rows = [f for f in (listed.get("findings") or []) if isinstance(f, dict)]
    verified_fp = verified_false_p_counts(rows)
    url_base = (dojo_url or _env("PK_DEFECTDOJO_URL")).rstrip("/")
    engagement_url = None
    for row in rows:
        eng = row.get("test_engagement") or row.get("engagement")
        if eng is not None and eng != "":
            engagement_url = build_dojo_engagement_url(url_base, eng)
            break
    if engagement_url is None and product_id is not None:
        engagement_url = f"{url_base}/product/{product_id}"

    return {
        **base,
        "ok": True,
        "status": "ok",
        "product_id": product_id,
        "findings": thin_findings_from_rows(rows, max_findings=max_findings),
        "findings_n": len(rows),
        "verified": verified_fp["verified"],
        "false_p": verified_fp["false_p"],
        "engagement_url": engagement_url,
    }
