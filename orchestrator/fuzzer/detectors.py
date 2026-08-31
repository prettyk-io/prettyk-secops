# -*- coding: utf-8 -*-
"""CF-B1: Детекторы — response-based detection XSS/SQLi/CMDi/SSRF/PathTraversal.

Каждый детектор возвращает Optional[FindingRecord] или None.
"""
from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional

from fuzzer.models import (
    EndpointSpec,
    FindingRecord,
    FuzzParam,
    InjectionType,
    ParamType,
    Severity,
)


class Detector:
    """Статический классификатор находок по ответу сервера."""

    @staticmethod
    def detect_xss(
        spec: EndpointSpec,
        param: FuzzParam,
        payload: str,
        response_body: str,
        response_status: int,
        response_headers: Dict[str, str],
        request_info: Dict[str, Any],
        response_time: float,
    ) -> Optional[FindingRecord]:
        """XSS reflected: ищем payload в теле ответа."""
        if not payload or len(payload) < 3:
            return None

        # Payload должен отразиться в ответе
        safe_payload = payload.replace("<", "").replace(">", "")
        if safe_payload and safe_payload in response_body:
            return FindingRecord(
                severity=Severity.MEDIUM,
                injection_type=InjectionType.XSS_REFLECTED,
                method=spec.method,
                url=spec.url,
                param_name=param.name,
                param_type=param.param_type,
                payload=payload,
                evidence_request=request_info,
                evidence_response={
                    "status": response_status,
                    "body_snippet": response_body[:2000],
                    "reflected_payload": payload,
                },
                detail=f"Payload '{payload[:80]}' reflected in response body",
                persona_name=spec.persona_name,
            )

        # XSS может отражаться с HTML-encoding — ищем частичное совпадение
        if any(part in response_body for part in _xss_fragments(payload)):
            return FindingRecord(
                severity=Severity.LOW,
                injection_type=InjectionType.XSS_REFLECTED,
                method=spec.method,
                url=spec.url,
                param_name=param.name,
                param_type=param.param_type,
                payload=payload,
                evidence_request=request_info,
                evidence_response={
                    "status": response_status,
                    "body_snippet": response_body[:2000],
                    "partial_reflection": True,
                },
                detail=f"Partial reflection of XSS payload '{payload[:60]}'",
                persona_name=spec.persona_name,
            )

        return None

    @staticmethod
    def detect_sqli(
        spec: EndpointSpec,
        param: FuzzParam,
        payload: str,
        response_body: str,
        response_status: int,
        response_headers: Dict[str, str],
        request_info: Dict[str, Any],
        response_time: float,
    ) -> Optional[FindingRecord]:
        """SQLi detection: error signatures + timing."""
        body_upper = response_body.upper()

        # Error-based SQLi
        for sig in _SQL_ERROR_SIGNATURES:
            if sig.upper() in body_upper:
                return FindingRecord(
                    severity=Severity.HIGH,
                    injection_type=InjectionType.SQL_INJECTION,
                    method=spec.method,
                    url=spec.url,
                    param_name=param.name,
                    param_type=param.param_type,
                    payload=payload,
                    evidence_request=request_info,
                    evidence_response={
                        "status": response_status,
                        "body_snippet": response_body[:2000],
                        "sql_error": sig,
                    },
                    detail=f"SQL error '{sig}' found in response",
                    persona_name=spec.persona_name,
                )

        # Time-based blind SQLi
        if response_time > 1.8 and any(
            kw in payload.lower() for kw in ("sleep", "pg_sleep", "waitfor delay", "benchmark")
        ):
            return FindingRecord(
                severity=Severity.HIGH,
                injection_type=InjectionType.SQL_INJECTION_BLIND,
                method=spec.method,
                url=spec.url,
                param_name=param.name,
                param_type=param.param_type,
                payload=payload,
                evidence_request=request_info,
                evidence_response={
                    "status": response_status,
                    "response_time_sec": round(response_time, 3),
                },
                detail=f"Time-based blind SQLi: response {response_time:.2f}s with sleep payload",
                persona_name=spec.persona_name,
            )

        return None

    @staticmethod
    def detect_cmdi(
        spec: EndpointSpec,
        param: FuzzParam,
        payload: str,
        response_body: str,
        response_status: int,
        response_headers: Dict[str, str],
        request_info: Dict[str, Any],
        response_time: float,
    ) -> Optional[FindingRecord]:
        """Command injection: вывод системных команд в теле."""
        for sig in _CMDI_OUTPUT_SIGNATURES:
            if re.search(sig, response_body, re.IGNORECASE):
                return FindingRecord(
                    severity=Severity.CRITICAL,
                    injection_type=InjectionType.COMMAND_INJECTION,
                    method=spec.method,
                    url=spec.url,
                    param_name=param.name,
                    param_type=param.param_type,
                    payload=payload,
                    evidence_request=request_info,
                    evidence_response={
                        "status": response_status,
                        "body_snippet": response_body[:2000],
                        "cmd_output_match": sig,
                    },
                    detail=f"Command injection: system output '{sig}' detected",
                    persona_name=spec.persona_name,
                )

        return None

    @staticmethod
    def detect_ssrf(
        spec: EndpointSpec,
        param: FuzzParam,
        payload: str,
        response_body: str,
        response_status: int,
        response_headers: Dict[str, str],
        request_info: Dict[str, Any],
        response_time: float,
    ) -> Optional[FindingRecord]:
        """SSRF: ответ содержит признаки доступа к internal/metadata."""
        body_lower = response_body.lower()

        for sig in _SSRF_RESPONSE_SIGNATURES:
            if sig.lower() in body_lower:
                return FindingRecord(
                    severity=Severity.HIGH,
                    injection_type=InjectionType.SSRF,
                    method=spec.method,
                    url=spec.url,
                    param_name=param.name,
                    param_type=param.param_type,
                    payload=payload,
                    evidence_request=request_info,
                    evidence_response={
                        "status": response_status,
                        "body_snippet": response_body[:2000],
                        "ssrf_indicator": sig,
                    },
                    detail=f"SSRF: response contains '{sig}'",
                    persona_name=spec.persona_name,
                )

        return None

    @staticmethod
    def detect_path_traversal(
        spec: EndpointSpec,
        param: FuzzParam,
        payload: str,
        response_body: str,
        response_status: int,
        response_headers: Dict[str, str],
        request_info: Dict[str, Any],
        response_time: float,
    ) -> Optional[FindingRecord]:
        """Path traversal: ответ содержит данные из системных файлов."""
        body_lower = response_body.lower()

        for sig in _PATH_TRAVERSAL_OUTPUT_SIGNATURES:
            if sig.lower() in body_lower:
                return FindingRecord(
                    severity=Severity.HIGH,
                    injection_type=InjectionType.PATH_TRAVERSAL,
                    method=spec.method,
                    url=spec.url,
                    param_name=param.name,
                    param_type=param.param_type,
                    payload=payload,
                    evidence_request=request_info,
                    evidence_response={
                        "status": response_status,
                        "body_snippet": response_body[:2000],
                        "file_content_match": sig,
                    },
                    detail=f"Path traversal: system file content '{sig}' found",
                    persona_name=spec.persona_name,
                )

        return None


