# -*- coding: utf-8 -*-
"""CD-3: service_map — endpoint → страница → инпут."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from corpus.discovery_capture import DiscoveryCorpus, DiscoveryPage, NetworkEntry
from corpus.service_map import ServiceMap, build_service_map

LOGIN_DOM = """
<html><body>
  <form id="login" action="/api/login">
    <input id="email" name="email" type="email" value="a@b.c" />
    <input name="password" type="password" />
  </form>
</body></html>
"""

SEARCH_DOM = """
<html><body>
  <form id="search" action="/search">
    <input id="q" name="q" type="text" />
  </form>
</body></html>
"""


def _corpus():
    return DiscoveryCorpus(
        pages=[
            DiscoveryPage(url="http://x/#/login", title="", dom=LOGIN_DOM),
            DiscoveryPage(url="http://x/#/search", title="", dom=SEARCH_DOM),
        ],
        network=[
            NetworkEntry(
                method="POST",
                url="http://x/api/login",
                status=200,
                request_body='{"email":"a","password":"b"}',
            ),
            NetworkEntry(
                method="GET",
                url="http://x/search?q=hello",
                status=200,
            ),
        ],
    )


def test_build_service_map_endpoints():
    sm = build_service_map(_corpus())
    assert "http://x/api/login" in sm.endpoints
    assert "http://x/search?q=hello" in sm.endpoints


def test_form_action_binding():
    sm = build_service_map(_corpus())
    # login form action → /api/login (резолвится против origin)
    bound = [b for b in sm.bindings if b.location == "form_action"]
    assert len(bound) == 3  # email + password (login) + q (search)
    actions = {b.endpoint for b in bound}
    assert "http://x/api/login" in actions
    assert "http://x/search" in actions


def test_param_name_binding():
    sm = build_service_map(_corpus())
    # email/q совпадают с именами параметров network
    param_bindings = [b for b in sm.bindings if b.location in ("query", "body")]
    names = {(b.endpoint, b.param_name) for b in param_bindings}
    assert ("http://x/api/login", "email") in names
    assert ("http://x/search?q=hello", "q") in names


def test_origin_fallback_edge():
    sm = build_service_map(_corpus())
    # все поля привязаны к страницам, есть edges page→endpoint
    assert len(sm.edges) > 0
    for page in ["http://x/#/login", "http://x/#/search"]:
        assert sm.endpoints_for_page(page)


def test_fields_for_endpoint():
    sm = build_service_map(_corpus())
    login_fields = {f.name for f in sm.fields_for_endpoint("http://x/api/login")}
    assert "email" in login_fields


def test_empty_corpus():
    sm = build_service_map(DiscoveryCorpus())
    assert sm.endpoints == []
    assert sm.edges == []
    assert sm.bindings == []


def test_to_dict_serializable():
    sm = build_service_map(_corpus())
    data = sm.to_dict()
    assert isinstance(data["endpoints"], list)
    assert isinstance(data["edges"], list)
    assert isinstance(data["bindings"], list)
    assert data["bindings"][0]["field"]["name"]
