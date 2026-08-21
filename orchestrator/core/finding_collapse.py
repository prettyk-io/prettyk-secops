# -*- coding: utf-8 -*-
"""
Fingerprint + systemic collapse для акта / RunSummary.

Не ML-similarity. Индустриальная норма:
  - DAST fingerprint = rule/alertRef (+ path/param для non-systemic)
  - site-wide header/CSP/HSTS → один кластер на rule+severity, path не входит

Канон: docs/internal/finding-collapse.md · backlog RES-4 / RES-ACT
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterable, List, Literal, Mapping, Optional, Sequence, Tuple
from urllib.parse import urlsplit

_SEV_MAP = {
    "critical": "critical",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "info": "info",
    "informational": "info",
    "0": "info",
    "1": "low",
    "2": "medium",
    "3": "high",
}

# Подстроки title / tags / alert name → systemic (path не в ключе).
_SYSTEMIC_NEEDLES: Tuple[str, ...] = (
    "content-security-policy",
    "content security policy",
    "csp",
    "strict-transport-security",
    "hsts",
    "x-frame-options",
    "x-content-type-options",
    "x-xss-protection",
    "referrer-policy",
    "permissions-policy",
    "missing anti-clickjacking",
    "clickjacking",
    "absence of anti-csrf",
    "csrf",
    "secure cookie",
    "httponly",
    "samesite",
    "server leaks information",
    "timestamp disclosure",
    "x-powered-by",
    "modern web application",
    "retrieved from cache",
    "storable and cacheable",
    "application error disclosure",
    "information disclosure - suspicious comments",
    "private ip disclosure",
    "vulnerable js library",
    "cross-domain javascript source",
    "cross-domain misconfiguration",
    "charset mismatch",
    "insufficient site isolation",
    "script served from malform",
    "cookie without",
    "cookie poison",
    "re-examine cache",
    "user controllable html",
    "big redirect",
    "https-only",
    "http-to-https",
    "mixed content",
    "subresource integrity",
    "sri",
    "security header",
    "missing security",
    "header set",
)

_NUM_SEG = re.compile(r"^\d+$")
_HEX_SEG = re.compile(r"^[0-9a-f]{8,}$", re.I)
_UUID_SEG = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


@dataclass
class FindingCluster:
    fingerprint: str
    title: str
    severity: str
    cwe: str = ""
    rule_id: str = ""
    systemic: bool = False
    instance_count: int = 0
    sample_endpoints: List[str] = field(default_factory=list)
    sample_params: List[str] = field(default_factory=list)

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class CollapseResult:
    clusters: List[FindingCluster]
    totals: Dict[str, int]
    raw_count: int
    systemic_clusters: int = 0

    def as_dict(self) -> Dict[str, Any]:
        return {
            "kind": "kdt_finding_collapse",
            "version": 1,
            "raw_count": self.raw_count,
            "cluster_count": len(self.clusters),
            "systemic_clusters": self.systemic_clusters,
            "totals": dict(self.totals),
            "clusters": [c.as_dict() for c in self.clusters],
            "top_findings": [
                {
                    "name": c.title,
                    "risk": c.severity,
                    "count": c.instance_count,
                    "fingerprint": c.fingerprint,
                    "systemic": c.systemic,
                    "sample_endpoints": list(c.sample_endpoints),
                }
                for c in self.clusters
            ],
        }


def _severity_key(raw: Any) -> str:
    if raw is None:
        return "info"
    key = str(raw).strip().lower()
    return _SEV_MAP.get(key, key if key in _SEV_MAP.values() else "info")


def _str_field(finding: Mapping[str, Any], *keys: str) -> str:
    for key in keys:
        val = finding.get(key)
        if val is None:
            continue
        text = str(val).strip()
        if text:
            return text
    return ""


def normalize_endpoint(raw: str) -> str:
    """Strip query/fragment; collapse numeric/uuid path segments."""
    text = (raw or "").strip()
    if not text:
        return ""
    try:
        parts = urlsplit(text)
        path = parts.path or "/"
    except ValueError:
        path = text.split("?", 1)[0].split("#", 1)[0] or "/"
    segs: List[str] = []
    for seg in path.split("/"):
        if not seg:
            continue
        if _NUM_SEG.match(seg) or _HEX_SEG.match(seg) or _UUID_SEG.match(seg):
            segs.append("{id}")
        else:
            segs.append(seg.lower())
    return "/" + "/".join(segs) if segs else "/"


def is_systemic_finding(finding: Mapping[str, Any]) -> bool:
    tags = finding.get("tags")
    tag_bits: List[str] = []
    if isinstance(tags, str):
        tag_bits = [tags]
    elif isinstance(tags, (list, tuple)):
        tag_bits = [str(t) for t in tags]
    blob = " ".join(
        [
            _str_field(finding, "title", "name", "alert", "vuln_id_from_tool"),
            _str_field(finding, "description"),
            " ".join(tag_bits),
        ]
    ).lower()
    if "systemic" in blob:
        return True
    return any(needle in blob for needle in _SYSTEMIC_NEEDLES)


FindingClass = Literal["systemic", "location", "noise_candidate"]


def classify_finding(finding: Mapping[str, Any]) -> FindingClass:
    """Определяет класс находки для фильтрации/коллапса.

    systemic — site-wide header/CSP/cookie (ключ без path).
    noise_candidate — вероятный шум по registry-иглам (timestamp, server leak, etc.),
                       группируем отдельно, не в основной отчёт.
    location — всё остальное (конкретный endpoint + параметр).
    """
    title = _str_field(finding, "title", "name", "alert").lower()
    sev = _severity_key(finding.get("severity") or finding.get("risk"))
    rule = rule_id_of(finding).lower()

    noise_markers = (
        "timestamp disclosure",
        "server leaks information",
        "x-powered-by",
        "modern web application",
        "information disclosure - sensitive",
        "information disclosure - suspicious",
        "private ip disclosure",
        "retrieved from cache",
        "storable and cacheable",
        "content-type header missing",
    )

    for n in noise_markers:
        if n in title:
            return "noise_candidate"

    # No-rule + info = noise (анонимные артефакты с низкой confidence)
    if not rule and sev == "info":
        return "noise_candidate"

    if is_systemic_finding(finding):
        return "systemic"

    return "location"


def rule_id_of(finding: Mapping[str, Any]) -> str:
    return _str_field(
        finding,
        "alertRef",
        "alertref",
        "pluginid",
        "plugin_id",
        "vuln_id_from_tool",
        "unique_id_from_tool",
        "vulnerability_ids",
    )


def cluster_key(finding: Mapping[str, Any]) -> Tuple[str, bool]:
    """
    Возвращает (key, systemic).
    Systemic: rule|title + severity (без path).
    Else: rule|title + severity + path + param.
    """
    systemic = is_systemic_finding(finding)
    sev = _severity_key(finding.get("severity") or finding.get("risk"))
    rule = rule_id_of(finding).lower()
    title = _str_field(finding, "title", "name", "alert").lower()
    cwe = _str_field(finding, "cwe", "cweid")
    base = rule or f"{title}|{cwe}"
    if systemic:
        return f"sys|{base}|{sev}", True
    path = normalize_endpoint(
        _str_field(finding, "url", "uri", "endpoint", "path", "file_path")
    )
    # Dojo may put endpoints as list of objects
    if not path:
        eps = finding.get("endpoints")
        if isinstance(eps, list) and eps:
            first = eps[0]
            if isinstance(first, Mapping):
                path = normalize_endpoint(
                    _str_field(first, "path", "host_with_protocol", "url")
                )
            else:
                path = normalize_endpoint(str(first))
    param = _str_field(finding, "param", "parameter", "param_name").lower()
    return f"loc|{base}|{sev}|{path}|{param}", False


def _fingerprint(key: str) -> str:
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


def _endpoint_sample(finding: Mapping[str, Any]) -> str:
    direct = _str_field(finding, "url", "uri", "endpoint")
    if direct:
        return direct
    eps = finding.get("endpoints")
    if isinstance(eps, list) and eps:
        first = eps[0]
        if isinstance(first, Mapping):
            return _str_field(first, "host_with_protocol", "url", "path") or str(first)
        return str(first)
    return ""


def collapse_findings(
    findings: Iterable[Mapping[str, Any]],
    *,
    sample_limit: int = 5,
) -> CollapseResult:
    buckets: Dict[str, FindingCluster] = {}
    order: List[str] = []
    raw = 0
    for item in findings:
        if not isinstance(item, Mapping):
            continue
        raw += 1
        key, systemic = cluster_key(item)
        fp = _fingerprint(key)
        title = _str_field(item, "title", "name", "alert") or "(без названия)"
        sev = _severity_key(item.get("severity") or item.get("risk"))
        cwe = _str_field(item, "cwe", "cweid")
        rule = rule_id_of(item)
        ep = _endpoint_sample(item)
        param = _str_field(item, "param", "parameter", "param_name")
        if fp not in buckets:
            buckets[fp] = FindingCluster(
                fingerprint=fp,
                title=title,
                severity=sev,
                cwe=cwe,
                rule_id=rule,
                systemic=systemic,
                instance_count=0,
            )
            order.append(fp)
        cluster = buckets[fp]
        cluster.instance_count += 1
        if ep and ep not in cluster.sample_endpoints and len(cluster.sample_endpoints) < sample_limit:
            cluster.sample_endpoints.append(ep)
        if param and param not in cluster.sample_params and len(cluster.sample_params) < sample_limit:
            cluster.sample_params.append(param)

    clusters = [buckets[k] for k in order]
    # stable: higher severity first, then count desc
    rank = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
    clusters.sort(
        key=lambda c: (-rank.get(c.severity, 0), -c.instance_count, c.title.lower())
    )
    totals = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    systemic_n = 0
    for c in clusters:
        if c.severity in totals:
            totals[c.severity] += 1
        if c.systemic:
            systemic_n += 1
    return CollapseResult(
        clusters=clusters,
        totals=totals,
        raw_count=raw,
        systemic_clusters=systemic_n,
    )


def collapse_filtered_findings(
    findings: Sequence[Mapping[str, Any]],
    *,
    policy: Any = None,
    waivers: Sequence[Any] = (),
    now: Any = None,
    sample_limit: int = 5,
) -> CollapseResult:
    """QG-AF filter → collapse (для hooks / акта)."""
    from core.admission_filter import default_filter_policy, drop_reason

    pol = policy or default_filter_policy()
    kept: List[Mapping[str, Any]] = []
    for f in findings:
        if drop_reason(f, pol, waivers=waivers, now=now) is None:
            kept.append(f)
    return collapse_findings(kept, sample_limit=sample_limit)
