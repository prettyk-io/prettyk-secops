# -*- coding: utf-8 -*-
"""WZ-5: VideoTrackAdapter — бесшовный переход Live Stream → MP4 Replay.

Спецификация: docs/research/2026-08-27-studio-warzone-rewind-specification.md (§4).

Единая абстракция источника видео:
  - Live Stream Mode (активный прогон): in-memory кольцевой буфер кадров;
  - MP4 Replay Mode (история/скраббинг): байт-рейндж MP4.
При завершении записи MP4 происходит бесшовный auto-switch: позиция playhead
сохраняется с точностью до миллисекунды, чёрного экрана нет (позиция не сбрасывается).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class TrackPosition:
    """Точная позиция playhead (миллисекунды)."""
    current_time_ms: int = 0
    duration_ms: int = 0

    def clamp(self) -> "TrackPosition":
        if self.duration_ms > 0 and self.current_time_ms > self.duration_ms:
            self.current_time_ms = self.duration_ms
        return self


class VideoTrackAdapter:
    """Управляет источником видео и переключением Live ↔ Replay."""

    def __init__(self, live_buffer_capacity: int = 120) -> None:
        self._mode: str = "live"  # "live" | "replay"
        self._live_frames: list[bytes] = []
        self._live_capacity = live_buffer_capacity
        self._mp4_path: Optional[str] = None
        self._position = TrackPosition()
        self._transitions: list[str] = []  # история переходов (для аудита)

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def position(self) -> TrackPosition:
        return TrackPosition(self._position.current_time_ms, self._position.duration_ms)

    @property
    def transitions(self) -> list[str]:
        return list(self._transitions)

    # ── Live Stream Mode ──

    def push_live_frame(self, frame: bytes, timestamp_ms: int) -> None:
        """Добавить кадр в кольцевой буфер (FIFO, capacity обрезает старые)."""
        if self._mode != "live":
            return
        self._live_frames.append(frame)
        if len(self._live_frames) > self._live_capacity:
            self._live_frames = self._live_frames[-self._live_capacity:]
        self._position.duration_ms = max(self._position.duration_ms, timestamp_ms)

    def live_frame_count(self) -> int:
        return len(self._live_frames)

    # ── Replay Mode ──

    def attach_mp4(self, mp4_path: str, duration_ms: int) -> None:
        """Смонтировать MP4 без сброса позиции (бесшовный переход)."""
        self._mp4_path = mp4_path
        self._position.duration_ms = duration_ms

    @property
    def mp4_path(self) -> Optional[str]:
        return self._mp4_path

    # ── Бесшовный авто-переход Live → Replay ──

    def switch_to_replay(self, mp4_path: str, duration_ms: int) -> TrackPosition:
        """Завершить live-запись и перейти на MP4.

        Инвариант бесшовности: current_time НЕ сбрасывается — оператор остаётся
        ровно в той же точке таймлайна, без чёрного экрана (seek не нужен).
        """
        if self._mode == "replay":
            return self.position

        # 1. Зафиксировать точную позицию playhead до переключения
        saved_ms = self._position.current_time_ms

        # 2. Смонтировать MP4
        self.attach_mp4(mp4_path, duration_ms)

        # 3. Переключить режим
        self._mode = "replay"

        # 4. Восстановить позицию (clamp к новой длительности)
        self._position.current_time_ms = min(saved_ms, duration_ms)

        self._transitions.append(f"live->replay@{saved_ms}ms")
        return self.position

    def switch_to_live(self) -> None:
        """Вернуться в live (напр. новый run). Позиция сбрасывается."""
        self._mode = "live"
        self._mp4_path = None
        self._live_frames = []
        self._position = TrackPosition()
        self._transitions.append("replay->live")

    def seek(self, current_time_ms: int) -> TrackPosition:
        """Точный seek (только в replay-режиме)."""
        self._position.current_time_ms = max(0, current_time_ms)
        return self.position.clamp()
