# -*- coding: utf-8 -*-
from __future__ import annotations

from unittest.mock import MagicMock
from corpus.pipeline import run_discovery_pipeline


def test_run_discovery_pipeline() -> None:
    mock_wd = MagicMock()
    mock_wd.get_current_url.return_value = "http://127.0.0.1:3000/#/search"
    mock_wd.get_page_source.return_value = "<html><input name='q' value='apple'/></html>"

    mock_scanner = MagicMock()
    mock_scanner.base_url = "http://127.0.0.1:3000"
    mock_scanner.get_messages.return_value = [
        {
            "requestHeader": "GET http://127.0.0.1:3000/rest/products/search?q=apple HTTP/1.1\r\nHost: 127.0.0.1:3000",
            "requestBody": "",
            "responseHeader": "HTTP/1.1 200 OK",
            "responseBody": '{"data":[]}',
        }
    ]
    mock_scanner.scanner_http_raw_request.return_value = {"status": 200}
    mock_scanner.active_scan.return_value = {"scan_id": "1", "status": "100"}

    result = run_discovery_pipeline(
        mock_wd,
        mock_scanner,
        context_name="Default Context",
        run_active_scan=True,
    )

    assert result["status"] == "success"
    assert "capture" in result["stages"]
    assert "parse" in result["stages"]
    assert "map" in result["stages"]
    assert "inject" in result["stages"]
    assert "active_scan" in result["stages"]
    assert result["corpus_pages"] == 1
    assert result["corpus_network"] == 1
    assert result["injected_requests"] == 1
    assert result["scan_status"] == "completed"
    mock_scanner.active_scan.assert_called_once_with("http://127.0.0.1:3000", context_name="Default Context")
