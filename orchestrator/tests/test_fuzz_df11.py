# -*- coding: utf-8 -*-
"""DF-11: corpus streaming, numbered masks, multi-corpus pitchfork."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.errors import WiredError
from core.fuzzing import (
    SuiteFuzzerRunner,
    apply_mask_template,
    count_mask_slots,
    iter_corpus_file,
    load_corpus_file,
    parse_corpus_names,
    split_payload_line,
)


class _FakeStream:
    def __init__(self, mapping=None):
        self._mapping = dict(mapping or {})

    def get_path(self, name):
        if name not in self._mapping:
            raise KeyError(name)
        return self._mapping[name]

    def resolve_arg(self, value):
        return value


class _FakeZap:
    def __init__(self):
        self.calls = []

    def zap_http_request(
        self, method, url, headers=None, body=None, follow_redirects=False
    ):
        self.calls.append(
            {
                "method": method,
                "url": url,
                "headers": dict(headers or {}),
                "body": body,
            }
        )
        return {"status": 200, "body": "ok"}

    def get_messages(self, context_name=None):
        return []


def test_iter_corpus_file_stops_at_limit(tmp_path):
    path = tmp_path / "huge.txt"
    # Больше лимита — стрим не должен вычитать всё в list до cap.
    path.write_text("\n".join([f"line-{i}" for i in range(500)] + ["# skip", ""]), encoding="utf-8")
    rows = list(iter_corpus_file(path, limit=3, name="huge"))
    assert rows == ["line-0", "line-1", "line-2"]
    assert load_corpus_file(path, limit=3) == rows


def test_count_mask_slots_numbered_and_bare():
    assert count_mask_slots("") == 1
    assert count_mask_slots("no masks here") == 1
    assert count_mask_slots("q={MASK}") == 1
    assert count_mask_slots("{MASK_1}/{MASK_3}") == 3
    assert count_mask_slots('{"a":"{MASK_1}","b":"{MASK_2}"}') == 2


def test_apply_mask_numbered_vector():
    template = '{"email": "{MASK_1}", "password": "{MASK_2}"}'
    assert count_mask_slots(template) == 2
    out = apply_mask_template(template, ("alice@x", "secret"))
    assert out == '{"email": "alice@x", "password": "secret"}'


def test_apply_mask_str_broadcast_compat():
    template = "{MASK_1}/{MASK_2}"
    assert apply_mask_template(template, "SAME") == "SAME/SAME"


def test_split_payload_line_tab():
    assert split_payload_line("a\tb\tc", slots=2) == ("a", "b")
    assert split_payload_line("only", slots=2) == "only"


def test_parse_corpus_names_pitchfork():
    assert parse_corpus_names("intent_a, intent_b") == ["intent_a", "intent_b"]
    with pytest.raises(WiredError):
        parse_corpus_names("  ,  ")


def test_suite_wave_pitchfork_two_corpora(tmp_path, monkeypatch):
    a = tmp_path / "intent_users.txt"
    b = tmp_path / "intent_passes.txt"
    a.write_text("u1\nu2\n", encoding="utf-8")
    b.write_text("p1\np2\np3\n", encoding="utf-8")

    fuzzer = SimpleNamespace(
        id="pf_login",
        algorithm="triples",
        session_replay=False,
        policy=SimpleNamespace(
            max_requests=5,
            requests_per_second=1.0,
            alert_on_server_error=True,
            latency_multiplier=3.0,
            size_ratio=3.0,
            size_abs_delta=2048,
        ),
        targets=[
            {
                "url": "http://juice-shop:3000/rest/user/login",
                "method": "POST",
                "body": '{"email":"{MASK_1}","password":"{MASK_2}"}',
                "corpus": "intent_users,intent_passes",
            }
        ],
    )
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer]),
        security_configuration=SimpleNamespace(
            base_url_override="http://juice-shop:3000"
        ),
    )
    zap = _FakeZap()
    runner = SuiteFuzzerRunner(Wired, zap, _FakeStream())
    monkeypatch.setattr(runner, "INTENT_DIR", tmp_path)

    summary = runner.run("pf_login")
    # pitchfork zip → 2 удара (min длины), + baseline
    bodies = [c["body"] for c in zap.calls if c["body"] and "email" in str(c["body"])]
    attack_bodies = [b for b in bodies if "u1" in b or "u2" in b]
    assert len(attack_bodies) == 2
    assert '{"email":"u1","password":"p1"}' in attack_bodies
    assert '{"email":"u2","password":"p2"}' in attack_bodies
    assert summary["requests_count"] >= 2


def test_suite_wave_tab_line_single_corpus(tmp_path, monkeypatch):
    corp = tmp_path / "intent_pairs.txt"
    corp.write_text("alice\tsecret1\nbob\tsecret2\n", encoding="utf-8")
    fuzzer = SimpleNamespace(
        id="tab_pairs",
        algorithm="triples",
        session_replay=False,
        policy=SimpleNamespace(
            max_requests=5,
            requests_per_second=1.0,
            alert_on_server_error=True,
            latency_multiplier=3.0,
            size_ratio=3.0,
            size_abs_delta=2048,
        ),
        targets=[
            {
                "url": "http://juice-shop:3000/rest/user/login",
                "method": "POST",
                "body": '{"email":"{MASK_1}","password":"{MASK_2}"}',
                "corpus": "intent_pairs",
            }
        ],
    )
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer]),
        security_configuration=SimpleNamespace(
            base_url_override="http://juice-shop:3000"
        ),
    )
    zap = _FakeZap()
    runner = SuiteFuzzerRunner(Wired, zap, _FakeStream())
    monkeypatch.setattr(runner, "INTENT_DIR", tmp_path)
    runner.run("tab_pairs")
    bodies = [c["body"] for c in zap.calls if c.get("body")]
    assert any("alice" in b and "secret1" in b for b in bodies)
    assert any("bob" in b and "secret2" in b for b in bodies)
