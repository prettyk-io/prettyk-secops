# -*- coding: utf-8 -*-
"""Wave B: corpus=auto → location matrix."""
from __future__ import annotations

from core.fuzzing import (
    FuzzLocation,
    classify_fuzz_hole,
    default_corpus_for_hole,
    resolve_corpus_spec,
)


def test_default_corpus_matrix() -> None:
    assert default_corpus_for_hole("query") == "intent_sqli_smoke"
    assert default_corpus_for_hole("body") == "intent_sqli_smoke"
    assert default_corpus_for_hole("path") == "intent_path_smoke"
    assert default_corpus_for_hole("header") == "intent_boundary"
    assert default_corpus_for_hole("cookie") == "intent_boundary"
    assert default_corpus_for_hole("unknown") == "intent_boundary"


def test_resolve_auto_and_explicit() -> None:
    assert resolve_corpus_spec("auto", hole_kind="query") == "intent_sqli_smoke"
    assert resolve_corpus_spec("", hole_kind="path") == "intent_path_smoke"
    assert resolve_corpus_spec("intent_xss_smoke", hole_kind="query") == "intent_xss_smoke"
    assert (
        resolve_corpus_spec("auto,intent_lab_b", hole_kind="query")
        == "intent_sqli_smoke,intent_lab_b"
    )


def test_classify_holes() -> None:
    """header/cookie matrix keys exist but classify never emits them yet (honesty)."""
    q_loc = FuzzLocation(kind="query_param", name="q")
    assert (
        classify_fuzz_hole(
            "http://h/search?q=",
            "GET",
            "",
            q_loc,
        )
        == "query"
    )
    mask = FuzzLocation(kind="mask", name="{MASK}")
    assert (
        classify_fuzz_hole(
            "http://h/api/{MASK}",
            "GET",
            "",
            mask,
        )
        == "path"
    )
    assert (
        classify_fuzz_hole(
            "http://h/login",
            "POST",
            '{"u":"{MASK}"}',
            mask,
        )
        == "body"
    )
    assert (
        classify_fuzz_hole(
            "http://h/search?q={MASK}",
            "GET",
            "",
            mask,
        )
        == "query"
    )
    # Reserved matrix keys — not produced by classifier yet.
    for url, body in (
        ("http://h/", ""),
        ("http://h/{MASK}", ""),
        ("http://h/", '{"a":"{MASK}"}'),
    ):
        kind = classify_fuzz_hole(url, "GET", body, mask)
        assert kind not in ("header", "cookie")
