# -*- coding: utf-8 -*-
"""CD-3: маппинг сервисов (endpoint → страница → инпут).

``ServiceMap`` — граф ``страница → действие → endpoint``. Связывает DOM-инпуты
(``FormField`` из CD-2) с фактическими HTTP-вызовами (``RequestTemplate``) тремя
эвристиками:

  1. **form_action** — у поля есть родительский ``<form action=…>`` → прямой edge
     страница → endpoint;
  2. **имя параметра** — ``field.name`` совпадает с query/body-параметром запроса
     → поле «подписано» на этот endpoint;
  3. **origin fallback** — поле и endpoint на одном origin (страница-источник),
     когда прямых совпадений нет.

Выход: adjacency (page → endpoints) + подписанные параметры (endpoint → fields).
Дальше это кормит CD-4 (awaken) и CD-5 (ZAP context).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlsplit

from corpus.corpus_parser import FormField, RequestTemplate, parse_corpus
from corpus.discovery_capture import DiscoveryCorpus

logger = logging.getLogger("orchestrator")


def _origin(url: str) -> str:
    parts = urlsplit(url or "")
    if not parts.netloc:
        return ""
    scheme = parts.scheme or "http"
    return f"{scheme}://{parts.netloc}"


def _path(url: str) -> str:
    parts = urlsplit(url or "")
    return parts.path or "/"


@dataclass
class FieldBinding:
    """Связь поле → параметр → endpoint (для подписанных параметров)."""

    endpoint: str
    param_name: str
    location: str  # query | body | form_action
    field: FormField


@dataclass
class ServiceMap:
    """Граф сервисов: endpoints, edges page→endpoint, подписанные параметры."""

    endpoints: List[str] = field(default_factory=list)
    edges: List[Tuple[str, str]] = field(default_factory=list)  # (page_url, endpoint)
    bindings: List[FieldBinding] = field(default_factory=list)

    def add_endpoint(self, url: str) -> None:
        if url and url not in self.endpoints:
            self.endpoints.append(url)

    def add_edge(self, page_url: str, endpoint: str) -> None:
        edge = (page_url, endpoint)
        if page_url and endpoint and edge not in self.edges:
            self.edges.append(edge)

    def add_binding(self, binding: FieldBinding) -> None:
        key = (binding.endpoint, binding.param_name, binding.location, binding.field.name)
        if any(
            (b.endpoint, b.param_name, b.location, b.field.name) == key
            for b in self.bindings
        ):
            return
        self.bindings.append(binding)

    def endpoints_for_page(self, page_url: str) -> List[str]:
        return [ep for (pg, ep) in self.edges if pg == page_url]

    def fields_for_endpoint(self, endpoint: str) -> List[FormField]:
        return [b.field for b in self.bindings if b.endpoint == endpoint]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "endpoints": self.endpoints,
            "edges": [{"page": p, "endpoint": e} for p, e in self.edges],
            "bindings": [
                {
                    "endpoint": b.endpoint,
                    "param_name": b.param_name,
                    "location": b.location,
                    "field": {
                        "name": b.field.name,
                        "page_url": b.field.page_url,
                        "field_type": b.field.field_type,
                        "selector": b.field.selector,
                    },
                }
                for b in self.bindings
            ],
        }


def _template_params(template: RequestTemplate) -> List[Tuple[str, str]]:
    """(name, location) всех параметров шаблона."""
    out: List[Tuple[str, str]] = []
    for p in template.query_params:
        out.append((p["name"], "query"))
    for p in template.body_fields:
        out.append((p["name"], "body"))
    return out


def build_service_map(corpus: DiscoveryCorpus) -> ServiceMap:
    """Построить ServiceMap из корпуса (CD-2 parse_corpus внутри)."""
    parsed = parse_corpus(corpus)
    fields: List[FormField] = parsed["form_fields"]
    templates: List[RequestTemplate] = parsed["request_templates"]

    sm = ServiceMap()
    for tpl in templates:
        sm.add_endpoint(tpl.url)

    # Индекс параметр-имя → шаблоны (для подписи полей)
    param_to_templates: Dict[str, List[RequestTemplate]] = {}
    for tpl in templates:
        for name, _loc in _template_params(tpl):
            param_to_templates.setdefault(name.lower(), [])
            param_to_templates[name.lower()].append(tpl)

    for field in fields:
        page_origin = _origin(field.page_url)
        # 1) form_action → прямой edge
        if field.form_action:
            # form_action может быть относительным — резолвим против origin страницы
            action = field.form_action
            if not action.startswith(("http://", "https://")):
                action = (page_origin or "") + (action if action.startswith("/") else "/" + action)
            sm.add_edge(field.page_url, action)
            sm.add_endpoint(action)
            sm.add_binding(
                FieldBinding(
                    endpoint=action,
                    param_name=field.name,
                    location="form_action",
                    field=field,
                )
            )

        # 2) имя поля == имя параметра
        matched = param_to_templates.get(field.name.lower(), [])
        for tpl in matched:
            for name, loc in _template_params(tpl):
                if name.lower() == field.name.lower():
                    sm.add_edge(field.page_url, tpl.url)
                    sm.add_binding(
                        FieldBinding(
                            endpoint=tpl.url,
                            param_name=name,
                            location=loc,
                            field=field,
                        )
                    )
                    break

        # 3) origin fallback: поле и endpoint на одном origin
        if not matched and page_origin:
            for tpl in templates:
                if _origin(tpl.url) == page_origin:
                    sm.add_edge(field.page_url, tpl.url)
                    break

    return sm
