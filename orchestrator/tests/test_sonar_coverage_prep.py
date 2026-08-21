# -*- coding: utf-8 -*-
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# tools/ not a package — load by path
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "sonar_coverage_prep",
    ROOT / "tools" / "sonar_coverage_prep.py",
)
prep = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(prep)


def test_write_zero_cobertura_and_lcov(tmp_path, monkeypatch):
    be = tmp_path / "coverage-backend.xml"
    fe = tmp_path / "lcov.info"
    monkeypatch.setattr(prep, "BE_COV", be)
    monkeypatch.setattr(prep, "FE_LCOV", fe)
    monkeypatch.setattr(prep, "REPO", tmp_path)
    prep.write_zero()
    assert be.is_file()
    assert "line-rate=\"0\"" in be.read_text(encoding="utf-8")
    assert fe.is_file()
    assert "end_of_record" in fe.read_text(encoding="utf-8")
