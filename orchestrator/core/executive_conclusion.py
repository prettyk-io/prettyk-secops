# -*- coding: utf-8 -*-
"""
RES-5: заключение для руководства (Critical / High / Watch / Pass).

Источник цифр — ACTIVE counts (+ collapse для текста), не pytest.
Канон: docs/results-epic.md · docs/internal/act-fill.md · docs/admission-act-ib.md
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Sequence

from core.gate_policy import normalize_severity_counts

_RANK = {"Pass": 0, "Watch": 1, "High": 2, "Critical": 3}


@dataclass
class ExecutiveConclusion:
    executive_class: str  # Critical|High|Watch|Pass
    recommendations: List[str] = field(default_factory=list)
    risks: Dict[str, int] = field(default_factory=dict)
    source: str = ""
    execution_fault: bool = False

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _max_class(a: str, b: str) -> str:
    return a if _RANK.get(a, 0) >= _RANK.get(b, 0) else b


def class_from_risks(counts: Mapping[str, Any]) -> str:
    norm = normalize_severity_counts(counts)
    if norm["critical"] > 0:
        return "Critical"
    if norm["high"] > 0:
        return "High"
    if norm["medium"] > 0:
        return "Watch"
    if norm["low"] > 0 or norm["info"] > 0:
        return "Watch"
    return "Pass"


def is_execution_fault(*, ci_verdict: str = "", ci_exit_code: Any = None) -> bool:
    verdict = (ci_verdict or "").strip().lower()
    return verdict == "fail_run" or ci_exit_code == 1


def class_from_ci(
    *,
    ci_verdict: str = "",
    ci_gate: str = "",
    ci_exit_code: Any = None,
) -> Optional[str]:
    """Security-класс из CI. fail_run не эскалирует — ось исполнения отдельно."""
    verdict = (ci_verdict or "").strip().lower()
    gate = (ci_gate or "").strip().lower()
    if is_execution_fault(ci_verdict=ci_verdict, ci_exit_code=ci_exit_code):
        return None
    if verdict == "fail_gate" or gate == "fail":
        return "High"
    if verdict in {"pass_watch", "pass_edge"} or gate == "watch":
        return "Watch"
    if verdict == "pass" or gate in {"pass", "ok"}:
        return "Pass"
    return None


def _ru_recommendations(
    cls: str,
    risks: Mapping[str, int],
    *,
    top_findings: Sequence[Mapping[str, Any]] = (),
    execution_fault: bool = False,
) -> List[str]:
    out: List[str] = []
    if execution_fault:
        out.append(
            "Исполнение: сбой (exit 1) — evidence/прогон не завершён штатно; "
            "допуск по ACTIVE считать недействительным до повторного успешного прогона."
        )
    if cls == "Critical":
        out.append(
            "Заключение: критический уровень риска — допуск не рекомендован "
            "до устранения ACTIVE Critical и повторной проверки."
        )
    elif cls == "High":
        out.append(
            "Заключение: высокий уровень риска — закрыть ACTIVE High/Critical "
            f"(critical={risks.get('critical', 0)}, high={risks.get('high', 0)}) "
            "до следующего допуска."
        )
    elif cls == "Watch":
        out.append(
            "Заключение: условно удовлетворительно — остаточный soft-риск "
            f"(medium={risks.get('medium', 0)}, low={risks.get('low', 0)}, "
            f"info={risks.get('info', 0)}); требуется риск-ack / план устранения."
        )
    elif not execution_fault:
        out.append(
            "Заключение: удовлетворительно — ACTIVE Critical/High не выявлены; "
            "допуск по severity-политике возможен."
        )
    else:
        out.append(
            "Заключение по ACTIVE: Critical/High не зафиксированы, но из‑за сбоя "
            "исполнения оценка допуска не применяется."
        )
    for item in list(top_findings)[:5]:
        if not isinstance(item, Mapping):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        risk = str(item.get("risk") or "info")
        count = item.get("count", 1)
        systemic = " (site-wide)" if item.get("systemic") else ""
        out.append(f"Кластер: {name} — {risk}×{count}{systemic}.")
    return out


def _risks_from_input(
    counts: Optional[Mapping[str, Any]],
    collapse: Optional[Mapping[str, Any]],
) -> Dict[str, int]:
    risks = normalize_severity_counts(counts)
    if any(risks.values()) or not isinstance(collapse, Mapping):
        return risks
    totals = collapse.get("totals")
    if isinstance(totals, Mapping):
        return normalize_severity_counts(totals)
    return risks


def _top_from_collapse(collapse: Optional[Mapping[str, Any]]) -> List[Mapping[str, Any]]:
    if not isinstance(collapse, Mapping):
        return []
    raw_top = collapse.get("top_findings")
    if not isinstance(raw_top, list):
        return []
    return [x for x in raw_top if isinstance(x, Mapping)]


def _resolve_source(
    source: str,
    collapse: Optional[Mapping[str, Any]],
    risks: Mapping[str, int],
) -> str:
    src = (source or "").strip()
    if src:
        return src
    if isinstance(collapse, Mapping) and collapse:
        return "collapse+counts"
    return "counts" if any(risks.values()) else "ci"


def _merge_ci_recommendations(
    recs: List[str], ci_recommendations: Optional[Sequence[str]]
) -> None:
    if not ci_recommendations:
        return
    for line in ci_recommendations:
        text = str(line or "").strip()
        if text and text not in recs:
            recs.append(text)


def build_executive_conclusion(
    *,
    counts: Optional[Mapping[str, Any]] = None,
    collapse: Optional[Mapping[str, Any]] = None,
    ci_verdict: str = "",
    ci_gate: str = "",
    ci_exit_code: Any = None,
    ci_recommendations: Optional[Sequence[str]] = None,
    source: str = "",
) -> ExecutiveConclusion:
    risks = _risks_from_input(counts, collapse)
    by_risks = class_from_risks(risks)
    by_ci = class_from_ci(
        ci_verdict=ci_verdict, ci_gate=ci_gate, ci_exit_code=ci_exit_code
    )
    cls = by_risks if by_ci is None else _max_class(by_risks, by_ci)
    execution_fault = is_execution_fault(
        ci_verdict=ci_verdict, ci_exit_code=ci_exit_code
    )
    top = _top_from_collapse(collapse)
    recs = _ru_recommendations(
        cls, risks, top_findings=top, execution_fault=execution_fault
    )
    _merge_ci_recommendations(recs, ci_recommendations)
    return ExecutiveConclusion(
        executive_class=cls,
        recommendations=recs,
        risks=dict(risks),
        source=_resolve_source(source, collapse, risks),
        execution_fault=execution_fault,
    )
