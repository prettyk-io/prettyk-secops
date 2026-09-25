# -*- coding: utf-8 -*-
"""
RES-4: сводка из Traditional scanner XML (без HTML-скрейпа).

Канон: docs/internal/run-summary-ui.md
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from core.finding_collapse import collapse_findings

PathLike = Union[str, Path]

_RISK = {
    "0": "info",
    "1": "low",
    "2": "medium",
    "3": "high",
    # scanner has no native critical; map via riskdesc if needed
}


def _text(el: Optional[ET.Element]) -> str:
    if el is None or el.text is None:
        return ""
    return str(el.text).strip()


def _risk_key(alertitem: ET.Element) -> str:
    code = _text(alertitem.find("riskcode"))
    if code in _RISK:
        return _RISK[code]
    desc = _text(alertitem.find("riskdesc")).lower()
    for key in ("critical", "high", "medium", "low", "info"):
        if key in desc:
            return "info" if key == "informational" else key
    return "info"


def _empty_scanner_summary(root_path: Path) -> Dict[str, Any]:
    return {
        "ok": False,
        "path": str(root_path),
        "sites": 0,
        "alert_count": 0,
        "instance_count": 0,
        "counts": {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0},
        "instance_counts": {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0},
        "top_findings": [],
        "collapse": None,
        "error": None,
    }


def _ingest_alertitem(
    item: ET.Element,
    site_name: str,
    *,
    findings: List[Dict[str, Any]],
    alert_rows: List[Dict[str, Any]],
    counts: Dict[str, int],
    instance_counts: Dict[str, int],
) -> int:
    risk = _risk_key(item)
    name = _text(item.find("name")) or _text(item.find("alert")) or "(alert)"
    plugin = _text(item.find("pluginid"))
    alert_ref = _text(item.find("alertRef")) or plugin
    cwe = _text(item.find("cweid"))
    count_el = _text(item.find("count"))
    instances = list(item.findall("./instances/instance"))
    n_inst = len(instances)
    if count_el.isdigit():
        n_inst = max(n_inst, int(count_el))
    if n_inst <= 0:
        n_inst = 1
    counts[risk] = counts.get(risk, 0) + 1
    instance_counts[risk] = instance_counts.get(risk, 0) + n_inst
    alert_rows.append(
        {
            "name": name,
            "risk": risk,
            "count": n_inst,
            "pluginid": plugin,
            "alertRef": alert_ref,
            "cwe": cwe,
            "site": site_name,
        }
    )
    for inst in instances:
        uri = _text(inst.find("uri"))
        param = _text(inst.find("param"))
        findings.append(
            {
                "title": name,
                "name": name,
                "severity": risk,
                "active": True,
                "false_p": False,
                "duplicate": False,
                "url": uri,
                "param": param,
                "pluginid": plugin,
                "alertRef": alert_ref,
                "cwe": cwe,
            }
        )
    if not instances:
        findings.append(
            {
                "title": name,
                "name": name,
                "severity": risk,
                "active": True,
                "url": site_name,
                "pluginid": plugin,
                "alertRef": alert_ref,
                "cwe": cwe,
            }
        )
    return n_inst


def summarize_scanner_xml(path: PathLike) -> Dict[str, Any]:
    """
    Parse OWASPscannerReport XML → counts (by alertitem) + top + collapse-ready findings.
    """
    root_path = Path(path)
    empty = _empty_scanner_summary(root_path)
    if not root_path.is_file():
        empty["error"] = "missing"
        return empty
    try:
        tree = ET.parse(root_path)
        root = tree.getroot()
    except (ET.ParseError, OSError) as exc:
        empty["error"] = str(exc)
        return empty

    findings: List[Dict[str, Any]] = []
    alert_rows: List[Dict[str, Any]] = []
    sites = 0
    instance_total = 0
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    instance_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}

    for site in root.findall(".//site"):
        sites += 1
        site_name = site.attrib.get("name") or ""
        for item in site.findall(".//alertitem"):
            instance_total += _ingest_alertitem(
                item,
                site_name,
                findings=findings,
                alert_rows=alert_rows,
                counts=counts,
                instance_counts=instance_counts,
            )

    alert_rows.sort(
        key=lambda r: (
            {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}.get(r["risk"], 0),
            r["count"],
        ),
        reverse=True,
    )
    collapse = collapse_findings(findings).as_dict() if findings else None
    return {
        "ok": True,
        "path": str(root_path.resolve()),
        "sites": sites,
        "alert_count": len(alert_rows),
        "instance_count": instance_total,
        "counts": counts,
        "instance_counts": instance_counts,
        "top_findings": [
            {
                "name": r["name"],
                "risk": r["risk"],
                "count": r["count"],
                "alertRef": r["alertRef"],
            }
            for r in alert_rows[:25]
        ],
        "collapse": collapse,
        "error": None,
    }
