# -*- coding: utf-8 -*-
"""CD-2: парсер корпуса — extract параметры/инпуты из ``DiscoveryCorpus``.

Из DOM-снимков вытаскиваем ``<input>/<form>/<select>/<textarea>`` + ``name/type/value``,
из Network — URL-параметры (query), body-поля XHR. Выход:
  - ``FormField`` — DOM-инпут (для пробуждения через клик/сабмит);
  - ``RequestTemplate`` — HTTP-шаблон (method/url/query/body) как кандидат для
    эвристического пробуждения (CD-4) и контекста ZAP (CD-5).

Чистые функции, без мутации входных структур. bs4 парсит через встроенный
``html.parser`` (без lxml/html5lib — они не в окружении).
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import parse_qsl, urlsplit

from bs4 import BeautifulSoup

from corpus.discovery_capture import (
    DiscoveryCorpus,
    NetworkEntry,
)

logger = logging.getLogger("orchestrator")

# Noise / tracker / секреты — не тащим как кандидаты (зеркало TRAF-A).
_SKIP_QUERY_NAMES = frozenset(
    {
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "gclid",
        "fbclid",
        "_",
        "cachebuster",
        "cb",
        "v",
        "ver",
        "timestamp",
        "ts",
    }
)

_SKIP_JSON_KEYS = frozenset(
    {
        "password",
        "passwd",
        "secret",
        "token",
        "access_token",
        "refresh_token",
        "csrf",
        "csrftoken",
        "_csrf",
    }
)

# Типы инпутов, которые не пробуждаем как текстовые дыры.
_SKIP_INPUT_TYPES = frozenset(
    {"hidden", "submit", "button", "image", "reset", "file"}
)


@dataclass
class FormField:
    """DOM-инпут: кандидат на пробуждение (клик/сабмит/подмена значения)."""

    page_url: str
    name: str
    field_type: str
    value: str = ""
    tag: str = "input"
    form_id: str = ""
    form_action: str = ""
    label: str = ""
    selector: str = ""

    def dedupe_key(self) -> tuple:
        return (self.page_url, self.tag, self.name, self.field_type)


@dataclass
class RequestTemplate:
    """HTTP-шаблон из Network: параметры для пробуждения/контекста ZAP."""

    method: str
    url: str
    query_params: List[Dict[str, str]] = field(default_factory=list)
    body_fields: List[Dict[str, str]] = field(default_factory=list)
    status: Optional[int] = None

    def dedupe_key(self) -> tuple:
        return (self.method.upper(), self.url.split("?", 1)[0])


def _soup(dom: str) -> BeautifulSoup:
    return BeautifulSoup(dom or "", "html.parser")


def _input_name(tag: Any) -> str:
    for attr in ("name", "id", "data-testid", "placeholder"):
        val = tag.get(attr)
        if val:
            return str(val).strip()
    return ""


def _field_selector(tag: Any, name: str) -> str:
    """Приблизительный css-селектор для переигрывания локатора."""
    if tag.get("id"):
        return f"#{tag['id']}"
    if tag.get("name"):
        return f"{tag.name}[name='{tag['name']}']"
    if name and tag.name:
        return f"{tag.name}[placeholder='{name}']"
    return tag.name or ""


def _label_for(soup: Any, tag: Any, name: str) -> str:
    if tag.get("id"):
        label = soup.find("label", attrs={"for": tag["id"]})
        if label:
            return label.get_text(" ", strip=True)
    if tag.parent and tag.parent.name == "label":
        return tag.parent.get_text(" ", strip=True)
    return ""


def extract_form_fields(page_url: str, dom: str) -> List[FormField]:
    """Вытащить все инпуты/селекты/текстарии из DOM-снимка."""
    soup = _soup(dom)
    fields: List[FormField] = []
    for tag in soup.find_all(["input", "select", "textarea"]):
        name = _input_name(tag)
        if not name:
            continue
        if tag.name == "input":
            ftype = str(tag.get("type") or "text").lower()
            if ftype in _SKIP_INPUT_TYPES:
                continue
        elif tag.name == "select":
            ftype = "select"
        else:
            ftype = "textarea"

        form = tag.find_parent("form")
        form_id = str(form.get("id") or "") if form else ""
        form_action = str(form.get("action") or "") if form else ""

        fields.append(
            FormField(
                page_url=page_url,
                name=name,
                field_type=ftype,
                value=str(tag.get("value") or ""),
                tag=tag.name,
                form_id=form_id,
                form_action=form_action,
                label=_label_for(soup, tag, name),
                selector=_field_selector(tag, name),
            )
        )
    return fields


def _query_params(url: str) -> List[Dict[str, str]]:
    parts = urlsplit(url)
    out: List[Dict[str, str]] = []
    for name, value in parse_qsl(parts.query, keep_blank_values=True):
        key = (name or "").strip()
        if not key or key.lower() in _SKIP_QUERY_NAMES:
            continue
        out.append({"name": key, "value": str(value)[:200]})
    return out


def _body_fields(method: str, body: str) -> List[Dict[str, str]]:
    text = (body or "").strip()
    if not text:
        return []
    m = method.upper()
    # URL-encoded форма
    if m in {"POST", "PUT", "PATCH"} and "=" in text and "{" not in text[:1]:
        out: List[Dict[str, str]] = []
        for name, value in parse_qsl(text, keep_blank_values=True):
            key = (name or "").strip()
            if not key or key.lower() in _SKIP_JSON_KEYS:
                continue
            out.append({"name": key, "value": str(value)[:200]})
        return out
    # JSON top-level
    if text[0] not in "{[":
        return []
    try:
        data = json.loads(text)
    except Exception:  # noqa: BLE001
        return []
    if not isinstance(data, dict):
        return []
    out = []
    for key, value in data.items():
        name = str(key).strip()
        if not name or name.lower() in _SKIP_JSON_KEYS:
            continue
        if isinstance(value, (dict, list)):
            continue
        out.append({"name": name, "value": "" if value is None else str(value)[:200]})
    return out


def entry_to_template(entry: NetworkEntry) -> Optional[RequestTemplate]:
    """NetworkEntry → RequestTemplate (query + body-поля)."""
    if not entry.url:
        return None
    return RequestTemplate(
        method=entry.method or "GET",
        url=entry.url,
        query_params=_query_params(entry.url),
        body_fields=_body_fields(entry.method or "GET", entry.request_body),
        status=entry.status,
    )


def parse_corpus(corpus: DiscoveryCorpus) -> Dict[str, Any]:
    """Полный разбор корпуса → {form_fields, request_templates}."""
    form_fields: List[FormField] = []
    templates: List[RequestTemplate] = []

    seen_fields = set()
    for page in corpus.pages or []:
        for f in extract_form_fields(page.url, page.dom):
            key = f.dedupe_key()
            if key in seen_fields:
                continue
            seen_fields.add(key)
            form_fields.append(f)

    seen_tmpl = set()
    for entry in corpus.network or []:
        tpl = entry_to_template(entry)
        if tpl is None:
            continue
        key = tpl.dedupe_key()
        if key in seen_tmpl:
            continue
        seen_tmpl.add(key)
        templates.append(tpl)

    return {
        "form_fields": form_fields,
        "request_templates": templates,
    }
