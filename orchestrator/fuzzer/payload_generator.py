# -*- coding: utf-8 -*-
"""CF-B1/B2: PayloadGenerator — раскрытие словарей + фильтрация по профилю."""
from __future__ import annotations

import itertools
from typing import Iterator, List, Optional, Tuple

from fuzzer.models import EndpointSpec, FuzzParam, ParamType
from fuzzer.payloads import (
    BOUNDARY_NUMBERS,
    BOUNDARY_STRINGS,
    CMDI_PAYLOADS,
    DOS_PAYLOADS,
    JSON_INJECTION_PAYLOADS,
    PATH_TRAVERSAL_PAYLOADS,
    SPECIAL_CHARS,
    SQLI_PAYLOADS,
    SSRF_PAYLOADS,
    XML_INJECTION_PAYLOADS,
    XSS_PAYLOADS,
)
from fuzzer.profiles import (
    DEVELOPER_SAFE,
    FULL_ACTIVE,
    INTRUSIVE_FUZZ,
    filter_payloads_for_profile,
)


class PayloadGenerator:
    """Генератор (param, payload) пар для фаззинга с фильтрацией по профилю."""

    def __init__(self, profile: str = DEVELOPER_SAFE, allow_destructive: bool = False):
        self.profile = profile
        self.allow_destructive = allow_destructive
        self._all_payloads: Optional[List[str]] = None
        self._xss_payloads: Optional[List[str]] = None
        self._sqli_payloads: Optional[List[str]] = None
        self._cmdi_payloads: Optional[List[str]] = None
        self._ssrf_payloads: Optional[List[str]] = None
        self._path_traversal_payloads: Optional[List[str]] = None

    @property
    def all_payloads(self) -> List[str]:
        if self._all_payloads is None:
            raw = (
                SPECIAL_CHARS
                + BOUNDARY_NUMBERS
                + BOUNDARY_STRINGS
                + XSS_PAYLOADS
                + SQLI_PAYLOADS
                + CMDI_PAYLOADS
                + PATH_TRAVERSAL_PAYLOADS
                + SSRF_PAYLOADS
                + JSON_INJECTION_PAYLOADS
                + XML_INJECTION_PAYLOADS
            )
            if self.profile == INTRUSIVE_FUZZ and self.allow_destructive:
                raw = raw + DOS_PAYLOADS
            self._all_payloads = filter_payloads_for_profile(raw, self.profile)
        return self._all_payloads

    def payloads_for_category(self, category: str) -> List[str]:
        """Получить payloads для конкретной категории с фильтрацией."""
        raw: List[str] = []
        if category == "xss":
            raw = list(XSS_PAYLOADS)
        elif category == "sqli":
            raw = list(SQLI_PAYLOADS)
        elif category == "cmdi":
            raw = list(CMDI_PAYLOADS)
        elif category == "ssrf":
            raw = list(SSRF_PAYLOADS)
        elif category == "path_traversal":
            raw = list(PATH_TRAVERSAL_PAYLOADS)
        elif category == "json":
            raw = list(JSON_INJECTION_PAYLOADS)
        elif category == "xml":
            raw = list(XML_INJECTION_PAYLOADS)
        else:
            raw = list(self.all_payloads)
        return filter_payloads_for_profile(raw, self.profile)

    def iter_payloads(
        self, param: FuzzParam, max_per_param: int = 15
    ) -> Iterator[Tuple[FuzzParam, str]]:
        """Итератор (param, payload) с лимитом на параметр."""
        payloads = self._select_payloads_for_param(param)
        for i, payload in enumerate(payloads):
            if i >= max_per_param:
                break
            yield param, payload

    def _select_payloads_for_param(self, param: FuzzParam) -> List[str]:
        """Выбрать payloads, релевантные для типа параметра."""
        name_lower = param.name.lower()
        type_str = param.param_type

        # Path-параметры → только path traversal
        if type_str == ParamType.PATH:
            return self.payloads_for_category("path_traversal")

        # Cookie/Header параметры → XSS + special chars
        if type_str in (ParamType.COOKIE, ParamType.HEADER):
            return self.payloads_for_category("xss") + SPECIAL_CHARS

        # Параметры с ключевыми именами
        if any(kw in name_lower for kw in ("url", "redirect", "return", "next", "link", "callback", "target")):
            return self.payloads_for_category("ssrf") + self.payloads_for_category("xss")

        if any(kw in name_lower for kw in ("file", "path", "dir", "folder", "document")):
            return self.payloads_for_category("path_traversal") + self.payloads_for_category("xss")

        if any(kw in name_lower for kw in ("query", "sql", "search", "filter", "sort", "order")):
            return self.payloads_for_category("sqli")

        if any(kw in name_lower for kw in ("cmd", "command", "exec", "run", "shell")):
            return self.payloads_for_category("cmdi")

        # Default: полный словарь
        return list(self.all_payloads)