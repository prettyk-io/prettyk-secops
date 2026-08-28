# -*- coding: utf-8 -*-
"""CD-7: Собственный фаззер мутаций (Burp-killer core).

Чистый Python, без scanner: генерирует boundary payloads, спецсимволы,
инъекционные сигналы и мутирует ``RequestTemplate`` подстановкой
в query/body/JSON.

``CorpusFuzzer.generate_mutations(template, count=50)`` — основная
точка входа. Маркер ``§payload§`` или ``{MASK}`` помечает позицию
для мультипозиционной замены.
"""
from __future__ import annotations

import copy
import json
import itertools
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from corpus.corpus_parser import RequestTemplate

_FUZZ_MARKER = "§payload§"
_ALT_MARKER = "{MASK}"

# ── Словари пейлоадов ──────────────────────────────────────────────

_SPECIAL_CHARS = [
    "'",
    '"',
    "<",
    ">",
    ";",
    "|",
    "%00",
    "\\r\\n",
    "%0d%0a",
    "\\x00",
    "\\n",
    "\\t",
    "`",
    "$(",
    "${",
    "#",
    "&",
    "||",
    "&&",
    "!",
    "@@",
    "//",
    "\\\\",
    "^",
    "~",
]

_BOUNDARY_NUMBERS = [
    "-1",
    "0",
    "1",
    "0.0",
    "-0.1",
    "9999999999",
    "-9999999999",
    "0.0000000001",
    "NaN",
    "Infinity",
    "-Infinity",
    "null",
    "undefined",
    "true",
    "false",
]

_BOUNDARY_STRINGS = [
    "",
    "A",
    "A" * 255,
    "A" * 1024,
    "A" * 5000,
    "A" * 10000,
    "\u0000",
    "\uffff",
    "\ufe0f",
    "%s",
    "%n",
    "%x",
    "%p",
]

_PRECISION_ATTACKS = [
    # SQLi smoke (детекция, не эксплуатация)
    "' OR '1'='1",
    "' OR 1=1--",
    "\" OR \"1\"=\"1",
    "'; DROP TABLE users--",
    "'); DROP TABLE users--",
    "' UNION SELECT 1,2,3--",
    "1' AND '1'='1",
    "1\" AND \"1\"=\"1",
    # XSS smoke (отражение в DOM)
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "\"><script>alert(1)</script>",
    "javascript:alert(1)",
    "<svg onload=alert(1)>",
    # Command injection smoke
    "; ls",
    "| ls",
    "`ls`",
    "$(ls)",
    "&& whoami",
    "|| whoami",
    "; cat /etc/passwd",
    "| cat /etc/passwd",
    # Path traversal
    "../../../etc/passwd",
    "..\\..\\..\\windows\\win.ini",
    "....//....//....//etc/passwd",
    # SSTI smoke
    "{{7*7}}",
    "${7*7}",
    "<%= 7*7 %>",
    "#{7*7}",
    # XML/XXE
    "<?xml version=\"1.0\"?>",
    "<!DOCTYPE foo [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]>",
]


@dataclass
class FuzzerConfig:
    """Конфиг фаззера: какие словари включать, сколько мутаций."""

    include_special_chars: bool = True
    include_boundary_numbers: bool = True
    include_boundary_strings: bool = True
    include_precision_attacks: bool = True
    max_long_string_len: int = 10000
    marker: str = _FUZZ_MARKER
    alt_marker: str = _ALT_MARKER


