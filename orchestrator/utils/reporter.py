# -*- coding: utf-8 -*-
"""
Утилита отчётности PrettyK — не адаптер.

HTML Allure собирает сервис allure-light-secops. Здесь:
  • вложения в allure-results (wire `allure|…` — историческое имя компонента);
  • те же операции записи отчёта сканера, что и у ScannerAdapter.generate_report (дубль);
  • trigger generate у allure-light-secops;
  • финал прогона: Allure + DefectDojo XML + run_summary.json (G-20).

ScannerAdapter.generate_report остаётся keyword'ом `scanner|generate_report|…`.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any, Dict, Optional, Union

import allure
import requests

from utils.paths import (
    ALLURE_REPORT_DIR,
    ALLURE_RESULTS_DIR,
    LIVE_DIR,
    REPO_ROOT,
    REPORTS_DIR,
    ensure_live_dir,
    find_artifact,
    scanner_RESULTS_DIR,
    scanner_report_path,
)

LIVE_RUN_SUMMARY_PATH = LIVE_DIR / "run_summary.json"

logger = logging.getLogger("orchestrator")

PathLike = Union[str, Path]


def _env_flag(name: str, default: str = "1") -> bool:
    base = name[3:] if name.startswith("PK_") else name
    raw = os.environ.get(f"PK_{base}", default)
    return raw.strip().lower() not in {
        "0",
        "false",
        "no",
        "async",
    }


def coerce_attach_flag(value) -> bool:
    """Wire передаёт строки; «false»/«0» не должны быть truthy."""
    if isinstance(value, str):
        return value.strip().lower() not in {"0", "false", "no", ""}
    return bool(value)


class Reporter:
    """Утилита вложений Allure + записи отчётов scanner (по переданному ScannerAdapter)."""

    ATTACHMENT_TYPES = {
        ".html": allure.attachment_type.HTML,
        ".json": allure.attachment_type.JSON,
        ".xml": allure.attachment_type.XML,
        ".csv": allure.attachment_type.CSV,
        ".png": allure.attachment_type.PNG,
        ".txt": allure.attachment_type.TEXT,
        ".log": allure.attachment_type.TEXT,
        ".md": allure.attachment_type.TEXT,
    }

    def __init__(self, webdriver_adapter=None):
        self._webdriver_adapter = webdriver_adapter

    @property
    def driver(self):
        if self._webdriver_adapter:
            return self._webdriver_adapter.driver
        return None

    # --- Allure attachments (wire: allure|attach_*) ---

    def attach_screenshot(self, name="Screenshot"):
        try:
            adapter = self._webdriver_adapter
            if adapter is not None and hasattr(adapter, "get_screenshot_as_png"):
                # PlaywrightAdapter: bytes уже в адаптере (Page.screenshot). Selenium:
                # забираем у драйвера ниже.
                screenshot_bytes = adapter.get_screenshot_as_png()
            else:
                driver = self.driver
                if not driver:
                    logger.warning("No driver for screenshot")
                    return False
                screenshot_bytes = driver.get_screenshot_as_png()
            allure.attach(
                screenshot_bytes,
                name=name,
                attachment_type=allure.attachment_type.PNG,
            )
            logger.info("Screenshot attached: %s", name)
            return True
        except Exception as e:
            logger.error("Failed to attach screenshot: %s", e)
            return False

    def attach_text(self, text, name="Text"):
        allure.attach(text, name=name, attachment_type=allure.attachment_type.TEXT)
        logger.info("Text attached: %s", name)
        return True

    def attach_json(self, data, name="JSON"):
        if isinstance(data, dict):
            data = json.dumps(data, indent=2, ensure_ascii=False)
        allure.attach(data, name=name, attachment_type=allure.attachment_type.JSON)
        logger.info("JSON attached: %s", name)
        return True

    def attach_html(self, html, name="HTML"):
        allure.attach(html, name=name, attachment_type=allure.attachment_type.HTML)
        logger.info("HTML attached: %s", name)
        return True

    def attach_file(self, file_path, name=None):
        resolved_path = find_artifact(file_path)
        if resolved_path is None:
            logger.error(
                "File not found: %s (searched in %s and %s)",
                file_path,
                ALLURE_RESULTS_DIR,
                REPO_ROOT,
            )
            return False
        attachment_type = self.ATTACHMENT_TYPES.get(
            resolved_path.suffix.lower(), allure.attachment_type.TEXT
        )
        allure.attach(
            resolved_path.read_bytes(),
            name=name or resolved_path.name,
            attachment_type=attachment_type,
        )
        logger.info(
            "File attached: %s from %s", name or resolved_path.name, resolved_path
        )
        return True

    # --- scanner reports (дубль ScannerAdapter.generate_report) ---

    def generate_report(
        self,
        scanner_adapter,
        format="html",
        output_file="scanner_report.html",
        attach_to_allure=False,
    ):
        """
        Те же форматы/пути, что у ScannerAdapter.generate_report.
        scanner_adapter — живой ScannerAdapter (уже connected).
        attach_to_allure по умолчанию false (как у ScannerAdapter.generate_report).
        """
        scanner_adapter._ensure_connected()
        attach_to_allure = coerce_attach_flag(attach_to_allure)

        output_path = scanner_report_path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        scanner = scanner_adapter._scanner
        if format == "html":
            report = scanner.core.htmlreport()
        elif format == "json":
            report = scanner.core.jsonreport()
        elif format == "xml":
            report = scanner.core.xmlreport()
        elif format == "md":
            report = scanner.core.mdreport()
        else:
            raise ValueError(f"Unsupported report format: {format}")

        output_path.write_text(report, encoding="utf-8")

        if attach_to_allure and format == "html":
            attach_scanner_html(report, name=output_path.name)

        return str(output_path)


def attach_scanner_html(report: str, name: str) -> bool:
    """Прикрепить готовый HTML scanner к текущему Allure-тесту/шагу."""
    try:
        allure.attach(
            report,
            name=name,
            attachment_type=allure.attachment_type.HTML,
        )
        logger.info("scanner report attached to Allure: %s", name)
        return True
    except Exception as e:
        logger.warning("Failed to attach scanner report to Allure: %s", e)
        return False


def trigger_allure_report(
    allure_url="http://127.0.0.1:5050",
    project_id="default",
    wait=None,
):
    """Дергает allure3-secops generate-report (канон :5050)."""
    if wait is None:
        wait = _env_flag("PK_ALLURE_WAIT", "1")
    try:
        url = f"{allure_url.rstrip('/')}/generate-report?project_id={project_id}"
        if not wait:
            url = f"{url}&async=true"
        logger.info("Triggering Allure report via %s (wait=%s)", url, wait)
        timeout = 15 if not wait else int(pk_env("ALLURE_TIMEOUT_SEC", "300"))
        resp = requests.get(url, timeout=timeout)
        if not wait and resp.status_code == 202:
            logger.info("Allure report generation accepted (async)")
            return True
        resp.raise_for_status()
        logger.info("Allure report generation triggered successfully")
        return True
    except Exception as e:
        logger.error("Failed to trigger Allure report: %s", e)
        return False


def _run_dir() -> Path:
    raw = (pk_env("RUN_DIR") or "").strip()
    return Path(raw).resolve() if raw else Path.cwd()


def purge_stale_run_artifacts() -> dict:
    """BOX-SAN-1: очистить stale-артефакты прошлого прогона ПЕРЕД стартом нового run.

    run_summary.json пишется в `_run_dir()`, его live-зеркало — в `reports/live/`,
    а scanner XML/HTML — в `reports/scanner-results/`. Все три — общие пути, не
    изолированные per-run: если прошлый прогон упал до generate_report/write_run_summary,
    на диске остаются старые файлы, и монитор/Results/DefectDojo читает их как свежий
    итог. Удаляем их на старте — свежий run не может подменить свой результат старьём,
    а ранний краш оставляет честное «нет свежего результата».

    Возвращает {"removed": [...], "skipped": [...]}; не бросает исключений.
    """
    candidates: list[Path] = [(_run_dir() / "run_summary.json"), LIVE_RUN_SUMMARY_PATH]
    try:
        if scanner_RESULTS_DIR.is_dir():
            candidates.extend(sorted(scanner_RESULTS_DIR.glob("*.xml")))
            candidates.extend(sorted(scanner_RESULTS_DIR.glob("*.html")))
    except OSError:
        pass

    removed: list[str] = []
    skipped: list[str] = []
    for path in candidates:
        try:
            if path.is_file():
                path.unlink()
                removed.append(str(path))
                logger.info("stale artifact purged: %s", path)
        except OSError as exc:
            skipped.append(str(path))
            logger.warning("stale artifact purge skip %s: %s", path, exc)

    # ALR-PHANTOM + AL3-FRESH: Allure results scope накапливает *-result.json
    # прошлых прогонов (project_id = check_id стабилен; default копит файлы корня).
    # Allure3 generate импортирует ВСЕ файлы каталога, поэтому stale fail/broken
    # старых контуров засчитались бы итогом свежего run. Чистим scope: per-check
    # подкаталог целиком, в default — только файлы корня (подпапки чеков целы).
    try:
        from utils.allure_project import purge_allure_results_for_current_check

        allure_purge = purge_allure_results_for_current_check()
        removed.extend(allure_purge.get("removed", []))
        skipped.extend(allure_purge.get("skipped", []))
    except Exception as exc:  # noqa: BLE001 — best-effort честный gate
        logger.warning("allure results purge skip: %s", exc)
    return {"removed": removed, "skipped": skipped}


def gate_label(
    quality_gate_failed: bool,
    quality_gate_summary: Optional[dict] = None,
    *,
    admission_void: bool = False,
) -> str:
    """pass | fail | error | void — для run_summary.json / Live ci_gate."""
    summary = quality_gate_summary or {}
    if admission_void or summary.get("admission_void") is True:
        return "void"
    if summary.get("error"):
        return "error"
    if quality_gate_failed:
        return "fail"
    return "pass"


def build_run_summary(
    *,
    exit_code: int,
    gate: str,
    scenarios: Optional[dict] = None,
    paths: Optional[dict] = None,
    scanner_mode: str = "demon",
    scanner_api_port: int = 8080,
    scanner_proxy_port: int = 8099,
    honest_contract_notes: Optional[list] = None,
) -> dict:
    """Сериализуемый итог прогона (G-20)."""
    stats = scenarios or {}
    return {
        "exit_code": int(exit_code),
        "gate": gate,
        "scenarios": {
            "ok": int(stats.get("ok", 0)),
            "fail": int(stats.get("fail", 0)),
            "fail_allowed": int(stats.get("fail_allowed", 0)),
            "skip": int(stats.get("skip", 0)),
        },
        "paths": dict(paths or {}),
        "scanner_mode": scanner_mode,
        "scanner_api_port": int(scanner_api_port),
        "scanner_proxy_port": int(scanner_proxy_port),
        "honest_contract_notes": list(honest_contract_notes or []),
    }


def persist_live_run_summary(payload: dict) -> Path:
    """G-20 mirror for Live GET /api/run_summary/latest + Results/акт."""
    ensure_live_dir()
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    LIVE_RUN_SUMMARY_PATH.write_text(text, encoding="utf-8")
    try:
        from utils import diary_bus

        diary_bus.set_meta(
            last_run_summary_path=str(LIVE_RUN_SUMMARY_PATH.resolve()),
            last_run_summary_at=payload.get("built_at") or None,
            last_run_summary_exit=payload.get("exit_code"),
            last_run_summary_gate=payload.get("gate"),
        )
    except Exception:
        pass
    return LIVE_RUN_SUMMARY_PATH


def read_live_run_summary() -> Optional[Dict[str, Any]]:
    if not LIVE_RUN_SUMMARY_PATH.is_file():
        return None
    try:
        data = json.loads(LIVE_RUN_SUMMARY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def write_run_summary(payload: dict) -> Path:
    """Пишет run_summary.json в PK_RUN_DIR или cwd; путь — одной строкой в лог."""
    out = _run_dir() / "run_summary.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    out.write_text(text, encoding="utf-8")
    logger.info("run_summary: %s", out)
    try:
        persist_live_run_summary(payload)
    except Exception as exc:
        logger.debug("live run_summary mirror: %s", exc)
    return out


def _summary_live_path() -> Optional[str]:
    try:
        from utils.live_server import live_enabled, live_url
        from utils.paths import DIARY_NDJSON

        if live_enabled():
            return live_url()
        if DIARY_NDJSON.exists():
            return str(DIARY_NDJSON)
    except Exception:
        return None
    return None


def _summary_paths(controller, scanner_xml_path: Optional[PathLike]) -> dict:
    from utils.allure_project import resolve_allure_project_id, resolve_allure_results_dir

    paths = {
        "allure_results": str(resolve_allure_results_dir()),
        "allure_report": str(ALLURE_REPORT_DIR),
        "allure_project_id": resolve_allure_project_id(),
    }
    scanner_html = getattr(controller, "last_scanner_report", None)
    if scanner_html:
        paths["scanner_html"] = str(scanner_html)
    if scanner_xml_path:
        paths["scanner_xml"] = str(scanner_xml_path)
    live_path = _summary_live_path()
    if live_path:
        paths["live"] = str(live_path)
    return paths


def _summary_gate_flags(controller, exit_code: int) -> tuple[str, bool, bool]:
    qsum = getattr(controller, "quality_gate_summary", None)
    hints = getattr(controller, "admission_risk_hints", None)
    admission_void = int(exit_code) == 1 or (
        isinstance(qsum, dict) and qsum.get("admission_void") is True
    ) or (isinstance(hints, dict) and hints.get("admission_void") is True)
    debug_mode = (isinstance(qsum, dict) and qsum.get("debug_mode") is True) or (
        isinstance(hints, dict) and hints.get("debug_mode") is True
    )
    if admission_void:
        return "void", True, debug_mode
    return (
        gate_label(bool(getattr(controller, "quality_gate_failed", False)), qsum),
        False,
        debug_mode,
    )


def _merge_results_hooks_into_summary(payload: dict) -> None:
    try:
        from utils import diary_bus

        hooks = diary_bus.get_results_hooks()
        dojo = hooks.get("dojo") if isinstance(hooks.get("dojo"), dict) else {}
        allure = hooks.get("allure") if isinstance(hooks.get("allure"), dict) else {}
        scanner = hooks.get("scanner") if isinstance(hooks.get("scanner"), dict) else {}
        if isinstance(dojo.get("stats"), dict):
            payload["dojo_stats"] = dojo["stats"]
        if isinstance(dojo.get("collapse"), dict):
            payload["finding_collapse"] = dojo["collapse"]
        elif isinstance(scanner.get("collapse"), dict):
            payload["finding_collapse"] = scanner["collapse"]
        if isinstance(dojo.get("executive"), dict):
            payload["executive"] = dojo["executive"]
        elif isinstance(scanner.get("executive"), dict):
            payload["executive"] = scanner["executive"]
        if isinstance(allure.get("summary"), dict):
            payload["allure_summary"] = allure["summary"]
        meta = diary_bus.get_meta()
        if meta.get("executive_class"):
            payload.setdefault("executive_class", meta.get("executive_class"))
    except Exception:
        pass


def write_run_summary_from_controller(
    controller,
    *,
    exit_code: int,
    scanner_xml_path: Optional[PathLike] = None,
) -> Path:
    """Собрать и записать summary из Controller после gate / finalize."""
    gate, admission_void, debug_mode = _summary_gate_flags(controller, exit_code)
    payload = build_run_summary(
        exit_code=exit_code,
        gate=gate,
        scenarios=getattr(controller, "scenario_stats", None),
        paths=_summary_paths(controller, scanner_xml_path),
        scanner_mode=getattr(controller, "scanner_mode", "demon") or "demon",
        scanner_api_port=int(getattr(controller, "scanner_api_port", 8080)),
        scanner_proxy_port=int(getattr(controller, "scanner_proxy_port", 8099)),
        honest_contract_notes=getattr(controller, "honest_contract_notes", None),
    )
    if admission_void:
        payload["admission_void"] = True
    if debug_mode:
        payload["debug_mode"] = True
    _merge_results_hooks_into_summary(payload)
    import time as _time

    payload["built_at"] = _time.time()
    return write_run_summary(payload)


def _finalize_allure_block(
    *,
    status: Dict[str, Any],
    evidence: Dict[str, Any],
    allure_base: str,
    project_id: str,
    results_dir: Path,
    wired: Any = None,
) -> None:
    from utils.allure_project import build_allure_report_url, summarize_allure_results_dir

    wait_allure = _env_flag("PK_ALLURE_WAIT", "1")
    copy_allure_index = _env_flag("PK_ALLURE_COPY_INDEX", "0")
    has_results = results_dir.exists() and any(results_dir.iterdir())
    if not has_results:
        logger.warning(
            "No Allure results found in %s. Skipping Allure generate.",
            results_dir,
        )
        status["allure_ok"] = False
        evidence["allure"] = {
            "allure_project_id": project_id,
            "status": "error",
            "summary": {"status": "error", "total": 0},
        }
        return
    allure_summary = summarize_allure_results_dir(results_dir)
    try:
        from utils.allure_report_meta import write_allure_report_meta

        meta_info = write_allure_report_meta(results_dir, wired=wired)
        logger.info("Allure report meta written: %s", meta_info)
    except Exception as exc:  # noqa: BLE001 — generate must still run
        logger.warning("Allure report meta skip: %s", exc)
    if not trigger_allure_report(
        allure_url=allure_base or "http://127.0.0.1:5050",
        project_id=project_id,
        wait=wait_allure,
    ):
        logger.error("Allure report generation via API failed")
        status["allure_ok"] = False
        evidence["allure"] = {
            "allure_project_id": project_id,
            "status": "error",
            "summary": {**allure_summary, "generate": "failed"},
        }
        return
    report_url = build_allure_report_url(allure_base, project_id)
    logger.info("Allure report ready: %s", report_url)
    status["allure_ok"] = True
    evidence["allure"] = {
        "report_url": report_url,
        "allure_project_id": project_id,
        "status": "ok",
        "summary": allure_summary,
    }
    if copy_allure_index and project_id == "default":
        index_path = ALLURE_REPORT_DIR / "index.html"
        allure_html = REPORTS_DIR / "allure_report.html"
        if index_path.exists():
            shutil.copy(index_path, allure_html)
            logger.info("Allure index copied to %s", allure_html)
        else:
            logger.warning("Allure index not found at %s", index_path)


def finalize_reports(
    scanner_report_path: Optional[PathLike] = None,
    wired: Any = None,
) -> Dict[str, Any]:
    """Базис конца прогона: allure-light-secops generate + DefectDojo import scanner XML.

    Returns dict:
      scanner_xml: Path | None
      allure_ok: bool | None  (None = не пытались / пустые results)
      dojo_ok: bool | None
      evidence: CheckEvidenceRefs | None
    """
    from adapters.defectdojo_client import (
        resolve_dojo_gate_counts,
        resolve_scanner_xml_for_dojo,
        trigger_defectdojo_import_detailed,
    )
    from utils.allure_project import (
        resolve_allure_project_id,
        resolve_allure_results_dir,
    )
    from utils.evidence_refs import (
        resolve_check_id_for_run,
        resolve_deploy_id_for_run,
        upsert_check_evidence,
    )

    status: Dict[str, Any] = {
        "scanner_xml": None,
        "allure_ok": None,
        "dojo_ok": None,
        "dojo_skipped": False,
        "dojo_stats": None,
        "dojo_meta": None,
        "counts_source": None,
        "admission_counts": None,
        "admission_evidence_error": None,
        "filter_audit": None,
        "gate_policy_source": None,
        "evidence": None,
    }
    from utils.allure_report_meta import resolve_allure_service_base

    allure_base = resolve_allure_service_base()
    project_id = resolve_allure_project_id()
    results_dir = resolve_allure_results_dir()
    check_id = resolve_check_id_for_run()
    deploy_id = resolve_deploy_id_for_run()
    evidence: Dict[str, Any] = {
        "check_id": check_id,
        "source": "finalize",
    }
    if deploy_id:
        evidence["deploy_id"] = deploy_id

    try:
        logger.info(
            "Generating reports... allure_project_id=%s results=%s",
            project_id,
            results_dir,
        )
        _finalize_allure_block(
            status=status,
            evidence=evidence,
            allure_base=allure_base,
            project_id=project_id,
            results_dir=results_dir,
            wired=wired,
        )

        if scanner_report_path is None:
            logger.info("Wired produced no scanner report path (last_scanner_report)")
        elif os.path.exists(str(scanner_report_path)):
            logger.info("scanner report on disk: %s", scanner_report_path)
        else:
            logger.warning("scanner report path missing: %s", scanner_report_path)

        xml_path = resolve_scanner_xml_for_dojo(scanner_report_path)
        status["scanner_xml"] = xml_path
        scanner_summary: Optional[Dict[str, Any]] = None
        if xml_path is not None:
            try:
                from utils.zap_report_summary import summarize_scanner_xml

                scanner_summary = summarize_scanner_xml(xml_path)
                status["scanner_summary"] = {
                    k: scanner_summary.get(k)
                    for k in (
                        "ok",
                        "path",
                        "sites",
                        "alert_count",
                        "instance_count",
                        "counts",
                        "instance_counts",
                        "top_findings",
                        "error",
                    )
                }
                evidence["scanner"] = scanner_summary
            except Exception as exc:
                logger.debug("scanner xml summary: %s", exc)

        if xml_path is None:
            logger.info("DefectDojo: нет scanner XML в reports/scanner-results — import пропуск")
            status["dojo_ok"] = False
        else:
            dojo_result = trigger_defectdojo_import_detailed(
                xml_path,
                check_id=check_id,
                product_name=pk_env("META_PROJECT_ID") or None,
                close_old_findings=True,
            )
            if dojo_result.get("skipped"):
                status["dojo_ok"] = True
                status["dojo_skipped"] = True
            elif dojo_result.get("ok"):
                status["dojo_ok"] = True
                if isinstance(dojo_result.get("dojo"), dict):
                    dojo_meta = dojo_result["dojo"]
                    evidence["dojo"] = dojo_meta
                    status["dojo_meta"] = dojo_meta
                    from core.gate_policy_load import load_gate_policy_bundle

                    bundle = load_gate_policy_bundle()
                    status["gate_policy_source"] = bundle.source_path or None
                    counts, src, err, audit, collapsed = resolve_dojo_gate_counts(
                        dojo_meta,
                        filter_policy=bundle.filter,
                        waivers=bundle.waivers,
                    )
                    status["counts_source"] = src
                    if audit:
                        status["filter_audit"] = audit
                    if collapsed:
                        status["finding_collapse"] = collapsed
                    if err:
                        status["admission_evidence_error"] = err
                        logger.error(
                            "Dojo admission counts unavailable (%s): %s", src, err
                        )
                    elif counts is not None:
                        status["admission_counts"] = counts
                        status["dojo_stats"] = counts
                        executive = None
                        try:
                            from core.executive_conclusion import (
                                build_executive_conclusion,
                            )
                            from utils import diary_bus as _diary

                            meta_now = _diary.get_meta()
                            executive = build_executive_conclusion(
                                counts=counts,
                                collapse=collapsed if isinstance(collapsed, dict) else None,
                                ci_verdict=str(meta_now.get("ci_verdict") or ""),
                                ci_gate=str(meta_now.get("ci_gate") or ""),
                                ci_exit_code=meta_now.get("ci_exit_code"),
                                ci_recommendations=meta_now.get("ci_recommendations")
                                if isinstance(meta_now.get("ci_recommendations"), list)
                                else None,
                                source=str(src or ""),
                            ).as_dict()
                            status["executive"] = executive
                            try:
                                _diary.set_meta(
                                    executive_class=executive.get("executive_class"),
                                    executive_source=executive.get("source"),
                                )
                            except Exception:
                                pass
                        except Exception as exc:
                            logger.debug("executive conclusion: %s", exc)
                        # hooks / акт видят отфильтрованные ACTIVE counts + collapse + suppression
                        evidence["dojo"] = {
                            **dojo_meta,
                            "stats": counts,
                            "filter_audit": audit,
                            "counts_source": src,
                            "collapse": collapsed,
                            "executive": executive,
                        }
                        # DOJO-S-3: pull suppressed findings statuses
                        _resolve_suppressed_into_evidence(evidence["dojo"], dojo_meta)
            else:
                logger.error("DefectDojo import failed for %s", xml_path)
                status["dojo_ok"] = False
                status["dojo_skipped"] = False

        # RES-4/5 fallback: Dojo skip/fail → executive + collapse из scanner XML
        if not status.get("executive") and isinstance(scanner_summary, dict) and scanner_summary.get("ok"):
            try:
                from core.executive_conclusion import build_executive_conclusion
                from utils import diary_bus as _diary

                meta_now = _diary.get_meta()
                z_counts = scanner_summary.get("counts") if isinstance(scanner_summary.get("counts"), dict) else {}
                z_collapse = (
                    scanner_summary.get("collapse")
                    if isinstance(scanner_summary.get("collapse"), dict)
                    else None
                )
                executive = build_executive_conclusion(
                    counts=z_counts,
                    collapse=z_collapse,
                    ci_verdict=str(meta_now.get("ci_verdict") or ""),
                    ci_gate=str(meta_now.get("ci_gate") or ""),
                    ci_exit_code=meta_now.get("ci_exit_code"),
                    ci_recommendations=meta_now.get("ci_recommendations")
                    if isinstance(meta_now.get("ci_recommendations"), list)
                    else None,
                    source="scanner_xml",
                ).as_dict()
                status["executive"] = executive
                if isinstance(evidence.get("scanner"), dict):
                    evidence["scanner"] = {**evidence["scanner"], "executive": executive}
                try:
                    _diary.set_meta(
                        executive_class=executive.get("executive_class"),
                        executive_source=executive.get("source"),
                    )
                except Exception:
                    pass
            except Exception as exc:
                logger.debug("executive from scanner: %s", exc)

        try:
            from utils.run_ui_summary import (
                append_severity_trend,
                build_run_ui_summary,
                persist_run_ui_summary,
            )
            from utils import diary_bus as _diary_ui

            meta_ui = _diary_ui.get_meta()
            ui_summary = build_run_ui_summary(
                allure=evidence.get("allure") if isinstance(evidence.get("allure"), dict) else None,
                dojo=evidence.get("dojo") if isinstance(evidence.get("dojo"), dict) else None,
                scanner=scanner_summary if isinstance(scanner_summary, dict) else None,
                executive=status.get("executive")
                if isinstance(status.get("executive"), dict)
                else None,
                run_id=str(
                    meta_ui.get("session_name")
                    or meta_ui.get("last_export_run_id")
                    or check_id
                    or ""
                ),
            )
            persist_run_ui_summary(ui_summary)
            append_severity_trend(ui_summary)
            status["run_ui_summary"] = ui_summary
        except Exception as exc:
            logger.debug("run_ui_summary persist: %s", exc)

        try:
            status["evidence"] = upsert_check_evidence(evidence)
            # RES-3: timeline point for Admin Evidence / Deploy history
            try:
                from utils.evidence_refs import append_evidence_history

                allure_e = evidence.get("allure") if isinstance(evidence.get("allure"), dict) else {}
                dojo_e = evidence.get("dojo") if isinstance(evidence.get("dojo"), dict) else {}
                stats = dojo_e.get("stats") if isinstance(dojo_e.get("stats"), dict) else None
                exec_cls = ""
                if isinstance(status.get("executive"), dict):
                    exec_cls = str(status["executive"].get("executive_class") or "")
                gate = "unknown"
                if exec_cls == "Pass":
                    gate = "pass"
                elif exec_cls == "Watch":
                    gate = "watch"
                elif exec_cls in ("High", "Critical"):
                    gate = "fail"
                append_evidence_history(
                    check_id,
                    {
                        "gate": gate,
                        "allure_project_id": allure_e.get("allure_project_id"),
                        "allure_report_url": allure_e.get("report_url"),
                        "dojo_engagement_url": dojo_e.get("engagement_url")
                        or dojo_e.get("test_url"),
                        "dojo_stats": stats,
                        "allure_summary": allure_e.get("summary")
                        if isinstance(allure_e.get("summary"), dict)
                        else None,
                        "note": exec_cls or None,
                    },
                )
            except Exception as hist_exc:
                logger.debug("evidence history append: %s", hist_exc)
        except Exception as exc:
            logger.warning("evidence_refs upsert failed: %s", exc)

        _push_results_hooks(evidence)

        try:
            from utils.artifact_index import record_finalize_artifacts
            from utils import diary_bus as _diary_idx

            meta_idx = _diary_idx.get_meta()
            run_id = str(
                meta_idx.get("session_name")
                or meta_idx.get("last_export_run_id")
                or pk_env("RUN_ID")
                or check_id
                or ""
            )
            run_dir = None
            raw_run = (pk_env("RUN_DIR") or "").strip()
            if raw_run:
                from pathlib import Path as _Path

                run_dir = _Path(raw_run)
            allure_e = (
                evidence.get("allure") if isinstance(evidence.get("allure"), dict) else {}
            )
            record_finalize_artifacts(
                check_id=check_id,
                run_id=run_id or None,
                run_dir=run_dir,
                scanner_xml=xml_path,
                allure_results_dir=results_dir,
                allure_report_url=allure_e.get("report_url"),
                dojo=evidence.get("dojo")
                if isinstance(evidence.get("dojo"), dict)
                else None,
                hooks={
                    "allure": allure_e.get("report_url"),
                    "dojo": (
                        (evidence.get("dojo") or {}).get("engagement_url")
                        if isinstance(evidence.get("dojo"), dict)
                        else None
                    ),
                },
            )
        except Exception as art_exc:
            logger.debug("artifact_index record: %s", art_exc)

    except Exception as e:
        logger.error("Report generation failed: %s", e)
        logger.debug("finalize_reports traceback", exc_info=True)
        if status["allure_ok"] is None:
            status["allure_ok"] = False
        if status["dojo_ok"] is None:
            status["dojo_ok"] = False
    return status


def _notify_hook_safe(notify, service: str, url: str, **kwargs) -> None:
    try:
        notify(service, url, **kwargs)
    except Exception as exc:
        logger.debug("%s hook push: %s", service, exc)


def _resolve_suppressed_into_evidence(dojo_evidence: Dict[str, Any], dojo_meta: Dict[str, Any]) -> None:
    """DOJO-S-3: pull suppressed finding statuses from Dojo into evidence."""
    test_id = dojo_meta.get("test_id")
    engagement_id = dojo_meta.get("engagement_id")
    if not test_id and not engagement_id:
        return
    try:
        from adapters.defectdojo_client import list_findings_suppressed

        suppressed = list_findings_suppressed(test_id=test_id, engagement_id=engagement_id)
        if suppressed.get("ok"):
            dojo_evidence["suppressed_count"] = suppressed.get("suppressed_count", 0)
            dojo_evidence["suppressed_kinds"] = suppressed.get("suppressed_kinds", {})
            dojo_evidence["suppressed_findings"] = [
                {"title": str(f.get("title", "")), "severity": str(f.get("severity", "")),
                 "false_p": bool(f.get("false_p")), "risk_accepted": bool(f.get("risk_accepted")),
                 "mitigated": bool(f.get("mitigated")), "out_of_scope": bool(f.get("out_of_scope")),
                 "active": bool(f.get("active"))}
                for f in suppressed.get("findings", [])[:20]
            ]
    except Exception as exc:
        logger.debug("dojo suppressed pull: %s", exc)


def _resolve_results_hook_notify():
    try:
        from utils.live_server import notify_results_hook

        return notify_results_hook
    except Exception:
        try:
            from utils.diary_bus import set_results_hook as notify_results_hook

            return notify_results_hook
        except Exception:
            return None


def _push_allure_hook(notify, evidence: Dict[str, Any], allure_meta: Dict[str, Any], *, run_id: str = "") -> None:
    url = allure_meta.get("report_url")
    if not (isinstance(url, str) and url.strip()):
        return
    _notify_hook_safe(
        notify,
        "allure",
        url.strip(),
        allure_project_id=allure_meta.get("allure_project_id"),
        check_id=evidence.get("check_id"),
        deploy_id=evidence.get("deploy_id"),
        run_id=run_id or None,
        status=allure_meta.get("status"),
        summary=allure_meta.get("summary"),
    )


def _push_dojo_hook(notify, evidence: Dict[str, Any], dojo_meta: Dict[str, Any], *, run_id: str = "") -> None:
    url = dojo_meta.get("engagement_url") or dojo_meta.get("test_url")
    if not (isinstance(url, str) and url.strip()):
        return
    _notify_hook_safe(
        notify,
        "dojo",
        url.strip(),
        product_id=dojo_meta.get("product_id"),
        engagement_id=dojo_meta.get("engagement_id"),
        test_id=dojo_meta.get("test_id"),
        check_id=evidence.get("check_id"),
        deploy_id=evidence.get("deploy_id"),
        run_id=run_id or None,
        stats=dojo_meta.get("stats"),
        collapse=dojo_meta.get("collapse"),
        filter_audit=dojo_meta.get("filter_audit"),
        counts_source=dojo_meta.get("counts_source"),
        executive=dojo_meta.get("executive"),
    )


def _resolve_hook_run_id() -> str:
    """Best-effort run_id for hook attribution (meta → env → check)."""
    try:
        from utils import diary_bus

        meta = diary_bus.get_meta()
        rid = str(
            meta.get("session_name")
            or meta.get("last_export_run_id")
            or meta.get("run_id")
            or ""
        ).strip()
        if rid:
            return rid
    except Exception:
        pass
    return (pk_env("RUN_ID") or "").strip()


def _push_results_hooks(evidence: Dict[str, Any]) -> None:
    """RES-H: Live hooks via HTTP (preferred) + local file-bus fallback."""
    notify_results_hook = _resolve_results_hook_notify()
    if notify_results_hook is None:
        return

    run_id = _resolve_hook_run_id()

    allure_meta = evidence.get("allure")
    if isinstance(allure_meta, dict):
        _push_allure_hook(notify_results_hook, evidence, allure_meta, run_id=run_id)
    dojo_meta = evidence.get("dojo")
    if isinstance(dojo_meta, dict):
        _push_dojo_hook(notify_results_hook, evidence, dojo_meta, run_id=run_id)
    scanner_meta = evidence.get("scanner")
    if isinstance(scanner_meta, dict) and scanner_meta.get("ok"):
        scanner_url = (
            pk_env("SCANNER_API_URL") or "http://127.0.0.1:8080/"
        ).strip()
        _notify_hook_safe(
            notify_results_hook,
            "scanner",
            scanner_url,
            check_id=evidence.get("check_id"),
            deploy_id=evidence.get("deploy_id"),
            run_id=run_id or None,
            counts=scanner_meta.get("counts"),
            instance_counts=scanner_meta.get("instance_counts"),
            alert_count=scanner_meta.get("alert_count"),
            instance_count=scanner_meta.get("instance_count"),
            top_findings=scanner_meta.get("top_findings"),
            collapse=scanner_meta.get("collapse"),
            executive=scanner_meta.get("executive"),
            path=scanner_meta.get("path"),
            status="ok",
        )


# ── PERS-B2: Evidence persistence (SHA256 + MinIO / local) ──

def record_evidence_artifact(
    *,
    run_id: str,
    file_path: str,
    artifact_type: str = "",
    artifact_name: str = "",
) -> dict:
    """
    Записать evidence-артефакт: SHA256 → MinIO (if available) или local → EvidenceRecord.

    Вызывается из Controller teardown / lab_run после завершения прогона.
    Не бросает исключений — возвращает dict с ok/error.
    """
    import os
    try:
        from api.evidence_api import write_evidence_from_file

        if not artifact_type:
            # Autodetect from extension
            ext = os.path.splitext(file_path)[1].lower()
            artifact_type = {
                ".webm": "video", ".mp4": "video",
                ".png": "screenshot", ".jpg": "screenshot", ".jpeg": "screenshot",
                ".har": "har",
                ".html": "report_html", ".xml": "report_xml", ".json": "report_json",
                ".log": "log", ".txt": "log",
            }.get(ext, "unknown")

        return write_evidence_from_file(
            run_id=run_id,
            file_path=file_path,
            artifact_type=artifact_type,
            artifact_name=artifact_name,
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc), "path": file_path}


def record_all_artifacts_in_dir(run_id: str, directory: str) -> list[dict]:
    """
    Обойти каталог артефактов и записать EvidenceRecord для каждого релевантного файла.

    Рекурсивно (один уровень): видео, скриншоты, HAR, отчёты, логи.
    """
    import os
    results = []
    if not os.path.isdir(directory):
        return results
    for entry in sorted(os.scandir(directory), key=lambda e: e.name):
        if not entry.is_file():
            continue
        ext = os.path.splitext(entry.name)[1].lower()
        if ext in {".webm", ".mp4", ".png", ".jpg", ".jpeg", ".har",
                   ".html", ".xml", ".json", ".log", ".txt", ".pdf"}:
            result = record_evidence_artifact(
                run_id=run_id,
                file_path=entry.path,
            )
            if result.get("ok"):
                results.append(result)
    return results
