# -*- coding: utf-8 -*-
"""CD-6: zero-touch конвейер обработки discovery корпуса и запуска сканирования.

Конвейер связывает шаги:
  1. Capture (DOM + Network через DiscoveryCorpus)
  2. Parse (извлечение FormFields + RequestTemplates)
  3. ServiceMap (маппинг страниц, форм и эндпоинтов)
  4. Context & Sites Tree injection (CD-5 zap_context)
  5. Active Scan / Passive Scan с поддержкой повторных итераций (repeat depth).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from corpus.corpus_parser import parse_corpus
from corpus.discovery_capture import DiscoveryCorpus, capture_current
from corpus.service_map import build_service_map
from corpus.zap_context import inject_corpus_into_zap

logger = logging.getLogger("orchestrator")


def run_discovery_pipeline(
    webdriver_adapter: Any,
    zap_adapter: Any,
    *,
    url: Optional[str] = None,
    context_name: Optional[str] = None,
    run_active_scan: bool = True,
    active_scan_target: Optional[str] = None,
    max_depth: int = 1,
) -> Dict[str, Any]:
    """Выполняет zero-touch конвейер: capture -> parse -> map -> inject -> scan."""
    result: Dict[str, Any] = {
        "status": "success",
        "stages": [],
        "corpus_pages": 0,
        "corpus_network": 0,
        "templates_count": 0,
        "fields_count": 0,
        "injected_requests": 0,
        "scan_status": "skipped",
    }

    current_url = url
    if not current_url and webdriver_adapter is not None:
        if hasattr(webdriver_adapter, "get_current_url"):
            try:
                current_url = webdriver_adapter.get_current_url()
            except Exception:
                current_url = ""
        elif hasattr(webdriver_adapter, "driver") and webdriver_adapter.driver:
            try:
                current_url = getattr(webdriver_adapter.driver, "current_url", "")
            except Exception:
                current_url = ""

    if not current_url and zap_adapter is not None:
        current_url = getattr(zap_adapter, "base_url", "") or ""

    # 1. Захват корпуса
    try:
        corpus = capture_current(
            webdriver_adapter,
            zap_adapter,
            url=current_url or "http://127.0.0.1",
            base=getattr(zap_adapter, "base_url", "") or "",
        )
        result["corpus_pages"] = len(corpus.pages)
        result["corpus_network"] = len(corpus.network)
        result["stages"].append("capture")
    except Exception as exc:
        logger.error("CD Pipeline: capture failed: %s", exc)
        result["status"] = "partial_error"
        result["error"] = str(exc)
        return result

    # 2. Парсинг корпуса
    try:
        parsed = parse_corpus(corpus)
        templates = parsed.get("request_templates") or []
        fields = parsed.get("form_fields") or []
        result["templates_count"] = len(templates)
        result["fields_count"] = len(fields)
        result["stages"].append("parse")
    except Exception as exc:
        logger.error("CD Pipeline: parse failed: %s", exc)
        result["status"] = "partial_error"
        result["error"] = str(exc)
        return result

    # 3. Построение карты сервисов
    try:
        s_map = build_service_map(corpus)
        result["endpoints_mapped"] = len(s_map.endpoints)
        result["stages"].append("map")
    except Exception as exc:
        logger.warning("CD Pipeline: map warning: %s", exc)
        s_map = None

    # 4. Внедрение в ZAP Context & Sites Tree
    try:
        inject_stats = inject_corpus_into_zap(
            zap_adapter,
            templates,
            context_name=context_name,
            send_to_sites_tree=True,
            service_map=s_map,
        )
        result["injected_requests"] = inject_stats.get("injected_requests", 0)
        result["stages"].append("inject")
    except Exception as exc:
        logger.error("CD Pipeline: inject failed: %s", exc)
        result["status"] = "partial_error"
        result["error"] = str(exc)

    # 5. Опциональный Active Scan
    if run_active_scan and zap_adapter:
        target_url = active_scan_target
        if not target_url and getattr(zap_adapter, "base_url", None):
            target_url = zap_adapter.base_url

        if target_url and hasattr(zap_adapter, "active_scan"):
            try:
                logger.info("CD Pipeline: starting active scan on %s", target_url)
                scan_res = zap_adapter.active_scan(target_url, context_name=context_name)
                result["scan_status"] = "completed"
                result["scan_details"] = scan_res
                result["stages"].append("active_scan")
            except Exception as exc:
                logger.error("CD Pipeline: active scan failed: %s", exc)
                result["scan_status"] = "failed"
                result["scan_error"] = str(exc)

    return result
