# -*- coding: utf-8 -*-
"""WZ-1: Timeline Controller — play/pause/seek/setSpeed + подписчики.

Спецификация: docs/research/2026-08-27-studio-warzone-rewind-specification.md (§6).
Чистая логика, без wall-clock в тестах (injectable clock).
"""
from __future__ import annotations

import threading
from typing import Callable, Optional


class TimelineController:
    """Центральный контроллер таймлайна Studio (IStudioTimelineController)."""

    def __init__(self, duration: float = 0.0, clock: Callable[[], float] | None = None) -> None:
        self._duration = max(0.0, duration)
        self._current = 0.0
        self._playing = False
        self._speed = 1.0
        self._clock = clock if clock is not None else _default_clock
        self._play_started_at: Optional[float] = None
        self._play_started_from: float = 0.0
        self._subscribers: list[Callable[[object], None]] = []
        self._lock = threading.RLock()

    # ── свойства ──

    @property
    def current_time(self) -> float:
        with self._lock:
            return self._compute_current()

    @property
    def duration(self) -> float:
        with self._lock:
            return self._duration

    @duration.setter
    def duration(self, value: float) -> None:
        with self._lock:
            self._duration = max(0.0, value)
            if self._current > self._duration:
                self._current = self._duration

    @property
    def is_playing(self) -> bool:
        with self._lock:
            return self._playing

    @property
    def playback_speed(self) -> float:
        with self._lock:
            return self._speed

    # ── внутренние ──

    def _compute_current(self) -> float:
        if not self._playing or self._play_started_at is None:
            return self._current
        elapsed = (self._clock() - self._play_started_at) * self._speed
        return min(self._play_started_from + elapsed, self._duration)

    def _snapshot(self) -> object:
        return self._compute_current()

    # ── управление ──

    def play(self) -> None:
        with self._lock:
            if self._playing:
                return
            self._current = self._compute_current()
            if self._current >= self._duration:
                self._current = 0.0  # доиграли → с начала
            self._play_started_from = self._current
            self._play_started_at = self._clock()
            self._playing = True
        self._notify()

    def pause(self) -> None:
        with self._lock:
            if not self._playing:
                return
            self._current = self._compute_current()
            self._playing = False
            self._play_started_at = None
        self._notify()

    def seek(self, t: float) -> None:
        with self._lock:
            self._current = max(0.0, min(float(t), self._duration))
            if self._playing:
                self._play_started_from = self._current
                self._play_started_at = self._clock()
        self._notify()

    def set_speed(self, speed: float) -> None:
        with self._lock:
            if speed <= 0:
                raise ValueError("playback speed must be positive")
            if self._playing:
                # пересчитать базовую точку при смене скорости
                self._current = self._compute_current()
                self._play_started_from = self._current
                self._play_started_at = self._clock()
            self._speed = float(speed)
        self._notify()

    # ── подписчики ──

    def subscribe(self, callback: Callable[[object], None]) -> Callable[[], None]:
        with self._lock:
            self._subscribers.append(callback)

        def unsubscribe() -> None:
            with self._lock:
                if callback in self._subscribers:
                    self._subscribers.remove(callback)

        return unsubscribe

    def _notify(self) -> None:
        snapshot = self._snapshot()
        with self._lock:
            subs = list(self._subscribers)
        for cb in subs:
            try:
                cb(snapshot)
            except Exception:
                continue


def _default_clock() -> float:
    import time
    return time.monotonic()
