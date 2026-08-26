# -*- coding: utf-8 -*-
"""DISC-2B/C/D: synthetic label resolve (no browser)."""
from __future__ import annotations

import pytest

from utils.label_resolve import (
    LabelResolveError,
    hits_from_raw,
    pick_label_hit,
)


def _row(**kw):
    base = {
        "key": "1",
        "kind": "label_for",
        "tag": "input",
        "id": "email",
        "name": "email",
        "text": "email",
        "visible": True,
        "enabled": True,
        "in_form": True,
        "near_password": True,
        "suggested_type": "id",
        "suggested_value": "email",
    }
    base.update(kw)
    return base


def test_hits_exact_preferred_over_contains():
    rows = [
        _row(key="a", text="email address", id="a1", suggested_value="a1"),
        _row(key="b", text="email", id="email", suggested_value="email"),
    ]
    hits = hits_from_raw(rows, "Email")
    assert hits
    assert hits[0].suggested_value == "email"
    assert hits[0].text == "email"


def test_pick_hard_rejects_ambiguous():
    rows = [
        _row(key="1", text="log in", id="a", suggested_value="a", score=0),
        _row(key="2", text="log in", id="b", suggested_value="b"),
    ]
    hits = hits_from_raw(rows, "Log in")
    assert len(hits) >= 2
    with pytest.raises(LabelResolveError, match="AMBIGUOUS"):
        pick_label_hit(hits, label="Log in", soft=False)


def test_pick_soft_ambiguous_picks_best():
    rows = [
        _row(
            key="1",
            text="log in",
            id="hidden",
            suggested_value="hidden",
            visible=False,
            enabled=True,
        ),
        _row(
            key="2",
            text="log in",
            id="login",
            suggested_value="login",
            visible=True,
            enabled=True,
            in_form=True,
        ),
    ]
    hits = hits_from_raw(rows, "Log in")
    hit = pick_label_hit(hits, label="Log in", soft=True)
    assert hit.suggested_value == "login"


def test_pick_disabled_raises():
    rows = [
        _row(
            text="submit",
            id="s",
            suggested_value="s",
            visible=True,
            enabled=False,
        )
    ]
    hits = hits_from_raw(rows, "Submit")
    with pytest.raises(LabelResolveError, match="DISABLED"):
        pick_label_hit(hits, label="Submit", soft=True)


def test_pick_miss():
    with pytest.raises(LabelResolveError, match="MISS"):
        pick_label_hit([], label="Nope", soft=True)
