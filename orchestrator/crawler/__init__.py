# -*- coding: utf-8 -*-
"""Playwright SPA/State Crawler package (PK-CRAWLER)."""
from __future__ import annotations

from crawler.action_discovery import (
    extract_ax_actions,
    is_allowed_origin,
    is_dangerous_action,
    rank_and_cap_actions,
)
from crawler.action_replay import (
    is_idempotent_action,
    replay_action_chain,
    replay_action_step,
)
from crawler.models import (
    AwakenedEndpoint,
    CrawlerAction,
    CrawlerConfig,
    CrawlerRunResult,
    CrawlerState,
    CrawlerTransition,
    NetworkDeltaEntry,
    PersonaAccessRecord,
    PersonaConfig,
    ReplayResult,
)
from crawler.spa_crawler import SPACrawler
from crawler.state_fingerprint import (
    compute_state_fingerprint,
    extract_accessible_digest,
    extract_route,
    normalize_url,
)
from crawler.ui_awakening import (
    awaken_orphan_field_ui,
    find_orphan_fields,
    run_ui_awakening,
)

__all__ = [
    "SPACrawler",
    "CrawlerConfig",
    "CrawlerState",
    "CrawlerAction",
    "CrawlerTransition",
    "CrawlerRunResult",
    "NetworkDeltaEntry",
    "AwakenedEndpoint",
    "PersonaConfig",
    "PersonaAccessRecord",
    "ReplayResult",
    "compute_state_fingerprint",
    "extract_route",
    "normalize_url",
    "extract_accessible_digest",
    "extract_ax_actions",
    "is_dangerous_action",
    "is_allowed_origin",
    "rank_and_cap_actions",
    "replay_action_step",
    "replay_action_chain",
    "is_idempotent_action",
    "find_orphan_fields",
    "awaken_orphan_field_ui",
    "run_ui_awakening",
]
