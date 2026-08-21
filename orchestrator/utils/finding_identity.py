# -*- coding: utf-8 -*-
"""QWEN3-ALERT-ASSISTANT W1: canonical finding-v1 fingerprint.

Stable cross-run identity for ZAP findings.

Fingerprint formula:
  sha256(source|plugin_id|alert_ref|method|normalized_path|normalized_parameter)

Dojo database id is NEVER part of the fingerprint — only a display reference.
"""
from __future__ import annotations

import hashlib
from typing import Any, Optional
from urllib.parse import urlparse, parse_qs, urlunparse

from models.finding import CanonicalFinding, FINGERPRINT_VERSION


def normalize_path(raw_uri: str) -> str:
    """Strip query string and fragment, keep only scheme://host/path.

    Dynamic segments (IDs, hashes, timestamps) are also removed.
    """
    if not raw_uri or not isinstance(raw_uri, str):
        return ""
    uri = raw_uri.strip()
    if not uri:
        return ""
    try:
        parsed = urlparse(uri)
    except Exception:
        return uri
    clean_path = parsed.path.strip("/")
    segments = clean_path.split("/") if clean_path else []
    normalized: list[str] = []
    for seg in segments:
        normalized.append(_normalize_segment(seg))
    scheme = parsed.scheme or "http"
    return f"{scheme}://{parsed.netloc or 'localhost'}/{('/'.join(normalized)) if normalized else ''}"


def normalize_parameter(raw_param: str) -> str:
    """Normalize query parameter name — lowercase, strip dynamic suffixes."""
    if not raw_param or not isinstance(raw_param, str):
        return ""
    return raw_param.strip().lower()


def _normalize_segment(segment: str) -> str:
    """Replace dynamic-looking segments with placeholders."""
    if not segment:
        return segment
    if segment.isdigit():
        return "{id}"
    if segment.count("-") >= 2 and any(c.isdigit() for c in segment):
        return "{uuid}"
    if len(segment) > 30 and segment.count("-") >= 3:
        return "{hash}"
    return segment


def compute_fingerprint(
    source: str,
    plugin_id: str,
    alert_ref: str,
    method: str,
    path: str,
    parameter: str,
) -> str:
    """Stable finding-v1 fingerprint. Dojo ID NOT included."""
    raw = "|".join([
        (source or "zap").strip(),
        (plugin_id or "").strip(),
        (alert_ref or "").strip(),
        (method or "GET").strip().upper(),
        (path or "").strip(),
        (parameter or "").strip().lower(),
    ])
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"finding:{FINGERPRINT_VERSION}:{digest[:24]}"


def build_canonical_finding(
    raw_zap_alert: dict[str, Any],
    instance: Optional[dict[str, Any]] = None,
    dojo_id: Optional[int] = None,
    dojo_url: Optional[str] = None,
) -> Optional[CanonicalFinding]:
    """Build one CanonicalFinding from a ZAP alert + optional instance + Dojo ref.

    One ZAP alert may have multiple instances — each with different path/parameter.
    If ``instance`` is None, the first instance is used.
    """
    if not isinstance(raw_zap_alert, dict):
        return None

    plugin_id = str(raw_zap_alert.get("pluginid", ""))
    alert_ref = str(raw_zap_alert.get("alertRef", ""))
    if not plugin_id or not alert_ref:
        return None

    instances: list = raw_zap_alert.get("instances") or []
    if not instance and instances:
        instance = instances[0] if isinstance(instances, list) else instances

    method = "GET"
    raw_uri = ""
    raw_param = ""
    if isinstance(instance, dict):
        method = str(instance.get("method", "GET")).upper() or "GET"
        raw_uri = str(instance.get("uri", ""))
        raw_param = str(instance.get("param", ""))

    path = normalize_path(raw_uri)
    parameter = normalize_parameter(raw_param)

    fingerprint = compute_fingerprint(
        source="zap",
        plugin_id=plugin_id,
        alert_ref=alert_ref,
        method=method,
        path=path,
        parameter=parameter,
    )

    return CanonicalFinding(
        finding_id=fingerprint,
        source="zap",
        plugin_id=plugin_id,
        alert_ref=alert_ref,
        title=str(raw_zap_alert.get("name", "")),
        severity=str(raw_zap_alert.get("risk", "info")).lower(),
        cwe=str(raw_zap_alert.get("cwe", "")),
        method=method,
        path=raw_uri,
        parameter=raw_param,
        evidence_refs=[f"artifact://zap.xml#alert/{alert_ref}/instance/{getattr(instance, '__', 0)}"],
        dojo_id=dojo_id,
        dojo_url=dojo_url,
    )


def _dojo_row_for_title(dojo_lookup: dict[str, dict[str, Any]], title: str) -> Optional[dict[str, Any]]:
    return dojo_lookup.get(title) if title else None


def _dojo_id_from_row(row: Optional[dict[str, Any]]) -> Optional[int]:
    if row and "id" in row:
        return int(row["id"])
    return None


def _dojo_url_from_row(row: Optional[dict[str, Any]], fallback: str = "") -> Optional[str]:
    if row and row.get("url"):
        return str(row["url"])
    return fallback or None


def build_canonical_findings_from_run(
    zap_raw_alerts: list[dict[str, Any]],
    dojo_findings: Optional[list[dict[str, Any]]] = None,
) -> list[CanonicalFinding]:
    """Build canonical finding list from ZAP raw alerts.

    Each ZAP alert instance becomes its own CanonicalFinding.
    Dojo findings are matched by title for display reference only (NOT identity).
    """
    dojo_lookup: dict[str, dict[str, Any]] = {}
    if dojo_findings:
        for f in dojo_findings:
            title = str(f.get("title", "")).strip()
            if title:
                # First match wins for reference lookup
                if title not in dojo_lookup:
                    dojo_lookup[title] = f

    results: list[CanonicalFinding] = []
    for alert in zap_raw_alerts:
        if not isinstance(alert, dict):
            continue
        instances: list = alert.get("instances") or []
        title = str(alert.get("name", ""))
        dojo_row = _dojo_row_for_title(dojo_lookup, title)

        items = instances if instances else [None]
        for idx, inst in enumerate(items):
            dojo_id = _dojo_id_from_row(dojo_row)
            dojo_url = _dojo_url_from_row(dojo_row, f"[{idx + 1}]" if inst else "")
            cf = build_canonical_finding(alert, instance=inst, dojo_id=dojo_id, dojo_url=dojo_url)
            if cf:
                results.append(cf)

    return results


def load_zap_alerts(path: str) -> list[dict[str, Any]]:
    """Load ZAP raw alerts from a JSON file."""
    import json
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, dict):
        return data.get("alerts", data.get("alert", []))
    if isinstance(data, list):
        return data
    return []