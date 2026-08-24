# -*- coding: utf-8 -*-
"""MC-RES-3: пересчёт admission gate из Live hooks при сборке zip-пакета."""
from __future__ import annotations

import os
from typing import Any, Dict, Mapping, Optional, Tuple

from core.gate_policy import (
    AdmissionPolicy,
    evaluate_admission_gate,
    normalize_severity_counts,
)
from utils.env_dual import pk_env


def package_recalc_enabled() -> bool:
    """KDT_PACKAGE_RECALC_GATE — default on; 0/false выключает."""
    raw = (pk_env("PACKAGE_RECALC_GATE") or "1").strip().lower()
    return raw not in {"0", "false", "off", "no", ""}


def resolve_hooks_counts(hooks: Mapping[str, Any]) -> Tuple[Dict[str, int], str]:
    """ACTIVE counts из hooks: Dojo stats → ZAP counts."""
    dojo = hooks.get("dojo") if isinstance(hooks.get("dojo"), dict) else {}
    stats = dojo.get("stats") if isinstance(dojo.get("stats"), dict) else {}
    norm = normalize_severity_counts(stats)
    if any(norm.values()):
        src = str(dojo.get("counts_source") or "dojo_stats").strip() or "dojo_stats"
        return norm, src
    zap = hooks.get("zap") if isinstance(hooks.get("zap"), dict) else {}
    zcounts = zap.get("counts") if isinstance(zap.get("counts"), dict) else {}
    znorm = normalize_severity_counts(zcounts)
    if any(znorm.values()):
        return znorm, "zap"
    return normalize_severity_counts({}), ""


def skip_recalc_reason(meta: Mapping[str, Any]) -> Optional[str]:
    """Не пересчитываем допуск при VOID / сбое исполнения / debug."""
    hints = meta.get("ci_risk_hints") if isinstance(meta.get("ci_risk_hints"), dict) else {}
    if hints.get("admission_void") is True or hints.get("debug_mode") is True:
        return "admission_void"
    try:
        exit_code = int(meta.get("ci_exit_code")) if meta.get("ci_exit_code") is not None else None
    except (TypeError, ValueError):
        exit_code = None
    verdict = str(meta.get("ci_verdict") or "").strip().lower()
    gate = str(meta.get("ci_gate") or "").strip().lower()
    if exit_code == 1 or verdict == "fail_run" or gate in {"void", "error"}:
        return "execution_fault"
    return None


def _load_admission_policy() -> Tuple[AdmissionPolicy, str]:
    try:
        from core.gate_policy_load import load_gate_policy_bundle

        bundle = load_gate_policy_bundle()
        return bundle.admission, str(bundle.source_path or "")
    except Exception:
        from core.gate_policy import admission_policy_from_env

        return admission_policy_from_env(), "env"


def _resolve_recalc_counts(
    hooks: Mapping[str, Any],
) -> Tuple[Optional[Dict[str, int]], str, Optional[str]]:
    """→ (counts|None, source, skip_reason|None)."""
    counts, source = resolve_hooks_counts(hooks)
    if source and any(counts.values()):
        return counts, source, None
    dojo = hooks.get("dojo") if isinstance(hooks.get("dojo"), dict) else {}
    zap = hooks.get("zap") if isinstance(hooks.get("zap"), dict) else {}
    has_hook = bool(dojo.get("stats") is not None or zap.get("counts") is not None)
    if not has_hook:
        return None, "", "no_counts"
    if not source:
        source = str(dojo.get("counts_source") or ("dojo_stats" if dojo else "zap"))
    return counts, source, None


def _gate_from_admission(result: Any) -> Tuple[str, str]:
    if result.failed:
        return "fail", "fail_gate"
    if result.watch:
        return "watch", "pass_watch"
    return "pass", "pass"


def recalculate_package_gate(
    meta: Mapping[str, Any],
    hooks: Mapping[str, Any],
    *,
    enabled: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Пересчёт gate из hooks.stats + GatePolicy (не зеркало ci_*).

    Возвращает dict для meta/package_gate.json и act.
    """
    on = package_recalc_enabled() if enabled is None else bool(enabled)
    mirrored_gate = str(meta.get("ci_gate") or "").strip().lower()
    mirrored_verdict = str(meta.get("ci_verdict") or "").strip().lower()
    base: Dict[str, Any] = {
        "kind": "kdt_package_gate_recalc",
        "version": 1,
        "enabled": on,
        "mirrored_gate": mirrored_gate or None,
        "mirrored_verdict": mirrored_verdict or None,
    }
    if not on:
        base["skipped"] = "disabled"
        return base

    skip = skip_recalc_reason(meta)
    if skip:
        base["skipped"] = skip
        return base

    counts, source, counts_skip = _resolve_recalc_counts(hooks)
    if counts_skip:
        base["skipped"] = counts_skip
        return base
    assert counts is not None

    policy, policy_source = _load_admission_policy()
    result = evaluate_admission_gate(counts, policy, source=source or "hooks")
    gate, verdict = _gate_from_admission(result)

    mirrored_norm = "pass" if mirrored_gate in {"pass", "ok"} else mirrored_gate
    diverged = bool(mirrored_norm) and mirrored_norm != gate
    if mirrored_verdict and mirrored_verdict != verdict:
        diverged = True

    base.update(
        {
            "gate": gate,
            "verdict": verdict,
            "failed": bool(result.failed),
            "watch": bool(result.watch),
            "counts": dict(counts),
            "counts_source": source,
            "policy": {
                "max_critical": int(policy.max_critical),
                "max_high": int(policy.max_high),
                "enabled": bool(policy.enabled),
                "source": policy_source,
            },
            "recommendations": list(result.recommendations),
            "diverged": diverged,
        }
    )
    return base


def format_recalc_admission_line(recalc: Mapping[str, Any]) -> str:
    """Строка для lab act.html."""
    if not recalc.get("enabled"):
        return "Пересчёт допуска: выключен (KDT_PACKAGE_RECALC_GATE=0)"
    skip = recalc.get("skipped")
    if skip == "admission_void":
        return "Пересчёт допуска: пропущен (допуск недействителен)"
    if skip == "execution_fault":
        return "Пересчёт допуска: пропущен (сбой исполнения)"
    if skip == "no_counts":
        return "Пересчёт допуска: нет counts в hooks"
    if skip == "disabled":
        return "Пересчёт допуска: выключен"
    if skip:
        return f"Пересчёт допуска: пропущен ({skip})"
    gate = str(recalc.get("gate") or "—")
    verdict = str(recalc.get("verdict") or "—")
    pol = recalc.get("policy") if isinstance(recalc.get("policy"), dict) else {}
    line = f"Пересчёт допуска (hooks): gate={gate} · verdict={verdict}"
    if pol:
        line += (
            f" · max_critical={pol.get('max_critical')} max_high={pol.get('max_high')}"
        )
    if recalc.get("diverged"):
        line += (
            f" · расхождение с CI ({recalc.get('mirrored_gate')}/{recalc.get('mirrored_verdict')})"
        )
    return line
