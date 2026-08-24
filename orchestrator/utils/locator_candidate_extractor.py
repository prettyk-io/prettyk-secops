# -*- coding: utf-8 -*-
"""PW-5: LocatorCandidateExtractor — role-first prioritization for Playwright locators.

Priority ladder (T0 → T4):
  T0  getByRole(role, {name: "..."})
  T1  getByLabel("...")
  T2  getByTestId("...")
  T3  CSS: #clean_id, [name="..."], [placeholder="..."]
  T4  XPath fallback

Integrates with Candidate model from models/discovery.py.
Consumed by discovery_pw_recorder.py and discovery_candidate_builder.py.
"""
from __future__ import annotations

from typing import Any


class LocatorCandidate:
    """Single locator suggestion with Priority scoring."""

    __slots__ = ("kind", "value", "score", "unique", "tier")

    def __init__(self, kind: str, value: str, score: float, unique: bool, tier: str):
        self.kind = kind
        self.value = value
        self.score = score
        self.unique = unique
        self.tier = tier

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "value": self.value,
            "score": round(self.score, 2),
            "unique": self.unique,
            "tier": self.tier,
        }


def _css_escape(value: str) -> str:
    return value.replace('"', '\\"').replace("'", "\\'")


def _attr_escape(value: str) -> str:
    return _css_escape(value)


def _pw_quote(value: str) -> str:
    """Quote for Playwright locator string literal — escape inner quotes."""
    if '"' not in value:
        return f'"{value}"'
    if "'" not in value:
        return f"'{value}'"
    escaped = value.replace('"', '\\"')
    return f'"{escaped}"'


# ---------------------------------------------------------------------------
# Tier definitions
# ---------------------------------------------------------------------------

def _t0_role(
    role: str,
    accessible_name: str,
    *,
    unique: bool,
) -> LocatorCandidate | None:
    """getByRole(role, {name: "..."}) — strongest, Playwright-native."""
    if not role or not accessible_name:
        return None
    return LocatorCandidate(
        kind="pw_role",
        value=f'page.getByRole({_pw_quote(role)}, {{name: {_pw_quote(accessible_name)}}})',
        score=1.0 if unique else 0.92,
        unique=unique,
        tier="T0",
    )


def _t1_label(
    label: str,
    *,
    unique: bool,
) -> LocatorCandidate | None:
    """getByLabel("...") — second strongest, maps to <label for="...">."""
    if not label:
        return None
    return LocatorCandidate(
        kind="pw_label",
        value=f"page.getByLabel({_pw_quote(label)})",
        score=0.90 if unique else 0.80,
        unique=unique,
        tier="T1",
    )


def _t1_placeholder(
    placeholder: str,
    *,
    unique: bool,
) -> LocatorCandidate | None:
    """getByPlaceholder("...") — good for inputs without labels."""
    if not placeholder:
        return None
    return LocatorCandidate(
        kind="pw_placeholder",
        value=f"page.getByPlaceholder({_pw_quote(placeholder)})",
        score=0.85 if unique else 0.75,
        unique=unique,
        tier="T1",
    )


def _t2_test_id(
    test_id: str,
    *,
    unique: bool,
) -> LocatorCandidate | None:
    """getByTestId("...") — explicit test attribute."""
    if not test_id:
        return None
    return LocatorCandidate(
        kind="pw_test_id",
        value=f"page.getByTestId({_pw_quote(test_id)})",
        score=0.88 if unique else 0.78,
        unique=unique,
        tier="T2",
    )


def _t3_css_id(
    clean_id: str,
    *,
    unique: bool,
) -> LocatorCandidate | None:
    """CSS #clean_id — stable DOM id."""
    if not clean_id:
        return None
    return LocatorCandidate(
        kind="css_id",
        value=f"page.locator('#{_css_escape(clean_id)}')",
        score=0.82 if unique else 0.68,
        unique=unique,
        tier="T3",
    )


def _t3_css_attribute(
    attr: str,
    value: str,
    *,
    unique: bool,
    kind_label: str = "css",
) -> LocatorCandidate | None:
    """CSS [attr="value"]."""
    if not value:
        return None
    return LocatorCandidate(
        kind=kind_label,
        value=f"page.locator('[{attr}={_pw_quote(_attr_escape(value))}]')",
        score=0.70 if unique else 0.58,
        unique=unique,
        tier="T3",
    )


