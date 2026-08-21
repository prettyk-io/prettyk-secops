# -*- coding: utf-8 -*-
"""CD-4: Эвристическое пробуждение запросов (zero-touch form awakening).

Принимает ``ServiceMap`` и ``DiscoveryCorpus``, находит DOM-инпуты
(формы/кнопки/поля) без зафиксированных сетевых вызовов, генерирует
эвристические payload-значения по типам полей и возвращает шаблоны
пробуждённых эндпоинтов.

Вызывающий код (браузер/ZAP/CDP) отправляет ``RequestTemplate`` и
слушает ответ; ``awaken_candidates`` только вычисляет кандидатов.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urlencode

from corpus.corpus_parser import FormField, RequestTemplate, parse_corpus
from corpus.discovery_capture import DiscoveryCorpus, NetworkEntry
from corpus.service_map import ServiceMap

logger = logging.getLogger("orchestrator")

_DEFAULT_PAYLOADS: Dict[str, str] = {
    "text": "awakened-test-value",
    "email": "awakened@secops.test",
    "password": "AwakenedP@ss1",
    "number": "42",
    "tel": "+79991234567",
    "url": "https://secops.test/awakened",
    "search": "awakened query",
    "date": "2026-01-15",
    "datetime-local": "2026-01-15T12:00",
    "textarea": "awakened multiline\ntext body",
    "select": "",  # заполняется первым option value при рендере
}


def _heuristic_value(field: FormField) -> str:
    ftype = (field.field_type or "text").lower().strip()
    if ftype in _DEFAULT_PAYLOADS:
        return _DEFAULT_PAYLOADS[ftype]
    if field.value and field.value.strip() and field.value.strip() != "undefined":
        return field.value.strip()
    return _DEFAULT_PAYLOADS["text"]


def _field_to_qp(field: FormField) -> Optional[Dict[str, str]]:
    if not field.name:
        return None
    return {"name": field.name, "value": _heuristic_value(field)}


@dataclass
class AwakenCandidate:
    """Пробуждённый эндпоинт: шаблон для отправки + мета-инфо."""

    template: RequestTemplate
    source_page: str = ""
    source_field: str = ""
    reason: str = ""  # form_action | param_name | origin_fallback


def _form_action_candidates(
    fields: List[FormField],
    page_url: str,
    page_origin: str,
) -> List[AwakenCandidate]:
    out: List[AwakenCandidate] = []
    for field in fields:
        if not field.form_action:
            continue
        action = field.form_action
        if not action.startswith(("http://", "https://")):
            action = page_origin + (action if action.startswith("/") else "/" + action)
        qp = _field_to_qp(field)
        out.append(
            AwakenCandidate(
                template=RequestTemplate(
                    method="POST",
                    url=action,
                    query_params=[qp] if qp else [],
                    body_fields=[],
                ),
                source_page=page_url,
                source_field=field.name,
                reason="form_action",
            )
        )
    return out


def _origin_fallback_candidates(
    fields: List[FormField],
    page_url: str,
    page_origin: str,
    templates: List[RequestTemplate],
) -> List[AwakenCandidate]:
    """Поля без form_action и без совпадения имени параметра — origin fallback."""
    out: List[AwakenCandidate] = []
    origin_templates = [t for t in templates if page_origin and page_origin in t.url]
    if not origin_templates:
        origin_templates = templates
    for field in fields:
        if field.form_action:
            continue  # уже обработано
        for tpl in origin_templates[:1]:  # берём первый подходящий как цель
            qp = _field_to_qp(field)
            candidate_tpl = RequestTemplate(
                method=tpl.method,
                url=tpl.url,
                query_params=list(tpl.query_params) + ([qp] if qp else []),
                body_fields=(
                    list(tpl.body_fields) + ([qp] if qp else [])
                    if tpl.method.upper() in ("POST", "PUT", "PATCH")
                    else list(tpl.body_fields)
                ),
            )
            out.append(
                AwakenCandidate(
                    template=candidate_tpl,
                    source_page=page_url,
                    source_field=field.name,
                    reason="origin_fallback",
                )
            )
            break
    return out


def _covered_endpoints(templates: List[RequestTemplate]) -> set:
    """Пути эндпоинтов, реально зафиксированных в Network (по template URL)."""
    from urllib.parse import urlsplit

    covered: set = set()
    for tpl in templates:
        parts = urlsplit(tpl.url)
        covered.add((parts.netloc or "").lower() + (parts.path or "/"))
    return covered


def _covered_param_names(templates: List[RequestTemplate]) -> set:
    """Имена параметров, реально зафиксированных в Network."""
    names: set = set()
    for tpl in templates:
        for p in tpl.query_params:
            names.add((p.get("name") or "").lower())
        for p in tpl.body_fields:
            names.add((p.get("name") or "").lower())
    return names


def _is_field_covered(
    field: FormField,
    page_origin: str,
    covered_endpoints: set,
    covered_params: set,
) -> bool:
    """Поле «покрыто» сетью, если его endpoint или имя параметра зафиксированы."""
    if (field.name or "").lower() in covered_params:
        return True
    if field.form_action:
        action = field.form_action
        if not action.startswith(("http://", "https://")):
            action = page_origin + (action if action.startswith("/") else "/" + action)
        from urllib.parse import urlsplit

        parts = urlsplit(action)
        key = (parts.netloc or "").lower() + (parts.path or "/")
        if key in covered_endpoints:
            return True
    return False


def _page_origin(page_url: str) -> str:
    from urllib.parse import urlsplit

    parts = urlsplit(page_url or "")
    if not parts.netloc:
        return ""
    scheme = parts.scheme or "http"
    return f"{scheme}://{parts.netloc}"


def awaken_candidates(
    service_map: ServiceMap,
    corpus: DiscoveryCorpus,
) -> List[AwakenCandidate]:
    """Найти формы/поля без зафиксированных сетевых вызовов и сгенерировать шаблоны.

    Возвращает список ``AwakenCandidate`` — готовые ``RequestTemplate``
    для пробуждения. Вызывающий код отправляет их через браузер/ZAP.
    """
    parsed = parse_corpus(corpus)
    all_fields: List[FormField] = parsed["form_fields"]
    all_templates: List[RequestTemplate] = parsed["request_templates"]

    covered_endpoints = _covered_endpoints(all_templates)
    covered_params = _covered_param_names(all_templates)

    # Поля без реальных network-вызовов (endpoint/param не зафиксированы)
    orphaned: Dict[str, List[FormField]] = {}
    for field in all_fields:
        origin = _page_origin(field.page_url)
        if _is_field_covered(field, origin, covered_endpoints, covered_params):
            continue
        orphaned.setdefault(field.page_url, [])
        orphaned[field.page_url].append(field)

    if not orphaned:
        return []

    candidates: List[AwakenCandidate] = []
    for page_url, fields in orphaned.items():
        origin = _page_origin(page_url)
        # 1) form_action
        form_candidates = _form_action_candidates(fields, page_url, origin)
        candidates.extend(form_candidates)
        # Собрать поля БЕЗ form_action для origin fallback
        no_action = [f for f in fields if not f.form_action]
        if no_action:
            fallback = _origin_fallback_candidates(
                no_action, page_url, origin, all_templates
            )
            candidates.extend(fallback)

    # Дедупликация по dedupe_key шаблона + reason
    seen = set()
    unique: List[AwakenCandidate] = []
    for c in candidates:
        key = (c.template.dedupe_key(), c.source_field, c.reason)
        if key in seen:
            continue
        seen.add(key)
        unique.append(c)
    return unique


def awaken_to_network_entries(
    candidates: List[AwakenCandidate],
) -> List[NetworkEntry]:
    """Преобразовать пробуждённые шаблоны в NetworkEntry для корпуса."""
    entries: List[NetworkEntry] = []
    for c in candidates:
        tpl = c.template
        # Собираем query string
        qs = urlencode(
            [(p["name"], p["value"]) for p in tpl.query_params if p.get("name")]
        )
        url = tpl.url
        if qs and "?" not in url:
            url += "?" + qs
        elif qs:
            url += "&" + qs

        body = ""
        if tpl.body_fields:
            body = urlencode(
                [(p["name"], p["value"]) for p in tpl.body_fields if p.get("name")]
            )
        entries.append(
            NetworkEntry(
                method=tpl.method,
                url=url,
                status=None,
                request_body=body,
            )
        )
    return entries


def summary(candidates: List[AwakenCandidate]) -> Dict[str, Any]:
    """Сводка пробуждения для diary/логов."""
    by_reason: Dict[str, int] = {}
    by_page: Dict[str, int] = {}
    for c in candidates:
        by_reason[c.reason] = by_reason.get(c.reason, 0) + 1
        by_page[c.source_page] = by_page.get(c.source_page, 0) + 1
    return {
        "total_awakened": len(candidates),
        "by_reason": by_reason,
        "by_page": by_page,
        "endpoints": sorted(
            {
                c.template.url.split("?", 1)[0]
                for c in candidates
            }
        ),
    }
