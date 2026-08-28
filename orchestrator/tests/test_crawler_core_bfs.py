# -*- coding: utf-8 -*-
"""Unit tests for CRAWL-1: Playwright SPA Crawler Core + BFS Architecture."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crawler.action_discovery import (
    extract_ax_actions,
    is_allowed_origin,
    is_dangerous_action,
    rank_and_cap_actions,
)
from crawler.models import CrawlerAction, CrawlerConfig, CrawlerRunResult, CrawlerState
from crawler.spa_crawler import SPACrawler
from crawler.state_fingerprint import (
    compute_state_fingerprint,
    extract_accessible_digest,
    extract_route,
    normalize_url,
)


class MockFixturePage:
    """
    Mock SPA page fixture simulating a real client-side routed SPA with:
    - /#/ (home with 'Open Modal' button)
    - /#/ (modal open: dialog 'Info Modal')
    - /#/login (login page with email/password and 'Войти')
    - /#/dashboard (dashboard with Tab 1 and Tab 2)
    """

    def __init__(self, base_url: str = "http://fixture.test"):
        self.base_url = base_url
        self.url = f"{base_url}/#/"
        self._title = "Home SPA"
        self._modal_open = False
        self._active_tab = "Tab 1"
        self._listeners: Dict[str, List[Callable]] = {}

    def on(self, event: str, callback: Callable) -> None:
        self._listeners.setdefault(event, []).append(callback)

    def _emit(self, event: str, *args, **kwargs) -> None:
        for cb in self._listeners.get(event, []):
            cb(*args, **kwargs)

    def title(self) -> str:
        if "/#/login" in self.url:
            return "Login - SPA"
        if "/#/dashboard" in self.url:
            return f"Dashboard ({self._active_tab}) - SPA"
        if self._modal_open:
            return "Home (Modal Open) - SPA"
        return "Home - SPA"

    def goto(self, url: str, timeout: int = 5000) -> None:
        self.url = url
        if "/#/" in url and not ("/login" in url or "/dashboard" in url):
            self._modal_open = False

    def wait_for_timeout(self, ms: int) -> None:
        pass

    def wait_for_load_state(self, state: str = "domcontentloaded", timeout: int = 5000) -> None:
        pass

    class accessibility:
        @staticmethod
        def snapshot() -> Dict[str, Any]:
            return {}

    def evaluate(self, script: str) -> Dict[str, Any]:
        """Simulate extraction of DOM metadata based on current state."""
        if "/#/login" in self.url:
            return {
                "headings": ["Авторизация"],
                "dialogs": [],
                "tabs": [],
                "forms": [
                    {"name": "email", "field_type": "email", "tag": "input"},
                    {"name": "password", "field_type": "password", "tag": "input"},
                ],
            }
        elif "/#/dashboard" in self.url:
            return {
                "headings": ["Панель управления"],
                "dialogs": [],
                "tabs": [self._active_tab],
                "forms": [],
            }
        elif self._modal_open:
            return {
                "headings": ["Главная"],
                "dialogs": ["Info Modal"],
                "tabs": [],
                "forms": [],
            }
        else:
            return {
                "headings": ["Главная"],
                "dialogs": [],
                "tabs": [],
                "forms": [{"name": "search", "field_type": "search", "tag": "input"}],
            }

    def get_by_role(self, role: str, name: str = ""):
        mock = MagicMock()
        name_clean = str(name).strip()

        def _click(timeout: int = 5000):
            if "Войти" in name_clean or "Login" in name_clean:
                self.url = f"{self.base_url}/#/login"
            elif "Dashboard" in name_clean:
                self.url = f"{self.base_url}/#/dashboard"
            elif "Home" in name_clean:
                self.url = f"{self.base_url}/#/"
                self._modal_open = False
            elif "Open Modal" in name_clean or "Модалка" in name_clean:
                self._modal_open = True
            elif "Close" in name_clean or "Закрыть" in name_clean:
                self._modal_open = False
            elif "Tab 2" in name_clean:
                self._active_tab = "Tab 2"
            elif "Tab 1" in name_clean:
                self._active_tab = "Tab 1"
            return True

        mock.first.click = _click
        return mock

    def get_by_text(self, text: str):
        return self.get_by_role("button", name=text)

    def get_by_label(self, label: str):
        mock = MagicMock()
        mock.first.fill = lambda val, timeout=5000: True
        return mock

    def get_by_placeholder(self, placeholder: str):
        mock = MagicMock()
        mock.first.fill = lambda val, timeout=5000: True
        return mock

    def locator(self, selector: str):
        mock = MagicMock()
        mock.first.click = lambda timeout=5000: True
        mock.first.fill = lambda val, timeout=5000: True
        mock.first.press = lambda key, timeout=5000: True
        return mock


def test_state_fingerprint_normalization():
    """Route, digest and metadata are normalized properly."""
    r1 = extract_route("http://app.test:3000/#/dashboard?sort=asc&_=12345")
    assert r1 == "#/dashboard"

    r2 = extract_route("http://app.test:3000/api/users")
    assert r2 == "/api/users"

    norm = normalize_url("http://app.test/#/home?utm_source=google&q=search&ts=999")
    assert "utm_source" not in norm
    assert "ts" not in norm
    assert "q=search" in norm

    ax = [
        {"role": "button", "name": "Submit", "disabled": False},
        {"role": "textbox", "name": "Email", "disabled": False},
    ]
    digest = extract_accessible_digest(ax)
    assert len(digest) == 16

    fp1 = compute_state_fingerprint("http://app.test/#/dashboard", route="#/dashboard", tabs=["Tab 1"])
    fp2 = compute_state_fingerprint("http://app.test/#/dashboard", route="#/dashboard", tabs=["Tab 2"])
    assert fp1 != fp2, "Different active tabs must have different state fingerprints"


def test_action_discovery_and_policy_gates():
    """Dangerous actions are blocked by policy; safe actions are ranked."""
    ax_nodes = [
        {"role": "link", "name": "Dashboard", "href": "http://app.test/#/dashboard"},
        {"role": "button", "name": "Open Modal"},
        {"role": "button", "name": "Delete Account"},
        {"role": "button", "name": "Выйти"},
        {"role": "link", "name": "External", "href": "http://evil.external.com/leak"},
        {"role": "textbox", "name": "User Email"},
    ]
    actions = extract_ax_actions(ax_nodes, "http://app.test/#/", ["http://app.test"])
    
    # Check dangerous actions blocked
    delete_act = next(a for a in actions if a.target == "Delete Account")
    assert delete_act.dangerous is True
    assert "dangerous_pattern_match:delete" in delete_act.blocked_reason

    logout_act = next(a for a in actions if a.target == "Выйти")
    assert logout_act.dangerous is True

    external_act = next(a for a in actions if a.target == "External")
    assert external_act.dangerous is True
    assert external_act.blocked_reason == "cross_origin_denied"

    # Ranking
    ranked = rank_and_cap_actions(actions, max_actions=10)
    assert ranked[0].target == "Dashboard"  # Navigation links ranked top
    assert ranked[-1].dangerous is True     # Blocked actions ranked bottom


def test_crawler_bfs_traversal_on_fixture_spa():
    """
    GWT:
      Given: fixture SPA with routes /#/, /#/login, /#/dashboard, modal on /#/, and tabs.
      When: crawler runs with CrawlerConfig(target_url, max_states=50, max_depth=3).
      Then: all three routes visited, modal captured as separate state, tabs switched,
            transitions recorded with (from_state, action, to_state), and budget respected.
    """
    page = MockFixturePage("http://fixture.test")
    
    # Inject synthetic AX nodes per state
    def mock_ax_snapshot():
        if "/#/login" in page.url:
            return {
                "children": [
                    {"role": "textbox", "name": "email"},
                    {"role": "textbox", "name": "password"},
                    {"role": "button", "name": "Войти"},
                    {"role": "link", "name": "Home"},
                ]
            }
        elif "/#/dashboard" in page.url:
            return {
                "children": [
                    {"role": "tab", "name": "Tab 1"},
                    {"role": "tab", "name": "Tab 2"},
                    {"role": "link", "name": "Home"},
                ]
            }
        elif page._modal_open:
            return {
                "children": [
                    {"role": "heading", "name": "Info Modal"},
                    {"role": "button", "name": "Close"},
                ]
            }
        else:
            return {
                "children": [
                    {"role": "link", "name": "Dashboard"},
                    {"role": "link", "name": "Login"},
                    {"role": "button", "name": "Open Modal"},
                ]
            }

    page.accessibility.snapshot = mock_ax_snapshot

    config = CrawlerConfig(
        target_url="http://fixture.test/#/",
        allowed_origins=["http://fixture.test"],
        max_states=50,
        max_depth=3,
        settle_timeout_ms=10,
        action_timeout_ms=100,
        awaken=False,
    )

    crawler = SPACrawler(config)
    result = crawler.crawl(page)

    assert isinstance(result, CrawlerRunResult)
    assert result.state_count >= 4, f"Expected at least 4 distinct states, got {result.state_count}"
    
    # Check routes visited
    routes_visited = {s.route for s in result.states}
    assert "#/" in routes_visited
    assert "#/login" in routes_visited
    assert "#/dashboard" in routes_visited

    # Check modal captured as distinct state
    dialog_states = [s for s in result.states if "Info Modal" in s.dialogs]
    assert len(dialog_states) >= 1, "Modal must be captured as a distinct state"

    # Check transitions
    assert result.transition_count >= 3
    for tr in result.transitions:
        assert tr.from_state_key
        assert tr.to_state_key
        assert tr.action.action_type in {"click", "fill", "navigate", "submit"}

    assert result.stop_reason in {"queue_empty", "budget_exhausted", "completed"}


def test_crawler_max_depth_and_states_budget():
    """Crawler respects max_states and max_depth bounds."""
    page = MockFixturePage("http://fixture.test")
    page.accessibility.snapshot = lambda: {
        "children": [
            {"role": "link", "name": "Dashboard"},
            {"role": "link", "name": "Login"},
            {"role": "button", "name": "Open Modal"},
        ]
    }

    # Tight budget: max_states=2
    config = CrawlerConfig(
        target_url="http://fixture.test/#/",
        max_states=2,
        max_depth=1,
        settle_timeout_ms=5,
        action_timeout_ms=50,
        awaken=False,
    )
    crawler = SPACrawler(config)
    res = crawler.crawl(page)

    assert res.state_count <= 2
    assert res.stop_reason == "budget_exhausted"
