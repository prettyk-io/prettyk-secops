# -*- coding: utf-8 -*-
"""BBA-EXEC-3: хранение артефактов replay (скриншоты шагов + timeline JSON).

Структура на диске (база по умолчанию — ``replay_artifacts``, переопределяется
через ``PK_REPLAY_ARTIFACTS_DIR``):

    replay_artifacts/
      <replay_id>/
        replay_timeline.json
        step_0_<step_id>.png
        step_1_<step_id>.png
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

DEFAULT_BASE = "replay_artifacts"
TIMELINE_FILENAME = "replay_timeline.json"


class ReplayStore:
    """Сохранение/чтение timeline и PNG-скриншотов по replay_id."""

    def __init__(self, base_dir: str | Path | None = None) -> None:
        env = os.environ.get("PK_REPLAY_ARTIFACTS_DIR")
        root = base_dir if base_dir is not None else (env or DEFAULT_BASE)
        self._base = Path(root)
        self._base.mkdir(parents=True, exist_ok=True)

    @property
    def base_dir(self) -> Path:
        return self._base

    def replay_dir(self, replay_id: str) -> Path:
        return self._base / replay_id

    def new_replay_id(self) -> str:
        return f"replay-{uuid.uuid4().hex[:12]}"

    def save_screenshot(self, replay_id: str, filename: str, png_bytes: bytes) -> str:
        """Сохраняет PNG-байты и возвращает относительный путь от базы."""
        d = self.replay_dir(replay_id)
        d.mkdir(parents=True, exist_ok=True)
        fpath = d / filename
        fpath.write_bytes(png_bytes)
        return str(fpath.relative_to(self._base)).replace(os.sep, "/")

    def save_timeline(self, replay_id: str, timeline: dict) -> str:
        """Сериализует timeline в JSON и возвращает относительный путь."""
        d = self.replay_dir(replay_id)
        d.mkdir(parents=True, exist_ok=True)
        fpath = d / TIMELINE_FILENAME
        fpath.write_text(
            json.dumps(timeline, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return str(fpath.relative_to(self._base)).replace(os.sep, "/")

    def load_timeline(self, replay_id: str) -> dict | None:
        fpath = self.replay_dir(replay_id) / TIMELINE_FILENAME
        if not fpath.exists():
            return None
        return json.loads(fpath.read_text(encoding="utf-8"))


def get_store(base_dir: str | Path | None = None) -> ReplayStore:
    """Фабрика стора. Читает env каждый вызов — удобно для monkeypatch в тестах."""
    return ReplayStore(base_dir=base_dir)