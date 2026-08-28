# -*- coding: utf-8 -*-
"""
scannerWorkStream — динамический scanner-канал для СборИнформации.

Не второй Docker-scanner и не always-on: start/close на время жеста.
Spider bursts сериализованы (один активный spider на demon).
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

logger = logging.getLogger("orchestrator")


class scannerWorkStream:
    """Второй канал управления scanner API рядом с WebDriver."""

    def __init__(self, scanner: Any):
        self._scanner = scanner
        self._active = False
        self._burst_count = 0
        self._closed = False

    @property
    def active(self) -> bool:
        return self._active and not self._closed

    @property
    def burst_count(self) -> int:
        return self._burst_count

    def start(self) -> None:
        if self._closed:
            raise RuntimeError("scannerWorkStream already closed")
        self._active = True
        self.ensure_passive_enabled()
        _publish("GATHER", "scannerWorkStream start")

    def ensure_passive_enabled(self) -> None:
        scanner = self._scanner
        if scanner is None:
            return
        try:
            if hasattr(scanner, "enable_all_passive_scanners"):
                scanner.enable_all_passive_scanners()
                return
        except Exception as e:
            logger.debug("enable_all_passive_scanners: %s", e)
        try:
            raw = getattr(scanner, "_scanner", None)
            pscan = getattr(raw, "pscan", None) if raw is not None else None
            if pscan is not None and hasattr(pscan, "enable_all_scanners"):
                pscan.enable_all_scanners()
        except Exception as e:
            logger.debug("pscan.enable_all_scanners: %s", e)

    def spider_burst(self, url: str, burst_sec: float = 15.0) -> Any:
        """
        Traditional spider на url с wall-clock cap в секундах.
        Перед стартом гасит предыдущий orphan (best-effort).
        """
        if not self.active:
            raise RuntimeError("scannerWorkStream not started")
        scanner = self._scanner
        if scanner is None:
            raise RuntimeError("scanner adapter missing")
        url = (url or "").strip()
        if not url:
            raise ValueError("spider_burst: empty url")
        sec = max(1.0, float(burst_sec))
        self._stop_orphan_spider()
        # spider_scan timeout_minutes принимает float (0.25 = 15с)
        timeout_min = sec / 60.0
        logger.info("GATHER spider_burst url=%s burst_sec=%.1f", url, sec)
        _publish("GATHER", f"spider_burst {url} {sec:.0f}s")
        result = scanner.spider_scan(url=url, timeout_minutes=timeout_min)
        self._burst_count += 1
        self._stop_orphan_spider()
        return result

    def passive_wait_capped(self, timeout_sec: float = 60.0) -> bool:
        """Ждать опустошения pscan queue с капом в секундах (не минутах int)."""
        if not self.active and not self._closed:
            raise RuntimeError("scannerWorkStream not started")
        scanner = self._scanner
        if scanner is None:
            return False
        sec = max(1.0, float(timeout_sec))
        if hasattr(scanner, "passive_scan_wait_seconds"):
            ok = bool(scanner.passive_scan_wait_seconds(timeout_seconds=sec))
            _publish("GATHER", f"passive_wait_capped {sec:.0f}s ok={ok}")
            return ok
        # fallback: дробные минуты если adapter режет int — свой poll
        ok = _poll_passive(scanner, sec)
        _publish("GATHER", f"passive_wait_capped {sec:.0f}s ok={ok}")
        return ok

    def close(self) -> None:
        if self._closed:
            return
        try:
            self._stop_orphan_spider()
        finally:
            self._active = False
            self._closed = True
            _publish("GATHER", f"scannerWorkStream close bursts={self._burst_count}")

    def _stop_orphan_spider(self) -> None:
        scanner = self._scanner
        if scanner is None:
            return
        try:
            if hasattr(scanner, "stop_all_spiders"):
                scanner.stop_all_spiders()
                return
        except Exception as e:
            logger.debug("stop_all_spiders: %s", e)
        try:
            raw = getattr(scanner, "_scanner", None)
            spider = getattr(raw, "spider", None) if raw is not None else None
            if spider is not None and hasattr(spider, "stop_all_scans"):
                spider.stop_all_scans()
        except Exception as e:
            logger.debug("spider.stop_all_scans: %s", e)


def _poll_passive(scanner: Any, timeout_sec: float) -> bool:
    start = time.time()
    while True:
        try:
            remaining = _records_to_scan(scanner)
            if remaining == 0:
                return True
            if time.time() - start > timeout_sec:
                logger.warning(
                    "passive wait capped after %.1fs remaining=%s",
                    timeout_sec,
                    remaining,
                )
                return False
        except Exception as e:
            logger.debug("passive poll: %s", e)
        time.sleep(0.5)


def _records_to_scan(scanner: Any) -> int:
    if hasattr(scanner, "passive_records_to_scan"):
        return int(scanner.passive_records_to_scan())
    raw = getattr(scanner, "_scanner", None)
    if raw is not None:
        return int(raw.pscan.records_to_scan)
    raise RuntimeError("cannot read pscan.records_to_scan")


def _publish(kind: str, msg: str) -> None:
    try:
        from utils.diary_bus import publish

        publish(kind, msg, channel="diary")
    except Exception:
        pass
