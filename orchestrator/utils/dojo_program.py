# -*- coding: utf-8 -*-
"""
ADM-DOJO-1: program-level DefectDojo severity aggregate by meta.project_id.

Lab convention: Dojo Product.name == project_id (no auto-create).
Honesty: unconfigured / down / product_missing — never fake green zeros as ok.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_EMPTY_STATS = {
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "info": 0,
}


def _sev_key(raw: Any) -> Optional[str]:
    from core.gate_policy import normalize_severity

    name = normalize_severity(str(raw) if raw is not None else "")
    low = name.lower()
    if low == "informational":
        return "info"
    if low in _EMPTY_STATS:
        return low
    return None


def counts_from_findings(findings: List[Dict[str, Any]]) -> Dict[str, int]:
    out = dict(_EMPTY_STATS)
    for row in findings:
        if not isinstance(row, dict):
            continue
        key = _sev_key(row.get("severity"))
        if key:
            out[key] = int(out[key]) + 1
    return out


def lookup_product_by_project_id(
    project_id: str,
    *,
    dojo_url: Optional[str] = None,
    token: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Resolve Dojo Product where name matches project_id (exact, then icontains).
    Returns {ok, product_id?, name?, error?, status?}.
    """
    from adapters.defectdojo_client import _env, _load_lab_env, defectdojo_configured
    import requests

    pid = (project_id or "").strip()
    if not pid:
        return {"ok": False, "status": "bad_request", "error": "project_id_required"}

    _load_lab_env()
    if not defectdojo_configured():
        return {"ok": False, "status": "unconfigured", "error": "not_configured"}

    url_base = (dojo_url or _env("PK_DEFECTDOJO_URL")).rstrip("/")
    api_token = token or _env("PK_DEFECTDOJO_TOKEN")
    timeout = int(_env("PK_DEFECTDOJO_TIMEOUT_SEC", "60") or "60")
    headers = {"Authorization": f"Token {api_token}", "accept": "application/json"}
    endpoint = f"{url_base}/api/v2/products/"

    def _first_match(params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        resp = requests.get(endpoint, headers=headers, params=params, timeout=timeout)
        if resp.status_code >= 400:
            raise RuntimeError(f"http_{resp.status_code}")
        body = resp.json()
        rows = body.get("results") if isinstance(body, dict) else body
        if not isinstance(rows, list):
            return None
        for row in rows:
            if isinstance(row, dict) and row.get("id") is not None:
                return row
        return None

    try:
        hit = _first_match({"name": pid, "limit": 20})
        if hit is None:
            # loose: scan first page for exact name (some Dojo builds ignore name=)
            resp = requests.get(
                endpoint,
                headers=headers,
                params={"limit": 200},
                timeout=timeout,
            )
            if resp.status_code >= 400:
                return {
                    "ok": False,
                    "status": "down",
                    "error": f"http_{resp.status_code}",
                }
            body = resp.json()
            rows = body.get("results") if isinstance(body, dict) else body
            if isinstance(rows, list):
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    if str(row.get("name") or "").strip() == pid:
                        hit = row
                        break
        if hit is None:
            return {"ok": False, "status": "product_missing", "error": "no_product"}
        return {
            "ok": True,
            "status": "ok",
            "product_id": hit.get("id"),
            "name": hit.get("name"),
        }
    except Exception as exc:
        logger.warning("Dojo product lookup failed project_id=%s: %s", pid, exc)
        return {"ok": False, "status": "down", "error": str(exc)}


def aggregate_dojo_for_project(
    project_id: str,
    *,
    dojo_url: Optional[str] = None,
    token: Optional[str] = None,
    limit: int = 500,
) -> Dict[str, Any]:
    """
    ACTIVE findings severity counts for Product named project_id.

    status: ok | unconfigured | down | product_missing | bad_request
    """
    import time

    from adapters.defectdojo_client import (
        build_dojo_engagement_url,
        defectdojo_configured,
        list_findings_for_gate,
        _env,
        _load_lab_env,
    )

    pid = (project_id or "").strip()
    at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    base: Dict[str, Any] = {
        "project_id": pid,
        "at": at,
        "stats": None,
        "product_id": None,
        "engagement_url": None,
        "findings_n": 0,
    }
    if not pid:
        return {**base, "ok": False, "status": "bad_request", "error": "project_id_required"}

    _load_lab_env()
    if not defectdojo_configured():
        return {
            **base,
            "ok": False,
            "status": "unconfigured",
            "error": "not_configured",
        }

    product = lookup_product_by_project_id(pid, dojo_url=dojo_url, token=token)
    if not product.get("ok"):
        return {
            **base,
            "ok": False,
            "status": product.get("status") or "down",
            "error": product.get("error"),
        }

    product_id = product.get("product_id")
    listed = list_findings_for_gate(
        product_id=product_id,
        dojo_url=dojo_url,
        token=token,
        limit=limit,
    )
    if not listed.get("ok"):
        return {
            **base,
            "ok": False,
            "status": "down",
            "product_id": product_id,
            "error": listed.get("error") or "findings_failed",
        }

    findings = [f for f in (listed.get("findings") or []) if isinstance(f, dict)]
    stats = counts_from_findings(findings)
    url_base = (dojo_url or _env("PK_DEFECTDOJO_URL")).rstrip("/")
    # Prefer product page; engagement_url filled when a finding exposes engagement
    engagement_url = f"{url_base}/product/{product_id}" if product_id is not None else None
    for f in findings:
        eng = f.get("test_engagement") or f.get("engagement")
        if eng is not None and eng != "":
            engagement_url = build_dojo_engagement_url(url_base, eng)
            break

    return {
        **base,
        "ok": True,
        "status": "ok",
        "product_id": product_id,
        "product_name": product.get("name"),
        "stats": stats,
        "findings_n": len(findings),
        "engagement_url": engagement_url,
        "pages": listed.get("pages"),
    }


def aggregate_dojo_program(
    project_ids: List[str],
    *,
    dojo_url: Optional[str] = None,
    token: Optional[str] = None,
) -> Dict[str, Any]:
    """Batch aggregate. Top-level status reflects config/down before per-item."""
    from adapters.defectdojo_client import defectdojo_configured, _load_lab_env

    _load_lab_env()
    ids = []
    seen = set()
    for raw in project_ids:
        pid = (raw or "").strip()
        if not pid or pid in seen:
            continue
        seen.add(pid)
        ids.append(pid)

    if not defectdojo_configured():
        return {
            "ok": False,
            "status": "unconfigured",
            "error": "not_configured",
            "items": {
                pid: {
                    "ok": False,
                    "status": "unconfigured",
                    "project_id": pid,
                    "stats": None,
                }
                for pid in ids
            },
        }

    items: Dict[str, Any] = {}
    any_ok = False
    any_down = False
    for pid in ids:
        row = aggregate_dojo_for_project(pid, dojo_url=dojo_url, token=token)
        items[pid] = row
        if row.get("ok"):
            any_ok = True
        elif row.get("status") == "down":
            any_down = True

    if not ids:
        return {
            "ok": False,
            "status": "bad_request",
            "error": "project_id_required",
            "items": {},
        }
    if any_ok:
        top = "ok"
        ok = True
    elif any_down:
        top = "down"
        ok = False
    else:
        # all product_missing / bad
        top = "partial"
        ok = False
    return {"ok": ok, "status": top, "items": items}
