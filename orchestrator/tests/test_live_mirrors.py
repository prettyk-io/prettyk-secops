# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

from utils import live_mirrors as lm


def test_clear_live_results_mirrors(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(lm, "LIVE_DIR", tmp_path)
    monkeypatch.setattr(lm, "ensure_live_dir", lambda: tmp_path.mkdir(parents=True, exist_ok=True))
    (tmp_path / "run_ui_summary.json").write_text("{}", encoding="utf-8")
    (tmp_path / "run_summary.json").write_text("{}", encoding="utf-8")
    (tmp_path / "keep.txt").write_text("x", encoding="utf-8")
    removed = lm.clear_live_results_mirrors()
    assert "run_ui_summary.json" in removed
    assert "run_summary.json" in removed
    assert not (tmp_path / "run_ui_summary.json").is_file()
    assert (tmp_path / "keep.txt").is_file()
