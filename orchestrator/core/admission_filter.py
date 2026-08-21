# -*- coding: utf-8 -*-
"""QG-AF: auto-filter Dojo findings → severity counts + audit."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from core.gate_policy import normalize_severity_counts

_SEV_MAP = {
    "critical": "critical",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "info": "info",
    "informational": "info",
}
_SEV_RANK = ("info", "low", "medium", "high", "critical")

# ZAP scanner_confidence → numeric threshold
# 0: False Positive (фильтруется ещё в ZAP, не приходит)
# 1: Low / Tentative  2: Medium / Firm  3: High / Certain  4: User Confirmed
_CONFIDENCE_MAP: Dict[Any, int] = {
    "low": 1,
    "tentative": 1,
    "medium": 2,
    "firm": 2,
    "high": 3,
    "certain": 3,
    "confirmed": 4,
    "user_confirmed": 4,
}


@dataclass(frozen=True)
class FilterPolicy:
    """ACTIVE-only + optional v2 rules."""

    require_active: bool = True
    exclude_false_positive: bool = True
    exclude_duplicate: bool = True
    exclude_mitigated: bool = True
    verified_only: bool = False
    min_severity: str = ""  # info|low|medium|high|critical; empty = no floor
    min_confidence: int = 0  # 0=off, 1=Low, 2=Medium, 3=High, 4=Confirmed
    registry_rules: Tuple[Tuple[str, str, str], ...] = ()  # frozen: ((rule_id, severity, cwe), ...)
    exclude_tags: Tuple[str, ...] = ()
    require_tags: Tuple[str, ...] = ()
    max_age_days: int = 0  # 0 = off


@dataclass
class FilterAudit:
    raw: int = 0
    kept: int = 0
    dropped_inactive: int = 0
    dropped_fp: int = 0
    dropped_dup: int = 0
    dropped_mitigated: int = 0
    dropped_verified: int = 0
    dropped_severity: int = 0
    dropped_tags: int = 0
    dropped_age: int = 0
    dropped_waiver: int = 0
    dropped_confidence: int = 0
    dropped_registry: int = 0
    pages: int = 0

    def as_dict(self) -> Dict[str, int]:
        return {k: int(v) for k, v in asdict(self).items()}


@dataclass(frozen=True)
class WaiverEntry:
    """Exclude finding from counts until expires_at (ISO date or datetime)."""

    title: str = ""
    severity: str = ""
    cwe: str = ""
    fingerprint: str = ""
    expires_at: str = ""


def default_filter_policy() -> FilterPolicy:
    return FilterPolicy()


def load_registry_rules(path: str) -> Tuple[Tuple[str, str, str], ...]:
    """Загружает rule_id, severity, cwe из fp_registry.json → frozen tuple.

    Формат: (rule_id или '', severity или '', cwe или '').
    Матчинг: AND — совпало всё ненулевое; пустое поле = wildcard.
    """
    import json
    import os.path

    if not os.path.isfile(path):
        return ()
    with open(path, encoding="utf-8") as fh:
        reg = json.load(fh)
    rules_raw: List[Any] = reg.get("rules", []) if isinstance(reg, dict) else []
    out: List[Tuple[str, str, str]] = []
    for r in rules_raw:
        if not isinstance(r, dict):
            continue
        rule_id = str(r.get("rule_id", r.get("plugin_id", r.get("id", "")))).strip()
        severity = str(r.get("severity", "")).strip().lower()
        cwe = str(r.get("cwe", "")).strip()
        if rule_id or severity or cwe:
            out.append((rule_id, severity, cwe))
    return tuple(out)


def _any_rule_matches(
    finding: Mapping[str, Any],
    rules: Tuple[Tuple[str, str, str], ...],
) -> bool:
    if not rules:
        return False
    f_rule = str(finding.get("rule_id", finding.get("pluginid", finding.get("alertRef", "")))).strip()
    f_cwe = str(finding.get("cwe", "")).strip()
    f_sev = str(finding.get("severity", "")).strip().lower()
    for (rid, sev, cwe) in rules:
        ok: bool = True
        if rid and rid != f_rule:
            ok = False
        if sev and sev != f_sev:
            ok = False
        if cwe and cwe != f_cwe:
            ok = False
        if ok:
            return True
    return False


def _drop_registry_reason(
    finding: Mapping[str, Any],
    policy: FilterPolicy,
) -> Optional[str]:
    """Drops finding if registry_rules match."""
    if not policy.registry_rules:
        return None
    if _any_rule_matches(finding, policy.registry_rules):
        return "registry"
    return None


def _truthy(value: Any) -> bool:
    if value is True:
        return True
    if value is False or value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}
    return bool(value)


def _severity_key(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    key = str(raw).strip().lower()
    return _SEV_MAP.get(key)


def _sev_rank(key: str) -> int:
    try:
        return _SEV_RANK.index(key)
    except ValueError:
        return -1


def _finding_tags(finding: Mapping[str, Any]) -> List[str]:
    raw = finding.get("tags")
    if isinstance(raw, str):
        return [raw.strip().lower()] if raw.strip() else []
    if isinstance(raw, (list, tuple)):
        out: List[str] = []
        for t in raw:
            s = str(t).strip().lower()
            if s:
                out.append(s)
        return out
    return []


def _parse_finding_date(finding: Mapping[str, Any]) -> Optional[date]:
    for key in ("date", "created", "updated"):
        raw = finding.get(key)
        if not raw:
            continue
        text = str(raw).strip()
        if not text:
            continue
        try:
            if "T" in text:
                return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
            return date.fromisoformat(text[:10])
        except ValueError:
            continue
    return None


def _waiver_active(entry: WaiverEntry, *, now: Optional[datetime] = None) -> bool:
    if not (entry.title or entry.fingerprint or entry.cwe):
        return False
    if not entry.expires_at.strip():
        return True
    clock = now or datetime.now(timezone.utc)
    text = entry.expires_at.strip()
    try:
        if "T" in text:
            exp = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            return clock <= exp
        exp_d = date.fromisoformat(text[:10])
        return clock.date() <= exp_d
    except ValueError:
        return False


def finding_matches_waiver(finding: Mapping[str, Any], entry: WaiverEntry) -> bool:
    if entry.fingerprint:
        fp = str(
            finding.get("hash_code")
            or finding.get("unique_id_from_tool")
            or finding.get("id")
            or ""
        ).strip()
        return bool(fp) and fp == entry.fingerprint.strip()
    title = str(finding.get("title") or finding.get("name") or "").strip().lower()
    sev = (_severity_key(finding.get("severity")) or "").lower()
    cwe = str(finding.get("cwe") or "").strip()
    if entry.title and entry.title.strip().lower() not in title:
        return False
    if entry.severity and entry.severity.strip().lower() != sev:
        return False
    if entry.cwe and str(entry.cwe).strip() != cwe:
        return False
    return bool(entry.title or entry.severity or entry.cwe)


def _drop_status_reason(finding: Mapping[str, Any], policy: FilterPolicy) -> Optional[str]:
    if policy.require_active and not _truthy(finding.get("active")):
        return "inactive"
    if policy.exclude_false_positive and _truthy(finding.get("false_p")):
        return "fp"
    if policy.exclude_duplicate and _truthy(finding.get("duplicate")):
        return "dup"
    if policy.exclude_mitigated and (
        _truthy(finding.get("is_mitigated")) or _truthy(finding.get("mitigated"))
    ):
        return "mitigated"
    if policy.verified_only and not _truthy(finding.get("verified")):
        return "verified"
    return None


def _normalize_confidence(raw: Any) -> int:
    """scanner_confidence → 1-4 (0 если нет поля)."""
    if raw is None:
        return 0
    if isinstance(raw, (int, float)):
        return int(raw)
    key = str(raw).strip().lower()
    return _CONFIDENCE_MAP.get(key, 0)


def _drop_confidence_reason(finding: Mapping[str, Any], policy: FilterPolicy) -> Optional[str]:
    if not policy.min_confidence or policy.min_confidence <= 0:
        return None
    conf = _normalize_confidence(
        finding.get("scanner_confidence") or finding.get("confidence")
    )
    if 0 < conf < int(policy.min_confidence):
        return "confidence"
    return None


def _drop_severity_reason(finding: Mapping[str, Any], policy: FilterPolicy) -> Optional[str]:
    sev = _severity_key(finding.get("severity"))
    if sev is None:
        return "severity"
    floor = (policy.min_severity or "").strip().lower()
    if floor and _sev_rank(sev) < _sev_rank(_SEV_MAP.get(floor, floor)):
        return "severity"
    return None


def _drop_tags_reason(finding: Mapping[str, Any], policy: FilterPolicy) -> Optional[str]:
    tags = set(_finding_tags(finding))
    if policy.exclude_tags and tags.intersection({t.lower() for t in policy.exclude_tags}):
        return "tags"
    if policy.require_tags:
        need = {t.lower() for t in policy.require_tags}
        if not need.issubset(tags):
            return "tags"
    return None


def _drop_age_reason(
    finding: Mapping[str, Any],
    policy: FilterPolicy,
    now: Optional[datetime],
) -> Optional[str]:
    if not policy.max_age_days or policy.max_age_days <= 0:
        return None
    fd = _parse_finding_date(finding)
    if fd is None:
        return None
    clock = now or datetime.now(timezone.utc)
    today = clock.date() if isinstance(clock, datetime) else clock
    if (today - fd).days > int(policy.max_age_days):
        return "age"
    return None


def drop_reason(
    finding: Mapping[str, Any],
    policy: FilterPolicy,
    *,
    waivers: Sequence[WaiverEntry] = (),
    now: Optional[datetime] = None,
) -> Optional[str]:
    """None = keep; else reason key for audit."""
    if not isinstance(finding, Mapping):
        return "inactive"
    for reason in (
        _drop_status_reason(finding, policy),
        _drop_confidence_reason(finding, policy),
        _drop_severity_reason(finding, policy),
        _drop_tags_reason(finding, policy),
        _drop_age_reason(finding, policy, now),
        _drop_registry_reason(finding, policy),
    ):
        if reason:
            # registry можно перекрыть waiver'ом (правило против конкретной находки)
            if reason == "registry":
                for w in waivers:
                    if _waiver_active(w, now=now) and finding_matches_waiver(finding, w):
                        return None  # waiver overrides registry → keep
            return reason
    for w in waivers:
        if _waiver_active(w, now=now) and finding_matches_waiver(finding, w):
            return "waiver"
    return None


def finding_passes_filter(
    finding: Mapping[str, Any],
    policy: FilterPolicy,
    *,
    waivers: Sequence[WaiverEntry] = (),
    now: Optional[datetime] = None,
) -> bool:
    return drop_reason(finding, policy, waivers=waivers, now=now) is None


def filter_findings_for_gate(
    findings: Iterable[Mapping[str, Any]] | None,
    policy: Optional[FilterPolicy] = None,
    *,
    waivers: Sequence[WaiverEntry] = (),
    now: Optional[datetime] = None,
    pages: int = 0,
) -> Tuple[Dict[str, int], FilterAudit]:
    """Оставить findings по FilterPolicy (+ waivers) → counts + audit."""
    pol = policy or default_filter_policy()
    counts = normalize_severity_counts({})
    audit = FilterAudit(pages=int(pages or 0))
    for item in findings or []:
        audit.raw += 1
        reason = drop_reason(item, pol, waivers=waivers, now=now)
        if reason is not None:
            key = {
                "inactive": "dropped_inactive",
                "fp": "dropped_fp",
                "dup": "dropped_dup",
                "mitigated": "dropped_mitigated",
                "verified": "dropped_verified",
                "severity": "dropped_severity",
                "tags": "dropped_tags",
                "age": "dropped_age",
                "waiver": "dropped_waiver",
                "confidence": "dropped_confidence",
                "registry": "dropped_registry",
            }.get(reason, "dropped_inactive")
            setattr(audit, key, int(getattr(audit, key)) + 1)
            continue
        sev = _severity_key(item.get("severity"))
        if sev is None:
            audit.dropped_severity += 1
            continue
        audit.kept += 1
        counts[sev] = int(counts.get(sev) or 0) + 1
    return counts, audit


def counts_look_usable(counts: Optional[Mapping[str, Any]]) -> bool:
    return isinstance(counts, Mapping)


def _fuzz_finding_to_filterable(finding: Mapping[str, Any]) -> Dict[str, Any]:
    """Нормализовать находку фаззера (CD-8) в Dojo-подобный dict для фильтра.

    Фазз-findings имеют ``severity``/``title``/``rule_id``/``cwe``/``tags``,
    но не ``active`` — Admission-фильтр требует ``active=True``. Мапим:
      - active=True (находки фаззера активны по определению);
      - rule_id → pluginid / alertRef (для registry-правил);
      - kind → tags.
    """
    out: Dict[str, Any] = dict(finding)
    out.setdefault("active", True)
    if "rule_id" in out and "pluginid" not in out:
        out["pluginid"] = out["rule_id"]
        out["alertRef"] = out["rule_id"]
    tags = out.get("tags")
    if isinstance(tags, list):
        tags = list(tags)
    else:
        tags = []
    if "kind" in out and out["kind"] not in tags:
        tags.append(str(out["kind"]))
    if "fuzz" not in tags:
        tags.append("fuzz")
    out["tags"] = tags
    return out


def admit_fuzz_findings(
    findings: Iterable[Mapping[str, Any]] | None,
    policy: Optional[FilterPolicy] = None,
    *,
    waivers: Sequence[WaiverEntry] = (),
    now: Optional[datetime] = None,
) -> Tuple[Dict[str, int], FilterAudit, List[Dict[str, Any]]]:
    """CD-8: прогнать находки фаззера через Admission-фильтр.

    Возвращает (counts, audit, kept_findings). Нормализует ``active=True``
    и ``rule_id`` → pluginid, чтобы registry/waiver-правила работали.
    """
    normalized = [
        _fuzz_finding_to_filterable(f) for f in findings or []
        if isinstance(f, Mapping)
    ]
    counts, audit = filter_findings_for_gate(
        normalized, policy, waivers=waivers, now=now
    )
    kept: List[Dict[str, Any]] = []
    pol = policy or default_filter_policy()
    for f in normalized:
        if drop_reason(f, pol, waivers=waivers, now=now) is None:
            kept.append(f)
    return counts, audit, kept
