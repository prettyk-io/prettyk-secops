# -*- coding: utf-8 -*-
"""QG-AF-12: GatePolicy JSON (thresholds + filter + waivers)."""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.admission_filter import FilterPolicy, WaiverEntry, default_filter_policy
from core.gate_policy import AdmissionPolicy, admission_policy_from_env
from utils.paths import REPO_ROOT

logger = logging.getLogger(__name__)

DEFAULT_LAB_POLICY = REPO_ROOT / "orchestrator" / "config" / "gate_policy.lab.json"


@dataclass
class GatePolicyBundle:
    admission: AdmissionPolicy
    filter: FilterPolicy
    waivers: List[WaiverEntry] = field(default_factory=list)
    source_path: str = ""

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "max_critical": self.admission.max_critical,
            "max_high": self.admission.max_high,
            "enabled": self.admission.enabled,
            "filter": {
                "require_active": self.filter.require_active,
                "exclude_false_positive": self.filter.exclude_false_positive,
                "exclude_duplicate": self.filter.exclude_duplicate,
                "exclude_mitigated": self.filter.exclude_mitigated,
                "verified_only": self.filter.verified_only,
                "min_severity": self.filter.min_severity,
                "min_confidence": self.filter.min_confidence,
                "exclude_tags": list(self.filter.exclude_tags),
                "require_tags": list(self.filter.require_tags),
                "max_age_days": self.filter.max_age_days,
            },
            "waivers": [
                {
                    "title": w.title,
                    "severity": w.severity,
                    "cwe": w.cwe,
                    "fingerprint": w.fingerprint,
                    "expires_at": w.expires_at,
                }
                for w in self.waivers
            ],
        }


def _env(name: str, default: str = "") -> str:
    pk_val = os.getenv(f"PK_{name}")
    if pk_val:
        return pk_val.strip()
    return (os.getenv(name) or default).strip()


def _as_bool(raw: Any, default: bool) -> bool:
    if raw is None:
        return default
    if isinstance(raw, bool):
        return raw
    return str(raw).strip().lower() not in {"0", "false", "no", "off", ""}


def _as_tags(raw: Any) -> tuple:
    if isinstance(raw, str):
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        return tuple(parts)
    if isinstance(raw, (list, tuple)):
        return tuple(str(x).strip() for x in raw if str(x).strip())
    return ()


def filter_policy_from_mapping(data: Optional[Dict[str, Any]]) -> FilterPolicy:
    base = default_filter_policy()
    d = data if isinstance(data, dict) else {}
    return FilterPolicy(
        require_active=_as_bool(d.get("require_active"), base.require_active),
        exclude_false_positive=_as_bool(
            d.get("exclude_false_positive"), base.exclude_false_positive
        ),
        exclude_duplicate=_as_bool(d.get("exclude_duplicate"), base.exclude_duplicate),
        exclude_mitigated=_as_bool(d.get("exclude_mitigated"), base.exclude_mitigated),
        verified_only=_as_bool(d.get("verified_only"), False),
        min_severity=str(d.get("min_severity") or "").strip().lower(),
        min_confidence=max(0, int(d.get("min_confidence") or 0)),
        exclude_tags=_as_tags(d.get("exclude_tags")),
        require_tags=_as_tags(d.get("require_tags")),
        max_age_days=max(0, int(d.get("max_age_days") or 0)),
    )


def filter_policy_from_env() -> FilterPolicy:
    """KDT_GATE_FILTER_* overlays on defaults."""
    return FilterPolicy(
        require_active=_as_bool(_env("KDT_GATE_FILTER_REQUIRE_ACTIVE", "1"), True),
        exclude_false_positive=_as_bool(
            _env("KDT_GATE_FILTER_EXCLUDE_FP", "1"), True
        ),
        exclude_duplicate=_as_bool(_env("KDT_GATE_FILTER_EXCLUDE_DUP", "1"), True),
        exclude_mitigated=_as_bool(
            _env("KDT_GATE_FILTER_EXCLUDE_MITIGATED", "1"), True
        ),
        verified_only=_as_bool(_env("KDT_GATE_FILTER_VERIFIED_ONLY", "0"), False),
        min_severity=_env("KDT_GATE_FILTER_MIN_SEVERITY", "").lower(),
        exclude_tags=_as_tags(_env("KDT_GATE_FILTER_EXCLUDE_TAGS", "")),
        require_tags=_as_tags(_env("KDT_GATE_FILTER_REQUIRE_TAGS", "")),
        max_age_days=max(0, int(_env("KDT_GATE_FILTER_MAX_AGE_DAYS", "0") or 0)),
    )


def waivers_from_mapping(raw: Any) -> List[WaiverEntry]:
    if not isinstance(raw, list):
        return []
    out: List[WaiverEntry] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        out.append(
            WaiverEntry(
                title=str(item.get("title") or ""),
                severity=str(item.get("severity") or ""),
                cwe=str(item.get("cwe") or ""),
                fingerprint=str(item.get("fingerprint") or ""),
                expires_at=str(item.get("expires_at") or ""),
            )
        )
    return out


def resolve_gate_policy_path() -> Path:
    raw = _env("KDT_GATE_POLICY_PATH")
    if raw:
        return Path(raw)
    return DEFAULT_LAB_POLICY


def load_gate_policy_bundle(path: Optional[Path] = None) -> GatePolicyBundle:
    """
    Merge: env admission defaults ← JSON file ← env filter overlays still apply
    if file missing filter section uses env filter.
    """
    admission = admission_policy_from_env()
    filt = filter_policy_from_env()
    waivers: List[WaiverEntry] = []
    src = ""
    p = path or resolve_gate_policy_path()
    if p.is_file():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                src = str(p)
                if "max_critical" in data or "max_high" in data or "enabled" in data:
                    admission = AdmissionPolicy(
                        max_critical=max(
                            0, int(data.get("max_critical", admission.max_critical))
                        ),
                        max_high=max(0, int(data.get("max_high", admission.max_high))),
                        enabled=_as_bool(data.get("enabled"), admission.enabled),
                    )
                if isinstance(data.get("filter"), dict):
                    filt = filter_policy_from_mapping(data["filter"])
                waivers = waivers_from_mapping(data.get("waivers"))
        except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.warning("Gate policy load failed (%s): %s — using env defaults", p, exc)
    return GatePolicyBundle(
        admission=admission, filter=filt, waivers=waivers, source_path=src
    )


def write_gate_policy_bundle(bundle: GatePolicyBundle, path: Optional[Path] = None) -> Path:
    p = path or resolve_gate_policy_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    payload = bundle.to_public_dict()
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return p


def bundle_from_public_dict(data: Dict[str, Any]) -> GatePolicyBundle:
    admission = AdmissionPolicy(
        max_critical=max(0, int(data.get("max_critical") or 0)),
        max_high=max(0, int(data.get("max_high") or 0)),
        enabled=_as_bool(data.get("enabled"), True),
    )
    filt = filter_policy_from_mapping(
        data.get("filter") if isinstance(data.get("filter"), dict) else {}
    )
    waivers = waivers_from_mapping(data.get("waivers"))
    return GatePolicyBundle(admission=admission, filter=filt, waivers=waivers)
