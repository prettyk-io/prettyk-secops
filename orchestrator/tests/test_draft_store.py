# -*- coding: utf-8 -*-
"""PK-WB-S1/S2: тесты draft_store (Playground-side draft persistence)."""
from __future__ import annotations

import json

import pytest

import utils.draft_store as store


@pytest.fixture
def tmp_drafts(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DRAFTS_DIR", str(tmp_path))
    return tmp_path


def _payload(check_id: str) -> dict:
    return {
        "wired": {"scenario": check_id},
        "resource_contents": {},
        "meta": {"checkId": check_id, "contentHash": "abc", "savedAt": 1},
    }


class TestDraftStore:
    def test_load_missing_returns_none(self, tmp_drafts):
        assert store.load_draft("no-such-check") is None

    def test_load_draft_exposes_revision_in_meta(self, tmp_drafts):
        # DRAFT-CONFLICT-TRUTH: GET обязан отдавать revision (meta.revision),
        # иначе свежая сессия не адоптит серверную версию → вечный 409.
        store.save_draft("chk-1", _payload("chk-1"), 0)  # rev → 1
        loaded = store.load_draft("chk-1")
        assert loaded is not None
        assert loaded["meta"]["revision"] == 1
        assert loaded["meta"]["checkId"] == "chk-1"  # остальные поля целы

    def test_save_then_load_roundtrip(self, tmp_drafts):
        code, resp = store.save_draft("chk-1", _payload("chk-1"), expected_revision=0)
        assert code == 200
        assert resp["ok"] is True
        assert resp["revision"] == 1

        loaded = store.load_draft("chk-1")
        assert loaded is not None
        assert loaded["meta"]["checkId"] == "chk-1"

    def test_revision_increments(self, tmp_drafts):
        _, r1 = store.save_draft("chk-1", _payload("chk-1"), 0)
        _, r2 = store.save_draft("chk-1", _payload("chk-1"), r1["revision"])
        assert r1["revision"] == 1
        assert r2["revision"] == 2

    def test_conflict_on_stale_revision(self, tmp_drafts):
        store.save_draft("chk-1", _payload("chk-1"), 0)  # rev → 1
        code, resp = store.save_draft("chk-1", _payload("chk-1"), 0)  # expected 0, stale
        assert code == 409
        assert resp["conflict"] is True
        assert resp["revision"] == 1
        assert resp["theirs"] is not None

    def test_delete_existing(self, tmp_drafts):
        store.save_draft("chk-1", _payload("chk-1"), 0)
        assert store.delete_draft("chk-1") is True
        assert store.load_draft("chk-1") is None

    def test_delete_missing(self, tmp_drafts):
        assert store.delete_draft("ghost") is False

    def test_check_id_is_sanitized(self, tmp_drafts):
        # Спецсимволы в check_id не ломают путь
        store.save_draft("a/b\\c:d", _payload("x"), 0)
        assert store.load_draft("a/b\\c:d") is not None


class TestDraftPathMatch:
    def test_match_draft_path(self):
        from tools.data_playground import Handler as _H

        assert _H._match_draft_path("/api/checks/abc-1/draft") == "abc-1"
        assert _H._match_draft_path("/api/checks/abc-1") is None
        assert _H._match_draft_path("/api/checks") is None
        assert _H._match_draft_path("/api/checks/a/b/c/draft") is None
