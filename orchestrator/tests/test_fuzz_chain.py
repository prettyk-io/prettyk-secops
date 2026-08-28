# -*- coding: utf-8 -*-
"""ФаззингЦепи MethodId (after PRE фугас)."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.errors import WiredError
from core.fuzzing import FuzzAdapter
from core.method_id import ensure_wire, lookup_method_id
from models.wired import Wired
from utils.chain_ops import chain_from_har, seed_prettyk_fuzz_chain


def test_method_id_fuzz_chain():
    assert lookup_method_id("ФаззингЦепи") == ("fuzz", "fuzz_chain_module")
    assert ensure_wire("ФаззингЦепи pay") == "fuzz|fuzz_chain_module|pay"
    assert seed_prettyk_fuzz_chain("pay") == "ФаззингЦепи pay"


def test_fuzz_chain_module_prepare_and_wave():
    har = {
        "log": {
            "entries": [
                {
                    "request": {
                        "method": "POST",
                        "url": "https://api.example/login",
                        "headers": [],
                    },
                    "response": {
                        "status": 200,
                        "content": {"text": "{}"},
                    },
                },
                {
                    "request": {
                        "method": "POST",
                        "url": "https://api.example/pay",
                        "headers": [],
                        "postData": {"text": "{}"},
                    },
                    "response": {"status": 200, "content": {"text": "{}"}},
                },
            ]
        }
    }
    built = chain_from_har(har, har_as="pay")
    steps = built["steps"]
    steps[0]["role"] = "precondition"
    steps[1]["role"] = "attack"
    fields = {
        "har_as": "pay",
        "template_har": built["template_har"],
        "steps": steps,
        "slots": [],
        "bindings": {},
        "seed_fuzz_targets": True,
    }
    mod = SimpleNamespace(id="flow_pay", module_type="Цепь", chain_fields=fields)
    fuzzer = SimpleNamespace(
        id="chain_pay",
        targets=[{"url": "https://old", "method": "GET", "corpus": "intent_boundary"}],
        algorithm="sniper",
        policy=SimpleNamespace(max_requests=5, requests_per_second=1.0),
        headers={},
        session_replay=False,
        follow_redirects=True,
        message=None,
    )
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(
            test_data_constructor=[mod],
            fuzzers=[fuzzer],
            imports=[],
        ),
        security_configuration=SimpleNamespace(base_url_override="https://api.example"),
    )

    scanner = SimpleNamespace(_wired_dir=None)
    calls = []

    def fake_prepare(mid):
        calls.append(("prepare", mid))
        return True

    scanner.prepare_chain_module = fake_prepare

    adapter = FuzzAdapter(wired, scanner)
    adapter.bind(SimpleNamespace())

    def fake_wave(fid):
        calls.append(("wave", fid))
        return {"status": "ok", "fuzzer_id": fid}

    adapter.wave = fake_wave  # type: ignore[method-assign]

    out = adapter.fuzz_chain_module("flow_pay")
    assert out["status"] == "ok"
    assert ("prepare", "flow_pay") in calls
    assert ("wave", "chain_pay") in calls
    assert fuzzer.targets[0]["url"] == "https://api.example/pay"
    assert fuzzer.targets[0]["method"] == "POST"


def test_fuzz_chain_missing_fuzzer():
    fields = {
        "har_as": "x",
        "template_har": '{"log":{"entries":[]}}',
        "steps": [
            {"index": 0, "method": "GET", "url": "https://a/1", "role": "attack"}
        ],
        "slots": [],
    }
    # empty template will fail materialize — use minimal valid from chain_from_har
    har = {
        "log": {
            "entries": [
                {
                    "request": {
                        "method": "GET",
                        "url": "https://a/1",
                        "headers": [],
                    },
                    "response": {"status": 200, "content": {"text": "{}"}},
                }
            ]
        }
    }
    built = chain_from_har(har, har_as="x")
    fields = {
        "har_as": "x",
        "template_har": built["template_har"],
        "steps": built["steps"],
        "slots": [],
    }
    mod = SimpleNamespace(id="flow_x", module_type="Цепь", chain_fields=fields)
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(
            test_data_constructor=[mod], fuzzers=[], imports=[]
        )
    )
    adapter = FuzzAdapter(wired, SimpleNamespace(_wired_dir=None))
    adapter.bind(SimpleNamespace())
    try:
        adapter.fuzz_chain_module("flow_x")
        raise AssertionError("expected WiredError")
    except WiredError as exc:
        assert "Fuzzer" in str(exc) or "фаззер" in str(exc).lower()