# ── Сигнатуры для детекции ──

_SQL_ERROR_SIGNATURES = [
    "sql syntax", "mysql_fetch", "ORA-", "postgresql",
    "sqlite3", "microsoft ole db", "odbc driver",
    "warning: mysql", "unclosed quotation mark",
    "you have an error in your sql syntax",
    "pg_query()", "mysqli", "sqlsrv",
    "jdbcodbc", "sqlstate", "syntax error",
]

_CMDI_OUTPUT_SIGNATURES = [
    r"uid=\d+\([\w-]+\)\s+gid=\d+\([\w-]+\)",  # id output
    r"Linux\s+\S+",                               # uname
    r"root:.*:0:0:",                              # /etc/passwd line
    r"bin:.*:1:1:",                               # /etc/passwd line
    r"daemon:.*:2:2:",                            # /etc/passwd line
    r"Microsoft Windows.*Version",                # Windows ver
    r"\[fonts\]",                                 # win.ini
    r"\[extensions\]",                            # win.ini
]

_SSRF_RESPONSE_SIGNATURES = [
    "ami-id", "instance-id", "instance-type",
    "local-hostname", "public-hostname",
    "security-credentials", "meta-data",
    "computeMetadata", "user-data",
]

_PATH_TRAVERSAL_OUTPUT_SIGNATURES = [
    "root:x:0:0:",           # /etc/passwd
    "daemon:x:1:1:",         # /etc/passwd
    "bin:x:2:2:",            # /etc/passwd
    "[fonts]",               # win.ini
    "[extensions]",          # win.ini
    "[drivers]",             # boot.ini
]


def _xss_fragments(payload: str) -> List[str]:
    """Извлечь фрагменты XSS payload для частичного матчинга."""
    frags = []
    for tag in ("<script>", "<img ", "<svg ", "alert(", "onerror="):
        if tag in payload:
            frags.append(tag)
    return frags


# ── Фасад: единый детектор ──

def detect_all(
    spec: EndpointSpec,
    param: FuzzParam,
    payload: str,
    response_body: str,
    response_status: int,
    response_headers: Dict[str, str],
    request_info: Dict[str, Any],
    response_time: float,
) -> List[FindingRecord]:
    """CF-B1: прогнать payload через все детекторы, вернуть все находки."""
    detectors = [
        Detector.detect_xss,
        Detector.detect_sqli,
        Detector.detect_cmdi,
        Detector.detect_ssrf,
        Detector.detect_path_traversal,
    ]
    findings: List[FindingRecord] = []
    for detect_fn in detectors:
        finding = detect_fn(
            spec, param, payload, response_body, response_status,
            response_headers, request_info, response_time,
        )
        if finding is not None:
            findings.append(finding)
    return findings


# Реэкспорт для удобства
detect_xss = Detector.detect_xss
detect_sqli = Detector.detect_sqli
detect_cmdi = Detector.detect_cmdi
detect_ssrf = Detector.detect_ssrf