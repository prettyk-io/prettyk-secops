# -*- coding: utf-8 -*-
from utils.locator_heal import (
    ElementFingerprint,
    HealCandidate,
    fingerprint_from_attrs,
    heal_allowed,
    pick_best_heal,
    pick_by_label_hint,
    score_candidate,
    suggest_locator,
)


def test_heal_allowed_gate():
    assert not heal_allowed()
    assert heal_allowed(step_failsafe=True)
    assert heal_allowed(scenario_failsafe=True)
    assert heal_allowed(discovery_mode=True)
    assert heal_allowed(env_flag=True)


def test_score_prefers_id_rename():
    fp = fingerprint_from_attrs(
        locator_type="id",
        locator_value="login-btn",
        tag="button",
        id="login-btn",
        text="Войти",
        classes=("btn", "primary"),
        parent_tag="form",
    )
    renamed = HealCandidate(
        key="a",
        tag="button",
        id="login-button-new",
        text="Войти",
        classes=("btn", "primary"),
        parent_tag="form",
    )
    decoy = HealCandidate(
        key="b",
        tag="a",
        id="logout",
        text="Выйти",
        classes=("link",),
        parent_tag="nav",
    )
    assert score_candidate(fp, renamed) > score_candidate(fp, decoy)
    pick = pick_best_heal(fp, [decoy, renamed], score_cap=0.5)
    assert pick is not None
    assert pick.candidate.key == "a"
    assert pick.score >= 0.5


def test_below_cap_returns_none():
    fp = fingerprint_from_attrs(
        locator_type="id",
        locator_value="x",
        tag="input",
        id="x",
        name="user",
    )
    weak = HealCandidate(key="z", tag="div", text="unrelated")
    assert pick_best_heal(fp, [weak], score_cap=0.8) is None


def test_suggest_locator_and_roundtrip():
    cand = HealCandidate(key="1", id="email", tag="input", name="email")
    assert suggest_locator(cand) == ("id", "email")
    fp = fingerprint_from_attrs(
        locator_type="css",
        locator_value="#email",
        tag="input",
        id="email",
    )
    assert ElementFingerprint.from_dict(fp.to_dict()).id == "email"


def test_pick_by_label_hint():
    cands = [
        HealCandidate(key="0", tag="button", id="x", text="Cancel"),
        HealCandidate(key="1", tag="button", id="loginButton", text="Log in"),
    ]
    pick = pick_by_label_hint("Log in", cands)
    assert pick is not None
    assert pick.candidate.id == "loginButton"
    assert pick.score >= 0.85
