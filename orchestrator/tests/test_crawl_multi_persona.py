# -*- coding: utf-8 -*-
"""CRAWL-9: Multi-persona crawl — BrowserContext per role, матрица доступности.

GWT:
  anonymous → /, /#/login обойдены, /#/admin → 401;
  admin → все три обойдены; persona_hash разный.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crawler.models import (
    AwakenedEndpoint,
    CrawlerConfig,
    CrawlerRunResult,
    CrawlerState,
    PersonaAccessRecord,
    PersonaConfig,
)
from crawler.spa_crawler import SPACrawler


class TestPersonaAccessRecord:
    def test_to_dict(self):
        r = PersonaAccessRecord(
            persona_name="anonymous",
            persona_hash="abc123",
            url="https://x.com/admin",
            status=401,
            access_result="blocked",
        )
        d = r.to_dict()
        assert d["persona_name"] == "anonymous"
        assert d["access_result"] == "blocked"
        assert d["status"] == 401

    def test_redirected_record(self):
        r = PersonaAccessRecord(
            persona_name="admin",
            persona_hash="def456",
            url="https://x.com/login",
            status=302,
            access_result="redirected",
            redirected_to="https://x.com/dashboard",
        )
        assert r.access_result == "redirected"
        assert r.redirected_to == "https://x.com/dashboard"


class TestRecordPersonaAccess:
    """SPACrawler._record_persona_access сохраняет записи с правильным статусом."""

    def test_no_active_persona_no_record(self):
        config = CrawlerConfig(target_url="https://x.com")
        crawler = SPACrawler(config)
        crawler._record_persona_access("https://x.com", 200)
        assert crawler.access_records == []

    def test_records_with_active_persona(self):
        config = CrawlerConfig(target_url="https://x.com")
        crawler = SPACrawler(config)
        crawler._active_persona = PersonaConfig(name="admin", auth_chain=[])
        crawler._record_persona_access("https://x.com/api", 200)
        assert len(crawler.access_records) == 1
        assert crawler.access_records[0].access_result == "accessible"

    def test_401_is_blocked(self):
        config = CrawlerConfig(target_url="https://x.com")
        crawler = SPACrawler(config)
        crawler._active_persona = PersonaConfig(name="anonymous")
        crawler._record_persona_access("https://x.com/admin", 401)
        assert crawler.access_records[0].access_result == "blocked"

    def test_302_is_redirected(self):
        config = CrawlerConfig(target_url="https://x.com")
        crawler = SPACrawler(config)
        crawler._active_persona = PersonaConfig(name="anonymous")
        crawler._record_persona_access("https://x.com/login", 302, "https://x.com/dashboard")
        assert crawler.access_records[0].access_result == "redirected"

    def test_500_is_accessible_not_blocked(self):
        """5xx — серверная ошибка, не блокировка доступа."""
        config = CrawlerConfig(target_url="https://x.com")
        crawler = SPACrawler(config)
        crawler._active_persona = PersonaConfig(name="admin")
        crawler._record_persona_access("https://x.com/api", 500)
        assert crawler.access_records[0].access_result == "accessible"


class TestBuildAccessMatrix:
    """SPACrawler.build_access_matrix — persona × URL → accessible|blocked|redirected."""

    def test_empty_results(self):
        config = CrawlerConfig(target_url="https://x.com")
        crawler = SPACrawler(config)
        matrix = crawler.build_access_matrix({})
        assert matrix == {}

    def test_single_persona_all_accessible(self):
        config = CrawlerConfig(target_url="https://x.com")
        crawler = SPACrawler(config)

        result = CrawlerRunResult(session_id="s1", target_url="https://x.com")
        result.states = [
            CrawlerState(state_key="a", url="https://x.com/", route="/", depth=0),
            CrawlerState(state_key="b", url="https://x.com/login", route="/login", depth=1),
        ]
        result.access_records = [
            PersonaAccessRecord("admin", "ph1", "https://x.com/", 200, "accessible"),
            PersonaAccessRecord("admin", "ph1", "https://x.com/login", 200, "accessible"),
        ]

        matrix = crawler.build_access_matrix({"admin": result})
        assert matrix["admin"]["https://x.com/"] == "accessible"
        assert matrix["admin"]["https://x.com/login"] == "accessible"

    def test_mixed_access_matrix(self):
        """GWT: anonymous — / и /login accessible, /admin blocked;
        admin — все три accessible."""
        config = CrawlerConfig(
            target_url="https://x.com",
            personas=[
                PersonaConfig(name="anonymous"),
                PersonaConfig(name="admin"),
            ],
        )
        crawler = SPACrawler(config)

        anon_result = CrawlerRunResult(session_id="s_anon", target_url="https://x.com")
        anon_result.states = [
            CrawlerState(state_key="a1", url="https://x.com/", route="/", depth=0),
            CrawlerState(state_key="a2", url="https://x.com/login", route="/login", depth=1),
        ]
        anon_result.access_records = [
            PersonaAccessRecord("anonymous", "ph_anon", "https://x.com/", 200, "accessible"),
            PersonaAccessRecord("anonymous", "ph_anon", "https://x.com/login", 200, "accessible"),
            PersonaAccessRecord("anonymous", "ph_anon", "https://x.com/admin", 401, "blocked"),
        ]

        admin_result = CrawlerRunResult(session_id="s_admin", target_url="https://x.com")
        admin_result.states = [
            CrawlerState(state_key="b1", url="https://x.com/", route="/", depth=0),
            CrawlerState(state_key="b2", url="https://x.com/login", route="/login", depth=1),
            CrawlerState(state_key="b3", url="https://x.com/admin", route="/admin", depth=1),
        ]
        admin_result.access_records = [
            PersonaAccessRecord("admin", "ph_admin", "https://x.com/", 200, "accessible"),
            PersonaAccessRecord("admin", "ph_admin", "https://x.com/login", 200, "accessible"),
            PersonaAccessRecord("admin", "ph_admin", "https://x.com/admin", 200, "accessible"),
        ]

        matrix = crawler.build_access_matrix({"anonymous": anon_result, "admin": admin_result})

        # anonymous
        assert matrix["anonymous"]["https://x.com/"] == "accessible"
        assert matrix["anonymous"]["https://x.com/login"] == "accessible"
        assert matrix["anonymous"]["https://x.com/admin"] == "blocked"

        # admin
        assert matrix["admin"]["https://x.com/"] == "accessible"
        assert matrix["admin"]["https://x.com/login"] == "accessible"
        assert matrix["admin"]["https://x.com/admin"] == "accessible"

    def test_persona_hash_consistent(self):
        """Одинаковые persona дают одинаковый hash."""
        p1 = PersonaConfig(name="admin", auth_chain=["step1", "step2"])
        p2 = PersonaConfig(name="admin", auth_chain=["step1", "step2"])
        assert p1.persona_hash() == p2.persona_hash()
        assert len(p1.persona_hash()) == 12

    def test_persona_hash_different_for_different(self):
        anon = PersonaConfig(name="anonymous")
        admin = PersonaConfig(name="admin")
        user = PersonaConfig(name="authenticated-user", auth_chain=["login"])
        hashes = {anon.persona_hash(), admin.persona_hash(), user.persona_hash()}
        assert len(hashes) == 3, "All three personas should have different hashes"