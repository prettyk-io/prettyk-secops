# -*- coding: utf-8 -*-
"""CF-B2: FuzzerProfile — safe/intrusive/full-active режимы + фильтрация payload'ов."""
from __future__ import annotations

from typing import List

DEVELOPER_SAFE = "developer-safe"
FULL_ACTIVE = "full-active"
INTRUSIVE_FUZZ = "intrusive-fuzz"

PROFILE_LABELS: dict[str, str] = {
    DEVELOPER_SAFE: "Developer-safe (XSS, headers, CORS — без деструктивного)",
    FULL_ACTIVE: "Полный активный фаззинг (SQLi, CMDi, SSRF, PathTraversal)",
    INTRUSIVE_FUZZ: "Интрузивный (DoS, DROP TABLE, многопоточный стресс) — только с allow_destructive",
}

# ── Инъекционные payload'ы, заблокированные в developer-safe ──

_SQL_INJECTION_SIGNATURES = [
    "OR '1'='1", "OR 1=1", "UNION SELECT", "DROP TABLE", "DELETE FROM",
    "sleep(", "SLEEP(", "benchmark(", "BENCHMARK(",
    "waitfor delay", "WAITFOR DELAY",
    "pg_sleep(", "PG_SLEEP(",
    "OR 'x'='x", "1=1--", "#", "SELECT CASE WHEN",
    "SELECT * FROM", "INFORMATION_SCHEMA", "LOAD_FILE",
    "EXTRACTVALUE", "UPDATEXML",
]

_COMMAND_INJECTION_SIGNATURES = [
    "; ls", "; id", "; whoami", "| ls", "| id", "| whoami",
    "`ls`", "`id`", "$(ls)", "$(id)",
    "; cat", "; bash", "; sh ", "&& whoami", "|| whoami",
    "; uname", "; wget", "; curl",
    "; pwd", "; hostname", "; dir", "; type ",
    "; ping", "| ping", "; sleep", "| sleep",
    "; nc ", "| nc ",
    # CMDi через newline/&
    "\nid", "\nwhoami", "\nls", "\nuname",
    "& dir", "& whoami", "& id",
    "| dir", "| type", "| find",
]

_PATH_TRAVERSAL_SIGNATURES = [
    "../", "..\\", "....//", "%2e%2e%2f", "%252e%252e%252f",
    "/etc/passwd", "/etc/shadow", "windows\\win.ini",
]

_SSRF_SIGNATURES = [
    "http://169.254.169.254", "http://metadata.google.internal",
    "file://", "gopher://", "dict://", "ftp://",
    "localhost:", "127.0.0.1:", "0.0.0.0:",
]

_DOS_SIGNATURES = [
    "DROP TABLE", "DELETE FROM", "TRUNCATE TABLE",
    "A" * 5000, "A" * 10000,
    "sleep(30", "SLEEP(30", "waitfor delay '0:0:30'",
]

_XSS_SIGNATURES = [
    "<script>", "</script>", "<img ", "<svg ", "onerror=", "onload=",
    "alert(", "javascript:", "eval(", "<iframe",
]

_SECURITY_HEADER_TESTS = [
    "X-Content-Type-Options", "X-Frame-Options",
    "Content-Security-Policy", "Strict-Transport-Security",
]


def filter_payloads_for_profile(payloads: List[str], profile: str) -> List[str]:
    """CF-B2: фильтровать список payload'ов по профилю.

    developer-safe:
      - XSS-reflected разрешён (не хранимый)
      - SQLi / CMDi / SSRF / PathTraversal / DoS — ЗАПРЕЩЕНЫ
      - special_chars + boundary разрешены
    full-active:
      - полные словари
    intrusive-fuzz:
      - всё + DoS, но только с allow_destructive
    """
    if profile == FULL_ACTIVE:
        return list(payloads)  # полный список

    if profile == INTRUSIVE_FUZZ:
        # Всё включая DoS — caller должен проверить allow_destructive снаружи
        return list(payloads)

    # developer-safe — фильтруем
    filtered: List[str] = []
    for p in payloads:
        if _is_destructive(p):
            continue
        filtered.append(p)
    return filtered


def requires_destructive_flag(profile: str) -> bool:
    """intrusive-fuzz требует явного allow_destructive=true."""
    return profile == INTRUSIVE_FUZZ


def _is_destructive(payload: str) -> bool:
    """Проверка: содержит ли payload деструктивные SQL/CMD/SSRF/DoS инъекции."""
    p_upper = payload.upper()
    p_lower = payload.lower()

    # SQLi: проверяем по широким сигнатурам
    for sig in _SQL_INJECTION_SIGNATURES:
        if sig.upper() in p_upper:
            return True

    # SQLi heuristic: OR/AND с кавычками и = — любой вариант инъекции
    if _looks_like_sqli(payload):
        return True

    # CMDi
    for sig in _COMMAND_INJECTION_SIGNATURES:
        if sig.lower() in p_lower:
            return True

    # Path traversal
    for sig in _PATH_TRAVERSAL_SIGNATURES:
        if sig in payload:
            return True

    # SSRF
    for sig in _SSRF_SIGNATURES:
        if sig in payload:
            return True

    # DoS
    for sig in _DOS_SIGNATURES:
        if sig.upper() in p_upper:
            return True

    return False


def _looks_like_sqli(payload: str) -> bool:
    """Эвристика: payload похож на SQLi (OR/AND с кавычками или UNION)."""
    p_stripped = payload.strip().lower()
    # ' OR ..., " OR ..., ') OR ...
    if any(p_stripped.startswith(prefix) for prefix in ("' or ", '" or ', "') or ", '") or ')):
        return True
    # ' AND ..., " AND ..., ') AND ...
    if any(p_stripped.startswith(prefix) for prefix in ("' and ", '" and ', "') and ", '") and ')):
        return True
    # admin'--, user'--, etc.
    if "'--" in p_stripped or "' --" in p_stripped or '"--' in p_stripped or '" --' in p_stripped:
        return True
    # ... OR ...=... pattern (not 'sort'/'order'/'report')
    if " or " in p_stripped and "=" in p_stripped and not _is_sql_keyword_safe(payload):
        return True
    # ... AND ... (non-trivial AUTH bypass patterns)
    if ("' and " in p_stripped or '" and ' in p_stripped) and "=" in p_stripped:
        return True
    if " union " in p_stripped and "select" in p_stripped:
        return True
    if "sleep(" in p_stripped:
        return True
    if "benchmark(" in p_stripped:
        return True
    if "waitfor delay" in p_stripped:
        return True
    if "cast(" in p_stripped or "convert(" in p_stripped:
        return True
    if "extractvalue(" in p_stripped or "updatexml(" in p_stripped:
        return True
    if "load_file(" in p_stripped:
        return True
    if "xp_dirtree" in p_stripped or "xp_cmdshell" in p_stripped:
        return True
    if any(kw in p_stripped for kw in ("drop table", "delete from", "truncate table", "insert into")):
        return True
    if "information_schema" in p_stripped:
        return True
    return False


def _is_sql_keyword_safe(payload: str) -> bool:
    """Payload содержит OR/AND но это не SQLi (например, 'sort' или 'order')."""
    p_lower = payload.lower().strip()
    safe = {"sort", "order", "report", "filter", "search"}
    for w in safe:
        if w in p_lower and len(p_lower) < 30:
            return True
    return False