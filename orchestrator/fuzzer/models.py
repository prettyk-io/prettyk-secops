# -*- coding: utf-8 -*-
"""CF-B1: Data models — EndpointSpec, FindingRecord, FuzzParam, FuzzerProfile."""
from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class ParamType(str, Enum):
    QUERY = "query"
    BODY = "body"
    HEADER = "header"
    PATH = "path"
    COOKIE = "cookie"


class FuzzerProfile(str, Enum):
    """CF-B2: профили исполнения фаззера."""
    DEVELOPER_SAFE = "developer-safe"
    FULL_ACTIVE = "full-active"
    INTRUSIVE_FUZZ = "intrusive-fuzz"


@dataclass
class FuzzParam:
    """Параметр эндпоинта для подстановки payload'а."""
    name: str
    param_type: ParamType = ParamType.QUERY
    original_value: str = ""
    example_value: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.param_type.value,
            "original_value": self.original_value,
        }


@dataclass
class EndpointSpec:
    """CF-B1: спецификация эндпоинта для фаззинга."""
    method: str                              # GET, POST, PUT, DELETE
    url: str                                 # полный URL с query
    path: str                                # /api/user/:id (шаблон)
    content_type: str = "application/x-www-form-urlencoded"
    params: List[FuzzParam] = field(default_factory=list)
    headers: Dict[str, str] = field(default_factory=dict)
    cookies: Dict[str, str] = field(default_factory=dict)
    # auth context из краулера
    auth_headers: Dict[str, str] = field(default_factory=dict)
    persona_name: str = ""

    def dedupe_key(self) -> str:
        payload = f"{self.method}|{self.url.split('?', 1)[0]}"
        return hashlib.sha256(payload.encode()).hexdigest()[:32]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "method": self.method,
            "url": self.url,
            "path": self.path,
            "content_type": self.content_type,
            "params": [p.to_dict() for p in self.params],
            "persona_name": self.persona_name,
        }


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class InjectionType(str, Enum):
    XSS_REFLECTED = "xss-reflected"
    XSS_STORED = "xss-stored"
    SQL_INJECTION = "sql-injection"
    SQL_INJECTION_BLIND = "sql-injection-blind"
    COMMAND_INJECTION = "command-injection"
    PATH_TRAVERSAL = "path-traversal"
    SSRF = "ssrf"
    SECURITY_HEADER = "security-header"
    CORS = "cors"
    INFORMATION_DISCLOSURE = "information-disclosure"
    DOS = "dos"


@dataclass
class FindingRecord:
    """CF-B1: запись о найденной уязвимости."""
    severity: Severity
    injection_type: InjectionType
    method: str
    url: str
    param_name: str
    param_type: ParamType
    payload: str
    finding_signature: str = ""     # method+path+param+injection_type (dedup)
    dedup_key: str = ""             # SHA-256 finding_signature
    evidence_request: Dict[str, Any] = field(default_factory=dict)
    evidence_response: Dict[str, Any] = field(default_factory=dict)
    detail: str = ""
    persona_name: str = ""
    timestamp: float = field(default_factory=time.time)

    def __post_init__(self):
        if not self.finding_signature:
            self.finding_signature = f"{self.method}|{self.url.split('?', 1)[0]}|{self.param_name}|{self.param_type.value}|{self.injection_type.value}"
        if not self.dedup_key:
            self.dedup_key = hashlib.sha256(self.finding_signature.encode()).hexdigest()[:32]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "finding",
            "severity": self.severity.value,
            "injection_type": self.injection_type.value,
            "method": self.method,
            "url": self.url,
            "param_name": self.param_name,
            "param_type": self.param_type.value,
            "payload": self.payload[:500],
            "finding_signature": self.finding_signature,
            "dedup_key": self.dedup_key,
            "evidence": {
                "request": self.evidence_request,
                "response": self.evidence_response,
            },
            "detail": self.detail,
            "persona_name": self.persona_name,
            "timestamp": self.timestamp,
        }

    def to_sse_event(self) -> Dict[str, Any]:
        """Контракт для SSE finding.created."""
        return {
            "type": "finding.created",
            "finding": self.to_dict(),
        }