def _t4_xpath(
    tag: str,
    clean_id: str,
) -> LocatorCandidate:
    """XPath fallback — last resort."""
    xvalue = f"//{tag or '*'}" + (f"[@id='{clean_id}']" if clean_id else "")
    return LocatorCandidate(
        kind="xpath",
        value=f"page.locator('{xvalue}')",
        score=0.20,
        unique=False,
        tier="T4",
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_locator_candidates(
    elements: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build role-first locator candidates for a list of raw elements.

    Each element receives a sorted list of LocatorCandidate entries
    appended as element['candidates_pw'].

    Returns the enriched elements list.
    """
    # Pre-compute uniqueness counts
    all_labels: list[str] = []
    all_placeholders: list[str] = []
    all_test_ids: list[str] = []
    all_clean_ids: list[str] = []
    all_names: list[str] = []
    all_role_names: list[str] = []

    for el in elements:
        role = str(el.get("role", ""))
        aname = str(el.get("accessible_name", ""))
        all_labels.append(str(el.get("label", "")))
        all_placeholders.append(str(el.get("placeholder", "")))
        all_test_ids.append(str(el.get("test_id", "")))
        all_clean_ids.append(str(el.get("clean_id", "")))
        all_names.append(str(el.get("name_attr", "")))
        all_role_names.append(f"{role}|{aname}")

    def _unique(lst: list[str], val: str) -> bool:
        return val and lst.count(val) == 1

    result: list[dict[str, Any]] = []

    for el in elements:
        candidates: list[LocatorCandidate] = []

        role = str(el.get("role", ""))
        aname = str(el.get("accessible_name", ""))
        label = str(el.get("label", ""))
        placeholder = str(el.get("placeholder", ""))
        test_id = str(el.get("test_id", ""))
        clean_id = str(el.get("clean_id", ""))
        name_attr = str(el.get("name_attr", ""))
        tag = str(el.get("tag", ""))

        # ── Build candidates in priority order ──
        _maybe_push(candidates, _t0_role(role, aname, unique=_unique(all_role_names, f"{role}|{aname}")))
        _maybe_push(candidates, _t1_label(label, unique=_unique(all_labels, label)))
        _maybe_push(candidates, _t1_placeholder(placeholder, unique=_unique(all_placeholders, placeholder)))
        _maybe_push(candidates, _t2_test_id(test_id, unique=_unique(all_test_ids, test_id)))
        _maybe_push(candidates, _t3_css_id(clean_id, unique=_unique(all_clean_ids, clean_id)))
        _maybe_push(candidates, _t3_css_attribute("name", name_attr, unique=_unique(all_names, name_attr), kind_label="css_name"))

        # Always add XPath fallback
        candidates.append(_t4_xpath(tag, clean_id))

        # Sort by score descending
        candidates.sort(key=lambda c: c.score, reverse=True)

        # Select best candidate
        best = candidates[0]

        # Merge into element dict
        enriched = dict(el)
        enriched["candidates_pw"] = [c.to_dict() for c in candidates]
        enriched["best_pw"] = best.to_dict()
        enriched["best_selector"] = best.value
        result.append(enriched)

    return result


def best_locator_for(
    elements: list[dict[str, Any]],
    element_index: int = 0,
) -> str:
    """Return the Playwright locator string for the first/best element."""
    enriched = extract_locator_candidates(elements)
    if not enriched or element_index >= len(enriched):
        return ""
    return enriched[element_index].get("best_selector", "")


def best_locator_by_label(
    elements: list[dict[str, Any]],
    label: str,
) -> str:
    """Find element matching a label and return its best Playwright locator."""
    enriched = extract_locator_candidates(elements)
    for el in enriched:
        if str(el.get("label", "")) == label or str(el.get("accessible_name", "")) == label:
            return el.get("best_selector", "")
    return ""


def _maybe_push(lst: list[LocatorCandidate], candidate: LocatorCandidate | None) -> None:
    if candidate is not None:
        lst.append(candidate)