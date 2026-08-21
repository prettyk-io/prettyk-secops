# -*- coding: utf-8 -*-
"""QA-1: pytest.ini markers registered; heavy tests stay opt-in."""
from __future__ import annotations

from pathlib import Path

def test_heavy_and_lab_markers_registered():
    root = Path(__file__).resolve().parents[2]
    ini = root / "pytest.ini"
    assert ini.is_file()
    text = ini.read_text(encoding="utf-8")
    assert "heavy:" in text
    assert "lab:" in text
    assert "not heavy" in text


def test_har_live_and_lab_hooks_marked_heavy():
    here = Path(__file__).resolve().parent
    har = (here / "test_har_sequence_live.py").read_text(encoding="utf-8")
    hooks = (here / "test_lab_hooks_e2e.py").read_text(encoding="utf-8")
    assert "@pytest.mark.heavy" in har
    assert "@pytest.mark.lab" in har
    assert "@pytest.mark.heavy" in hooks
    assert "@pytest.mark.lab" in hooks
