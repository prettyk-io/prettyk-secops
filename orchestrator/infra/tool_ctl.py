# PoC — NOT production. Cosmoport boundary. Do not import into DAST runtime.
"""
COS-009: scanner ctl + Playwright ctl — стандартный интерфейс через CapabilityBroker.

Обёртки над существующими адаптерами для управления через брокер,
с изоляцией по run_id. Ресурсы освобождаются при завершении run.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from infra.capability_broker import Capability, CapabilityBroker, ResourceHealth

logger = logging.getLogger(__name__)


@dataclass
class ToolSession:
    """Управляемая сессия инструмента, привязанная к run_id."""
    run_id: str
    capability: Capability
    port: int
    host: str = "127.0.0.1"
    status: str = "starting"   # starting / running / scanning / done / error


class scannerCtl:
    """Управление scanner-демоном через брокер (изоляция по run_id)."""

    def __init__(self, broker: CapabilityBroker):
        self._broker = broker
        self._sessions: dict[str, ToolSession] = {}

    def start_scanner(self, run_id: str, target_url: str) -> ToolSession | None:
        """Запустить scanner для run. None если нет свободного порта."""
        alloc = self._broker.acquire(run_id, Capability.scanner)
        if alloc is None:
            return None
        session = ToolSession(
            run_id=run_id,
            capability=Capability.scanner,
            port=alloc.port,
            host=alloc.host,
            status="running",
        )
        self._sessions[run_id] = session
        logger.info("scanner started for %s on :%d → %s", run_id, alloc.port, target_url)
        return session

    def scanner_status(self, run_id: str) -> str | None:
        """Текущий статус сканирования."""
        s = self._sessions.get(run_id)
        return s.status if s else None

    def stop_scanner(self, run_id: str) -> None:
        """Остановить scanner, освободить порт."""
        if run_id in self._sessions:
            del self._sessions[run_id]
        self._broker.release(run_id, Capability.scanner)

    def teardown_run(self, run_id: str) -> None:
        """Освободить все ресурсы run (вызывается при завершении)."""
        self.stop_scanner(run_id)


class PlaywrightCtl:
    """Управление Playwright-браузером через брокер (изоляция по run_id)."""

    def __init__(self, broker: CapabilityBroker):
        self._broker = broker
        self._sessions: dict[str, ToolSession] = {}

    def start_playwright(self, run_id: str, browser_type: str = "chromium") -> ToolSession | None:
        """Запустить Playwright для run. None если нет свободного порта."""
        alloc = self._broker.acquire(run_id, Capability.PLAYWRIGHT)
        if alloc is None:
            return None
        session = ToolSession(
            run_id=run_id,
            capability=Capability.PLAYWRIGHT,
            port=alloc.port,
            host=alloc.host,
            status="running",
        )
        self._sessions[run_id] = session
        logger.info("Playwright started for %s on :%d (%s)", run_id, alloc.port, browser_type)
        return session

    def playwright_status(self, run_id: str) -> str | None:
        s = self._sessions.get(run_id)
        return s.status if s else None

    def stop_playwright(self, run_id: str) -> None:
        if run_id in self._sessions:
            del self._sessions[run_id]
        self._broker.release(run_id, Capability.PLAYWRIGHT)

    def teardown_run(self, run_id: str) -> None:
        self.stop_playwright(run_id)


class RunCapabilities:
    """Фасад: управление всеми инструментами одного run через один интерфейс."""

    def __init__(self, broker: CapabilityBroker | None = None):
        self._broker = broker or CapabilityBroker()
        self._scanner = scannerCtl(self._broker)
        self._pw = PlaywrightCtl(self._broker)

    @property
    def scanner(self) -> scannerCtl:
        return self._scanner

    @property
    def playwright(self) -> PlaywrightCtl:
        return self._pw

    def teardown_run(self, run_id: str) -> None:
        """Освободить ВСЕ ресурсы run (завершение/сбой)."""
        self._scanner.teardown_run(run_id)
        self._pw.teardown_run(run_id)
        self._broker.release(run_id)  # страховка — всё равно освободить

    def broker(self) -> CapabilityBroker:
        return self._broker