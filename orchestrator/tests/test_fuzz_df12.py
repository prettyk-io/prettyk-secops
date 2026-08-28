# -*- coding: utf-8 -*-
"""DF-12: wave_mode sniper / pitchfork / cluster_bomb across targets[]."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from models.wired import Wired
from core.errors import WiredError
from core.fuzzing import (
    SuiteFuzzerRunner,
    matrix_payload_plans,
    resolve_wave_mode,
)


class _FakeStream:
    def get_path(self, name):
        raise KeyError(name)

    def resolve_arg(self, value):
        return value


class _Fakescanner:
    def __init__(self):
        self.calls = []

    def scanner_http_request(
        self, method, url, headers=None, body=None, follow_redirects=False
    ):
        self.calls.append({"method": method, "url": url, "body": body})
        return {"status": 200, "body": "ok"}

    def get_messages(self, context_name=None):
        return []

    def get_alerts(self, context_name=None, risk=None, url=None):
        return []


def _policy(**kwargs):
    base = dict(
        max_requests=25,
        requests_per_second=100.0,
        alert_on_server_error=True,
        latency_multiplier=3.0,
        size_ratio=3.0,
        size_abs_delta=2048,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_resolve_wave_mode_defaults_and_aliases():
    assert resolve_wave_mode(SimpleNamespace(algorithm="triples")) == "sniper"
    assert resolve_wave_mode(SimpleNamespace(algorithm="pitchfork")) == "pitchfork"
    assert resolve_wave_mode(SimpleNamespace(algorithm="cluster-bomb")) == "cluster_bomb"
    assert resolve_wave_mode(SimpleNamespace(wave_mode="cluster_bomb")) == "cluster_bomb"
    with pytest.raises(WiredError):
        resolve_wave_mode(SimpleNamespace(wave_mode="intruder"))


def test_matrix_pitchfork_zips_min_length():
    a = ["a1", "a2", "a3"]
    b = ["b1", "b2"]
    out, stopped = matrix_payload_plans([a, b], mode="pitchfork", max_requests=25)
    assert stopped is None
    assert out == [["a1", "a2"], ["b1", "b2"]]


def test_matrix_cluster_bomb_caps_and_flags():
    a = ["a1", "a2"]
    b = ["b1", "b2", "b3"]
    # product=6, cap=4 → matrix_capped; per-target lengths = 4
    out, stopped = matrix_payload_plans([a, b], mode="cluster_bomb", max_requests=4)
    assert stopped == "matrix_capped"
    assert len(out[0]) == 4
    assert len(out[1]) == 4
    assert out[0][0] == "a1" and out[1][0] == "b1"
    assert out[0][1] == "a1" and out[1][1] == "b2"


def test_suite_sniper_independent_lengths(tmp_path, monkeypatch):
    (tmp_path / "intent_lab_a.txt").write_text("a1\na2\na3\n", encoding="utf-8")
    (tmp_path / "intent_lab_b.txt").write_text("b1\n", encoding="utf-8")
    fuzzer = SimpleNamespace(
        id="df12_sniper",
        algorithm="triples",
        wave_mode="sniper",
        session_replay=False,
        policy=_policy(max_requests=5),
        targets=[
            {
                "url": "http://juice-shop:3000/rest/products/search?q={MASK}",
                "method": "GET",
                "corpus": "intent_lab_a",
            },
            {
                "url": "http://juice-shop:3000/rest/products/search?q={MASK}&d=1",
                "method": "GET",
                "corpus": "intent_lab_b",
            },
        ],
    )
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer]),
        security_configuration=SimpleNamespace(
            base_url_override="http://juice-shop:3000"
        ),
    )
    scanner = _Fakescanner()
    runner = SuiteFuzzerRunner(wired, scanner, _FakeStream())
    monkeypatch.setattr(runner, "INTENT_DIR", tmp_path)
    summary = runner.run("df12_sniper")
    assert summary["wave_mode"] == "sniper"
    # 3 + 1 attacks (+ baselines separately in calls)
    attack_urls = [c["url"] for c in scanner.calls if "q=" in c["url"] and "q=&" not in c["url"]]
    # baselines use empty mask → q= ; attacks have payload
    attacks = [u for u in attack_urls if not u.endswith("q=") and "q=&" not in u]
    # Count non-baseline: url contains lab-a or lab-b payload text
    hits = [u for u in scanner.calls if "lab-" in u["url"] or any(
        x in u["url"] for x in ("a1", "a2", "a3", "b1")
    )]
    # payloads are a1/a2/a3/b1 without lab- prefix in our files
    hits = [
        c["url"]
        for c in scanner.calls
        if any(tok in c["url"] for tok in ("a1", "a2", "a3", "b1"))
    ]
    assert len(hits) == 4  # sniper independent
    assert summary["requests_count"] == 4


def test_suite_pitchfork_aligns_targets(tmp_path, monkeypatch):
    (tmp_path / "intent_lab_a.txt").write_text("a1\na2\na3\n", encoding="utf-8")
    (tmp_path / "intent_lab_b.txt").write_text("b1\nb2\n", encoding="utf-8")
    fuzzer = SimpleNamespace(
        id="df12_pf",
        algorithm="pitchfork",
        session_replay=False,
        policy=_policy(max_requests=10),
        targets=[
            {
                "url": "http://juice-shop:3000/rest/products/search?q={MASK}",
                "method": "GET",
                "corpus": "intent_lab_a",
            },
            {
                "url": "http://juice-shop:3000/api/Quantitys/",
                "method": "GET",
                "corpus": "intent_lab_b",
            },
        ],
    )
    # second target without mask → auto query; use mask in path-ish via query
    fuzzer.targets[1]["url"] = (
        "http://juice-shop:3000/rest/products/search?q={MASK}&side=b"
    )
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer]),
        security_configuration=SimpleNamespace(
            base_url_override="http://juice-shop:3000"
        ),
    )
    scanner = _Fakescanner()
    runner = SuiteFuzzerRunner(wired, scanner, _FakeStream())
    monkeypatch.setattr(runner, "INTENT_DIR", tmp_path)
    summary = runner.run("df12_pf")
    assert summary["wave_mode"] == "pitchfork"
    # min(3,2)=2 per target → 4 attacks
    a_hits = [c for c in scanner.calls if "a1" in c["url"] or "a2" in c["url"] or "a3" in c["url"]]
    b_hits = [c for c in scanner.calls if "side=b" in c["url"] and ("b1" in c["url"] or "b2" in c["url"])]
    assert len(a_hits) == 2
    assert len(b_hits) == 2
    assert "a3" not in "".join(c["url"] for c in scanner.calls)
    assert summary["requests_count"] == 4


def test_suite_cluster_bomb_capped(tmp_path, monkeypatch):
    (tmp_path / "intent_lab_a.txt").write_text("a1\na2\n", encoding="utf-8")
    (tmp_path / "intent_lab_b.txt").write_text("b1\nb2\nb3\n", encoding="utf-8")
    fuzzer = SimpleNamespace(
        id="df12_cb",
        wave_mode="cluster_bomb",
        algorithm="triples",
        session_replay=False,
        policy=_policy(max_requests=4),
        targets=[
            {
                "url": "http://juice-shop:3000/rest/products/search?q={MASK}&t=a",
                "method": "GET",
                "corpus": "intent_lab_a",
            },
            {
                "url": "http://juice-shop:3000/rest/products/search?q={MASK}&t=b",
                "method": "GET",
                "corpus": "intent_lab_b",
            },
        ],
    )
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(fuzzers=[fuzzer]),
        security_configuration=SimpleNamespace(
            base_url_override="http://juice-shop:3000"
        ),
    )
    scanner = _Fakescanner()
    runner = SuiteFuzzerRunner(wired, scanner, _FakeStream())
    monkeypatch.setattr(runner, "INTENT_DIR", tmp_path)
    summary = runner.run("df12_cb")
    assert summary["wave_mode"] == "cluster_bomb"
    assert summary["stopped_reason"] == "matrix_capped"
    assert summary["status"] == "matrix_capped"
    # 4 combos × each target fired once in its campaign → 4+4 attack URLs with t=
    a_hits = [c for c in scanner.calls if "t=a" in c["url"] and "a" in c["url"].split("q=")[-1]]
    # simpler: cases_total per target == 4
    assert summary["target_summaries"][0]["cases_total"] == 4
    assert summary["target_summaries"][1]["cases_total"] == 4
