# -*- coding: utf-8 -*-
from utils.locator_heal_policy import HealStrategy, choose_heal_strategy


def test_gate_off():
    assert (
        choose_heal_strategy(
            heal_gate=False,
            has_fingerprint=True,
            has_label_hint=True,
            label_mode_enabled=True,
        )
        == HealStrategy.NONE
    )


def test_fingerprint_default():
    assert (
        choose_heal_strategy(
            heal_gate=True,
            has_fingerprint=True,
            has_label_hint=False,
            label_mode_enabled=False,
        )
        == HealStrategy.FINGERPRINT
    )


def test_label_first_when_mode():
    assert (
        choose_heal_strategy(
            heal_gate=True,
            has_fingerprint=False,
            has_label_hint=True,
            label_mode_enabled=True,
        )
        == HealStrategy.LABEL_FIRST
    )


def test_label_then_fingerprint():
    assert (
        choose_heal_strategy(
            heal_gate=True,
            has_fingerprint=True,
            has_label_hint=True,
            label_mode_enabled=True,
        )
        == HealStrategy.LABEL_THEN_FINGERPRINT
    )
