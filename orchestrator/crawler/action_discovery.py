# -*- coding: utf-8 -*-
"""Action discovery, classification, and ranking for SPA Crawler."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple
from urllib.parse import urlsplit

from crawler.models import CrawlerAction

logger = logging.getLogger("orchestrator")

# Words/phrases indicating destructive or session-terminating actions
_DANGEROUS_PATTERNS = frozenset({
    "logout", "signout", "sign out", "log out", "выйти", "выход",
    "delete", "remove", "destroy", "purge", "удалить", "стереть", "уничтожить",
    "reset account", "delete account", "удалить аккаунт", "сброс",
    "purchase", "buy", "pay", "checkout", "купить", "оплатить", "перевести",
    "transfer", "wire transfer",
    "change password", "сменить пароль", "изменить пароль",
})

# Roles considered primary interactive controls
_INTERACTIVE_ROLES = frozenset({
    "button", "link", "tab", "menuitem", "checkbox", "radio",
    "textbox", "searchbox", "combobox", "spinbutton", "option", "treeitem"
})


def is_dangerous_action(target_name: str, action_type: str = "") -> Tuple[bool, str]:
    """Check if an action target matches the dangerous policy filter."""
    clean = (target_name or "").strip().lower()
    for pattern in _DANGEROUS_PATTERNS:
        if pattern in clean:
            return True, f"dangerous_pattern_match:{pattern}"
    return False, ""


def is_allowed_origin(url: str, allowed_origins: Sequence[str]) -> bool:
    """Check if a URL belongs to the allowed origins list."""
    if not url:
        return False
    # Hash or relative routes are always same-origin
    if url.startswith(("#", "/", "./", "../")) or not urlsplit(url).netloc:
        return True
    parts = urlsplit(url)
    origin = f"{parts.scheme or 'http'}://{parts.netloc}".rstrip("/")
    for allowed in allowed_origins:
        if origin == allowed.rstrip("/"):
            return True
    return False


def extract_ax_actions(
    ax_nodes: Sequence[Dict[str, Any]],
    current_url: str,
    allowed_origins: Sequence[str],
) -> List[CrawlerAction]:
    """Extract candidate crawler actions from accessibility snapshot nodes."""
    actions: List[CrawlerAction] = []
    seen_targets: Set[Tuple[str, str]] = set()

    for node in ax_nodes:
        if not isinstance(node, dict):
            continue
        role = str(node.get("role") or "").strip().lower()
        name = str(node.get("name") or "").strip()
        value = str(node.get("value") or "").strip()
        disabled = bool(node.get("disabled", False))

        if disabled or not role:
            continue

        if role not in _INTERACTIVE_ROLES and not name:
            continue

        # Check for button / link / tab / menuitem clicks
        if role in {"button", "link", "tab", "menuitem", "option"}:
            if not name:
                continue
            dedup_key = ("click", name)
            if dedup_key in seen_targets:
                continue
            seen_targets.add(dedup_key)

            # Check for link href
            href = str(node.get("url") or node.get("href") or "").strip()
            if href and not is_allowed_origin(href, allowed_origins):
                actions.append(
                    CrawlerAction(
                        action_type="navigate",
                        target=name or href,
                        candidate={"kind": "link", "value": href, "role": role},
                        dangerous=True,
                        blocked_reason="cross_origin_denied",
                    )
                )
                continue

            dangerous, reason = is_dangerous_action(name, "click")
            actions.append(
                CrawlerAction(
                    action_type="click",
                    target=name,
                    candidate={"kind": "semantic", "value": name, "role": role},
                    dangerous=dangerous,
                    blocked_reason=reason if dangerous else "",
                )
            )

        # Check for input fields (textbox, searchbox, combobox)
        elif role in {"textbox", "searchbox", "combobox", "spinbutton"}:
            target_name = name or node.get("placeholder") or node.get("id") or "input"
            dedup_key = ("fill", target_name)
            if dedup_key in seen_targets:
                continue
            seen_targets.add(dedup_key)

            val_class = "text"
            safe_val = "crawler-test"
            if "email" in target_name.lower():
                val_class = "email"
                safe_val = "crawler@secops.test"
            elif "search" in target_name.lower() or role == "searchbox":
                val_class = "search"
                safe_val = "crawler-query"
            elif "pass" in target_name.lower():
                val_class = "password"
                safe_val = "CrawlerP@ss1"
            elif role == "spinbutton" or "num" in target_name.lower() or "count" in target_name.lower():
                val_class = "number"
                safe_val = "1"

            dangerous, reason = is_dangerous_action(target_name, "fill")
            actions.append(
                CrawlerAction(
                    action_type="fill",
                    target=target_name,
                    candidate={"kind": "label", "value": target_name, "role": role},
                    value=safe_val,
                    value_class=val_class,
                    dangerous=dangerous,
                    blocked_reason=reason if dangerous else "",
                )
            )

    return actions


def rank_and_cap_actions(
    actions: Sequence[CrawlerAction],
    max_actions: int = 30,
) -> List[CrawlerAction]:
    """
    Rank actions by discovery importance and cap at max_actions.

    Ranking priority:
      1. Navigation links & tabs (highest priority for finding new states)
      2. Dialog & modal triggers
      3. Unblocked buttons
      4. Form inputs (fill)
      5. Other actions
      6. Blocked / dangerous actions (ranked last)
    """
    def _rank_key(action: CrawlerAction) -> int:
        if action.dangerous or action.blocked_reason:
            return 99
        role = action.candidate.get("role", "")
        if action.action_type == "click" and role in {"tab", "link"}:
            return 10
        if "modal" in action.target.lower() or "dialog" in action.target.lower() or "open" in action.target.lower():
            return 15
        if action.action_type == "click" and role == "button":
            return 20
        if action.action_type == "fill":
            return 30
        if action.action_type == "submit":
            return 40
        return 50

    sorted_actions = sorted(actions, key=_rank_key)
    return list(sorted_actions[:max_actions])
