# -*- coding: utf-8 -*-
import time
import pytest
from lab.intruder_engine import (
    IntruderAttackConfig,
    IntruderAttackSession,
    IntruderResultItem,
    apply_encoders,
    apply_processing,
    build_attack_generator,
    extract_markers,
    generate_brute_force,
    generate_payload_set,
    generate_runtime_numbers,
    parse_raw_http_request,
    replace_markers,
    resolve_payload_sets,
    BruteForcerSpec,
    RuntimeNumbersSpec,
)
from corpus.fuzzer import GrepMatchRule, GrepExtractRule


def test_extract_markers():
    raw = "GET /api/user?id=§1§&name=§admin§ HTTP/1.1\nHost: example.com"
    text, markers = extract_markers(raw)
    assert len(markers) == 2
    assert markers[0][2] == "1"
    assert markers[1][2] == "admin"


def test_replace_markers():
    raw = "GET /api/user?id=§1§&name=§admin§ HTTP/1.1"
    res = replace_markers(raw, ["99", "root"])
    assert res == "GET /api/user?id=99&name=root HTTP/1.1"


def test_apply_encoders():
    assert apply_encoders("admin' OR 1=1", ["url"]) == "admin%27%20OR%201%3D1"
    assert apply_encoders("admin", ["base64"]) == "YWRtaW4="
    assert apply_encoders("abc", ["hex"]) == "616263"


def test_parse_raw_http():
    raw = "POST /api/login HTTP/1.1\nHost: test.com\nAuthorization: Bearer xyz\n\nuser=test&pass=123"
    method, url, headers, body = parse_raw_http_request(raw)
    assert method == "POST"
    assert url == "http://test.com/api/login"
    assert headers["Authorization"] == "Bearer xyz"
    assert body == "user=test&pass=123"


def test_sniper_generator():
    raw = "GET /search?q=§test§&page=§1§ HTTP/1.1"
    items = list(build_attack_generator(raw, "sniper", [["payload1", "payload2"]]))
    assert len(items) == 4
    # 2 позиции * 2 пейлоада = 4 запроса
    assert items[0][1] == ["payload1"]
    assert "q=payload1&page=1" in items[0][2]
    assert "q=test&page=payload2" in items[3][2]


def test_pitchfork_generator():
    raw = "GET /check?user=§u§&pass=§p§ HTTP/1.1"
    items = list(build_attack_generator(raw, "pitchfork", [["alice", "bob"], ["123", "456"]]))
    assert len(items) == 2
    assert items[0][1] == ["alice", "123"]
    assert items[1][1] == ["bob", "456"]


def test_cluster_bomb_generator():
    raw = "GET /check?u=§u§&p=§p§ HTTP/1.1"
    items = list(build_attack_generator(raw, "cluster_bomb", [["a", "b"], ["1", "2"]]))
    assert len(items) == 4
    combos = [it[1] for it in items]
    assert ["a", "1"] in combos
    assert ["a", "2"] in combos
    assert ["b", "1"] in combos
    assert ["b", "2"] in combos


# ── Payload Generators ──


def test_runtime_numbers_basic():
    assert generate_runtime_numbers(RuntimeNumbersSpec(start=0, stop=4, step=2)) == ["0", "2", "4"]


def test_runtime_numbers_negative_step():
    assert generate_runtime_numbers(RuntimeNumbersSpec(start=5, stop=0, step=-1)) == ["5", "4", "3", "2", "1", "0"]


def test_runtime_numbers_fmt_index():
    res = generate_runtime_numbers(RuntimeNumbersSpec(start=1, stop=3, step=1, fmt="id={value}#{index}"))
    assert res == ["id=1#1", "id=2#2", "id=3#3"]


def test_runtime_numbers_limit():
    assert len(generate_runtime_numbers(RuntimeNumbersSpec(start=0, stop=100000, step=1), limit=7)) == 7


def test_brute_force_basic():
    res = generate_brute_force(BruteForcerSpec(charset="ab", min_len=1, max_len=2))
    assert res == ["a", "b", "aa", "ab", "ba", "bb"]


def test_brute_force_prefix_suffix():
    res = generate_brute_force(BruteForcerSpec(charset="1", min_len=2, max_len=2, prefix="x", suffix="!"))
    assert res == ["x11!"]


def test_generate_payload_set_kinds():
    assert generate_payload_set("simple", items=["a", "b"]) == ["a", "b"]
    nums = generate_payload_set("numbers", spec={"start": 0, "stop": 2, "step": 1})
    assert nums == ["0", "1", "2"]
    bf = generate_payload_set("bruteforce", spec={"charset": "0", "min_len": 1, "max_len": 2})
    assert bf == ["0", "00"]


def test_resolve_payload_sets_spec_and_legacy():
    sets = resolve_payload_sets([
        ["a", "b"],
        {"kind": "numbers", "spec": {"start": 0, "stop": 1, "step": 1}},
    ])
    assert sets[0] == ["a", "b"]
    assert sets[1] == ["0", "1"]


def test_resolve_payload_sets_processing():
    sets = resolve_payload_sets([["a"]], encoders=["base64"], prefix="p_", suffix="_s")
    # prefix "p_a" → base64, suffix applied after encoding
    assert sets[0] == [__import__("base64").b64encode(b"p_a").decode() + "_s"]


def test_apply_processing_md5():
    assert apply_encoders("admin", ["md5"]) == "21232f297a57a5a743894a0e4a801fc3"
    out = apply_processing("x", prefix="A", suffix="Z", encoders=["hex"])
    # "Ax" → hex("Ax") = "4178", suffix "Z"
    assert out == "4178Z"


# ── Многопоточный воркер ──


def _dummy_execute(self, item_id, payloads, mutated_http):
    return IntruderResultItem(
        id=item_id,
        payloads=payloads,
        position_names=[],
        url="http://x",
        method="GET",
        status=200,
        length=0,
        elapsed_ms=0,
        request_raw=mutated_http,
    )


def test_multithreaded_worker_orders_results(monkeypatch):
    cfg = IntruderAttackConfig(
        attack_id="mt1",
        raw_http="GET /q?a=§x§ HTTP/1.1",
        attack_mode="sniper",
        payload_sets=[["p1", "p2", "p3", "p4"]],
        concurrency=4,
    )
    sess = IntruderAttackSession(cfg)
    monkeypatch.setattr(IntruderAttackSession, "_execute_single", _dummy_execute)
    sess.start()
    sess._thread.join(timeout=5)
    assert not sess.is_running
    assert sess.completed_requests == 4
    ids = [r.id for r in sess.results]
    assert ids == [1, 2, 3, 4]  # строгий порядок item_id


def test_multithreaded_worker_respects_concurrency(monkeypatch):
    active = {"n": 0, "peak": 0}

    def _counting_execute(self, item_id, payloads, mutated_http):
        active["n"] += 1
        active["peak"] = max(active["peak"], active["n"])
        time.sleep(0.01)
        active["n"] -= 1
        return _dummy_execute(self, item_id, payloads, mutated_http)

    cfg = IntruderAttackConfig(
        attack_id="mt2",
        raw_http="GET /q?a=§x§ HTTP/1.1",
        attack_mode="sniper",
        payload_sets=[["p1", "p2", "p3", "p4", "p5", "p6"]],
        concurrency=3,
    )
    sess = IntruderAttackSession(cfg)
    monkeypatch.setattr(IntruderAttackSession, "_execute_single", _counting_execute)
    sess.start()
    sess._thread.join(timeout=10)
    assert active["peak"] <= 3
