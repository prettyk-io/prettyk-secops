# -*- coding: utf-8 -*-
"""Playwright SPA/State Crawler Core (CRAWL-1, CRAWL-5, CRAWL-8)."""
from __future__ import annotations

import collections
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from urllib.parse import urlsplit

from corpus.corpus_parser import FormField
from corpus.service_map import ServiceMap
from crawler.action_discovery import extract_ax_actions, is_allowed_origin, rank_and_cap_actions
from crawler.action_replay import replay_action_chain, replay_action_step
from crawler.models import (
    AwakenedEndpoint,
    CrawlerAction,
    CrawlerConfig,
    CrawlerRunResult,
    CrawlerState,
    CrawlerTransition,
    NetworkDeltaEntry,
)
from crawler.state_fingerprint import compute_state_fingerprint, extract_route
from crawler.ui_awakening import run_ui_awakening

logger = logging.getLogger("orchestrator")


@dataclass
class QueueItem:
    url: str
    depth: int
    replay_chain: List[CrawlerAction] = field(default_factory=list)
    expected_fingerprints: List[str] = field(default_factory=list)
    parent_state_key: str = ""


class SPACrawler:
    """
    Playwright-native SPA/State Crawler.

    Traverses application states via BFS, discovers interactive elements,
    executes safe actions, captures state snapshots & transitions,
    and performs UI awakening for orphan forms.
    """

    def __init__(self, config: CrawlerConfig):
        self.config = config
        self.session_id = f"crawl_{int(time.time())}"
        self.visited_states: Dict[str, CrawlerState] = {}
        self.transitions: List[CrawlerTransition] = []
        self.executed_actions: Set[str] = set()
        self.service_map = ServiceMap()
        self.awakened_endpoints: List[AwakenedEndpoint] = []
        self.blocked_actions_count = 0
        self._network_buffer: List[NetworkDeltaEntry] = []
        self._console_errors: List[str] = []
        self._page_errors: List[str] = []

    def _attach_page_listeners(self, page: Any) -> None:
        """Attach network & console listeners to Playwright page."""
        if page is None:
            return

        def _on_request(req) -> None:
            try:
                self._network_buffer.append(
                    NetworkDeltaEntry(
                        method=req.method,
                        url=req.url,
                        resource_type=req.resource_type,
                        request_headers=dict(req.headers),
                        request_body=str(req.post_data or ""),
                        timestamp=time.time(),
                    )
                )
            except Exception:
                pass

        def _on_response(resp) -> None:
            try:
                for entry in reversed(self._network_buffer):
                    if entry.url == resp.url and entry.status is None:
                        entry.status = resp.status
                        entry.response_headers = dict(resp.headers)
                        try:
                            entry.response_body = resp.text()[:2000]
                        except Exception:
                            pass
                        break
            except Exception:
                pass

        def _on_console(msg) -> None:
            try:
                if msg.type in ("error", "warning"):
                    self._console_errors.append(f"[{msg.type}] {msg.text}")
            except Exception:
                pass

        def _on_page_error(err) -> None:
            try:
                self._page_errors.append(str(err))
            except Exception:
                pass

        try:
            page.on("request", _on_request)
            page.on("response", _on_response)
            page.on("console", _on_console)
            page.on("pageerror", _on_page_error)
        except Exception as exc:
            logger.debug("Attach page listeners fallback/skipped: %s", exc)

    def _settle(self, page: Any) -> None:
        """Wait for SPA DOM/network stabilization."""
        if page is None:
            return
        timeout = self.config.settle_timeout_ms
        if hasattr(page, "wait_for_timeout"):
            try:
                page.wait_for_timeout(timeout)
            except Exception:
                pass
        elif hasattr(page, "wait_for_load_state"):
            try:
                page.wait_for_load_state("domcontentloaded", timeout=timeout)
            except Exception:
                pass

    def _extract_dom_metadata(self, page: Any) -> Dict[str, Any]:
        """Extract visible headings, dialogs, active tabs, and form fields via evaluate."""
        if page is None:
            return {"headings": [], "dialogs": [], "tabs": [], "forms": []}
        try:
            res = page.evaluate("""() => {
                const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
                    .map(h => (h.innerText || h.textContent || '').trim())
                    .filter(Boolean);

                const dialogs = Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], .modal, .modal-open'))
                    .map(d => {
                        const title = d.querySelector('h1, h2, h3, h4, .modal-title, [role="heading"]');
                        return title ? (title.innerText || title.textContent || '').trim() : 'dialog';
                    })
                    .filter(Boolean);

                const tabs = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"], [role="tab"].active, .tab.active, .tab-active'))
                    .map(t => (t.innerText || t.textContent || '').trim())
                    .filter(Boolean);

                const forms = Array.from(document.querySelectorAll('input, select, textarea'))
                    .filter(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    })
                    .map(el => {
                        const form = el.closest('form');
                        return {
                            name: el.name || el.id || el.getAttribute('data-testid') || el.placeholder || '',
                            field_type: el.type || el.tagName.toLowerCase(),
                            value: el.value || '',
                            tag: el.tagName.toLowerCase(),
                            form_id: form ? form.id || '' : '',
                            form_action: form ? form.getAttribute('action') || '' : '',
                            label: el.labels && el.labels[0] ? (el.labels[0].innerText || '').trim() : '',
                            selector: el.id ? '#' + el.id : (el.name ? el.tagName.toLowerCase() + "[name='" + el.name + "']" : '')
                        };
                    })
                    .filter(f => Boolean(f.name));

                return { headings, dialogs, tabs, forms };
            }""")
            return res or {"headings": [], "dialogs": [], "tabs": [], "forms": []}
        except Exception:
            return {"headings": [], "dialogs": [], "tabs": [], "forms": []}

    def _capture_state_snapshot(self, page: Any, depth: int, replay_chain: List[CrawlerAction]) -> CrawlerState:
        """Capture full state snapshot from the current page."""
        url = page.url if page else self.config.target_url
        route = extract_route(url)
        title = ""
        ax_nodes: List[Dict[str, Any]] = []

        try:
            title = page.title() if hasattr(page, "title") else ""
        except Exception:
            title = ""

        try:
            if hasattr(page, "accessibility"):
                raw_ax = page.accessibility.snapshot() or {}
                # Flatten tree
                def _walk(node: dict):
                    if not isinstance(node, dict):
                        return
                    ax_nodes.append(node)
                    for child in node.get("children") or []:
                        if isinstance(child, dict):
                            _walk(child)
                _walk(raw_ax)
        except Exception:
            ax_nodes = []

        dom_meta = self._extract_dom_metadata(page)
        headings = dom_meta.get("headings", [])
        dialogs = dom_meta.get("dialogs", [])
        tabs = dom_meta.get("tabs", [])
        forms = dom_meta.get("forms", [])

        state_key = compute_state_fingerprint(
            url=url,
            route=route,
            ax_nodes=ax_nodes,
            headings=headings,
            dialogs=dialogs,
            tabs=tabs,
        )

        return CrawlerState(
            state_key=state_key,
            url=url,
            route=route,
            title=title,
            depth=depth,
            elements=ax_nodes,
            forms=forms,
            headings=headings,
            dialogs=dialogs,
            tabs=tabs,
            network_delta=list(self._network_buffer),
            console_errors=list(self._console_errors),
            page_errors=list(self._page_errors),
            replay_chain=list(replay_chain),
        )

    def crawl(self, page: Any = None) -> CrawlerRunResult:
        """
        Execute the BFS crawl cycle.

        Can accept a live Playwright page or mock fixture page.
        """
        if page is not None:
            self._attach_page_listeners(page)

        queue: collections.deque[QueueItem] = collections.deque()
        queue.append(
            QueueItem(
                url=self.config.target_url,
                depth=0,
                replay_chain=[],
                expected_fingerprints=[],
                parent_state_key="",
            )
        )

        stop_reason = "queue_empty"

        # Initial navigation to seed
        if page is not None:
            try:
                page.goto(self.config.target_url, timeout=self.config.action_timeout_ms)
                self._settle(page)
            except Exception as exc:
                logger.error("Crawler seed navigation failed: %s", exc)
                return CrawlerRunResult(
                    session_id=self.session_id,
                    target_url=self.config.target_url,
                    stop_reason=f"seed_navigation_failed:{exc}",
                )

        while queue:
            # Check max states budget
            if len(self.visited_states) >= self.config.max_states:
                stop_reason = "budget_exhausted"
                break

            item = queue.popleft()

            # Restore state if returning to branch
            if item.replay_chain and page is not None:
                # Replay chain to restore state
                replay_res = replay_action_chain(
                    page,
                    self.config.target_url,
                    item.replay_chain,
                    expected_fingerprints=item.expected_fingerprints,
                    settle_ms=self.config.settle_timeout_ms,
                    action_timeout_ms=self.config.action_timeout_ms,
                    max_depth=self.config.max_replay_depth,
                )
                if not replay_res.success:
                    logger.warning("Replay chain failed, falling back to direct navigation: %s", replay_res.diverged_reason)
                    try:
                        page.goto(item.url, timeout=self.config.action_timeout_ms)
                        self._settle(page)
                    except Exception:
                        continue
            elif page is not None and item.url != page.url:
                try:
                    page.goto(item.url, timeout=self.config.action_timeout_ms)
                    self._settle(page)
                except Exception:
                    continue

            # Capture state snapshot
            snapshot = self._capture_state_snapshot(page, item.depth, item.replay_chain)
            state_key = snapshot.state_key

            # Record state if new
            if state_key not in self.visited_states:
                self.visited_states[state_key] = snapshot
                for entry in snapshot.network_delta:
                    self.service_map.add_endpoint(entry.url)
                    self.service_map.add_edge(snapshot.url, entry.url)

                # UI Awakening if enabled
                if self.config.awaken and snapshot.forms:
                    awakened = run_ui_awakening(
                        page,
                        snapshot,
                        self._network_buffer,
                        self.service_map,
                        network_collector=self._network_buffer,
                        settle_ms=self.config.settle_timeout_ms,
                    )
                    self.awakened_endpoints.extend(awakened)

            # Discover actions from current state
            actions = extract_ax_actions(snapshot.elements, snapshot.url, self.config.allowed_origins)
            ranked_actions = rank_and_cap_actions(actions, self.config.max_actions_per_state)

            for action in ranked_actions:
                # Policy check
                if action.dangerous or action.blocked_reason:
                    self.blocked_actions_count += 1
                    continue

                action_key = action.action_key(state_key)
                if action_key in self.executed_actions:
                    continue
                self.executed_actions.add(action_key)

                # Execute action
                buffer_len_before = len(self._network_buffer)
                action_ok = False
                if page is not None:
                    action_ok = replay_action_step(page, action, timeout_ms=self.config.action_timeout_ms)
                    if action_ok:
                        self._settle(page)

                if not action_ok and page is not None:
                    continue

                # Capture outcome state
                next_replay_chain = list(item.replay_chain) + [action]
                outcome_snapshot = self._capture_state_snapshot(page, item.depth + 1, next_replay_chain)
                to_state_key = outcome_snapshot.state_key

                # Network delta from this action
                new_network = self._network_buffer[buffer_len_before:]

                # Record transition
                transition = CrawlerTransition(
                    from_state_key=state_key,
                    action=action,
                    to_state_key=to_state_key,
                    url_change=outcome_snapshot.route if outcome_snapshot.route != snapshot.route else "",
                    response_class=str(new_network[-1].status) if new_network and new_network[-1].status else "2xx",
                    network_delta=new_network,
                )
                self.transitions.append(transition)

                # If destination state is new and depth budget allows, enqueue it
                if to_state_key not in self.visited_states and item.depth + 1 <= self.config.max_depth:
                    if len(self.visited_states) >= self.config.max_states:
                        stop_reason = "budget_exhausted"
                        break
                    self.visited_states[to_state_key] = outcome_snapshot
                    next_fps = list(item.expected_fingerprints) + [to_state_key]
                    queue.append(
                        QueueItem(
                            url=outcome_snapshot.url,
                            depth=item.depth + 1,
                            replay_chain=next_replay_chain,
                            expected_fingerprints=next_fps,
                            parent_state_key=state_key,
                        )
                    )

                # Restore page back to parent state for next sibling action
                if page is not None and len(ranked_actions) > 1:
                    if item.replay_chain:
                        replay_action_chain(
                            page,
                            self.config.target_url,
                            item.replay_chain,
                            expected_fingerprints=item.expected_fingerprints,
                            settle_ms=self.config.settle_timeout_ms,
                            action_timeout_ms=self.config.action_timeout_ms,
                            max_depth=self.config.max_replay_depth,
                        )
                    else:
                        try:
                            page.goto(item.url, timeout=self.config.action_timeout_ms)
                            self._settle(page)
                        except Exception:
                            pass

        return CrawlerRunResult(
            session_id=self.session_id,
            target_url=self.config.target_url,
            states=list(self.visited_states.values()),
            transitions=self.transitions,
            state_count=len(self.visited_states),
            transition_count=len(self.transitions),
            stop_reason=stop_reason,
            service_map_dict=self.service_map.to_dict(),
            awakened_endpoints=self.awakened_endpoints,
            blocked_actions_count=self.blocked_actions_count,
        )
