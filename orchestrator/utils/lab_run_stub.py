# -*- coding: utf-8 -*-
"""
Быстрая болванка lab-прогона (без Juice/Grid/Spider).

Эмулирует: CI running → (pause) → hooks Allure+Dojo (+ stats) → CI completed.
Лёгкий gate: бутафория DefectDojo stats может уронить quality gate (exit 2).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional

DEFAULT_ALLURE_URL = "http://127.0.0.1:5050/"
DEFAULT_DOJO_URL = "http://127.0.0.1:8081/engagement/1"

# Бутафория «одна порция High» — для ломки gate в lab без Juice.
BUTTA_DOJO_HIGH = {
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 0,
    "info": 1,
}


# CLI → re-apply after status=running (child must not wipe parent seed).
_ACT_META: Dict[str, Any] = {}


@dataclass(frozen=True)
class LabStubScenario:
    """Параметры болванки (exit/gate → PipelineVerdict)."""

    sleep_s: float = 0.05
    exit_code: int = 0
    gate: str = "pass"
    conclusion: str = "success"
    allure_url: str = DEFAULT_ALLURE_URL
    dojo_url: str = DEFAULT_DOJO_URL
    job_name: str = "lab-stub"
    job_description: str = "Имитация: пауза + отчёты"
    skip_hooks: bool = False
    fail_before_hooks: bool = False
    # DefectDojo-бутафория: counts → risk_hints + опционально ломка gate.
    dojo_stats: Dict[str, int] = field(default_factory=dict)
    allure_summary: Dict[str, Any] = field(default_factory=dict)
    # True → если high+critical > 0, принудительно exit 2 / gate=fail (лёгкий контур).
    apply_dojo_gate: bool = False
    # Готовый preset: подставить BUTTA_DOJO_HIGH + apply_dojo_gate.
    dojo_butta_high: bool = False


def _int_stat(stats: Dict[str, Any], key: str) -> int:
    try:
        return max(0, int(stats.get(key) or 0))
    except (TypeError, ValueError):
        return 0


def resolve_gate_from_dojo(
    *,
    exit_code: int,
    gate: str,
    conclusion: str,
    dojo_stats: Dict[str, Any],
    apply_dojo_gate: bool,
) -> tuple[int, str, str, Optional[Dict[str, Any]], list[str]]:
    """
    Stub admission через общий evaluate_admission_gate.
    Возвращает exit, gate, conclusion, risk_hints, recommendations.
    """
    from core.gate_policy import AdmissionPolicy, evaluate_admission_gate

    out_exit = int(exit_code)
    out_gate = (gate or "").strip().lower()
    out_conclusion = (conclusion or "").strip().lower()
    risk_hints: Optional[Dict[str, Any]] = None
    recommendations: list[str] = []

    if apply_dojo_gate:
        result = evaluate_admission_gate(
            dojo_stats,
            AdmissionPolicy(max_critical=0, max_high=0, enabled=True),
            source="dojo_butta",
        )
        risk_hints = dict(result.risk_hints) if result.risk_hints else {}
        recommendations = list(result.recommendations)
        if result.failed:
            out_exit = 2
            out_gate = "fail"
            if not out_conclusion:
                out_conclusion = "success"
        elif result.watch and out_exit == 0 and (not out_gate or out_gate == "pass"):
            out_gate = "pass"
    elif dojo_stats:
        # Stats без ломки gate — всё равно risk_hints для pass_watch на FE.
        result = evaluate_admission_gate(
            dojo_stats,
            AdmissionPolicy(max_critical=999, max_high=999, enabled=True),
            source="dojo_butta",
        )
        risk_hints = dict(result.risk_hints) if result.risk_hints else {}
        recommendations = list(result.recommendations)

    if out_exit == 0 and not out_conclusion:
        out_conclusion = "success"
    if out_exit == 1 and not out_conclusion:
        out_conclusion = "failure"
    if out_exit == 2 and not out_gate:
        out_gate = "fail"

    return out_exit, out_gate, out_conclusion, risk_hints, recommendations


def _apply_ci(**fields) -> None:
    from utils.live_server import apply_ci_status

    apply_ci_status({k: v for k, v in fields.items() if v is not None})


def _push_hooks(
    allure_url: str,
    dojo_url: str,
    *,
    allure_summary: Optional[Dict[str, Any]] = None,
    dojo_stats: Optional[Dict[str, Any]] = None,
) -> None:
    from utils.live_server import notify_results_hook

    allure_extra: Dict[str, Any] = {"status": "ok", "source": "lab_stub"}
    if allure_summary:
        allure_extra["summary"] = allure_summary
        allure_extra["allure_project_id"] = "default"
    notify_results_hook("allure", allure_url, **allure_extra)

    dojo_extra: Dict[str, Any] = {"source": "lab_stub"}
    if dojo_stats:
        dojo_extra["stats"] = dojo_stats
        dojo_extra["active_findings"] = sum(
            _int_stat(dojo_stats, k) for k in ("critical", "high", "medium", "low", "info")
        )
    notify_results_hook("dojo", dojo_url, **dojo_extra)


def _sleep_interruptible(
    seconds: float, stop_flag: Optional[Callable[[], bool]] = None
) -> bool:
    if seconds <= 0:
        return not (stop_flag and stop_flag())
    deadline = time.time() + seconds
    while time.time() < deadline:
        if stop_flag and stop_flag():
            return False
        time.sleep(min(0.05, max(0.0, deadline - time.time())))
    return not (stop_flag and stop_flag())


def _normalize_scenario(sc: LabStubScenario) -> LabStubScenario:
    if not sc.dojo_butta_high:
        return sc
    # Preset жёстко: флаг = порция High, не «частично переопределённый» stats.
    stats = dict(BUTTA_DOJO_HIGH)
    return LabStubScenario(
        sleep_s=sc.sleep_s,
        exit_code=sc.exit_code,
        gate=sc.gate,
        conclusion=sc.conclusion,
        allure_url=sc.allure_url,
        dojo_url=sc.dojo_url,
        job_name=sc.job_name,
        job_description=sc.job_description or "Имитация: Dojo High → gate fail",
        skip_hooks=sc.skip_hooks,
        fail_before_hooks=sc.fail_before_hooks,
        dojo_stats=stats,
        allure_summary=sc.allure_summary
        or {"total": 4, "passed": 3, "failed": 1, "broken": 0, "skipped": 0},
        apply_dojo_gate=True,
        dojo_butta_high=True,
    )


def run_lab_stub(
    scenario: LabStubScenario | None = None,
    *,
    stop_flag: Optional[Callable[[], bool]] = None,
) -> int:
    from utils.diary_bus import set_meta

    sc = _normalize_scenario(scenario or LabStubScenario())
    job = (sc.job_name or "lab-stub").strip() or "lab-stub"

    try:
        set_meta(status="running", session_name=job)
        if _ACT_META:
            set_meta(**_ACT_META)
    except Exception:
        pass

    _apply_ci(
        phase="in_progress",
        job_name=job,
        job_description=sc.job_description,
    )

    finished_ok = _sleep_interruptible(float(sc.sleep_s), stop_flag)
    if not finished_ok:
        _apply_ci(
            phase="completed",
            conclusion="cancelled",
            exit_code=1,
            gate="error",
            job_name=job,
            job_description="Имитация остановлена",
        )
        try:
            set_meta(status="waiting")
        except Exception:
            pass
        return 1

    if sc.fail_before_hooks:
        _apply_ci(
            phase="completed",
            conclusion="failure",
            exit_code=1,
            gate="error",
            job_name=job,
            job_description="Авария до публикации ссылок",
        )
        try:
            set_meta(status="waiting")
        except Exception:
            pass
        return 1

    if not sc.skip_hooks:
        _push_hooks(
            sc.allure_url,
            sc.dojo_url,
            allure_summary=sc.allure_summary or None,
            dojo_stats=sc.dojo_stats or None,
        )

    exit_code, gate, conclusion, risk_hints, recommendations = resolve_gate_from_dojo(
        exit_code=sc.exit_code,
        gate=sc.gate,
        conclusion=sc.conclusion,
        dojo_stats=sc.dojo_stats,
        apply_dojo_gate=sc.apply_dojo_gate,
    )

    _apply_ci(
        phase="completed",
        conclusion=conclusion or None,
        exit_code=exit_code,
        gate=gate or None,
        job_name=job,
        job_description=sc.job_description,
        # Пустые объекты — чтобы не залипали hints прошлого fail_gate/pass_watch.
        risk_hints=risk_hints if risk_hints is not None else {},
        recommendations=list(recommendations),
    )
    try:
        set_meta(status="waiting")
    except Exception:
        pass
    return exit_code


def scenario_from_mapping(opts: Dict[str, Any], *, session_name: str = "") -> LabStubScenario:
    """Собрать сценарий из stub_opts playground / тестов."""
    sleep_s = opts.get("sleep_s", opts.get("sleep", 0.05))
    try:
        sleep_s = float(sleep_s)
    except (TypeError, ValueError):
        sleep_s = 0.05
    try:
        exit_code = int(opts.get("exit_code", 0))
    except (TypeError, ValueError):
        exit_code = 0
    dojo_stats = opts.get("dojo_stats") if isinstance(opts.get("dojo_stats"), dict) else {}
    allure_summary = (
        opts.get("allure_summary") if isinstance(opts.get("allure_summary"), dict) else {}
    )
    return LabStubScenario(
        sleep_s=sleep_s,
        exit_code=exit_code,
        gate=str(opts.get("gate") or "pass"),
        conclusion=str(opts.get("conclusion") or ""),
        allure_url=str(opts.get("allure_url") or DEFAULT_ALLURE_URL),
        dojo_url=str(opts.get("dojo_url") or DEFAULT_DOJO_URL),
        job_name=str(opts.get("job_name") or session_name or "lab-stub"),
        job_description=str(opts.get("job_description") or "Имитация: пауза + отчёты"),
        skip_hooks=opts.get("skip_hooks") is True,
        fail_before_hooks=opts.get("fail_before_hooks") is True,
        dojo_stats={str(k): _int_stat(dojo_stats, str(k)) for k in dojo_stats},
        allure_summary=dict(allure_summary),
        apply_dojo_gate=opts.get("apply_dojo_gate") is True,
        dojo_butta_high=opts.get("dojo_butta_high") is True,
    )


def scenario_from_args(ns: argparse.Namespace) -> LabStubScenario:
    stats: Dict[str, int] = {}
    if getattr(ns, "dojo_stats_json", None):
        try:
            raw = json.loads(ns.dojo_stats_json)
            if isinstance(raw, dict):
                stats = {str(k): _int_stat(raw, str(k)) for k in raw}
        except json.JSONDecodeError:
            stats = {}
    return LabStubScenario(
        sleep_s=float(ns.sleep),
        exit_code=int(ns.exit_code),
        gate=str(ns.gate or "pass"),
        conclusion=str(ns.conclusion or ""),
        allure_url=str(ns.allure_url),
        dojo_url=str(ns.dojo_url),
        job_name=str(ns.job_name or "lab-stub"),
        job_description=str(ns.job_description or "Имитация: пауза + отчёты"),
        skip_hooks=bool(ns.skip_hooks),
        fail_before_hooks=bool(ns.fail_before_hooks),
        dojo_stats=stats,
        apply_dojo_gate=bool(ns.apply_dojo_gate),
        dojo_butta_high=bool(ns.dojo_butta_high),
    )


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Ускоренная имитация lab-прогона")
    p.add_argument("--sleep", type=float, default=0.05)
    p.add_argument("--exit-code", type=int, default=0)
    p.add_argument("--gate", default="pass")
    p.add_argument("--conclusion", default="")
    p.add_argument("--allure-url", default=DEFAULT_ALLURE_URL)
    p.add_argument("--dojo-url", default=DEFAULT_DOJO_URL)
    p.add_argument("--job-name", default="lab-stub")
    p.add_argument("--job-description", default="Имитация: пауза + отчёты")
    p.add_argument("--skip-hooks", action="store_true")
    p.add_argument("--fail-before-hooks", action="store_true")
    p.add_argument(
        "--dojo-stats-json",
        default="",
        help='JSON counts, напр. {"high":1,"medium":2}',
    )
    p.add_argument(
        "--apply-dojo-gate",
        action="store_true",
        help="High/Critical в stats → exit 2 / gate=fail",
    )
    p.add_argument(
        "--dojo-butta-high",
        action="store_true",
        help="Preset: одна бутафорская High + ломка gate",
    )
    p.add_argument(
        "--generate-act",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="Писать meta.generate_act (ворота акта/zip)",
    )
    p.add_argument(
        "--assessment-purpose",
        default="",
        help="Писать meta.assessment_purpose",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    ns = build_arg_parser().parse_args(argv)
    global _ACT_META
    _ACT_META = {}
    if ns.generate_act is not None:
        _ACT_META["generate_act"] = bool(ns.generate_act)
    purpose = str(ns.assessment_purpose or "").strip()
    if purpose:
        _ACT_META["assessment_purpose"] = purpose
    return int(run_lab_stub(scenario_from_args(ns)))


if __name__ == "__main__":
    sys.exit(main())
