# -*- coding: utf-8 -*-
"""G-19 / G-21: dual-axis admission gate + обязательность отчётов.

Не секция манифеста. Схему не трогает.

Оси:
  execution — crash / report require → exit 1 (вне этого модуля)
  security  — evaluate_admission_gate(counts) → fail_gate / watch / pass

Env:
  KDT_GATE_MAX_CRITICAL — max ACTIVE Critical (default 0); выше → fail_gate
  KDT_GATE_MAX_HIGH — max ACTIVE High (default 0); выше → fail_gate
  KDT_GATE_SEVERITY — legacy ZAP floor (High|Medium|…); для сбора ZAP fallback
  KDT_REQUIRE_ALLURE — 1 → нет/падение Allure влияет на exit (default 0)
  KDT_REQUIRE_DEFECTDOJO — 1 → нет/падение Dojo import влияет на exit (default 0)
  KDT_QUALITY_GATE — 0 выключает severity-gate
  KDT_QUALITY_GATE_ON_ALERT_ERROR — closed|open (G-18)
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Tuple

_SEVERITY_ORDER: Tuple[str, ...] = ("Informational", "Low", "Medium", "High")
_COUNT_KEYS: Tuple[str, ...] = ("critical", "high", "medium", "low", "info")
_ALIASES = {
    "info": "Informational",
    "informational": "Informational",
    "low": "Low",
    "medium": "Medium",
    "med": "Medium",
    "high": "High",
    "critical": "Critical",
}


def _env(name: str, default: str = "") -> str:
    pk_val = os.getenv(f"PK_{name}")
    if pk_val:
        return pk_val.strip()
    return (os.getenv(name) or default).strip()


def env_flag(name: str, default: str = "0") -> bool:
    return _env(name, default).lower() not in {"0", "false", "no", "off", ""}


def normalize_severity(raw: str | None) -> str:
    key = (raw or "High").strip().lower()
    if key in _ALIASES:
        return _ALIASES[key]
    for name in _SEVERITY_ORDER:
        if name.lower() == key:
            return name
    if key == "critical":
        return "Critical"
    return "High"


def gate_severity_floor() -> str:
    """Legacy ZAP floor (G-19): для сбора алертов fallback, не для max_* admission."""
    return normalize_severity(_env("KDT_GATE_SEVERITY", "High"))


def severities_at_or_above(floor: str | None = None) -> List[str]:
    floor_name = normalize_severity(floor or gate_severity_floor())
    if floor_name == "Critical":
        return ["High"]  # ZAP UI: Critical обычно в High
    try:
        idx = _SEVERITY_ORDER.index(floor_name)
    except ValueError:
        idx = _SEVERITY_ORDER.index("High")
    return list(_SEVERITY_ORDER[idx:])


def require_allure() -> bool:
    return env_flag("KDT_REQUIRE_ALLURE", "0")


def require_defectdojo() -> bool:
    return env_flag("KDT_REQUIRE_DEFECTDOJO", "0")


def quality_gate_enabled() -> bool:
    raw = _env("KDT_QUALITY_GATE", "1").lower()
    return raw not in {"0", "false", "off", "no"}


def _env_nonneg_int(name: str, default: int) -> int:
    raw = _env(name, str(default))
    try:
        return max(0, int(raw))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class AdmissionPolicy:
    """Пороги block vs track (ACTIVE findings)."""

    max_critical: int = 0
    max_high: int = 0
    enabled: bool = True


@dataclass
class AdmissionResult:
    failed: bool
    watch: bool
    risk_hints: Dict[str, Any] = field(default_factory=dict)
    recommendations: List[str] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)

    @property
    def gate_label(self) -> str:
        if self.summary.get("error"):
            return "error"
        if self.summary.get("disabled"):
            return "pass"
        if self.failed:
            return "fail"
        return "pass"


def admission_policy_from_env() -> AdmissionPolicy:
    return AdmissionPolicy(
        max_critical=_env_nonneg_int("KDT_GATE_MAX_CRITICAL", 0),
        max_high=_env_nonneg_int("KDT_GATE_MAX_HIGH", 0),
        enabled=quality_gate_enabled(),
    )


def normalize_severity_counts(raw: Optional[Mapping[str, Any]]) -> Dict[str, int]:
    src = raw if isinstance(raw, Mapping) else {}
    out: Dict[str, int] = {}
    for key in _COUNT_KEYS:
        try:
            out[key] = max(0, int(src.get(key) or 0))
        except (TypeError, ValueError):
            out[key] = 0
    return out


def highest_severity(counts: Mapping[str, int]) -> Optional[str]:
    for key in _COUNT_KEYS:
        if int(counts.get(key) or 0) > 0:
            return key
    return None


def counts_from_zap_live_summary(summary: Optional[Mapping[str, Any]]) -> Dict[str, int]:
    """Map ZapAdapter.summarize_alerts_for_live tallies → admission counts."""
    s = summary if isinstance(summary, Mapping) else {}
    return normalize_severity_counts(
        {
            "critical": s.get("critical_total") or 0,
            "high": s.get("high_total") or 0,
            "medium": s.get("medium_total") or 0,
            "low": s.get("low_total") or 0,
            "info": s.get("info_total") or 0,
        }
    )


def counts_from_zap_gate_summary(summary: Optional[Mapping[str, Any]]) -> Dict[str, int]:
    """
    Legacy _summarize_gate_alerts / summarize_high_alerts → counts.
    Without per-risk tallies, bucket total into the highest requested risk.
    """
    s = summary if isinstance(summary, Mapping) else {}
    if any(k in s for k in ("high_total", "medium_total", "low_total", "info_total")):
        return counts_from_zap_live_summary(s)
    try:
        total = max(0, int(s.get("total") or 0))
    except (TypeError, ValueError):
        total = 0
    risks = s.get("risks") if isinstance(s.get("risks"), (list, tuple)) else ()
    risks_l = {str(r).strip().lower() for r in risks}
    counts = normalize_severity_counts({})
    if total <= 0:
        return counts
    if "high" in risks_l or not risks_l:
        counts["high"] = total
    elif "medium" in risks_l:
        counts["medium"] = total
    elif "low" in risks_l:
        counts["low"] = total
    else:
        counts["info"] = total
    return counts


def evaluate_admission_gate(
    counts: Optional[Mapping[str, Any]],
    policy: Optional[AdmissionPolicy] = None,
    *,
    source: str = "dojo",
) -> AdmissionResult:
    """
    ИБ-допуск по severity counts (DefectDojo ACTIVE или ZAP fallback).

    failed → exit 2 / fail_gate
    watch  → exit 0 / pass_watch (soft residual)
    """
    pol = policy or admission_policy_from_env()
    norm = normalize_severity_counts(counts)
    src = (source or "unknown").strip() or "unknown"

    if not pol.enabled:
        return AdmissionResult(
            failed=False,
            watch=False,
            risk_hints={},
            recommendations=[],
            summary={"disabled": True, "source": src, "counts": norm},
        )

    hot_critical = norm["critical"]
    hot_high = norm["high"]
    soft = norm["medium"] + norm["low"] + norm["info"]
    over_critical = hot_critical > int(pol.max_critical)
    over_high = hot_high > int(pol.max_high)
    failed = over_critical or over_high
    watch = (not failed) and soft > 0
    highest = highest_severity(norm)

    risk_hints: Dict[str, Any] = {}
    if highest:
        risk_hints = {
            "highest_severity": highest,
            "elevated": bool(failed or over_critical or over_high),
            "counts": dict(norm),
            "source": src,
            "policy": {
                "max_critical": int(pol.max_critical),
                "max_high": int(pol.max_high),
            },
        }

    recommendations: List[str] = []
    if failed:
        recommendations.append(
            f"Admission gate FAIL ({src}): critical={hot_critical}/{pol.max_critical}, "
            f"high={hot_high}/{pol.max_high} — закрыть до следующего допуска"
        )
    elif watch:
        recommendations.append(
            f"Admission gate WATCH ({src}): soft residual "
            f"medium={norm['medium']} low={norm['low']} info={norm['info']}"
        )

    summary: Dict[str, Any] = {
        "source": src,
        "counts": dict(norm),
        "max_critical": int(pol.max_critical),
        "max_high": int(pol.max_high),
        "failed": failed,
        "watch": watch,
        "total_hot": hot_critical + hot_high,
        "total_soft": soft,
    }
    if highest:
        summary["highest_severity"] = highest

    return AdmissionResult(
        failed=failed,
        watch=watch,
        risk_hints=risk_hints,
        recommendations=recommendations,
        summary=summary,
    )


def report_requirement_failures(
    *,
    allure_ok: bool | None,
    dojo_ok: bool | None,
) -> List[str]:
    """Список причин для exit 1, если env требует артефакт, а его нет/ошибка.

    allure_ok/dojo_ok:
      True — успех; False — провал; None — не пытались / N/A (считается провалом при require).
    """
    reasons: List[str] = []
    if require_allure() and allure_ok is not True:
        reasons.append("KDT_REQUIRE_ALLURE=1, но Allure generate неуспешен или results пусты")
    if require_defectdojo() and dojo_ok is not True:
        reasons.append(
            "KDT_REQUIRE_DEFECTDOJO=1, но DefectDojo import неуспешен или нет ZAP XML"
        )
    return reasons


def zap_api_key_from_env() -> str | None:
    """Ключ для industrial ZAP (G-37). Lab disablekey → None ок."""
    for name in ("KDT_ZAP_API_KEY", "ZAP_API_KEY"):
        val = _env(name)
        if val:
            return val
    return None
