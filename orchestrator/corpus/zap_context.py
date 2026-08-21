# -*- coding: utf-8 -*-
"""CD-5: внедрение корпуса (DiscoveryCorpus / RequestTemplate / ServiceMap) в ZAP Context & Sites Tree.

Функционал:
  1. ``build_zap_raw_request()`` — форматирование ``RequestTemplate`` в стандартный HTTP/1.1 wire-формат.
  2. ``inject_corpus_into_zap()`` — регистрация URL-шаблонов в include-паттерны контекста ZAP
     и отправка синтетических/пробуждённых запросов через ``zap.core.send_request`` для
     наполнения дерева сайтов (Sites Tree), чтобы последующий ``active_scan`` сканировал
     не только обнаруженные спайдером страницы, но и все извлечённые/пробуждённые эндпоинты.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlencode, urlsplit

from corpus.corpus_parser import RequestTemplate
from corpus.service_map import ServiceMap

logger = logging.getLogger("orchestrator")


def build_zap_raw_request(
    template: RequestTemplate,
    *,
    host_header: Optional[str] = None,
    user_agent: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KDT-SecOps/1.0",
    headers_extra: Optional[Dict[str, str]] = None,
) -> str:
    """Сборка HTTP/1.1 wire-запроса из ``RequestTemplate`` для отправки в ZAP API."""
    method = (template.method or "GET").upper()
    parts = urlsplit(template.url or "/")
    host = host_header or parts.netloc or "127.0.0.1"

    path = parts.path or "/"
    query_str = parts.query

    # Если в query_params есть переопределения/поля, нормализуем
    if template.query_params:
        q_dict = {f["name"]: f["value"] for f in template.query_params if "name" in f}
        extra_q = urlencode(q_dict)
        if extra_q:
            query_str = f"{query_str}&{extra_q}" if query_str else extra_q

    full_path = f"{path}?{query_str}" if query_str else path

    headers: Dict[str, str] = {
        "Host": host,
        "User-Agent": user_agent,
        "Accept": "*/*",
        "Connection": "close",
    }
    if headers_extra:
        for k, v in headers_extra.items():
            if k.lower() not in ("host", "content-length"):
                headers[k] = str(v)

    body = ""
    if template.body_fields:
        b_dict = {f["name"]: f["value"] for f in template.body_fields if "name" in f}
        if method in ("POST", "PUT", "PATCH"):
            headers["Content-Type"] = "application/json"
            body = json.dumps(b_dict, ensure_ascii=False)

    if body:
        headers["Content-Length"] = str(len(body.encode("utf-8")))

    lines = [f"{method} {full_path} HTTP/1.1"]
    for hk, hv in headers.items():
        lines.append(f"{hk}: {hv}")
    lines.append("")
    lines.append(body)

    return "\r\n".join(lines)


def inject_corpus_into_zap(
    zap_adapter: Any,
    templates: Sequence[RequestTemplate],
    *,
    context_name: Optional[str] = None,
    send_to_sites_tree: bool = True,
    service_map: Optional[ServiceMap] = None,
) -> Dict[str, Any]:
    """Внедрение разобранного корпуса запросов в ZAP:

    1. Добавление URL/Origin в include-фильтры контекста (если задан context_name).
    2. Прогон запросов через ``zap_http_raw_request`` / ``send_request`` для наполнения
       Sites Tree ZAP (перед active_scan).
    """
    stats = {
        "templates_total": len(templates),
        "injected_requests": 0,
        "failed_requests": 0,
        "context_includes_added": 0,
    }

    if not templates and not (service_map and service_map.endpoints):
        return stats

    # 1. Добавление путей в context include regex
    if context_name and hasattr(zap_adapter, "set_context_include"):
        seen_origins = set()
        for t in templates:
            parts = urlsplit(t.url or "")
            if parts.netloc:
                origin = f"{parts.scheme or 'http'}://{parts.netloc}"
                if origin not in seen_origins:
                    seen_origins.add(origin)
                    try:
                        zap_adapter.set_context_include(context_name, f"{origin}.*")
                        stats["context_includes_added"] += 1
                    except Exception as exc:
                        logger.debug("ZAP context include skip for %s: %s", origin, exc)

    # 2. Отправка запросов в ZAP для наполнения дерева
    if send_to_sites_tree:
        for t in templates:
            try:
                raw_http = build_zap_raw_request(t)
                if hasattr(zap_adapter, "zap_http_raw_request"):
                    zap_adapter.zap_http_raw_request(raw_http, follow_redirects=True)
                    stats["injected_requests"] += 1
                elif hasattr(zap_adapter, "_zap") and zap_adapter._zap:
                    zap_adapter._zap.core.send_request(raw_http, "true")
                    stats["injected_requests"] += 1
            except Exception as exc:
                stats["failed_requests"] += 1
                logger.debug("Failed injecting template %s into ZAP: %s", t.url, exc)

    return stats
