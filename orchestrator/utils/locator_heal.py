# -*- coding: utf-8 -*-
"""
HEAL-A carcass: fingerprint + score candidates (classical, no LLM / no Healenium).

Wire into WebDriver resolve only under failsafe/discovery (HEAL-B).
See docs/research/2026-08-12-epic-locator-heal-prettyk.md.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Mapping, Optional, Sequence


# Lab Pareto: id-rename keeps text/class/parent (~0.59) — 0.6 was too strict.
DEFAULT_SCORE_CAP = 0.55

# Higher weight → stronger match signal (Healenium-like attrs, not their stack).
_WEIGHTS = {
    "tag": 1.0,
    "id": 4.0,
    "name": 3.0,
    "text": 2.5,
    "role": 2.0,
    "aria_label": 2.0,
    "classes": 1.5,
    "parent_tag": 0.8,
}


@dataclass(frozen=True)
class ElementFingerprint:
    """Last-good node profile (lab JSON-serializable)."""

    locator_type: str
    locator_value: str
    tag: str = ""
    id: str = ""
    name: str = ""
    text: str = ""
    role: str = ""
    aria_label: str = ""
    classes: tuple[str, ...] = field(default_factory=tuple)
    parent_tag: str = ""

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["classes"] = list(self.classes)
        return d

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> "ElementFingerprint":
        classes = raw.get("classes") or ()
        if isinstance(classes, str):
            classes = tuple(c for c in classes.split() if c)
        else:
            classes = tuple(str(c) for c in classes if c)
        return cls(
            locator_type=str(raw.get("locator_type") or ""),
            locator_value=str(raw.get("locator_value") or ""),
            tag=str(raw.get("tag") or "").lower(),
            id=str(raw.get("id") or ""),
            name=str(raw.get("name") or ""),
            text=_norm_text(raw.get("text")),
            role=str(raw.get("role") or ""),
            aria_label=str(raw.get("aria_label") or ""),
            classes=classes,
            parent_tag=str(raw.get("parent_tag") or "").lower(),
        )


@dataclass(frozen=True)
class HealCandidate:
    """Synthetic / adapter-facing candidate node."""

    key: str
    tag: str = ""
    id: str = ""
    name: str = ""
    text: str = ""
    role: str = ""
    aria_label: str = ""
    classes: tuple[str, ...] = field(default_factory=tuple)
    parent_tag: str = ""
    suggested_locator_type: str = "css"
    suggested_locator_value: str = ""


@dataclass(frozen=True)
class HealPick:
    candidate: HealCandidate
    score: float
    fingerprint: ElementFingerprint


def _norm_text(raw: Any) -> str:
    return " ".join(str(raw or "").split()).strip().lower()


def _norm_classes(raw: Any) -> tuple[str, ...]:
    if isinstance(raw, str):
        return tuple(sorted({c for c in raw.split() if c}))
    if isinstance(raw, (list, tuple)):
        return tuple(sorted({str(c) for c in raw if c}))
    return ()


def fingerprint_from_attrs(
    *,
    locator_type: str,
    locator_value: str,
    tag: str = "",
    id: str = "",
    name: str = "",
    text: str = "",
    role: str = "",
    aria_label: str = "",
    classes: Any = (),
    parent_tag: str = "",
) -> ElementFingerprint:
    return ElementFingerprint(
        locator_type=locator_type,
        locator_value=locator_value,
        tag=(tag or "").lower(),
        id=id or "",
        name=name or "",
        text=_norm_text(text),
        role=role or "",
        aria_label=aria_label or "",
        classes=_norm_classes(classes),
        parent_tag=(parent_tag or "").lower(),
    )


def score_candidate(fp: ElementFingerprint, cand: HealCandidate) -> float:
    """Weighted overlap in [0, 1]. Only fields present on fingerprint count."""
    numer = 0.0
    denom = 0.0

    def add(field: str, a: str, b: str, *, fuzzy: bool = False) -> None:
        nonlocal numer, denom
        if not a:
            return
        w = _WEIGHTS[field]
        denom += w
        if not b:
            return
        if a == b:
            numer += w
        elif fuzzy and (a in b or b in a):
            numer += w * 0.6

    add("tag", fp.tag, (cand.tag or "").lower())
    add("id", fp.id, cand.id or "")
    add("name", fp.name, cand.name or "")
    add("text", fp.text, _norm_text(cand.text), fuzzy=True)
    add("role", fp.role, cand.role or "")
    add("aria_label", fp.aria_label, cand.aria_label or "", fuzzy=True)
    add("parent_tag", fp.parent_tag, (cand.parent_tag or "").lower())

    if fp.classes:
        w_cls = _WEIGHTS["classes"]
        denom += w_cls
        cset = set(_norm_classes(cand.classes))
        if cset:
            inter = len(set(fp.classes) & cset)
            union = len(set(fp.classes) | cset) or 1
            numer += w_cls * (inter / union)

    if denom <= 0:
        return 0.0
    return max(0.0, min(1.0, numer / denom))


def pick_best_heal(
    fp: ElementFingerprint,
    candidates: Sequence[HealCandidate],
    *,
    score_cap: float = DEFAULT_SCORE_CAP,
) -> Optional[HealPick]:
    best: Optional[HealPick] = None
    for cand in candidates:
        sc = score_candidate(fp, cand)
        if sc < score_cap:
            continue
        if best is None or sc > best.score:
            best = HealPick(candidate=cand, score=sc, fingerprint=fp)
    return best


def pick_by_label_hint(
    label_hint: str,
    candidates: Sequence[HealCandidate],
    *,
    locator_type: str = "label",
    locator_value: str = "",
) -> Optional[HealPick]:
    """
    HEAL-E: exact/contains match on text / aria / name / id (DISC-2 stub).
    Returns synthetic fingerprint for HealPick contract.
    """
    hint = _norm_text(label_hint)
    if not hint:
        return None
    best: Optional[HealCandidate] = None
    best_sc = 0.0
    for cand in candidates:
        blob = " ".join(
            [
                _norm_text(cand.text),
                _norm_text(cand.aria_label),
                _norm_text(cand.name),
                _norm_text(cand.id),
            ]
        )
        if not blob:
            continue
        if hint == _norm_text(cand.text) or hint == _norm_text(cand.aria_label):
            sc = 1.0
        elif hint in blob:
            sc = 0.85
        else:
            continue
        if sc > best_sc:
            best_sc = sc
            best = cand
    if best is None:
        return None
    fp = fingerprint_from_attrs(
        locator_type=locator_type or "label",
        locator_value=locator_value or label_hint,
        tag=best.tag,
        id=best.id,
        name=best.name,
        text=best.text,
        role=best.role,
        aria_label=best.aria_label,
        classes=best.classes,
        parent_tag=best.parent_tag,
    )
    return HealPick(candidate=best, score=best_sc, fingerprint=fp)


def heal_allowed(
    *,
    step_failsafe: bool = False,
    scenario_failsafe: bool = False,
    discovery_mode: bool = False,
    env_flag: bool = False,
) -> bool:
    """CANON gate: never heal on hard-only path."""
    return bool(step_failsafe or scenario_failsafe or discovery_mode or env_flag)


def suggest_locator(cand: HealCandidate) -> tuple[str, str]:
    """Prefer stable attrs for PrettyK rewrite hint."""
    if cand.suggested_locator_type and cand.suggested_locator_value:
        return cand.suggested_locator_type, cand.suggested_locator_value
    if cand.id:
        return "id", cand.id
    if cand.name:
        return "name", cand.name
    if cand.role and cand.text:
        return "css", f'[role="{cand.role}"]'
    if cand.classes:
        return "css", "." + ".".join(cand.classes[:2])
    if cand.tag:
        return "css", cand.tag
    return "css", "*"
