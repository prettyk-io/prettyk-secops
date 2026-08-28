"""COS-L9: CapabilityBroker для scanner."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import requests

logger = logging.getLogger(__name__)
DEFAULT_TIMEOUT = 30


@dataclass
class scannerSession:
    session_id: str
    run_id: str
    proxy_host: str
    proxy_port: int
    api_key: str
    context_id: int | None = None


class scannerCapabilityBroker:
    def __init__(self, scanner_url: str = "http://127.0.0.1:8080", api_key: str = "changeme"):
        self._scanner_url = scanner_url.rstrip("/")
        self._api_key = api_key
        self._sessions: dict[str, scannerSession] = {}

    def _get(self, path: str, **params: Any) -> requests.Response:
        p = dict(params)
        p["apikey"] = self._api_key
        return requests.get(f"{self._scanner_url}{path}", params=p, timeout=DEFAULT_TIMEOUT)

    def start_scanner_demon(self, run_id: str) -> scannerSession:
        r = self._get("/JSON/core/view/version/")
        if r.status_code != 200:
            raise RuntimeError(f"scanner is not reachable at {self._scanner_url}")
        context_name = f"pk-run-{run_id}"
        r = self._get("/JSON/context/action/newContext/", contextName=context_name)
        context_id = r.json().get("contextId") if r.status_code == 200 else None
        session = scannerSession(
            session_id=f"scanner-{run_id}-{int(time.time())}",
            run_id=run_id, proxy_host="host.docker.internal",
            proxy_port=8080, api_key=self._api_key, context_id=context_id,
        )
        self._sessions[run_id] = session
        logger.info("Started scanner demon for run %s (context %s)", run_id, context_id)
        return session

    def configure_proxy(self, session: scannerSession, target_host: str, target_port: int = 443) -> None:
        if session.context_id:
            self._get("/JSON/context/action/includeInContext/",
                      contextName=f"pk-run-{session.run_id}",
                      regex=f"https?://{target_host}(:\\d+)?/.*")
        logger.info("Configured proxy for %s:%d", target_host, target_port)

    def teardown(self, session: scannerSession) -> None:
        if session.context_id:
            try:
                self._get("/JSON/context/action/removeContext/", contextId=session.context_id)
            except Exception:
                logger.warning("Failed to remove scanner context %s", session.context_id)
        self._sessions.pop(session.run_id, None)
        logger.info("Tore down scanner session %s", session.session_id)