# -*- coding: utf-8 -*-
"""CD-4: awaken — эвристическое пробуждение запросов."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from corpus.awaken import (
    awaken_candidates,
    awaken_to_network_entries,
    summary,
)
from corpus.discovery_capture import DiscoveryCorpus, DiscoveryPage
from corpus.service_map import build_service_map

LOGIN_DOM = """
<html><body>
  <form id="login" action="/api/login">
    <input id="email" name="email" type="email" value="" />
    <input name="password" type="password" />
  </form>
</body></html>
"""

SEARCH_DOM = """
<html><body>
  <form id="search">
    <input id="q" name="q" type="text" />
  </form>
</body></html>
"""

NO_NETWORK_DOM = """
<html><body>
  <form id="signup" action="/api/signup">
    <input name="username" type="text" />
    <input name="age" type="number" />
  </form>
</body></html>
"""


def _corpus_with_orphans():
    """Страницы с полями, но network не покрывает их вызовы."""
    return DiscoveryCorpus(
        pages=[
            DiscoveryPage(url="http://x/#/login", title="", dom=LOGIN_DOM),
            DiscoveryPage(url="http://x/#/search", title="", dom=SEARCH_DOM),
            DiscoveryPage(url="http://x/#/signup", title="", dom=NO_NETWORK_DOM),
        ],
        network=[],  # нет сетевых вызовов вообще → все поля orphans
    )


def test_awaken_finds_orphan_forms():
    sm = build_service_map(_corpus_with_orphans())
    candidates = awaken_candidates(sm, _corpus_with_orphans())
    # signup форма имеет form_action → пробуждается как form_action
    reasons = {c.reason for c in candidates}
    assert "form_action" in reasons


def test_awaken_heuristic_payload_by_type():
    sm = build_service_map(_corpus_with_orphans())
    candidates = awaken_candidates(sm, _corpus_with_orphans())
    # email поле пробуждается с email-значением
    email_cands = [c for c in candidates if c.source_field == "email"]
    assert email_cands
    assert email_cands[0].template.query_params[0]["value"] == "awakened@secops.test"


def test_awaken_number_field_uses_number_payload():
    sm = build_service_map(_corpus_with_orphans())
    candidates = awaken_candidates(sm, _corpus_with_orphans())
    age_cands = [c for c in candidates if c.source_field == "age"]
    assert age_cands
    assert age_cands[0].template.query_params[0]["value"] == "42"


def test_awaken_empty_when_no_orphans():
    # Все поля уже забинжены через network → нет orphans
    from corpus.discovery_capture import NetworkEntry

    corpus = DiscoveryCorpus(
        pages=[
            DiscoveryPage(url="http://x/#/login", title="", dom=LOGIN_DOM),
        ],
        network=[
            NetworkEntry(
                method="POST",
                url="http://x/api/login",
                status=200,
                request_body='{"email":"a","password":"b"}',
            ),
        ],
    )
    sm = build_service_map(corpus)
    candidates = awaken_candidates(sm, corpus)
    # email/password имеют form_action binding → не orphans
    assert all(c.source_field != "password" for c in candidates)


def test_awaken_to_network_entries():
    sm = build_service_map(_corpus_with_orphans())
    candidates = awaken_candidates(sm, _corpus_with_orphans())
    entries = awaken_to_network_entries(candidates)
    assert len(entries) == len(candidates)
    assert all(e.method for e in entries)
    assert all(e.url for e in entries)


def test_summary_shape():
    sm = build_service_map(_corpus_with_orphans())
    candidates = awaken_candidates(sm, _corpus_with_orphans())
    s = summary(candidates)
    assert "total_awakened" in s
    assert "by_reason" in s
    assert "by_page" in s
    assert "endpoints" in s
    assert s["total_awakened"] == len(candidates)
