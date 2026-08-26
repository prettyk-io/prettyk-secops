# -*- coding: utf-8 -*-
"""Режим отладки (эпик DBG): pause/resume Live + флаги для controller/main."""
from __future__ import annotations

import time
from typing import Any, Callable, Dict, Optional


def wired_debug_mode(wired: Any) -> bool:
    infra = getattr(wired, "infrastructure", None)
    return bool(getattr(infra, "debug_mode", False))


def set_live_debug_flags(
    *,
    enabled: bool,
    paused: bool = False,
    timers_suppressed: bool = False,
) -> None:
    """Пишет флаги в Live meta (файл) — видно idle Live и контроллеру."""
    from utils.diary_bus import publish, set_meta

    set_meta(
        debug_mode=bool(enabled),
        debug_paused=bool(paused) if enabled else False,
        debug_timers_suppressed=bool(timers_suppressed) if enabled else False,
    )
    if enabled:
        note = "Режим отладки: допуск по ACTIVE недействителен"
        if timers_suppressed:
            note += "; таймеры idle/work сняты"
        publish("NOTE", note, channel="diary")


def set_debug_paused(paused: bool) -> dict:
    from utils.diary_bus import get_meta, publish, set_meta

    meta = get_meta()
    if not meta.get("debug_mode"):
        raise ValueError("debug_mode is off — pause/resume недоступны")
    set_meta(debug_paused=bool(paused))
    if paused:
        publish("DEBUG_PAUSE", "Пауза отладки", channel="diary")
    else:
        publish("DEBUG_RESUME", "Продолжение после паузы отладки", channel="diary")
    return get_meta()


def is_debug_paused() -> bool:
    from utils.diary_bus import get_meta

    meta = get_meta()
    return bool(meta.get("debug_mode")) and bool(meta.get("debug_paused"))


def wait_while_paused(
    *,
    should_stop: Optional[Callable[[], bool]] = None,
    poll_sec: float = 0.4,
) -> None:
    """Блокирует поток сценария, пока Live meta.debug_paused."""
    while is_debug_paused():
        if should_stop is not None and should_stop():
            return
        time.sleep(max(0.1, float(poll_sec)))


def apply_debug_admission_void(
    hints: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Допуск VOID при debug_mode (не execution fault)."""
    out: Dict[str, Any] = dict(hints) if isinstance(hints, dict) else {}
    out["admission_void"] = True
    out["debug_mode"] = True
    return out
