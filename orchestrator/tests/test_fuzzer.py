# -*- coding: utf-8 -*-
"""CD-7: fuzzer — генератор мутаций RequestTemplate."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from corpus.fuzzer import (
    CorpusFuzzer,
    FuzzerConfig,
    GrepExtractRule,
    GrepMatchRule,
    evaluate_grep_extract,
    evaluate_grep_match,
    make_default_fuzzer,
)
from corpus.corpus_parser import RequestTemplate


def _template(**kwargs):
    defaults = {
        "method": "GET",
        "url": "http://x/api/search?q=hello",
        "query_params": [{"name": "q", "value": "hello"}],
    }
    defaults.update(kwargs)
    return RequestTemplate(**defaults)


def test_generates_count_mutations():
    fuzzer = make_default_fuzzer()
    tpl = _template()
    mutations = fuzzer.generate_mutations(tpl, count=5)
    assert len(mutations) == 5


def test_sniper_substitutes_into_query_param():
    fuzzer = make_default_fuzzer()
    tpl = _template()
    mutations = fuzzer.generate_mutations(tpl, count=10)
    # sniper mode: каждая мутация заменяет значение q на пейлоад
    substituted = [m for m in mutations if any(p["value"] != "hello" for p in m.query_params)]
    assert substituted


def test_marker_replacement():
    fuzzer = make_default_fuzzer()
    tpl = RequestTemplate(
        method="POST",
        url="http://x/api/search?q=\u00a7payload\u00a7",
        query_params=[{"name": "q", "value": "\u00a7payload\u00a7"}],
        body_fields=[{"name": "body_param", "value": "\u00a7payload\u00a7"}],
    )
    mutations = fuzzer.generate_mutations(tpl, count=3)
    assert len(mutations) == 3
    # Ни в одной мутации не осталось маркера
    for m in mutations:
        assert "\u00a7payload\u00a7" not in m.url
        assert all("\u00a7payload\u00a7" not in (p["value"] or "") for p in m.query_params)
        assert all("\u00a7payload\u00a7" not in (p["value"] or "") for p in m.body_fields)


def test_alt_marker_replacement():
    fuzzer = make_default_fuzzer()
    tpl = RequestTemplate(
        method="GET",
        url="http://x/search?q={MASK}",
        query_params=[{"name": "q", "value": "{MASK}"}],
    )
    mutations = fuzzer.generate_mutations(tpl, count=3)
    assert len(mutations) == 3
    for m in mutations:
        assert "{MASK}" not in m.url
        assert all("{MASK}" not in (p["value"] or "") for p in m.query_params)


def test_payloads_include_special_chars():
    fuzzer = make_default_fuzzer()
    all_payloads = fuzzer.payloads
    assert any("<" in p for p in all_payloads)
    assert any("'" in p for p in all_payloads)


def test_payloads_include_precision_attacks():
    fuzzer = make_default_fuzzer()
    all_payloads = fuzzer.payloads
    assert any("OR 1=1" in p for p in all_payloads)
    assert any("alert(1)" in p for p in all_payloads)


def test_all_payload_categories_shape():
    fuzzer = make_default_fuzzer()
    cats = fuzzer.all_payload_categories()
    assert isinstance(cats, dict)
    assert "special_chars" in cats
    assert "boundary_numbers" in cats
    assert "boundary_strings" in cats
    assert "precision_attacks" in cats


def test_zero_count_returns_empty():
    fuzzer = make_default_fuzzer()
    assert fuzzer.generate_mutations(_template(), count=0) == []


def test_post_body_mutation():
    fuzzer = make_default_fuzzer()
    tpl = RequestTemplate(
        method="POST",
        url="http://x/api/login",
        query_params=[],
        body_fields=[
            {"name": "email", "value": "a@b.c"},
            {"name": "password", "value": "secret"},
        ],
    )
    mutations = fuzzer.generate_mutations(tpl, count=5)
    assert len(mutations) >= 1
    # Хотя бы одна мутация меняет body-поле
    has_body_change = any(
        any(
            p["value"] != orig_val
            for p, orig_val in zip(m.body_fields, tpl.body_fields)
        )
        for m in mutations
    )
    assert has_body_change


def test_no_params_adds_fuzz_query():
    fuzzer = make_default_fuzzer()
    tpl = RequestTemplate(
        method="GET",
        url="http://x/empty",
        query_params=[],
        body_fields=[],
    )
    mutations = fuzzer.generate_mutations(tpl, count=3)
    assert len(mutations) == 3
    assert all("fuzz=" in m.url for m in mutations)


def test_config_can_disable_categories():
    cfg = FuzzerConfig(
        include_special_chars=False,
        include_precision_attacks=False,
    )
    fuzzer = CorpusFuzzer(cfg)
    payloads = fuzzer.payloads
    assert not any("<" in p for p in payloads)
    assert not any("OR 1=1" in p for p in payloads)
    # Но boundary всё ещё есть
    assert any(p in payloads for p in ["-1", "0", "A"])


def test_deduplicate_mutations():
    fuzzer = make_default_fuzzer()
    tpl = _template()
    mutations = fuzzer.generate_mutations(tpl, count=20)
    keys = [m.dedupe_key() for m in mutations]
    # sniper по одному полю (q) даёт разные значения → разные query_params в URL
    # проверяем, что нет точных дубликатов всего шаблона
    urls = [(m.method, m.url, str(m.query_params), str(m.body_fields)) for m in mutations]
    assert len(set(urls)) == len(mutations)


# ── INTRUDER-PRO: режимы атаки ──────────────────────────────────────


def _multi_param_template():
    return RequestTemplate(
        method="GET",
        url="http://x/api/search?a=1&b=2",
        query_params=[{"name": "a", "value": "1"}, {"name": "b", "value": "2"}],
        body_fields=[],
    )


def test_battering_ram_applies_single_payload_to_all_positions():
    fuzzer = make_default_fuzzer()
    tpl = _multi_param_template()
    mutations = fuzzer.generate_mutations(tpl, count=4, mode="battering_ram")
    assert len(mutations) == 4
    for m in mutations:
        a_vals = {p["value"] for p in m.query_params if p["name"] == "a"}
        b_vals = {p["value"] for p in m.query_params if p["name"] == "b"}
        # Один пейлоад сразу в обе позиции → значения совпадают
        assert a_vals == b_vals


def test_pitchfork_iterates_parallel_sets():
    fuzzer = make_default_fuzzer()
    tpl = _multi_param_template()
    mutations = fuzzer.generate_mutations(
        tpl, count=3, mode="pitchfork", payload_sets=[["X1", "X2", "X3"], ["Y1", "Y2"]]
    )
    assert len(mutations) == 3
    a_vals = [next(p["value"] for p in m.query_params if p["name"] == "a") for m in mutations]
    b_vals = [next(p["value"] for p in m.query_params if p["name"] == "b") for m in mutations]
    assert a_vals == ["X1", "X2", "X3"]
    assert b_vals == ["Y1", "Y2", "Y2"]  # короткий набор зацикливается на последнем


def test_cluster_bomb_cartesian_product():
    fuzzer = make_default_fuzzer()
    tpl = _multi_param_template()
    mutations = fuzzer.generate_mutations(
        tpl, count=10, mode="cluster_bomb", payload_sets=[["X1", "X2"], ["Y1", "Y2"]]
    )
    # Декартово произведение 2×2 = 4 (лимит count=10 не урезает)
    assert len(mutations) == 4
    combos = {
        (
            next(p["value"] for p in m.query_params if p["name"] == "a"),
            next(p["value"] for p in m.query_params if p["name"] == "b"),
        )
        for m in mutations
    }
    assert combos == {("X1", "Y1"), ("X1", "Y2"), ("X2", "Y1"), ("X2", "Y2")}


def test_cluster_bomb_respects_count_limit():
    fuzzer = make_default_fuzzer()
    tpl = _multi_param_template()
    mutations = fuzzer.generate_mutations(
        tpl, count=2, mode="cluster_bomb", payload_sets=[["A", "B", "C"], ["D", "E", "F"]]
    )
    assert len(mutations) == 2


def test_pitchfork_without_explicit_sets_splits_pool():
    fuzzer = make_default_fuzzer()
    tpl = _multi_param_template()
    mutations = fuzzer.generate_mutations(tpl, count=4, mode="pitchfork")
    # 4 пейлоада делятся на 2 позиции (по 2), pitchfork = max(2,2) = 2 итерации
    assert len(mutations) == 2
    # Каждая мутация должна менять обе позиции
    for m in mutations:
        a_val = next(p["value"] for p in m.query_params if p["name"] == "a")
        b_val = next(p["value"] for p in m.query_params if p["name"] == "b")
        assert a_val != "1"
        assert b_val != "2"


def test_mode_default_stays_sniper():
    fuzzer = make_default_fuzzer()
    tpl = _template()
    # Режим по умолчанию — sniper: count мутаций
    assert len(fuzzer.generate_mutations(tpl, count=5)) == 5


# ── Grep Match & Extract Engine Tests ───────────────────────────────


def test_evaluate_grep_match_substring_and_regex():
    body = "HTTP 500 Internal Error: SQL syntax error near 'admin'"
    rules = [
        GrepMatchRule(key="is_sql", pattern="sql syntax", is_regex=False),
        GrepMatchRule(key="has_500", pattern=r"5\d\d", is_regex=True),
        GrepMatchRule(key="has_xss", pattern="<script>", is_regex=False),
    ]
    res = evaluate_grep_match(body, rules)
    assert res["is_sql"] is True
    assert res["has_500"] is True
    assert res["has_xss"] is False


def test_evaluate_grep_extract_regex_groups():
    body = "Set-Cookie: session_id=abc1234567; Path=/\nSet-Cookie: user_id=999;"
    rules = [
        GrepExtractRule(key="session", pattern=r"session_id=([a-z0-9]+)", group=1),
        GrepExtractRule(key="user", pattern=r"user_id=(\d+)", group=1),
    ]
    res = evaluate_grep_extract(body, rules)
    assert res["session"] == ["abc1234567"]
    assert res["user"] == ["999"]
