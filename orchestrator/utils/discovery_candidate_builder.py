from __future__ import annotations

from typing import Any, Optional


def _css_escape(value: str) -> str:
    return value.replace('"', '\\"').replace("'", "\\'")


def _escape_attr(value: str) -> str:
    return _css_escape(value)


def _add_candidate(
    candidates: list[dict[str, Any]],
    kind: str,
    value: str,
    tier: str,
    base_score: float,
    unique: bool,
    degraded_score: Optional[float] = None,
) -> None:
    score = base_score if unique else (degraded_score or max(0.1, base_score - 0.3))
    candidates.append(
        {"kind": kind, "value": value, "score": round(score, 2), "tier": tier, "unique": unique}
    )


def build_candidates(
    elements: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    # Count uniqueness once per attribute across all elements
    counts: dict[str, list[str]] = {}
    for attr in ("test_id", "clean_id", "accessible_name", "label_for", "placeholder", "name_attr"):
        counts[attr] = [el.get(attr, "") for el in elements if el.get(attr)]

    def _is_unique(attr: str, value: str) -> bool:
        return counts.get(attr, []).count(value) == 1

    result: list[dict[str, Any]] = []
    for el in elements:
        candidates: list[dict[str, Any]] = []
        test_id = str(el.get("test_id", ""))
        clean_id = str(el.get("clean_id", ""))
        aname = str(el.get("accessible_name", ""))
        role = str(el.get("role", ""))
        label_for = str(el.get("label_for", ""))
        placeholder = str(el.get("placeholder", ""))
        name_attr = str(el.get("name_attr", ""))
        tag = str(el.get("tag", ""))

        if test_id:
            _add_candidate(candidates, "test_id", f'css [data-testid="{_escape_attr(test_id)}"]', "T0", 1.0, _is_unique("test_id", test_id), 0.85)
        if clean_id:
            _add_candidate(candidates, "clean_id", clean_id, "T0", 0.95, _is_unique("clean_id", clean_id), 0.78)
        if aname and role:
            _add_candidate(candidates, "semantic", f'[role="{_css_escape(role)}"][aria-label="{_css_escape(aname)}"]', "T1", 0.85, _is_unique("accessible_name", aname), 0.68)
        if label_for:
            _add_candidate(candidates, "label", f"css #{_css_escape(label_for)}", "T1", 0.82, _is_unique("label_for", label_for), 0.60)
        if placeholder:
            _add_candidate(candidates, "placeholder", f'css [placeholder="{_escape_attr(placeholder)}"]', "T2", 0.70, _is_unique("placeholder", placeholder), 0.55)
        if name_attr:
            _add_candidate(candidates, "name", f'css [name="{_escape_attr(name_attr)}"]', "T2", 0.65, _is_unique("name_attr", name_attr), 0.50)
        if not candidates:
            candidates.append({"kind": "fallback", "value": f"xpath //{tag or '*'}[@id='{clean_id or '?'}']", "score": 0.20, "tier": "T3", "unique": True})

        candidates.sort(key=lambda c: c["score"], reverse=True)
        el["candidates"] = candidates
        result.append(el)
    return result