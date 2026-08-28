# -*- coding: utf-8 -*-
"""CD-1: discovery_capture — DOM + Network граб."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from corpus.discovery_capture import (
    DiscoveryCorpus,
    DiscoveryPage,
    NetworkEntry,
    capture_network,
    capture_page,
    _message_to_entry,
    _parse_request_line,
    _redact_header,
    _split_headers,
)


# ── request-line / headers ──


def test_parse_request_line():
    assert _parse_request_line("GET /path HTTP/1.1\r\nHost: x") == ("GET", "/path")
    assert _parse_request_line("POST /api/x HTTP/1.1") == ("POST", "/api/x")
    assert _parse_request_line("") == ("", "")


def test_split_headers_skips_request_line():
    raw = "POST /api HTTP/1.1\r\nContent-Type: application/json\r\nX-Foo: bar"
    headers = _split_headers(raw)
    assert headers == {"Content-Type": "application/json", "X-Foo": "bar"}


def test_redact_header_sensitive():
    assert _redact_header("Cookie", "session=abc") == "[REDACTED]"
    assert _redact_header("Authorization", "Bearer x") == "[REDACTED]"
    assert _redact_header("X-API-Key", "k") == "[REDACTED]"
    assert _redact_header("Content-Type", "application/json") == "application/json"


# ── message → NetworkEntry ──


def _msg(**overrides):
    base = {
        "method": "POST",
        "url": "http://juice-shop:3000/api/login",
        "requestHeader": "POST /api/login HTTP/1.1\r\nContent-Type: application/json\r\nCookie: s=1",
        "responseHeader": "HTTP/1.1 200 OK\r\nContent-Type: application/json",
        "requestBody": '{"email":"a","password":"b"}',
        "responseBody": '{"token":"t"}',
    }
    base.update(overrides)
    return base


def test_message_to_entry_full():
    entry = _message_to_entry(_msg(), "http://juice-shop:3000")
    assert entry is not None
    assert entry.method == "POST"
    assert entry.url == "http://juice-shop:3000/api/login"
    assert entry.status == 200
    assert entry.request_headers["Content-Type"] == "application/json"
    assert entry.request_headers["Cookie"] == "[REDACTED]"
    assert entry.request_body == '{"email":"a","password":"b"}'
    assert entry.response_body == '{"token":"t"}'


def test_message_to_entry_relative_url_resolved():
    msg = _msg(
        method="GET",
        url="/#/register",
        requestHeader="GET /#/register HTTP/1.1\r\nHost: juice-shop:3000",
        requestBody="",
        responseBody="",
    )
    entry = _message_to_entry(msg, "http://juice-shop:3000/")
    assert entry is not None
    assert entry.url == "http://juice-shop:3000/#/register"


def test_message_to_entry_no_url():
    assert _message_to_entry({"method": "GET"}, "http://x") is None


def test_message_to_entry_skips_non_http_methods():
    # CONNECT не в _CAPTURE_METHODS
    msg = _msg(method="CONNECT", url="http://x/")
    assert _message_to_entry(msg, "http://x") is None


# ── capture_page ──


def test_capture_page_reads_title_and_dom():
    class FakeDriver:
        title = "Juice Shop"
        page_source = "<html><body>hi</body></html>"

    class FakeWd:
        driver = FakeDriver()

    page = capture_page(FakeWd(), "http://juice-shop:3000/#/")
    assert page.url == "http://juice-shop:3000/#/"
    assert page.title == "Juice Shop"
    assert "hi" in page.dom
    assert page.captured_at > 0


# ── capture_network ──


def test_capture_network_empty_without_scanner():
    class Noscanner:
        pass

    assert capture_network(Noscanner()) == []


def test_capture_network_from_get_messages():
    class Fakescanner:
        def get_messages(self, start=None, count=None):
            return [
                _msg(),
                {"method": "GET", "url": "http://juice-shop:3000/"},
            ]

    entries = capture_network(Fakescanner(), base="http://juice-shop:3000")
    assert len(entries) == 2
    assert entries[0].method == "POST"
    assert entries[1].method == "GET"
    assert entries[0].request_headers["Cookie"] == "[REDACTED]"


def test_capture_network_skips_bad_rows():
    class Fakescanner:
        def get_messages(self, start=None, count=None):
            return [{"garbage": True}, _msg()]

    entries = capture_network(Fakescanner(), base="http://juice-shop:3000")
    assert len(entries) == 1


# ── corpus serialize/deserialize ──


def test_corpus_roundtrip_ndjson():
    corpus = DiscoveryCorpus(
        pages=[DiscoveryPage(url="http://x/", title="t", dom="<html/>", captured_at=1.0)],
        network=[
            NetworkEntry(
                method="GET",
                url="http://x/",
                status=200,
                request_headers={"Content-Type": "text/html"},
            )
        ],
    )
    line = corpus.to_ndjson()
    data = json.loads(line)
    assert data["schema_version"] == 1
    assert data["pages"][0]["url"] == "http://x/"

    back = DiscoveryCorpus.from_ndjson(line)
    assert len(back.pages) == 1
    assert back.pages[0].title == "t"
    assert back.network[0].status == 200
