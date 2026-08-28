# -*- coding: utf-8 -*-
"""Data models for Playwright SPA/State Crawler (PK-CRAWLER)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class CrawlerConfig:
    """Configuration for SPA Crawler execution."""
    target_url: str
    allowed_origins: List[str] = field(default_factory=list)
    max_states: int = 50
    max_depth: int = 3
    max_actions_per_state: int = 30
    action_timeout_ms: int = 5000
    settle_timeout_ms: int = 750
    context_options: Dict[str, Any] = field(
        default_factory=lambda: {"service_workers": "block"}
    )
    awaken: bool = True
    fuzz: bool = False
    max_replay_depth: int = 6

    def __post_init__(self):
        if not self.allowed_origins and self.target_url:
            from urllib.parse import urlsplit
            parts = urlsplit(self.target_url)
            if parts.netloc:
                scheme = parts.scheme or "http"
                self.allowed_origins = [f"{scheme}://{parts.netloc}"]


@dataclass
class NetworkDeltaEntry:
    """Network request/response pair captured during a state or transition."""
    method: str
    url: str
    status: Optional[int] = None
    resource_type: str = "xhr"
    request_headers: Dict[str, str] = field(default_factory=dict)
    response_headers: Dict[str, str] = field(default_factory=dict)
    request_body: str = ""
    response_body: str = ""
    timestamp: float = field(default_factory=lambda: datetime.now(timezone.utc).timestamp())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "method": self.method,
            "url": self.url,
            "status": self.status,
            "resource_type": self.resource_type,
            "request_headers": self.request_headers,
            "response_headers": self.response_headers,
            "request_body": self.request_body[:2000] if self.request_body else "",
            "response_body": self.response_body[:2000] if self.response_body else "",
            "timestamp": self.timestamp,
        }


@dataclass
class CrawlerAction:
    """Single action candidate on a state."""
    action_type: str  # click | fill | select | submit | scroll | navigate
    target: str       # semantic label, text, accessible name, or selector
    candidate: Dict[str, Any] = field(default_factory=dict)  # tier, kind, value
    value: str = ""   # test value for fill/select
    value_class: str = "text"
    dangerous: bool = False
    blocked_reason: str = ""

    def action_key(self, state_key: str) -> str:
        import hashlib
        payload = f"{state_key}|{self.action_type}|{self.target}|{self.candidate.get('kind', '')}|{self.candidate.get('value', '')}|{self.value_class}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.action_type,
            "target": self.target,
            "candidate": self.candidate,
            "value_class": self.value_class,
            "dangerous": self.dangerous,
            "blocked_reason": self.blocked_reason,
        }


@dataclass
class CrawlerState:
    """Observed state snapshot in the application."""
    state_key: str
    url: str
    route: str
    title: str = ""
    depth: int = 0
    elements: List[Dict[str, Any]] = field(default_factory=list)
    forms: List[Dict[str, Any]] = field(default_factory=list)
    headings: List[str] = field(default_factory=list)
    dialogs: List[str] = field(default_factory=list)
    tabs: List[str] = field(default_factory=list)
    network_delta: List[NetworkDeltaEntry] = field(default_factory=list)
    console_errors: List[str] = field(default_factory=list)
    page_errors: List[str] = field(default_factory=list)
    replay_chain: List[CrawlerAction] = field(default_factory=list)
    timestamp: float = field(default_factory=lambda: datetime.now(timezone.utc).timestamp())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "state_key": self.state_key,
            "url": self.url,
            "route": self.route,
            "title": self.title,
            "depth": self.depth,
            "elements_count": len(self.elements),
            "forms_count": len(self.forms),
            "headings": self.headings,
            "dialogs": self.dialogs,
            "tabs": self.tabs,
            "network_delta": [n.to_dict() for n in self.network_delta],
            "console_errors": self.console_errors,
            "page_errors": self.page_errors,
        }


@dataclass
class CrawlerTransition:
    """Edge in the transition graph connecting states."""
    from_state_key: str
    action: CrawlerAction
    to_state_key: str
    url_change: str = ""
    response_class: str = ""  # 2xx, 4xx, 5xx
    network_delta: List[NetworkDeltaEntry] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "from_state": self.from_state_key,
            "action": self.action.to_dict(),
            "to_state": self.to_state_key,
            "outcome": {
                "url_change": self.url_change,
                "response_class": self.response_class,
                "network_calls": len(self.network_delta),
            },
        }


@dataclass
class AwakenedEndpoint:
    """Result of UI awakening on an orphaned form/field."""
    field_name: str
    page_url: str
    provenance: str  # "observed" | "synthetic_candidate"
    endpoint_url: str = ""
    method: str = "GET"
    request_payload: Dict[str, Any] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field_name": self.field_name,
            "page_url": self.page_url,
            "provenance": self.provenance,
            "endpoint_url": self.endpoint_url,
            "method": self.method,
            "request_payload": self.request_payload,
            "notes": self.notes,
        }


@dataclass
class ReplayResult:
    """Outcome of playing an action replay chain."""
    success: bool
    final_state_key: str = ""
    expected_state_key: str = ""
    diverged_step: Optional[int] = None
    diverged_reason: str = ""
    duration_ms: int = 0
    actions_executed: int = 0


@dataclass
class CrawlerRunResult:
    """Full execution summary of a crawler run."""
    session_id: str
    target_url: str
    states: List[CrawlerState] = field(default_factory=list)
    transitions: List[CrawlerTransition] = field(default_factory=list)
    state_count: int = 0
    transition_count: int = 0
    stop_reason: str = "completed"  # completed | queue_empty | budget_exhausted | max_depth_reached | error
    service_map_dict: Dict[str, Any] = field(default_factory=dict)
    awakened_endpoints: List[AwakenedEndpoint] = field(default_factory=list)
    blocked_actions_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schema_version": 2,
            "session_id": self.session_id,
            "target": {"origin": self.target_url},
            "states": [s.to_dict() for s in self.states],
            "transitions": [t.to_dict() for t in self.transitions],
            "service_map": self.service_map_dict,
            "awaken": {
                "observed": [a.to_dict() for a in self.awakened_endpoints if a.provenance == "observed"],
                "synthetic_candidates": [a.to_dict() for a in self.awakened_endpoints if a.provenance == "synthetic_candidate"],
            },
            "limits": {
                "states": self.state_count,
                "transitions": self.transition_count,
                "blocked": self.blocked_actions_count,
                "stop_reason": self.stop_reason,
            },
        }
