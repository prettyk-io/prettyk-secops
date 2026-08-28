# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.session_bridge import (
    browser_cookie_meta,
    browser_storage_meta,
    cookie_header_from_jar,
    cookie_names_from_jar,
    http_sessions_snapshot_meta,
    read_http_sessions_snapshot,
    request_headers_from_browser_cookies,
    request_headers_from_browser_storage,
    storage_map_from_entries,
)


def test_cookie_header_from_selenium_jar():
    jar = [
        {"name": "token", "value": "secret-abc", "domain": "juice-shop"},
        {"name": "lang", "value": "en"},
    ]
    assert cookie_header_from_jar(jar) == "token=secret-abc; lang=en"
    assert cookie_header_from_jar(jar, names=["lang"]) == "lang=en"
    assert cookie_header_from_jar([]) == ""
    assert cookie_header_from_jar(None) == ""


def test_cookie_header_last_wins_same_name():
    jar = [
        {"name": "token", "value": "old"},
        {"name": "token", "value": "new"},
    ]
    assert cookie_header_from_jar(jar) == "token=new"


def test_meta_has_names_not_values():
    jar = [{"name": "token", "value": "secret-xyz"}, {"name": "a", "value": "1"}]
    meta = browser_cookie_meta(jar)
    assert meta["has_cookie"] is True
    assert meta["cookie_names"] == ["token", "a"]
    assert meta["cookies_count"] == 2
    blob = json.dumps(meta)
    assert "secret-xyz" not in blob
    assert cookie_names_from_jar(jar) == ["token", "a"]


def test_request_headers_merge_base():
    headers = request_headers_from_browser_cookies(
        [{"name": "sid", "value": "v1"}],
        base_headers={"Accept": "application/json", "Cookie": "stale=1"},
    )
    assert headers["Accept"] == "application/json"
    assert headers["Cookie"] == "sid=v1"


def test_storage_entries_to_headers_bearer():
    local = storage_map_from_entries([["token", "jwt-secret-value"], ["theme", "dark"]])
    headers = request_headers_from_browser_storage(
        local,
        {},
        base_headers={"Accept": "application/json"},
    )
    assert headers["Authorization"] == "Bearer jwt-secret-value"
    assert headers["Accept"] == "application/json"


def test_storage_does_not_override_explicit_authorization():
    headers = request_headers_from_browser_storage(
        {"token": "from-storage"},
        {},
        base_headers={"Authorization": "Bearer from-history"},
    )
    assert headers["Authorization"] == "Bearer from-history"


def test_storage_meta_names_not_values():
    meta = browser_storage_meta(
        [["token", "jwt-secret-value"], ["lang", "ru"]],
        [["nonce", "n1"]],
    )
    assert meta["has_storage_token"] is True
    assert meta["storage_token_key"] == "token"
    assert meta["storage_key_names"] == ["token", "lang", "nonce"]
    blob = json.dumps(meta)
    assert "jwt-secret-value" not in blob
    assert "n1" not in blob


def test_http_sessions_meta_names_not_tokens():
    meta = http_sessions_snapshot_meta(
        {"sites": ["http://juice-shop:3000", "http://other"]},
        {
            "http://juice-shop:3000": {
                "sessions": [
                    {"name": "Session 0", "cookie": "token=LEAK"},
                    {"name": "Session 1"},
                ]
            }
        },
    )
    assert meta["http_sessions_sites_count"] == 2
    assert meta["http_sessions_count"] == 2
    assert "Session 0" in meta["http_session_names"]
    blob = json.dumps(meta)
    assert "LEAK" not in blob
    assert "token=" not in blob


def test_read_http_sessions_snapshot_from_fake_scanner():
    class _scanner:
        def get_sessions_sites(self):
            return ["http://target.local"]

        def get_site_sessions(self, site, session_name=None):
            return [{"name": "auth-session", "token": "SECRET"}]

    meta = read_http_sessions_snapshot(_scanner(), base_url="http://target.local/app")
    assert meta["http_sessions_sites"] == ["http://target.local"]
    assert meta["http_session_names"] == ["auth-session"]
    assert "SECRET" not in json.dumps(meta)
