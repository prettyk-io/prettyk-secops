# -*- coding: utf-8 -*-
"""Action replay chains for state restoration in Playwright SPA Crawler (CRAWL-8)."""
from __future__ import annotations

import logging
import time
from typing import Any, Callable, List, Optional, Sequence, Tuple

from crawler.models import CrawlerAction, ReplayResult
from crawler.state_fingerprint import compute_state_fingerprint

logger = logging.getLogger("orchestrator")


def is_idempotent_action(action: CrawlerAction) -> bool:
    """Check if action is safe to replay without mutating server-side state."""
    if action.action_type == "submit":
        return False
    # Dangerous actions are not idempotent
    if action.dangerous:
        return False
    return True


def replay_action_step(page: Any, action: CrawlerAction, timeout_ms: int = 5000) -> bool:
    """Execute a single action on the page during replay."""
    action_type = action.action_type
    target = action.target
    role = action.candidate.get("role", "")
    
    try:
        if action_type == "click":
            # 1. Try by accessible role + name
            if role in {"button", "link", "tab", "menuitem"}:
                try:
                    page.get_by_role(role, name=target).first.click(timeout=timeout_ms)
                    return True
                except Exception:
                    pass
            # 2. Try generic text
            try:
                page.get_by_text(target).first.click(timeout=timeout_ms)
                return True
            except Exception:
                pass
            # 3. Try locator value from candidate
            cand_val = action.candidate.get("value", "")
            if cand_val:
                try:
                    page.locator(cand_val).first.click(timeout=timeout_ms)
                    return True
                except Exception:
                    pass
            return False

        elif action_type == "fill":
            val = action.value or "crawler-test"
            # 1. Try by label
            try:
                page.get_by_label(target).first.fill(val, timeout=timeout_ms)
                return True
            except Exception:
                pass
            # 2. Try by placeholder
            try:
                page.get_by_placeholder(target).first.fill(val, timeout=timeout_ms)
                return True
            except Exception:
                pass
            # 3. Try locator
            try:
                page.locator(f"input[name='{target}'], input[id='{target}'], textarea[name='{target}']").first.fill(val, timeout=timeout_ms)
                return True
            except Exception:
                pass
            return False

        elif action_type == "navigate":
            target_url = action.candidate.get("value") or target
            page.goto(target_url, timeout=timeout_ms)
            return True

        elif action_type == "scroll":
            page.evaluate("window.scrollBy(0, 500)")
            return True

        return False
    except Exception as exc:
        logger.debug("Replay action failed: %s %s: %s", action_type, target, exc)
        return False


def replay_action_chain(
    page: Any,
    seed_url: str,
    action_chain: Sequence[CrawlerAction],
    expected_fingerprints: Optional[Sequence[str]] = None,
    *,
    settle_ms: int = 500,
    action_timeout_ms: int = 5000,
    max_depth: int = 6,
    state_capture_fn: Optional[Callable[[Any], Tuple[str, list]]] = None,
) -> ReplayResult:
    """
    Play a chain of actions sequentially from seed URL.

    Checks fingerprint after each step.
    If state diverges from expected, returns failure with diverged_step.
    """
    start_time = time.perf_counter()
    
    if len(action_chain) > max_depth:
        return ReplayResult(
            success=False,
            diverged_reason=f"max_replay_depth_exceeded:{len(action_chain)}>{max_depth}",
            duration_ms=int((time.perf_counter() - start_time) * 1000),
            actions_executed=0,
        )

    # 1. Navigate to seed URL
    try:
        page.goto(seed_url, timeout=action_timeout_ms)
        if hasattr(page, "wait_for_timeout"):
            page.wait_for_timeout(settle_ms)
    except Exception as exc:
        return ReplayResult(
            success=False,
            diverged_step=0,
            diverged_reason=f"seed_navigation_failed:{exc}",
            duration_ms=int((time.perf_counter() - start_time) * 1000),
            actions_executed=0,
        )

    # 2. Execute each action sequentially
    actions_done = 0
    for idx, action in enumerate(action_chain):
        # Non-idempotent action check
        if not is_idempotent_action(action):
            return ReplayResult(
                success=False,
                diverged_step=idx,
                diverged_reason=f"non_idempotent_action_skipped:{action.action_type}",
                duration_ms=int((time.perf_counter() - start_time) * 1000),
                actions_executed=actions_done,
            )

        step_ok = replay_action_step(page, action, timeout_ms=action_timeout_ms)
        if not step_ok:
            return ReplayResult(
                success=False,
                diverged_step=idx,
                diverged_reason=f"action_execution_failed:{action.action_type}:{action.target}",
                duration_ms=int((time.perf_counter() - start_time) * 1000),
                actions_executed=actions_done,
            )

        actions_done += 1
        if hasattr(page, "wait_for_timeout"):
            page.wait_for_timeout(settle_ms)

        # Check fingerprint if expected fingerprints provided
        if expected_fingerprints and idx < len(expected_fingerprints):
            expected_fp = expected_fingerprints[idx]
            current_fp = ""
            if state_capture_fn:
                current_fp, _ = state_capture_fn(page)
            else:
                try:
                    ax = page.accessibility.snapshot() if hasattr(page, "accessibility") else None
                    current_fp = compute_state_fingerprint(page.url, ax_nodes=ax.get("children", []) if ax else [])
                except Exception:
                    current_fp = compute_state_fingerprint(page.url)

            if expected_fp and current_fp and current_fp != expected_fp:
                logger.warning(
                    "Replay diverged at step %d (%s %s): expected %s, got %s",
                    idx, action.action_type, action.target, expected_fp, current_fp
                )
                return ReplayResult(
                    success=False,
                    final_state_key=current_fp,
                    expected_state_key=expected_fp,
                    diverged_step=idx,
                    diverged_reason="replay_diverged:fingerprint_mismatch",
                    duration_ms=int((time.perf_counter() - start_time) * 1000),
                    actions_executed=actions_done,
                )

    # All actions completed successfully
    final_fp = ""
    if state_capture_fn:
        final_fp, _ = state_capture_fn(page)
    else:
        try:
            ax = page.accessibility.snapshot() if hasattr(page, "accessibility") else None
            final_fp = compute_state_fingerprint(page.url, ax_nodes=ax.get("children", []) if ax else [])
        except Exception:
            final_fp = compute_state_fingerprint(page.url)

    return ReplayResult(
        success=True,
        final_state_key=final_fp,
        duration_ms=int((time.perf_counter() - start_time) * 1000),
        actions_executed=actions_done,
    )
