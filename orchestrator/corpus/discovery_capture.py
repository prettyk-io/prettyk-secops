# -*- coding: utf-8 -*-
"""CD-1: DOM + Network граб при обходе страниц.

``DiscoveryCorpus`` — нормализованный снимок того, что реально произошло при
обходе страниц: сырой DOM каждой посещённой страницы + весь Network-трафик
(XHR/fetch/websocket, JSON-тела, параметры, заголовки). Всё JSON-строки, не бинарь.

Захват двух источников:
  1. **DOM** — `webdriver.page_source` после каждого navigate (имеет смысл только
     для «гуляющего» браузера; для API-обхода DOM пуст).
  2. **Network** — scanner History через `scanner.get_messages()`. Браузер и HTTP/gRPC
     адаптеры уже проксируются через scanner, поэтому весь трафик оседает в History;
     CDP-событийный сниффинг (BiDi) в PK не тянем — History даёт то же самое
     и не зависит от браузера.

Выход — dict с ``DiscoveryCorpus`` (``schema_version``, ``pages``, ``network``),
который сериализуется в NDJSON-строки и дальше парсится CD-2.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlsplit, urlunsplit

logger = logging.getLogger("orchestrator")

SCHEMA_VERSION = 1

# Заголовки, которые не тащим в корпус как есть: куки/токены/CSRF — секреты,
# которые не должны жить в артефакте (CD не про переиспользование сессии).
_SENSITIVE_HEADER_SUBSTRINGS = (
    "cookie",
    "authorization",
    "proxy-authorization",
    "x-api-key",
    "x-csrf",
    "x-xsrf",
    "csrf",
    "set-cookie",
)

# Методы, которые считаем «пробуждаемыми» кандидатами для CD-4.
_CAPTURE_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"})

# Ограничение на размер тела/ответа в корпусе (не тащим стриминги/бинарь).
_MAX_BODY_CHARS = 64 * 1024


def _redact_header(name: str, value: str) -> str:
    low = (name or "").lower()
    for frag in _SENSITIVE_HEADER_SUBSTRINGS:
        if frag in low:
            return "[REDACTED]"
    return value


def _parse_request_line(header: str) -> Tuple[str, str]:
    """``GET /path HTTP/1.1`` → (method, url) без схемы/хоста."""
    first = (header or "").split("\r\n", 1)[0].split("\n", 1)[0].strip()
    if not first:
        return "", ""
    parts = first.split(" ")
    if len(parts) >= 2:
        return parts[0].upper(), parts[1]
    return first.upper(), ""


def _split_headers(header: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    lines = (header or "").replace("\r\n", "\n").split("\n")
    for line in lines[1:]:
        if not line.strip() or ":" not in line:
            continue
        name, _, value = line.partition(":")
        out[name.strip()] = value.strip()
    return out


def _status_from_message(message: Dict[str, Any]) -> Optional[int]:
    for key in ("statusCode", "status_code", "responseCode", "response_code"):
        raw = message.get(key)
        if raw is None:
            continue
        try:
            return int(raw)
        except (TypeError, ValueError):
            continue
    header = str(message.get("responseHeader") or message.get("response_header") or "")
    first = header.replace("\r\n", "\n").split("\n")[0].strip()
    import re

    m = re.match(r"HTTP/\d(?:\.\d)?\s+(\d{3})", first, re.I)
    if m:
        return int(m.group(1))
    return None


def _request_body(message: Dict[str, Any]) -> str:
    for key in ("requestBody", "request_body", "body"):
        raw = message.get(key)
        if raw is None:
            continue
        if isinstance(raw, (bytes, bytearray)):
            try:
                return raw.decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                return ""
        text = str(raw)
        if text.strip():
            return text
    return ""


@dataclass
class DiscoveryPage:
    """Одна посещённая страница (сырой DOM + мета)."""

    url: str
    title: str = ""
    dom: str = ""
    captured_at: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "url": self.url,
            "title": self.title,
            "dom": self.dom,
            "captured_at": self.captured_at,
        }


@dataclass
class NetworkEntry:
    """Один запрос из scanner History, нормализованный в JSON-friendly вид."""

    method: str
    url: str
    status: Optional[int]
    request_headers: Dict[str, str] = field(default_factory=dict)
    response_headers: Dict[str, str] = field(default_factory=dict)
    request_body: str = ""
    response_body: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "method": self.method,
            "url": self.url,
            "status": self.status,
            "request_headers": self.request_headers,
            "response_headers": self.response_headers,
            "request_body": self.request_body,
            "response_body": self.response_body,
        }


@dataclass
class DiscoveryCorpus:
    """Нормализованный корпус одного обхода."""

    pages: List[DiscoveryPage] = field(default_factory=list)
    network: List[NetworkEntry] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "pages": [p.to_dict() for p in self.pages],
            "network": [n.to_dict() for n in self.network],
        }

    def to_ndjson(self) -> str:
        """Одна строка JSON на запись (NDJSON) — удобно для diary/артефакта."""
        return json.dumps(self.to_dict(), ensure_ascii=False, default=str)

    @staticmethod
    def from_ndjson(line: str) -> "DiscoveryCorpus":
        data = json.loads(line)
        corpus = DiscoveryCorpus()
        for p in data.get("pages", []):
            corpus.pages.append(DiscoveryPage(**p))
        for n in data.get("network", []):
            corpus.network.append(NetworkEntry(**n))
        return corpus


# ======================= DOM capture =======================


def capture_dom(webdriver: Any) -> Tuple[str, str]:
    """Снять текущий DOM (page_source) + title. Безопасно для API-обхода."""
    title = ""
    dom = ""
    try:
        title = str(getattr(webdriver.driver, "title", "") or "")
    except Exception:  # noqa: BLE001
        title = ""
    try:
        dom = str(webdriver.driver.page_source or "")
    except Exception:  # noqa: BLE001
        dom = ""
    return title, dom


def capture_page(webdriver: Any, url: str) -> DiscoveryPage:
    title, dom = capture_dom(webdriver)
    return DiscoveryPage(url=url, title=title, dom=dom, captured_at=time.time())


# ======================= Network capture =======================


def _absolute_url(method: str, url: str, base: str) -> str:
    """Привести URL из History к абсолютному виду, если он относительный."""
    if url.startswith(("http://", "https://")):
        return url
    if not base:
        return url
    if url.startswith("//"):
        scheme = urlsplit(base).scheme or "http"
        return f"{scheme}:{url}"
    if url.startswith("/"):
        parts = urlsplit(base)
        return urlunsplit((parts.scheme, parts.netloc, url, parts.query, ""))
    # относительный path
    parts = urlsplit(base)
    from urllib.parse import urljoin

    return urljoin(base, url)


def _message_to_entry(message: Dict[str, Any], base: str) -> Optional[NetworkEntry]:
    method = str(
        message.get("method") or message.get("requestMethod") or ""
    ).strip().upper()
    url = str(
        message.get("url") or message.get("requestUrl") or message.get("uri") or ""
    ).strip()

    header = str(message.get("requestHeader") or message.get("request_header") or "")
    if not method or not url:
        line_method, line_url = _parse_request_line(header)
        if not method:
            method = line_method
        if not url:
            url = line_url

    if not url:
        return None
    if method and method not in _CAPTURE_METHODS:
        return None

    url = _absolute_url(method or "GET", url, base)
    if not url.startswith(("http://", "https://")):
        return None

    req_headers = _split_headers(header)
    req_headers = {
        k: _redact_header(k, v) for k, v in req_headers.items()
    }

    resp_header = str(message.get("responseHeader") or message.get("response_header") or "")
    resp_headers = {
        k: _redact_header(k, v) for k, v in _split_headers(resp_header).items()
    }

    request_body = _request_body(message)
    response_body = ""
    for key in ("responseBody", "response_body"):
        raw = message.get(key)
        if isinstance(raw, str):
            response_body = raw
            break
        if isinstance(raw, (bytes, bytearray)):
            try:
                response_body = raw.decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                response_body = ""
            break

    return NetworkEntry(
        method=method or "GET",
        url=url,
        status=_status_from_message(message),
        request_headers=req_headers,
        response_headers=resp_headers,
        request_body=request_body[:_MAX_BODY_CHARS],
        response_body=response_body[:_MAX_BODY_CHARS],
    )


def capture_network(
    scanner: Any,
    *,
    base: str = "",
    start: Optional[int] = None,
    count: Optional[int] = None,
) -> List[NetworkEntry]:
    """Снять Network-трафик из scanner History → list[NetworkEntry].

    ``start``/``count`` — окно History. По умолчанию берём хвост (как и
    ``get_messages``, до 200 записей). Для полного обхода вызывающий код может
    отдать явное окно от начала прогона.
    """
    messages = getattr(scanner, "get_messages", None)
    if messages is None:
        return []
    try:
        raw = messages(start=start, count=count) or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("discovery_capture: get_messages failed: %s", exc)
        return []

    entries: List[NetworkEntry] = []
    for message in raw or []:
        if not isinstance(message, dict):
            continue
        try:
            entry = _message_to_entry(message, base)
        except Exception:  # noqa: BLE001
            continue
        if entry:
            entries.append(entry)
    return entries


# ======================= High-level capture =======================


def capture_current(
    webdriver: Any,
    scanner: Any,
    *,
    url: str,
    base: str = "",
    history_start: Optional[int] = None,
    history_count: Optional[int] = None,
) -> DiscoveryCorpus:
    """Снять корпус «здесь и сейчас»: текущая страница + окно History."""
    corpus = DiscoveryCorpus()
    if webdriver is not None:
        try:
            corpus.pages.append(capture_page(webdriver, url))
        except Exception as exc:  # noqa: BLE001
            logger.debug("discovery_capture: capture_page failed: %s", exc)
    if scanner is not None:
        corpus.network = capture_network(
            scanner, base=base, start=history_start, count=history_count
        )
    return corpus


def serialize_corpus(corpus: DiscoveryCorpus) -> str:
    """Корпус → одна NDJSON-строка (для публикации в diary/артефакт)."""
    return corpus.to_ndjson()
