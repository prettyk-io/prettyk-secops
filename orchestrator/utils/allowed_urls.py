# -*- coding: utf-8 -*-
"""
Allowlist для ОткрытьПоURL / ПрименитьДомены.

Сегменты: `|` и `,` (канон UI — `|`). Паттерны токена:
  * https://host/… — URL-prefix
  * host.example — bare host (опционально host:port)
  * *.internal.bank — host или любой поддомен
"""
from __future__ import annotations

import re
from typing import Iterable, List, Union
from urllib.parse import ParseResult, urlparse

ALLOWED_URL_DENY_MSG = "Домен данного URL не включен в список разрешенных."

_SPLIT_RE = re.compile(r"[|,]")


def parse_allowed_url_tokens(text: str) -> List[str]:
    return [t.strip() for t in _SPLIT_RE.split(str(text or "")) if t.strip()]


def _host_matches_wildcard(hostname: str, token: str) -> bool:
    """token = *.foo.bar → foo.bar или x.foo.bar."""
    base = token[2:].lower()
    host = (hostname or "").lower()
    if not base or not host:
        return False
    return host == base or host.endswith("." + base)


def _normalize_tokens(allowlist: Union[str, Iterable[str]]) -> List[str]:
    if isinstance(allowlist, str):
        return parse_allowed_url_tokens(allowlist)
    return [str(t).strip() for t in allowlist if str(t).strip()]


def _token_matches_url(token: str, raw: str, parsed: ParseResult, host: str) -> bool:
    if token.startswith("*.") and "://" not in token:
        return _host_matches_wildcard(host, token)
    if "://" in token:
        prefix = token.rstrip("/")
        candidate = raw.rstrip("/")
        return candidate == prefix or candidate.startswith(prefix + "/")
    tok = token.lower()
    tok_host, tok_port = tok, None
    if ":" in tok and not tok.startswith("["):
        th, _, tp = tok.rpartition(":")
        if tp.isdigit():
            tok_host, tok_port = th, int(tp)
    if host != tok_host:
        return False
    if tok_port is not None and parsed.port != tok_port:
        return False
    return True


def url_allowed(url: str, allowlist: Union[str, Iterable[str]]) -> bool:
    raw = (url or "").strip()
    if not raw:
        return False
    tokens = _normalize_tokens(allowlist)
    if not tokens:
        return False
    parsed = urlparse(raw)
    host = (parsed.hostname or "").lower()
    return any(_token_matches_url(token, raw, parsed, host) for token in tokens)
