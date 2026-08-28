# -*- coding: utf-8 -*-
"""Unit tests for CRAWL-5: UI Awakening for orphan forms and fields."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from corpus.corpus_parser import FormField
from corpus.service_map import ServiceMap
from crawler.models import AwakenedEndpoint, CrawlerState, NetworkDeltaEntry
from crawler.ui_awakening import (
    _get_safe_value,
    awaken_orphan_field_ui,
    find_orphan_fields,
    run_ui_awakening,
)


def test_safe_test_values_mapping():
    """Safe test values match specification without leaking secrets."""
    assert _get_safe_value("email", "email") == "awakened@secops.test"
    assert _get_safe_value("user_email", "text") == "awakened@secops.test"
    assert _get_safe_value("password", "password") == "AwakenedP@ss1"
    assert _get_safe_value("q", "search") == "awakened-test-value"
    assert _get_safe_value("item_count", "number") == "42"


def test_find_orphan_fields():
    """Fields not present in network traffic are identified as orphans."""
    f1 = FormField(page_url="http://app.test/", name="q", field_type="search")
    f2 = FormField(page_url="http://app.test/", name="sort", field_type="text")
    f3 = FormField(page_url="http://app.test/", name="category", field_type="text")

    # Network entry only has query param 'sort'
    net = [
        NetworkDeltaEntry(
            method="GET",
            url="http://app.test/api/items?sort=asc",
            status=200,
        )
    ]

    orphans = find_orphan_fields([f1, f2, f3], net)
    orphan_names = {f.name for f in orphans}
    assert "q" in orphan_names
    assert "category" in orphan_names
    assert "sort" not in orphan_names


def test_ui_awakening_observed_endpoint_success():
    """
    GWT:
      Given: search form with <input name="q"> and button "Искать", not yet observed in network.
      When: crawler discovers orphan field q.
      Then: Playwright fills field with safe value -> clicks submit -> network delta is captured
            with GET /api/search?q=awakened-test-value -> provenance=observed and endpoint added to ServiceMap.
    """
    page = MagicMock()
    network_buffer: list[NetworkDeltaEntry] = []

    # Mock locator interactions
    fill_mock = MagicMock()
    page.get_by_label.return_value.first.fill = fill_mock
    page.locator.return_value.first.fill = fill_mock

    def _mock_submit_click(timeout=5000):
        # Simulate network request triggered by UI click
        network_buffer.append(
            NetworkDeltaEntry(
                method="GET",
                url="http://app.test/api/search?q=awakened-test-value",
                status=200,
            )
        )
        return True

    page.get_by_role.return_value.first.click = _mock_submit_click
    page.locator.return_value.first.press = lambda key, timeout=5000: _mock_submit_click()

    field = FormField(
        page_url="http://app.test/search",
        name="q",
        field_type="search",
        label="Поиск",
        selector="input[name='q']",
    )

    state = CrawlerState(
        state_key="state_search_1",
        url="http://app.test/search",
        route="/search",
        forms=[{"name": "q", "field_type": "search", "selector": "input[name='q']"}],
    )

    service_map = ServiceMap()

    results = run_ui_awakening(
        page=page,
        state=state,
        accumulated_network=[],
        service_map=service_map,
        network_collector=network_buffer,
        settle_ms=10,
    )

    assert len(results) == 1
    res = results[0]
    assert res.field_name == "q"
    assert res.provenance == "observed"
    assert res.endpoint_url == "http://app.test/api/search?q=awakened-test-value"
    assert "http://app.test/api/search?q=awakened-test-value" in service_map.endpoints


def test_ui_awakening_fallback_synthetic_candidate():
    """
    GWT:
      Given: form with hidden or disabled submit button.
      When: UI action fails or cannot submit.
      Then: created AwakenedEndpoint with provenance=synthetic_candidate.
    """
    page = MagicMock()
    # Fill throws exception (hidden element)
    page.get_by_label.side_effect = Exception("Element not visible")
    page.get_by_placeholder.side_effect = Exception("Element not visible")
    page.locator.side_effect = Exception("Element not visible")

    field = FormField(
        page_url="http://app.test/hidden",
        name="legacy_param",
        field_type="text",
        form_action="/api/legacy_submit",
    )

    state = CrawlerState(
        state_key="state_hidden_1",
        url="http://app.test/hidden",
        route="/hidden",
        forms=[{"name": "legacy_param", "field_type": "text", "form_action": "/api/legacy_submit"}],
    )

    service_map = ServiceMap()

    results = run_ui_awakening(
        page=page,
        state=state,
        accumulated_network=[],
        service_map=service_map,
        network_collector=[],
        settle_ms=10,
    )

    assert len(results) == 1
    res = results[0]
    assert res.field_name == "legacy_param"
    assert res.provenance == "synthetic_candidate"
    assert "api/legacy_submit" in res.endpoint_url
