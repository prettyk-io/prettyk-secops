# -*- coding: utf-8 -*-
"""CRAWL-7: Fuzzer handoff — фильтр provenance + передача в CorpusFuzzer.

GWT:
  7 observed + 3 synthetic_candidate + 1 operator_approved
  → fuzzable_endpoints() = 8 (7 observed + 1 approved)
  → synthetic_candidates() = 3
  → handoff_to_fuzzer() получает 8 endpoint'ов, генерит мутации
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crawler.models import AwakenedEndpoint, CrawlerRunResult


def _observed(**kw) -> AwakenedEndpoint:
    return AwakenedEndpoint(field_name=kw.pop("name", "q"), page_url="/search", provenance="observed", **kw)


def _synthetic(**kw) -> AwakenedEndpoint:
    return AwakenedEndpoint(field_name=kw.pop("name", "comment"), page_url="/post", provenance="synthetic_candidate", **kw)


def _approved(endpoint_url: str = "https://api.test/v1/users", **kw) -> AwakenedEndpoint:
    return AwakenedEndpoint(
        field_name=kw.pop("name", "user_id"),
        page_url="/admin",
        provenance="operator_approved",
        endpoint_url=endpoint_url,
        method="POST",
        request_payload={"id": "42"},
        **kw,
    )


class TestFuzzableFiltering:
    """Фильтрация по provenance: observed + operator_approved → фаззер;
    synthetic_candidate — ждёт ручного approve."""

    def test_empty_result_has_no_fuzzable(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        assert r.fuzzable_endpoints() == []
        assert r.synthetic_candidates() == []

    def test_observed_is_fuzzable(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = [_observed(endpoint_url="https://x.com/api")]
        assert len(r.fuzzable_endpoints()) == 1
        assert r.fuzzable_endpoints()[0].provenance == "observed"

    def test_synthetic_is_not_fuzzable(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = [_synthetic(endpoint_url="")]
        assert r.fuzzable_endpoints() == []
        assert len(r.synthetic_candidates()) == 1

    def test_operator_approved_is_fuzzable(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = [_approved()]
        assert len(r.fuzzable_endpoints()) == 1
        assert r.fuzzable_endpoints()[0].provenance == "operator_approved"

    def test_mixed_provenance_gwt(self):
        """GWT: 7 observed + 3 synthetic + 1 approved → fuzzable = 8, synthetic = 3."""
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = (
            [_observed(endpoint_url=f"https://x.com/api/{i}") for i in range(7)]
            + [_synthetic() for _ in range(3)]
            + [_approved()]
        )
        assert len(r.fuzzable_endpoints()) == 8  # 7 observed + 1 approved
        assert len(r.synthetic_candidates()) == 3


class TestHandoffToFuzzer:
    """Передача fuzzable endpoints в CorpusFuzzer через handoff_to_fuzzer()."""

    def test_empty_handoff_returns_empty(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        mutations, count = r.handoff_to_fuzzer(count=10)
        assert mutations == []
        assert count == 0

    def test_observed_generates_mutations(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = [
            _observed(
                endpoint_url="https://x.com/search?q=test",
                method="GET",
                request_payload={"q": "test"},
            )
        ]
        mutations, count = r.handoff_to_fuzzer(count=10, mode="sniper")
        assert count == 1
        assert len(mutations) > 0, "sniper mode must produce mutations for a GET with query param"

    def test_synthetic_not_in_handoff(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = [
            _synthetic(endpoint_url="https://x.com/hidden"),
            _observed(endpoint_url="https://x.com/visible"),
        ]
        mutations, count = r.handoff_to_fuzzer(count=5)
        assert count == 1  # только observed
        assert len(mutations) > 0

    def test_approved_joins_observed_in_handoff(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = [
            _observed(endpoint_url="https://x.com/api/1?q=test"),
            _approved(endpoint_url="https://x.com/api/2?q=test"),
            _synthetic(),
        ]
        mutations, count = r.handoff_to_fuzzer(count=5)
        assert count == 2  # observed + approved
        assert len(mutations) > 0

    def test_endpoint_without_url_skipped(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = [
            _observed(endpoint_url=""),  # без URL — будет пропущен
            _observed(endpoint_url="https://x.com/api?q=ok"),
        ]
        mutations, count = r.handoff_to_fuzzer(count=5)
        assert count == 1
        assert len(mutations) > 0

    def test_post_with_body_fields_generates_mutations(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = [
            _observed(
                endpoint_url="https://x.com/api/login",
                method="POST",
                request_payload={"user": "admin", "pass": "test"},
            )
        ]
        mutations, count = r.handoff_to_fuzzer(count=10, mode="sniper")
        assert count == 1
        assert len(mutations) > 0, "POST with body fields must produce sniper mutations"

    def test_query_params_parsed_from_url(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = [
            _observed(endpoint_url="https://x.com/api?page=1&limit=10", method="GET")
        ]
        mutations, count = r.handoff_to_fuzzer(count=5)
        assert count == 1
        assert len(mutations) > 0


class TestToDictProvenanceGroups:
    """to_dict() разделяет awakened по трём группам provenance."""

    def test_all_three_groups_present(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = [
            _observed(endpoint_url="https://x.com/o"),
            _synthetic(),
            _approved(),
        ]
        d = r.to_dict()
        aw = d["awaken"]
        assert len(aw["observed"]) == 1
        assert len(aw["synthetic_candidates"]) == 1
        assert len(aw["operator_approved"]) == 1

    def test_no_empty_groups_if_none(self):
        r = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        r.awakened_endpoints = [_observed(endpoint_url="https://x.com/o")]
        d = r.to_dict()
        aw = d["awaken"]
        assert len(aw["observed"]) == 1  # один observed на месте
        assert aw["synthetic_candidates"] == []  # synthetic нет
        assert aw["operator_approved"] == []     # approved нет
        # schema_version и лимиты на месте
        assert d["limits"]["stop_reason"] == "completed"


class TestPersonaConfigHash:
    """PersonaConfig.persona_hash() — детерминированный,
    разный для разных ролей."""

    def test_same_name_same_hash(self):
        from crawler.models import PersonaConfig
        p1 = PersonaConfig(name="admin")
        p2 = PersonaConfig(name="admin")
        assert p1.persona_hash() == p2.persona_hash()

    def test_different_name_different_hash(self):
        from crawler.models import PersonaConfig
        anon = PersonaConfig(name="anonymous")
        admin = PersonaConfig(name="admin")
        assert anon.persona_hash() != admin.persona_hash()

    def test_hash_length_is_12(self):
        from crawler.models import PersonaConfig
        p = PersonaConfig(name="authenticated-user", auth_chain=["ПрименитьAuth", "BrowserAuth"])
        h = p.persona_hash()
        assert len(h) == 12