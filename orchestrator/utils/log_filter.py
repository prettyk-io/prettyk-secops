# -*- coding: utf-8 -*-
"""W3.8: Live Log Anomaly Filter — поднимает только ошибки/аномалии из потока."""
from __future__ import annotations

import re
from dataclasses import dataclass, field


ERROR_PATTERNS = [
    (re.compile(r"HTTP\s+(\d{3})", re.I), "{status}"),
    (re.compile(r"ERR(?:OR)?\s*[:\-]\s*(.+?)(?:\r?\n|$)", re.I), "ERROR: {detail}"),
    (re.compile(r"(?:Fail|Exception|Traceback)[:\s]*(.+?)(?:\r?\n|$)", re.I), "{detail}"),
    (re.compile(r"timeout|timed?\s*out", re.I), "TIMEOUT"),
    (re.compile(r"refused|ECONNREFUSED", re.I), "CONNECTION_REFUSED"),
    (re.compile(r"Dump\s*(?:file|written?|saved?)[:\s]*(\S+)", re.I), "DUMP: {path}"),
]


@dataclass
class LogAnomaly:
    line: str
    category: str = ""
    detail: str = ""
    log_index: int = -1


def is_anomaly(line: str) -> LogAnomaly | None:
    """Check if a single log line is an anomaly worth surfacing.

    Returns None for normal/verbose lines.
    """
    line_stripped = line.strip()
    if not line_stripped:
        return None

    for pattern, label in ERROR_PATTERNS:
        m = pattern.search(line_stripped)
        if m:
            cat = label
            detail = line_stripped[:300]
            for g in m.groups():
                if g and g != m.group(0):
                    cat = label.replace(f"{{{g}}}", "detail").replace("{path}", "DUMP").replace("{status}", f"HTTP{m.group(1)}")
                    detail = g.strip()[:200]
            return LogAnomaly(line=line_stripped, category=cat, detail=detail)

    return None


def filter_anomalies(log_lines: list[str]) -> list[LogAnomaly]:
    """Extract only anomalies from a log line list."""
    anomalies: list[LogAnomaly] = []
    for i, line in enumerate(log_lines):
        a = is_anomaly(line)
        if a:
            a.log_index = i
            anomalies.append(a)
    return anomalies


def anomaly_summary(anomalies: list[LogAnomaly]) -> dict[str, int]:
    """Count anomalies by category."""
    counts: dict[str, int] = {}
    for a in anomalies:
        counts[a.category] = counts.get(a.category, 0) + 1
    return counts