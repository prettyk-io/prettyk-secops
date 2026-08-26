# -*- coding: utf-8 -*-
"""Scenario-level failsafe marker `<!>` (не путать с action `>?`)."""
from __future__ import annotations

from typing import Tuple

from core.errors import WiredError

SCENARIO_FAILSAFE_MARKER = "<!>"


def parse_scenario_failsafe_prefix(script: str) -> Tuple[bool, str]:
    """
    Первая строка constructor: ровно первые 3 символа `<!>`, иначе failsafe нет.

    Хвост 1-й строки после маркера — только whitespace, иначе WiredError.
    Тело = строки 2…N (1-я с маркером снимается). Маркер в JSON/Editor остаётся.
    """
    if script is None:
        return False, ""
    text = str(script)
    if not text:
        return False, ""

    if "\n" in text:
        first, rest = text.split("\n", 1)
        body = rest
    else:
        first, body = text, ""

    if len(first) < 3 or first[:3] != SCENARIO_FAILSAFE_MARKER:
        return False, text

    after = first[3:]
    if after.strip():
        raise WiredError(
            "После маркера сценария <!> на первой строке допустим только пробел "
            f"(хвост: {after!r})"
        )
    return True, body


def scenario_failsafe_allowed(scenario) -> bool:
    """continue_on_failure (SoT) ИЛИ префикс <!> в steps[0].constructor."""
    if bool(getattr(scenario, "continue_on_failure", False)):
        return True
    steps = getattr(scenario, "steps", None) or []
    if not steps:
        return False
    ctor = getattr(steps[0], "constructor", None)
    if not isinstance(ctor, str):
        return False
    allowed, _ = parse_scenario_failsafe_prefix(ctor)
    return allowed


def strip_scenario_failsafe_from_step0_constructor(constructor: str) -> str:
    """Снять <!> с 1-й строки для execute (без изменения JSON на диске)."""
    _allowed, body = parse_scenario_failsafe_prefix(constructor or "")
    return body


def strip_at_directives(constructor: str) -> str:
    """Убрать @-директивы (Description/Title/Tag/Author) перед выполнением."""
    if not constructor:
        return ""
    lines = constructor.replace("\r\n", "\n").replace("\r", "").split("\n")
    filtered = [ln for ln in lines if not ln.strip().startswith("@")]
    return "\n".join(filtered)
