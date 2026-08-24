# -*- coding: utf-8 -*-
"""Wave S: test_suites.fuzzers[] SoT + soft-migrate legacy Фаззер."""
from __future__ import annotations

from pathlib import Path

ORCH = Path(__file__).resolve().parents[1]
FIX = ORCH / "fixtures"


def test_validate_fuzzers_ok():
    from core.wired_validate import validate_wired_file

    issues, wired = validate_wired_file(FIX / "validate_fuzzers_ok.json")
    assert issues == [], issues
    assert wired is not None
    fuzzers = wired.test_suites.fuzzers
    assert len(fuzzers) == 1
    assert fuzzers[0].id == "juice_search_q"
    assert len(fuzzers[0].targets) == 1
    assert fuzzers[0].targets[0].url == "http://example.test/#/search?q=test"
    assert fuzzers[0].targets[0].method == "GET"
    assert fuzzers[0].targets[0].corpus == "intent_boundary"


def test_fuzzer_triples_targets_v2():
    from models.wired import TestSuites

    suites = TestSuites.model_validate(
        {
            "imports": [],
            "pages": {},
            "scenarios": [],
            "fuzzers": [
                {
                    "id": "multi_target_fuzzer",
                    "algorithm": "triples",
                    "policy": {"max_requests": 10, "requests_per_second": 1.0},
                    "targets": [
                        {
                            "url": "http://example.test/api/v1/search?q=1",
                            "method": "GET",
                            "corpus": "intent_boundary",
                        },
                        {
                            "url": "http://example.test/api/v1/login",
                            "method": "POST",
                            "corpus": "intent_sqli_smoke",
                        },
                    ],
                }
            ],
        }
    )
    assert len(suites.fuzzers) == 1
    f = suites.fuzzers[0]
    assert f.id == "multi_target_fuzzer"
    assert f.algorithm == "triples"
    assert len(f.targets) == 2
    assert f.targets[0].method == "GET"
    assert f.targets[1].method == "POST"


def test_legacy_fuzzer_module_soft_migrates_to_fuzzers():
    from models.wired import TestSuites

    suites = TestSuites.model_validate(
        {
            "imports": [],
            "pages": {},
            "scenarios": [],
            "test_data_constructor": [
                {
                    "id": "legacy_search",
                    "module_type": "Фаззер",
                    "label": "Legacy",
                    "fuzzing_fields": {
                        "request": {
                            "method": "GET",
                            "url": "http://example.test/search",
                            "headers": {},
                            "follow_redirects": True,
                        },
                        "injection": {
                            "query_param": "q",
                            "corpus": "intent_sqli_smoke",
                        },
                        "limits": {"max_requests": 3, "requests_per_second": 1.0},
                        "observation": {
                            "alert_on_server_error": True,
                            "latency_multiplier": 3.0,
                        },
                    },
                }
            ],
        }
    )
    assert len(suites.fuzzers) == 1
    assert suites.fuzzers[0].id == "legacy_search"
    assert suites.fuzzers[0].corpus == "intent_sqli_smoke"
    assert suites.fuzzers[0].location.name == "q"
    # Legacy module retained for import compatibility.
    assert len(suites.test_data_constructor) == 1
    assert suites.test_data_constructor[0].module_type == "Фаззер"
