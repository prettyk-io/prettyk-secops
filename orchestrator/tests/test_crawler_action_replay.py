# -*- coding: utf-8 -*-
"""Unit tests for CRAWL-8: Action Replay Chains for Fast State Recovery."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from crawler.action_replay import (
    is_idempotent_action,
    replay_action_chain,
    replay_action_step,
)
from crawler.models import CrawlerAction, ReplayResult


def test_is_idempotent_action_classification():
    """Safe read-only actions are idempotent; submits and dangerous actions are not."""
    click_tab = CrawlerAction(action_type="click", target="Tab 1")
    assert is_idempotent_action(click_tab) is True

    fill_search = CrawlerAction(action_type="fill", target="search", value="test")
    assert is_idempotent_action(fill_search) is True

    submit_act = CrawlerAction(action_type="submit", target="form")
    assert is_idempotent_action(submit_act) is False

    delete_act = CrawlerAction(action_type="click", target="Delete", dangerous=True)
    assert is_idempotent_action(delete_act) is False


def test_replay_action_chain_success():
    """
    GWT:
      Given: state /#/dashboard reached via:
             navigate / -> click 'Войти' -> fill email -> fill password -> click 'Вход'.
      When: crawler restores /#/dashboard via replay_action_chain.
      Then: replay executes 5 actions sequentially; intermediate fingerprints match;
            ReplayResult.success=True and final_state_key matches.
    """
    page = MagicMock()
    page.url = "http://app.test/#/dashboard"

    actions = [
        CrawlerAction(action_type="click", target="Войти", candidate={"role": "button"}),
        CrawlerAction(action_type="fill", target="email", value="user@test.io"),
        CrawlerAction(action_type="fill", target="password", value="P@ss123"),
        CrawlerAction(action_type="click", target="Вход", candidate={"role": "button"}),
    ]

    expected_fps = ["fp_step1", "fp_step2", "fp_step3", "fp_step4"]

    # Step simulation mock
    step_count = 0
    def _mock_capture(p):
        nonlocal step_count
        fp = expected_fps[min(step_count, len(expected_fps) - 1)]
        step_count += 1
        return fp, []

    res = replay_action_chain(
        page=page,
        seed_url="http://app.test/#/",
        action_chain=actions,
        expected_fingerprints=expected_fps,
        settle_ms=5,
        action_timeout_ms=100,
        state_capture_fn=_mock_capture,
    )

    assert isinstance(res, ReplayResult)
    assert res.success is True
    assert res.actions_executed == 4
    assert res.final_state_key == "fp_step4"


def test_replay_divergence_detection_mismatch():
    """
    GWT:
      Given: expected fingerprint at step 2 is 'fp_expected', but DOM returns 'fp_diverged'.
      When: replay executes step 2.
      Then: ReplayResult.success=False with diverged_step=2 and diverged_reason='replay_diverged:fingerprint_mismatch'.
    """
    page = MagicMock()
    actions = [
        CrawlerAction(action_type="click", target="Step 1", candidate={"role": "button"}),
        CrawlerAction(action_type="click", target="Step 2", candidate={"role": "button"}),
    ]

    expected_fps = ["fp_step1", "fp_expected_step2"]

    # Simulate divergence at step 2
    step_count = 0
    def _divergent_capture(p):
        nonlocal step_count
        step_count += 1
        if step_count == 1:
            return "fp_step1", []
        return "fp_unexpected_diff", []

    res = replay_action_chain(
        page=page,
        seed_url="http://app.test/#/",
        action_chain=actions,
        expected_fingerprints=expected_fps,
        settle_ms=5,
        action_timeout_ms=100,
        state_capture_fn=_divergent_capture,
    )

    assert res.success is False
    assert res.diverged_step == 1  # 0-indexed: step 2 is index 1
    assert "replay_diverged" in res.diverged_reason
    assert res.expected_state_key == "fp_expected_step2"
    assert res.final_state_key == "fp_unexpected_diff"


def test_replay_depth_limit_enforced():
    """Chains exceeding max_depth are rejected."""
    page = MagicMock()
    actions = [
        CrawlerAction(action_type="click", target=f"Step {i}")
        for i in range(10)
    ]

    res = replay_action_chain(
        page=page,
        seed_url="http://app.test/#/",
        action_chain=actions,
        max_depth=6,
    )

    assert res.success is False
    assert "max_replay_depth_exceeded" in res.diverged_reason
