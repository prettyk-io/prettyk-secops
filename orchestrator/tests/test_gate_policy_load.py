# -*- coding: utf-8 -*-
"""QG-AF-12: GatePolicy JSON loader."""
from __future__ import annotations

import json

from core.gate_policy_load import (
    bundle_from_public_dict,
    load_gate_policy_bundle,
    write_gate_policy_bundle,
)


def test_load_lab_default_file():
    bundle = load_gate_policy_bundle()
    assert bundle.admission.max_critical == 0
    assert bundle.admission.max_high == 0
    assert bundle.filter.require_active is True
    assert bundle.source_path


def test_write_and_reload_roundtrip(tmp_path, monkeypatch):
    path = tmp_path / "gate_policy.json"
    monkeypatch.setenv("KDT_GATE_POLICY_PATH", str(path))
    bundle = bundle_from_public_dict(
        {
            "max_critical": 0,
            "max_high": 1,
            "enabled": True,
            "filter": {
                "verified_only": True,
                "min_severity": "high",
                "exclude_tags": ["noise"],
            },
            "waivers": [
                {
                    "title": "Known XSS",
                    "severity": "high",
                    "expires_at": "2099-01-01",
                }
            ],
        }
    )
    write_gate_policy_bundle(bundle, path)
    loaded = load_gate_policy_bundle(path)
    assert loaded.admission.max_high == 1
    assert loaded.filter.verified_only is True
    assert loaded.filter.min_severity == "high"
    assert "noise" in loaded.filter.exclude_tags
    assert len(loaded.waivers) == 1
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["max_high"] == 1
