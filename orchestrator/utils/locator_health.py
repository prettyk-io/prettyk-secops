# -*- coding: utf-8 -*-
"""W3.7: Locator Health Monitor — отслеживание failsafe-ошибок по локаторам.

Агрегирует ошибки из нескольких runs и выдаёт locator_health.json артефакт.
"""
from __future__ import annotations

import json
import os
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class LocatorHealthRecord:
    locator: str
    page_id: str = ""
    fails: int = 0
    successes: int = 0
    last_fail_run: str = ""
    last_fail_reason: str = ""
    consecutive_fails: int = 0

    @property
    def health(self) -> str:
        if self.consecutive_fails >= 3:
            return "broken"
        if self.fails > self.successes:
            return "degraded"
        if self.fails > 0:
            return "warn"
        return "ok"


LocatorHealthIndex = dict[str, LocatorHealthRecord]


def load_locator_health(health_path: str) -> LocatorHealthIndex:
    """Load existing health index or return empty."""
    if not os.path.exists(health_path):
        return {}
    try:
        with open(health_path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
        out: LocatorHealthIndex = {}
        for k, v in raw.items():
            if not isinstance(v, dict):
                continue
            out[k] = LocatorHealthRecord(
                locator=str(v.get("locator", k)),
                page_id=str(v.get("page_id", "")),
                fails=int(v.get("fails", 0)),
                successes=int(v.get("successes", 0)),
                last_fail_run=str(v.get("last_fail_run", "")),
                last_fail_reason=str(v.get("last_fail_reason", "")),
                consecutive_fails=int(v.get("consecutive_fails", 0)),
            )
        return out
    except Exception:
        return {}


def save_locator_health(health: LocatorHealthIndex, health_path: str) -> None:
    os.makedirs(os.path.dirname(health_path) or ".", exist_ok=True)
    payload = {k: asdict(v) for k, v in health.items()}
    with open(health_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)


def record_locator_fail(
    health: LocatorHealthIndex,
    locator: str,
    run_id: str,
    reason: str = "",
    page_id: str = "",
) -> LocatorHealthIndex:
    key = locator.strip()
    if not key:
        return health

    prev = health.get(key, LocatorHealthRecord(locator=key))
    prev.fails += 1
    prev.last_fail_run = run_id
    prev.last_fail_reason = reason or prev.last_fail_reason
    prev.consecutive_fails += 1
    prev.page_id = page_id or prev.page_id
    health[key] = prev
    return health


def record_locator_success(
    health: LocatorHealthIndex,
    locator: str,
    page_id: str = "",
) -> LocatorHealthIndex:
    key = locator.strip()
    if not key:
        return health

    prev = health.get(key, LocatorHealthRecord(locator=key))
    prev.successes += 1
    prev.consecutive_fails = 0
    prev.page_id = page_id or prev.page_id
    health[key] = prev
    return health


def broken_locators(health: LocatorHealthIndex) -> list[LocatorHealthRecord]:
    return [r for r in health.values() if r.health == "broken"]


def degraded_locators(health: LocatorHealthIndex) -> list[LocatorHealthRecord]:
    return [r for r in health.values() if r.health in ("broken", "degraded")]