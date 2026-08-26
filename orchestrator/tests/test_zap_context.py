# -*- coding: utf-8 -*-
from __future__ import annotations

from unittest.mock import MagicMock
from corpus.corpus_parser import RequestTemplate
from corpus.zap_context import build_zap_raw_request, inject_corpus_into_zap


def test_build_zap_raw_request_get() -> None:
    t = RequestTemplate(
        method="GET",
        url="http://127.0.0.1:3000/rest/products/search",
        query_params=[{"name": "q", "value": "apple"}],
    )
    raw = build_zap_raw_request(t, headers_extra={"X-Custom": "test"})
    assert "GET /rest/products/search?q=apple HTTP/1.1" in raw
    assert "Host: 127.0.0.1:3000" in raw
    assert "X-Custom: test" in raw


def test_build_zap_raw_request_post_json() -> None:
    t = RequestTemplate(
        method="POST",
        url="http://target.local/api/login",
        body_fields=[{"name": "email", "value": "admin@test.com"}],
    )
    raw = build_zap_raw_request(t)
    assert "POST /api/login HTTP/1.1" in raw
    assert "Content-Type: application/json" in raw
    assert "Content-Length: " in raw
    assert '"email": "admin@test.com"' in raw


def test_inject_corpus_into_zap() -> None:
    mock_adapter = MagicMock()
    mock_adapter.zap_http_raw_request.return_value = {"status": 200}

    templates = [
        RequestTemplate(method="GET", url="http://127.0.0.1:3000/api/one"),
        RequestTemplate(method="POST", url="http://127.0.0.1:3000/api/two", body_fields=[{"name": "x", "value": "1"}]),
    ]

    stats = inject_corpus_into_zap(
        mock_adapter,
        templates,
        context_name="Default Context",
        send_to_sites_tree=True,
    )

    assert stats["templates_total"] == 2
    assert stats["injected_requests"] == 2
    assert stats["failed_requests"] == 0
    assert stats["context_includes_added"] == 1
    mock_adapter.set_context_include.assert_called_once_with("Default Context", "http://127.0.0.1:3000.*")
    assert mock_adapter.zap_http_raw_request.call_count == 2
