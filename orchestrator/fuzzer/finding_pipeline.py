# -*- coding: utf-8 -*-
"""CF-B1: FindingPipeline — запись, dedup, SSE-публикация."""
from __future__ import annotations

import json
import logging
import threading
from typing import Any, Dict, List, Optional

from fuzzer.models import FindingRecord, Severity

logger = logging.getLogger("orchestrator.fuzzer")


class FindingPipeline:
    """Конвейер находок: dedup, severity-сортировка, SSE-публикация."""

    def __init__(self, publish_sse: bool = True):
        self._lock = threading.Lock()
        self._findings: Dict[str, FindingRecord] = {}  # dedup_key → record
        self._publish_sse = publish_sse

    # ── Dedup ──

    def is_duplicate(self, finding: FindingRecord) -> bool:
        with self._lock:
            return finding.dedup_key in self._findings

    def record(self, finding: FindingRecord) -> bool:
        """Записать finding. Возвращает True если новый (не дубль)."""
        with self._lock:
            if finding.dedup_key in self._findings:
                return False
            self._findings[finding.dedup_key] = finding

        # SSE-публикация
        if self._publish_sse:
            self._publish_finding_sse(finding)

        return True

    # ── Чтение ──

    def all_findings(self) -> List[FindingRecord]:
        with self._lock:
            return list(self._findings.values())

    def findings_by_severity(self, severity: Severity) -> List[FindingRecord]:
        with self._lock:
            return [f for f in self._findings.values() if f.severity == severity]

    def count_by_severity(self) -> Dict[str, int]:
        counts: Dict[str, int] = {s.value: 0 for s in Severity}
        with self._lock:
            for f in self._findings.values():
                counts[f.severity.value] += 1
        return {k: v for k, v in counts.items() if v > 0}

    def summary(self) -> Dict[str, Any]:
        counts = self.count_by_severity()
        return {
            "total": len(self._findings),
            "by_severity": counts,
            "unique_signatures": len(self._findings),
        }

    # ── SSE ──

    @staticmethod
    def _publish_finding_sse(finding: FindingRecord) -> None:
        """Опубликовать finding.created в diary bus для SSE."""
        try:
            from utils.diary_bus import publish
            from fuzzer.findings import append_finding

            payload_json = json.dumps(finding.to_dict(), ensure_ascii=False)
            publish(
                kind="FINDING",
                text=f"{finding.injection_type.value}: {finding.param_name} → {finding.payload[:80]}",
                channel="diary",
                pretty=payload_json,
            )
            # Дополнительный publish в dedicated channel для мониторов
            publish(
                kind=f"finding.severity.{finding.severity.value}",
                text=f"[{finding.severity.value.upper()}] {finding.injection_type.value} @ {finding.url}",
                channel="diary",
            )

            # CF-B3: сохранить в in-memory state для live_server.py
            append_finding(finding.to_dict())

        except Exception:
            logger.debug("Finding SSE publish skipped (diary_bus unavailable)")