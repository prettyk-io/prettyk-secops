# -*- coding: utf-8 -*-
"""S-1 / S-2: storage → fuzz Authorization + redact names in meta/digest."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.fuzzing import SuiteFuzzerRunner, build_audit_digest, session_bound_meta
from core.session_bridge import browser_storage_meta


class _FakeBrowser:
    def __init__(self, local, session=None):
        self._local = local
        self._session = session or []

    def get_local_storage_entries(self):
        return self._local

    def get_session_storage_entries(self):
        return self._session


class _Emptyscanner:
    def get_messages(self):
        return []


def test_suite_wave_storage_replay_fills_authorization():
    token = "storage-jwt-SECRET-x"
    browser = _FakeBrowser([["token", token], ["theme", "dark"]])
    runner = SuiteFuzzerRunner(
        wired=None,
        scanner=_Emptyscanner(),
        stream=None,
        browser=browser,
    )
    headers = runner._apply_session_replay(
        {},
        url_contains="",
        method="GET",
        base_url="http://juice-shop:3000",
    )
    assert headers.get("Authorization") == f"Bearer {token}"
    assert runner._storage_meta is not None
    assert runner._storage_meta["storage_token_key"] == "token"
    blob = json.dumps(runner._storage_meta)
    assert token not in blob


def test_session_bound_and_digest_redact_storage_values():
    token = "leak-me-please-TOKEN"
    storage = browser_storage_meta({"token": token, "lang": "en"})
    meta = session_bound_meta(
        {"Authorization": f"Bearer {token}"},
        storage_meta=storage,
    )
    assert meta["session_bound"] is True
    assert meta["storage_token_key"] == "token"
    assert "token" in meta["storage_key_names"]
    digest = build_audit_digest(
        {
            "run_id": "r1",
            "module_id": "m1",
            "session_bound": True,
            "has_authorization": True,
            "request_header_names": ["Authorization"],
            "has_storage_token": True,
            "storage_token_key": "token",
            "storage_key_names": ["token", "lang"],
            "cases": [],
            "baseline": {},
            "location": {},
            "policy": {},
        }
    )
    packed = json.dumps({"meta": meta, "digest": digest})
    assert token not in packed
    assert digest["storage_token_key"] == "token"
    assert digest["storage_key_names"] == ["token", "lang"]
