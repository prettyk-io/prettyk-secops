# -*- coding: utf-8 -*-
"""manual JSON без scanner_mode/base_url — playground start не должен резать schema noise."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.wired_validate import validate_wired_file
from models.wired import Wired


def test_manual_Wired_validate_ok(tmp_path: Path):
    path = tmp_path / "manual.json"
    path.write_text(
        json.dumps(
            {
                "meta": {
                    "assessment_purpose": "manual",
                    "project_id": "t",
                    "generate_act": False,
                },
                "infrastructure": {
                    "webswing_session_timeout_min": 30,
                    "idle_timeout_min": 5,
                    "debug_mode": False,
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    issues, wired = validate_wired_file(path)
    assert issues == [], issues
    assert wired is not None
    # PW-C1: webswing removed, _manual_forces_webswing deleted.
    # Manual wired defaults to scanner_mode="demon" (Literal default).
