from utils.env_dual import pk_env
import os
import sys
import json
import argparse
import logging
import traceback

from models.wired import Wired
from core.errors import WiredError
from core.controller import Controller
from utils.reporter import finalize_reports, write_run_summary_from_controller
from utils.paths import ensure_reports_dirs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("main")


def load_wired(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        from core.wired_secretref import prepare_wired_data
        from models.wired import strip_legacy_wired_dict

        data, secret_seeds = prepare_wired_data(data)
        data = strip_legacy_wired_dict(data)
        wired = Wired.model_validate(data)
        logger.info(f"Структура загружена: {file_path}")
        return wired
    except WiredError:
        raise
    except Exception as e:
        logger.error(f"Не удалось загрузить wired: {e}")
        sys.exit(1)


def run_validate_only(wired_path: str) -> int:
    """Pydantic + constructors; без Controller/scanner/Grid. 0 ok, 1 fail."""
    from core.wired_validate import validate_wired_file

    issues, _wired = validate_wired_file(wired_path)
    if not issues:
        logger.info("validate-only: OK (%s)", wired_path)
        return 0
    logger.error("validate-only: FAILED (%s issue(s))", len(issues))
    for line in issues:
        logger.error("  %s", line)
    return 1


def _resolve_admission_counts(controller, report_status: dict):
    """
    QG-AF: Dojo ACTIVE (stats или /findings/+filter); scanner если Dojo skipped.
    Returns (counts|None, source, evidence_error|None).
    """
    from adapters.defectdojo_client import defectdojo_configured
    from core.gate_policy import normalize_severity_counts

    dojo_skipped = bool(report_status.get("dojo_skipped"))
    dojo_ok = report_status.get("dojo_ok")

    if not dojo_skipped and defectdojo_configured():
        if dojo_ok is not True:
            return (
                None,
                "dojo",
                "DefectDojo configured but import failed or scanner XML missing",
            )
        err = report_status.get("admission_evidence_error")
        if err:
            return None, str(report_status.get("counts_source") or "dojo"), str(err)
        counts = report_status.get("admission_counts")
        src = str(report_status.get("counts_source") or "dojo_stats")
        if isinstance(counts, dict):
            return normalize_severity_counts(counts), src, None
        # finalize не положил counts — fail-closed (не тихий pass)
        return (
            None,
            src,
            "DefectDojo import ok but admission counts unavailable",
        )

    # Dojo off / skipped → scanner fallback
    try:
        return controller.collect_scanner_severity_counts(), "scanner", None
    except Exception as exc:
        return None, "scanner", str(exc)


def main():
    parser = argparse.ArgumentParser(description="PrettyK Runner")
    parser.add_argument("--wired", required=True, help="Path to wired JSON")
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate Pydantic/constructors and exit (no scanner/Grid)",
    )
    args = parser.parse_args()

    if args.validate_only:
        sys.exit(run_validate_only(args.wired))

    ensure_reports_dirs()

    wired = load_wired(args.wired)

    try:
        seeds = getattr(load_wired, "last_secret_seeds", []) or []
        controller = Controller(
            wired, wired_path=args.wired, secret_seeds=seeds
        )
    except Exception as e:
        logger.error(f"FATAL ERROR: run initialization failed: {e}")
        logger.debug(traceback.format_exc())
        sys.exit(1)

    failed = False
    quality_gate_failed = False
    exit_code = 0
    fault_kind = ""
    fault_reason = ""
    try:
        controller.run()
    except WiredError as e:
        logger.error(f"WIRED ERROR: {e}")
        failed = True
        from core.execution_fault import classify_execution_fault

        fault_kind, fault_reason = classify_execution_fault(e)
    except Exception as e:
        logger.error(f"FATAL ERROR: {e}")
        logger.debug(traceback.format_exc())
        failed = True
        from core.execution_fault import classify_execution_fault

        fault_kind, fault_reason = classify_execution_fault(e)
    finally:
        controller.shutdown()
        from adapters.defectdojo_client import defectdojo_configured
        from core.execution_fault import apply_admission_void, classify_execution_fault
        from core.gate_policy import report_requirement_failures

        report_status = finalize_reports(
            scanner_report_path=controller.last_scanner_report,
            wired=getattr(controller, "wired", None),
        )
        scanner_xml = report_status.get("scanner_xml")
        report_fails = report_requirement_failures(
            allure_ok=report_status.get("allure_ok"),
            dojo_ok=report_status.get("dojo_ok"),
        )
        if report_fails:
            for reason in report_fails:
                logger.error("Report requirement FAIL: %s", reason)
            failed = True
            if not fault_kind:
                fault_kind, fault_reason = classify_execution_fault(
                    kind_hint="reports", reason=str(report_fails[0])
                )

        # Dojo сконфигурирован и не skipped, но import/XML упал → ось исполнения.
        if (
            defectdojo_configured()
            and not report_status.get("dojo_skipped")
            and report_status.get("dojo_ok") is not True
        ):
            logger.error(
                "DefectDojo configured but import unsuccessful — execution fail "
                "(не маскируем отсутствие ИБ-evidence тихим pass)"
            )
            failed = True
            if not fault_kind:
                fault_kind, fault_reason = classify_execution_fault(
                    kind_hint="reports",
                    reason="DefectDojo configured but import unsuccessful",
                )

        # Этап-1: suites_complete обязателен перед ИБ-gate.
        suites_complete = bool(getattr(controller, "suites_complete", False))
        if not suites_complete:
            failed = True
            if not fault_kind:
                fault_kind, fault_reason = classify_execution_fault(
                    kind_hint="other",
                    reason="Stage-1 suites incomplete (hard-fail or skipped scenarios)",
                )

        try:
            from core.gate_policy_load import load_gate_policy_bundle

            gate_bundle = load_gate_policy_bundle()
            counts, source, evidence_err = _resolve_admission_counts(
                controller, report_status
            )
            if evidence_err:
                logger.error("Admission evidence error (%s): %s", source, evidence_err)
                controller._fail_quality_gate_on_alert_error(evidence_err)
                # fail-closed evidence → execution axis (допуск VOID, не fail_gate)
                mode = (
                    pk_env("QUALITY_GATE_ON_ALERT_ERROR") or "closed"
                ).strip().lower()
                if mode not in ("open", "fail_open", "fail-open"):
                    failed = True
                    if not fault_kind:
                        fault_kind, fault_reason = classify_execution_fault(
                            kind_hint="evidence", reason=str(evidence_err)
                        )
            elif not failed and suites_complete:
                quality_gate_failed = bool(
                    controller.evaluate_quality_gate(
                        counts,
                        source=source,
                        policy=gate_bundle.admission,
                    )
                )
            # QG-AF-11: observability — filter_audit + counts_source в Live hints
            # (counts остаются справкой даже при admission_void)
            hints = dict(getattr(controller, "admission_risk_hints", None) or {})
            if isinstance(counts, dict) and counts:
                hints.setdefault("counts", counts)
            audit = report_status.get("filter_audit")
            if isinstance(audit, dict) and audit:
                hints["filter_audit"] = audit
            if source:
                hints["counts_source"] = source
            if gate_bundle.source_path:
                hints["gate_policy_source"] = gate_bundle.source_path
            hints["suites_complete"] = suites_complete
            outcomes = getattr(controller, "scenario_outcomes", None)
            if isinstance(outcomes, list) and outcomes:
                hints["scenario_outcomes"] = outcomes
            from core.debug_run import (
                apply_debug_admission_void,
                wired_debug_mode,
            )

            debug_mode = wired_debug_mode(controller.wired)
            if failed:
                quality_gate_failed = False
                hints = apply_admission_void(
                    hints, kind=fault_kind or "other", reason=fault_reason
                )
                if debug_mode:
                    hints = apply_debug_admission_void(hints)
                prev = getattr(controller, "quality_gate_summary", None)
                summary = dict(prev) if isinstance(prev, dict) else {}
                summary["admission_void"] = True
                summary["execution_fault_kind"] = hints.get("execution_fault_kind")
                if debug_mode:
                    summary["debug_mode"] = True
                controller.quality_gate_summary = summary
            elif debug_mode:
                # DBG-3/6: прогон операторский — counts/gate только справка, не exit 2.
                quality_gate_failed = False
                hints = apply_debug_admission_void(hints)
                prev = getattr(controller, "quality_gate_summary", None)
                summary = dict(prev) if isinstance(prev, dict) else {}
                summary["admission_void"] = True
                summary["debug_mode"] = True
                controller.quality_gate_summary = summary
            controller.admission_risk_hints = hints
        except Exception as e:
            logger.error("Quality gate evaluation failed: %s", e)
            try:
                controller._fail_quality_gate_on_alert_error(str(e))
            except Exception:
                pass
            mode = (
                pk_env("QUALITY_GATE_ON_ALERT_ERROR") or "closed"
            ).strip().lower()
            if mode not in ("open", "fail_open", "fail-open"):
                failed = True
                if not fault_kind:
                    fault_kind, fault_reason = classify_execution_fault(
                        e, kind_hint="other"
                    )
                hints = apply_admission_void(
                    getattr(controller, "admission_risk_hints", None),
                    kind=fault_kind or "other",
                    reason=fault_reason,
                )
                controller.admission_risk_hints = hints
                quality_gate_failed = False

        if failed:
            exit_code = 1
            # Гарантируем void-hints, если try/gate оборвался до apply.
            hints_now = getattr(controller, "admission_risk_hints", None) or {}
            if not (
                isinstance(hints_now, dict) and hints_now.get("admission_void") is True
            ):
                controller.admission_risk_hints = apply_admission_void(
                    hints_now if isinstance(hints_now, dict) else {},
                    kind=fault_kind or "other",
                    reason=fault_reason,
                )
        elif quality_gate_failed:
            exit_code = 2
        try:
            write_run_summary_from_controller(
                controller, exit_code=exit_code, scanner_xml_path=scanner_xml
            )
        except Exception as e:
            logger.error("run_summary write failed: %s", e)
        try:
            from utils.live_server import notify_ci_status
            from utils.reporter import gate_label

            # exit 0/2 = process finished; exit 1 = run crash (fail_run, gate=void).
            # debug_mode: exit 0 + gate=void + admission_void (не soft-pass допуска).
            hints_ci = getattr(controller, "admission_risk_hints", None) or {}
            admission_void_ci = exit_code == 1 or (
                isinstance(hints_ci, dict) and hints_ci.get("admission_void") is True
            )
            notify_ci_status(
                phase="completed",
                conclusion="failure" if exit_code == 1 else "success",
                exit_code=exit_code,
                gate=gate_label(
                    quality_gate_failed,
                    getattr(controller, "quality_gate_summary", None),
                    admission_void=admission_void_ci,
                ),
                job_name=controller._session_name(),
                job_description="Локальный прогон оркестратора",
                risk_hints=hints_ci if isinstance(hints_ci, dict) else {},
                recommendations=getattr(controller, "admission_recommendations", None)
                or [],
            )
        except Exception as e:
            logger.debug("PrettyK Live ci/status (completed) skipped: %s", e)

    logger.info("Done.")
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
