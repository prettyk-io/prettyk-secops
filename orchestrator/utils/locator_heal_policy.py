# -*- coding: utf-8 -*-
"""
HEAL-E: матрица label ∩ fingerprint (DISC-2 ещё дно — политика готова заранее).

Не LLM. Не отдельный MethodId Heal.
"""
from __future__ import annotations

from enum import Enum


class HealStrategy(str, Enum):
    NONE = "none"
    FINGERPRINT = "fingerprint"
    LABEL_FIRST = "label_first"
    LABEL_THEN_FINGERPRINT = "label_then_fingerprint"


def choose_heal_strategy(
    *,
    heal_gate: bool,
    has_fingerprint: bool,
    has_label_hint: bool,
    label_mode_enabled: bool = False,
) -> HealStrategy:
    """
    soft/gate off → NONE.
    label_mode + hint → label first (then fp if label miss — caller).
    иначе fingerprint если есть fp или cold weak signal допускается снаружи.
    """
    if not heal_gate:
        return HealStrategy.NONE
    if label_mode_enabled and has_label_hint:
        if has_fingerprint:
            return HealStrategy.LABEL_THEN_FINGERPRINT
        return HealStrategy.LABEL_FIRST
    if has_fingerprint:
        return HealStrategy.FINGERPRINT
    # cold start: runtime may still try weak fp from locator attrs
    return HealStrategy.FINGERPRINT
