# -*- coding: utf-8 -*-
"""QWEN3-ALERT-ASSISTANT W1: canonical finding-v1 record.

Source of truth: ZAP raw alerts (pluginid, alertRef, method, uri, param).
Dojo database id is NEVER used as cross-run identity — only as display reference.
"""
from __future__ import annotations

from dataclasses import dataclass, field

FINGERPRINT_VERSION = "finding-v1"


@dataclass
class CanonicalFinding:
    finding_id: str
    fingerprint_version: str = FINGERPRINT_VERSION
    source: str = "zap"
    plugin_id: str = ""
    alert_ref: str = ""
    title: str = ""
    severity: str = ""
    cwe: str = ""
    method: str = ""
    path: str = ""
    parameter: str = ""
    evidence_refs: list[str] = field(default_factory=list)
    dojo_id: int | None = None
    dojo_url: str | None = None