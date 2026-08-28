# -*- coding: utf-8 -*-
"""L-3: Live diary publish redacts Bearer / JWT-ish tokens."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils import diary_bus
from utils.paths import DIARY_NDJSON, ensure_live_dir


def test_publish_redacts_bearer(tmp_path, monkeypatch):
    diary = tmp_path / "diary.ndjson"
    monkeypatch.setattr(diary_bus, "DIARY_NDJSON", diary)
    monkeypatch.setattr(diary_bus, "ensure_live_dir", lambda: tmp_path.mkdir(exist_ok=True))
    diary_bus.publish(
        "LOG",
        'ЛогАтаки | Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.aaa.bbb password=secret',
        channel="scanner",
    )
    raw = diary.read_text(encoding="utf-8").strip()
    ev = json.loads(raw)
    assert "eyJhbGciOiJIUzI1NiJ9" not in ev["text"]
    assert "secret" not in ev["text"] or "***" in ev["text"]
    assert "Bearer" in ev["text"] or "***" in ev["text"]
