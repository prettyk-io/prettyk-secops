# -*- coding: utf-8 -*-
"""Discovery Engine — IR schema (Pydantic).

Discovery IR (run artifact) != wired.json (executable source).
Сырые evidence, candidate-селекторы, AX-деревья, fingerprints, история ревизий.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


class PersonaContext(BaseModel):
    auth_subject_kind: str = "anonymous"
    granted_capabilities: list[str] = Field(default_factory=list)
    feature_flags: list[str] = Field(default_factory=list)
    locale: str = "ru-RU"
    viewport_profile: str = "desktop"


class ElementFingerprint(BaseModel):
    tag: str = ""
    role: str = ""
    name: str = ""


class Candidate(BaseModel):
    kind: str = ""  # test_id, clean_id, semantic, label, placeholder, name, xpath
    value: str = ""
    score: float = 0.0
    unique: bool = True
    tier: str = "T3"  # T0, T1, T2, T3


class DiscoveryElement(BaseModel):
    semantic_name: str = ""
    fingerprint: ElementFingerprint = Field(default_factory=ElementFingerprint)
    candidates: list[Candidate] = Field(default_factory=list)
    value_class: str = "unknown"


class Evidence(BaseModel):
    screenshot_ref: str = ""
    ax_tree_ref: str = ""
    wireframe_svg_ref: str = ""


class Expansion(BaseModel):
    trigger: str = ""
    added_elements: list[str] = Field(default_factory=list)
    remains_same_variant: bool = True


class StateRevision(BaseModel):
    revision_id: str = ""
    parent_revision_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    ax_hash: str = ""
    fingerprint: dict = Field(default_factory=dict)
    elements: list[DiscoveryElement] = Field(default_factory=list)
    evidence: Evidence = Field(default_factory=Evidence)


class StateVariant(BaseModel):
    variant_id: str = ""
    variant_key: str = ""
    description: str = ""
    revisions: list[StateRevision] = Field(default_factory=list)
    expansions: list[Expansion] = Field(default_factory=list)


class PageFamily(BaseModel):
    family_id: str = ""
    route: str = ""
    persona_hash: str = ""
    variants: list[StateVariant] = Field(default_factory=list)


class Action(BaseModel):
    type: str = ""  # click, fill, navigate
    target: str = ""


class ObservedOutcome(BaseModel):
    url_change: str = ""
    response_class: str = ""
    visible_assertions: list[str] = Field(default_factory=list)


class Transition(BaseModel):
    transition_id: str = ""
    from_variant: str = ""
    action: Action = Field(default_factory=Action)
    to_variant: str = ""
    observed_outcome: ObservedOutcome = Field(default_factory=ObservedOutcome)


class Target(BaseModel):
    origin: str = ""
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DiscoverySession(BaseModel):
    session_id: str = ""
    target: Target = Field(default_factory=Target)
    persona_context: PersonaContext = Field(default_factory=PersonaContext)
    page_families: list[PageFamily] = Field(default_factory=list)
    transitions: list[Transition] = Field(default_factory=list)
    status: str = "active"  # active | stopped | compiled
    stopped_at: Optional[str] = None

    def current_variant_id(self, family_id: str) -> Optional[str]:
        for pf in self.page_families:
            if pf.family_id == family_id and pf.variants:
                return pf.variants[-1].variant_id
        return None