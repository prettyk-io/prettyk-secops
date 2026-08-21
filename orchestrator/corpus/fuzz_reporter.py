# -*- coding: utf-8 -*-
"""CD-8: Интеграция вывода фаззинга в Admission & Report.

Фиксирует аномалии, найденные собственным фаззером (``CorpusFuzzer``),
в формат SecOps Lab findings (``Finding`` / ``Severity``), пробрасывает
в run_summary.json и Allure3 categories.

Аномалии:
  - status 5xx → ``server_error`` (High/Medium по статусу)
  - отражение payload (reflection) → ``reflection`` (Medium/Low)
  - time delay → ``time_based`` (Medium)
  - diff от baseline → ``anomaly`` (Low/Info)

Чистый Python, без ZAP: ``Anomaly`` → ``Finding`` — детерминированное
преобразование в JSON-совместимый вид для Dojo/Allure.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import urlsplit

_SEVERITY_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}

# 5xx → High (прямое свидетельство падения), 4xx → Low (ложные/авторизация)
_SERVER_ERROR_SEVERITY = {
    500: "high",
    501: "high",
    502: "high",
    503: "high",
    504: "medium",
    505: "medium",
}

_DEFAULT_CWES = {
    "server_error": "CWE-20",
    "reflection": "CWE-79",
    "time_based": "CWE-89",
    "anomaly": "CWE-200",
}


@dataclass(frozen=True)
class Severity:
    """Каноничная severity-шкала SecOps Lab (совместимо с Dojo/Allure)."""

    critical: str = "critical"
    high: str = "high"
    medium: str = "medium"
    low: str = "low"
    info: str = "info"

    @staticmethod
    def from_rank(rank: int) -> str:
        for key, value in _SEVERITY_RANK.items():
            if value == rank:
                return key
        return "info"


@dataclass
class Finding:
    """Находка фаззера в формате SecOps Lab findings."""

    title: str
    severity: str
    kind: str  # server_error | reflection | time_based | anomaly
    url: str = ""
    param: str = ""
    payload: str = ""
    evidence: str = ""
    cwe: str = ""
    rule_id: str = ""
    confidence: int = 2  # 1=Low 2=Medium 3=High 4=Confirmed
    tags: List[str] = field(default_factory=list)
    created_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        return d

    def fingerprint(self) -> str:
        base = "|".join(
            [self.kind, self.title.lower(), self.severity, self.cwe, self.param]
        )
        return hashlib.sha1(base.encode("utf-8")).hexdigest()[:16]


@dataclass
class FuzzAnomaly:
    """Сырой сигнал аномалии из прогона фаззера."""

    kind: str  # server_error | reflection | time_based | anomaly
    url: str
    param: str = ""
    payload: str = ""
    status: Optional[int] = None
    latency_ms: int = 0
    reflection: bool = False
    evidence: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _cwe_for(kind: str) -> str:
    return _DEFAULT_CWES.get(kind, "CWE-200")


def _severity_for(kind: str, status: Optional[int] = None) -> str:
    if kind == "server_error":
        if status in _SERVER_ERROR_SEVERITY:
            return _SERVER_ERROR_SEVERITY[status]
        return "high"
    if kind == "reflection":
        return "medium"
    if kind == "time_based":
        return "medium"
    return "low"


def _title_for(kind: str, param: str = "") -> str:
    titles = {
        "server_error": "Server error на эндпоинте (фаззинг)",
        "reflection": "Отражение пейлоада в ответе (XSS-риск)",
        "time_based": "Задержка ответа (time-based инъекция)",
        "anomaly": "Аномальный ответ относительно baseline",
    }
    title = titles.get(kind, "Аномалия фаззинга")
    return f"{title}" if not param else f"{title} ({param})"


def anomaly_to_finding(anomaly: FuzzAnomaly) -> Finding:
    """Преобразовать сырой сигнал → Finding (каноничная severity)."""
    severity = _severity_for(anomaly.kind, anomaly.status)
    return Finding(
        title=_title_for(anomaly.kind, anomaly.param),
        severity=severity,
        kind=anomaly.kind,
        url=anomaly.url,
        param=anomaly.param,
        payload=anomaly.payload,
        evidence=anomaly.evidence,
        cwe=_cwe_for(anomaly.kind),
        rule_id=f"kdt_fuzz_{anomaly.kind}",
        confidence=2,
        tags=["fuzz", anomaly.kind],
        created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )


def anomalies_to_findings(
    anomalies: Sequence[FuzzAnomaly] | Sequence[Mapping[str, Any]],
) -> List[Finding]:
    """Пакетное преобразование (принимает FuzzAnomaly или dict)."""
    out: List[Finding] = []
    for raw in anomalies:
        if isinstance(raw, FuzzAnomaly):
            a = raw
        elif isinstance(raw, Mapping):
            a = FuzzAnomaly(**{k: v for k, v in raw.items() if k in FuzzAnomaly.__dataclass_fields__})
        else:
            continue
        out.append(anomaly_to_finding(a))
    return out


def dedupe_findings(findings: Sequence[Finding]) -> List[Finding]:
    """Убрать дубликаты по fingerprint (kind+title+severity+cwe+param)."""
    seen = set()
    out: List[Finding] = []
    for f in findings:
        fp = f.fingerprint()
        if fp in seen:
            continue
        seen.add(fp)
        out.append(f)
    return out


def severity_counts(findings: Sequence[Finding]) -> Dict[str, int]:
    """Сводка severity → count (для run_summary)."""
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        if f.severity in counts:
            counts[f.severity] += 1
    return counts


def classify_anomaly(
    status: Optional[int],
    *,
    baseline_status: Optional[int] = None,
    latency_ms: int = 0,
    baseline_latency_ms: int = 0,
    reflected_payload: Optional[str] = None,
    body_diff: bool = False,
) -> Optional[FuzzAnomaly]:
    """Классифицировать один ответ фаззера → FuzzAnomaly (или None, если норма).

    Детерминированная эвристика:
      - status 5xx → server_error;
      - отражение payload в response → reflection;
      - latency в 3+ раза больше baseline → time_based;
      - иначе diff от baseline → anomaly (Low).
    """
    if status is not None and 500 <= status < 600:
        return FuzzAnomaly(kind="server_error", url="", status=status)
    if reflected_payload and len(reflected_payload) >= 4:
        return FuzzAnomaly(kind="reflection", url="", payload=reflected_payload, reflection=True)
    if baseline_latency_ms and latency_ms >= baseline_latency_ms * 3:
        return FuzzAnomaly(kind="time_based", url="", latency_ms=latency_ms)
    if body_diff:
        return FuzzAnomaly(kind="anomaly", url="")
    return None


def attach_findings_to_run_summary(
    summary: Dict[str, Any],
    findings: Sequence[Finding],
    *,
    replace: bool = True,
) -> Dict[str, Any]:
    """Добавить fuzz-findings в run_summary.json (секция ``fuzz_findings``).

    Возвращает обновлённый summary (не мутирует входной dict).
    """
    updated = dict(summary)
    counts = severity_counts(findings)
    if replace or "fuzz_findings" not in updated:
        updated["fuzz_findings"] = {
            "total": len(findings),
            "severity": counts,
            "items": [f.to_dict() for f in findings],
        }
    else:
        prev = updated["fuzz_findings"]
        if isinstance(prev, Mapping):
            prev_items = list(prev.get("items", []))
            prev_items.extend(f.to_dict() for f in findings)
            merged = dedupe_findings(
                [Finding(**i) for i in prev_items if isinstance(i, Mapping)]
                + list(findings)
            )
            updated["fuzz_findings"] = {
                "total": len(merged),
                "severity": severity_counts(merged),
                "items": [f.to_dict() for f in merged],
            }
    return updated


def build_allure_categories(findings: Sequence[Finding]) -> List[Dict[str, Any]]:
    """Сформировать Allure3 categories.json из фазз-находок.

    Каждая категория — name + messageRegex + matchedStatuses (failed).
    """
    cats: List[Dict[str, Any]] = []
    for f in findings:
        name = f.title
        regex = ".*(" + (
            f.kind.replace("_", "|") + "|"
            + (f.param or "fuzz") + "|"
            + f.rule_id
        ) + ").*"
        cats.append(
            {
                "name": name,
                "messageRegex": regex,
                "matchedStatuses": ["failed"],
            }
        )
    # Прочее — fallback
    cats.append({"name": "Прочее", "matchedStatuses": ["failed", "broken"]})
    return cats


def merge_allure_categories(
    existing: Sequence[Mapping[str, Any]],
    findings: Sequence[Finding],
) -> List[Dict[str, Any]]:
    """Слить фазз-категории с существующими (без дубликатов по name)."""
    merged: List[Dict[str, Any]] = []
    seen_names = set()
    for c in existing:
        name = str(c.get("name") or "").strip()
        if name and name not in seen_names:
            seen_names.add(name)
            merged.append(dict(c))
    for c in build_allure_categories(findings):
        name = str(c.get("name") or "").strip()
        if name in seen_names:
            continue
        seen_names.add(name)
        merged.append(c)
    return merged


def fuzz_findings_report(
    anomalies: Sequence[FuzzAnomaly] | Sequence[Mapping[str, Any]],
    *,
    run_id: str = "",
) -> Dict[str, Any]:
    """Полный пакет: anomalies → findings → severity → categories."""
    findings = dedupe_findings(anomalies_to_findings(anomalies))
    return {
        "kind": "kdt_fuzz_findings_pack",
        "run_id": run_id,
        "total": len(findings),
        "severity": severity_counts(findings),
        "findings": [f.to_dict() for f in findings],
        "allure_categories": build_allure_categories(findings),
    }