class CorpusFuzzer:
    """Генератор мутаций RequestTemplate.

    Использование::

        fuzzer = CorpusFuzzer()
        mutations = fuzzer.generate_mutations(template, count=50)

    Если в url/body есть маркер ``§payload§`` или ``{MASK}`` —
    мультипозиционная замена по всем маркерам одновременно.
    Без маркера — round-robin подстановка в каждый query-параметр
    и body-поле по очереди (sniper mode).
    """

    def __init__(self, config: Optional[FuzzerConfig] = None):
        self.config = config or FuzzerConfig()
        self._payload_cache: Optional[List[str]] = None

    @property
    def payloads(self) -> List[str]:
        if self._payload_cache is not None:
            return self._payload_cache
        out: List[str] = []
        cfg = self.config
        if cfg.include_special_chars:
            out.extend(_SPECIAL_CHARS)
        if cfg.include_boundary_numbers:
            out.extend(_BOUNDARY_NUMBERS)
        if cfg.include_boundary_strings:
            out.extend(_BOUNDARY_STRINGS)
        if cfg.include_precision_attacks:
            out.extend(_PRECISION_ATTACKS)
        self._payload_cache = out
        return out

    def generate_mutations(
        self,
        template: RequestTemplate,
        count: int = 50,
        mode: str = "sniper",
        payload_sets: Optional[Sequence[Sequence[str]]] = None,
    ) -> List[RequestTemplate]:
        """Сгенерировать до ``count`` мутаций template.

        ``mode`` — режим атаки (Burp Intruder-стиль):
          - ``sniper`` (default): один набор пейлоадов, по очереди в каждую позицию;
          - ``battering_ram``: один набор, одновременно во все позиции;
          - ``pitchfork``: свой набор на каждую позицию, итерация параллельно;
          - ``cluster_bomb``: декартово произведение наборов по позициям.

        Для pitchfork/cluster_bomb ``payload_sets`` — список наборов
        (по одному на позицию). Если не задан — одиночный набор режется
        поровну между позициями.
        """
        if count < 1:
            return []

        if mode == "pitchfork":
            return self._pitchfork_mutations(template, count, payload_sets)
        if mode == "cluster_bomb":
            return self._cluster_bomb_mutations(template, count, payload_sets)

        payloads = self._payload_slice(count)
        if not payloads:
            return []

        # Есть маркер → мультипозиционная замена
        url_has_marker = (
            self.config.marker in (template.url or "")
            or self.config.alt_marker in (template.url or "")
        )
        body_has_marker = any(
            self.config.marker in (p.get("value") or "")
            or self.config.alt_marker in (p.get("value") or "")
            for p in template.body_fields or []
        )
        marker_in_query = any(
            self.config.marker in (p.get("value") or "")
            or self.config.alt_marker in (p.get("value") or "")
            for p in template.query_params or []
        )

        if url_has_marker or body_has_marker or marker_in_query:
            return self._marker_mutations(template, payloads)

        if mode == "battering_ram":
            return self._battering_ram_mutations(template, payloads)

        # Sniper: round-robin по параметрам
        return self._sniper_mutations(template, payloads)

    # ── private ─────────────────────────────────────────────────────

    def _positions(self, template: RequestTemplate) -> List[Tuple[str, Optional[str]]]:
        """Список (location, param_name) для подстановки."""
        positions: List[Tuple[str, Optional[str]]] = []
        for q in template.query_params or []:
            positions.append(("query", q.get("name")))
        for b in template.body_fields or []:
            positions.append(("body", b.get("name")))
        return positions

    def _apply_payload(
        self,
        template: RequestTemplate,
        loc: str,
        name: Optional[str],
        payload: str,
    ) -> RequestTemplate:
        """Копия template с подстановкой payload в конкретную позицию."""
        new_qp = [
            (
                {"name": q["name"], "value": payload if q.get("name") == name else q.get("value") or ""}
                if loc == "query"
                else dict(q)
            )
            for q in (template.query_params or [])
        ]
        new_body = [
            (
                {"name": b["name"], "value": payload if b.get("name") == name else b.get("value") or ""}
                if loc == "body"
                else dict(b)
            )
            for b in (template.body_fields or [])
        ]
        return RequestTemplate(
            method=template.method,
            url=template.url,
            query_params=new_qp,
            body_fields=new_body,
            status=template.status,
        )

    def _per_position_sets(
        self,
        positions: List[Tuple[str, Optional[str]]],
        count: int,
        payload_sets: Optional[Sequence[Sequence[str]]],
    ) -> List[List[str]]:
        """Распределить наборы по позициям (для pitchfork/cluster_bomb)."""
        n = len(positions)
        if not n:
            return []
        if payload_sets:
            out: List[List[str]] = []
            for i in range(n):
                if i < len(payload_sets) and payload_sets[i]:
                    out.append(list(payload_sets[i])[:count])
                else:
                    out.append([])
            return out
        # Нет явных наборов → режем одиночный пул поровну.
        pool = self._payload_slice(count)
        chunk = max(1, len(pool) // n) if n else 0
        return [pool[i * chunk:(i + 1) * chunk] for i in range(n)]

    def _pitchfork_mutations(
        self,
        template: RequestTemplate,
        count: int,
        payload_sets: Optional[Sequence[Sequence[str]]],
    ) -> List[RequestTemplate]:
        """Pitchfork: свой набор на позицию, итерация параллельно."""
        positions = self._positions(template)
        if not positions:
            return self._url_only_mutations(template, self._payload_slice(count))
        per_pos = self._per_position_sets(positions, count, payload_sets)
        max_len = max((len(s) for s in per_pos), default=0)
        out: List[RequestTemplate] = []
        for step in range(max_len):
            cur = template
            for i, (loc, name) in enumerate(positions):
                s = per_pos[i]
                if not s:
                    continue
                pld = s[min(step, len(s) - 1)]
                cur = self._apply_payload(cur, loc, name, pld)
            out.append(cur)
            if len(out) >= count:
                break
        return out

    def _cluster_bomb_mutations(
        self,
        template: RequestTemplate,
        count: int,
        payload_sets: Optional[Sequence[Sequence[str]]],
    ) -> List[RequestTemplate]:
        """Cluster bomb: декартово произведение наборов по позициям."""
        positions = self._positions(template)
        if not positions:
            return self._url_only_mutations(template, self._payload_slice(count))
        per_pos = self._per_position_sets(positions, count, payload_sets)
        per_pos = [s for s in per_pos if s]
        if not per_pos:
            return []

        out: List[RequestTemplate] = []
        for combo in itertools.product(*per_pos):
            cur = template
            idx = 0
            for loc, name in positions:
                if idx >= len(per_pos):
                    break
                cur = self._apply_payload(cur, loc, name, combo[idx])
                idx += 1
            out.append(cur)
            if len(out) >= count:
                break
        return out

    def _battering_ram_mutations(
        self,
        template: RequestTemplate,
        payloads: List[str],
    ) -> List[RequestTemplate]:
        """Battering ram: один пейлоад во все позиции одновременно."""
        positions = self._positions(template)
        if not positions:
            return self._url_only_mutations(template, payloads)
        out: List[RequestTemplate] = []
        for pld in payloads:
            cur = template
            for loc, name in positions:
                cur = self._apply_payload(cur, loc, name, pld)
            out.append(cur)
        return out

    def _payload_slice(self, count: int) -> List[str]:
        """Циклический отбор payloads до count штук."""
        src = self.payloads
        if not src:
            return []
        out: List[str] = []
        for i in range(count):
            out.append(src[i % len(src)])
        return out

    def _marker_mutations(
        self,
        template: RequestTemplate,
        payloads: List[str],
    ) -> List[RequestTemplate]:
        m = self.config.marker
        a = self.config.alt_marker
        out: List[RequestTemplate] = []
        for pld in payloads:
            new_url = (template.url or "").replace(m, pld).replace(a, pld)
            new_qp = [
                {
                    "name": q["name"],
                    "value": (q.get("value") or "").replace(m, pld).replace(a, pld),
                }
                for q in template.query_params or []
            ]
            new_body = [
                {
                    "name": b["name"],
                    "value": (b.get("value") or "").replace(m, pld).replace(a, pld),
                }
                for b in template.body_fields or []
            ]
            out.append(
                RequestTemplate(
                    method=template.method,
                    url=new_url,
                    query_params=new_qp,
                    body_fields=new_body,
                    status=template.status,
                )
            )
            if len(out) >= len(payloads):
                break
        return out

    def _sniper_mutations(
        self,
        template: RequestTemplate,
        payloads: List[str],
    ) -> List[RequestTemplate]:
        """Sniper mode: по очереди подставляем payload в каждый параметр."""
        positions: List[Tuple[str, Optional[str]]] = []  # (location, param_name)
        for q in template.query_params or []:
            positions.append(("query", q.get("name")))
        for b in template.body_fields or []:
            positions.append(("body", b.get("name")))

        if not positions:
            # Нет параметров — мутируем только URL, добавляя query
            return self._url_only_mutations(template, payloads)

        out: List[RequestTemplate] = []
        pld_iter = itertools.cycle(payloads)
        seen = set()
        for _ in range(len(payloads)):
            pld = next(pld_iter)
            for loc, name in positions:
                key = (template.dedupe_key(), pld, loc, name)
                if key in seen:
                    continue
                seen.add(key)

                new_qp = [
                    (
                        {"name": q["name"], "value": pld if q.get("name") == name else q.get("value") or ""}
                        if loc == "query"
                        else dict(q)
                    )
                    for q in (template.query_params or [])
                ]
                new_body = [
                    (
                        {"name": b["name"], "value": pld if b.get("name") == name else b.get("value") or ""}
                        if loc == "body"
                        else dict(b)
                    )
                    for b in (template.body_fields or [])
                ]
                out.append(
                    RequestTemplate(
                        method=template.method,
                        url=template.url,
                        query_params=new_qp,
                        body_fields=new_body,
                        status=template.status,
                    )
                )
                if len(out) >= len(payloads):
                    return out
        return out

    def _url_only_mutations(
        self,
        template: RequestTemplate,
        payloads: List[str],
    ) -> List[RequestTemplate]:
        """Мутировать URL, добавляя фазз-параметр."""
        out: List[RequestTemplate] = []
        for pld in payloads:
            url = template.url
            qs = urlencode({"fuzz": pld})
            if "?" in url:
                new_url = url + "&" + qs
            else:
                new_url = url + "?" + qs
            out.append(
                RequestTemplate(
                    method=template.method,
                    url=new_url,
                    query_params=[{"name": "fuzz", "value": pld}],
                    body_fields=list(template.body_fields),
                    status=template.status,
                )
            )
        return out

    def all_payload_categories(self) -> Dict[str, List[str]]:
        """Возвращает словари по категориям для инспекции."""
        return {
            "special_chars": list(_SPECIAL_CHARS) if self.config.include_special_chars else [],
            "boundary_numbers": list(_BOUNDARY_NUMBERS) if self.config.include_boundary_numbers else [],
            "boundary_strings": list(_BOUNDARY_STRINGS) if self.config.include_boundary_strings else [],
            "precision_attacks": list(_PRECISION_ATTACKS) if self.config.include_precision_attacks else [],
        }

    def payload_count(self) -> int:
        return len(self.payloads)


def make_default_fuzzer() -> CorpusFuzzer:
    """Фабрика: фаззер с полным набором словарей."""
    return CorpusFuzzer(FuzzerConfig())


# ── Grep Match & Extract Engine (Burp Intruder style) ───────────────


@dataclass
class GrepMatchRule:
    """Правило проверки ответа на наличие паттерна."""

    key: str
    pattern: str
    is_regex: bool = False
    case_sensitive: bool = False


@dataclass
class GrepExtractRule:
    """Правило извлечения данных из ответа (group capture или substring)."""

    key: str
    pattern: str
    is_regex: bool = True
    group: int = 1


def evaluate_grep_match(
    response_body: str,
    rules: Sequence[GrepMatchRule],
) -> Dict[str, bool]:
    """Проверяет совпадения Grep Match по правилам."""
    results: Dict[str, bool] = {}
    if not response_body or not rules:
        return results

    for r in rules:
        if not r.pattern:
            continue
        if r.is_regex:
            flags = 0 if r.case_sensitive else re.IGNORECASE
            try:
                results[r.key] = bool(re.search(r.pattern, response_body, flags))
            except re.error:
                results[r.key] = r.pattern in response_body
        else:
            if r.case_sensitive:
                results[r.key] = r.pattern in response_body
            else:
                results[r.key] = r.pattern.lower() in response_body.lower()
    return results


def evaluate_grep_extract(
    response_body: str,
    rules: Sequence[GrepExtractRule],
) -> Dict[str, List[str]]:
    """Извлекает захваченные значения Grep Extract."""
    results: Dict[str, List[str]] = {}
    if not response_body or not rules:
        return results

    for r in rules:
        if not r.pattern:
            continue
        if r.is_regex:
            try:
                matches = re.finditer(r.pattern, response_body)
                extracted: List[str] = []
                for m in matches:
                    if r.group <= len(m.groups()):
                        extracted.append(m.group(r.group))
                    else:
                        extracted.append(m.group(0))
                results[r.key] = extracted
            except re.error:
                results[r.key] = []
        else:
            results[r.key] = [r.pattern] if r.pattern in response_body else []
    return results
