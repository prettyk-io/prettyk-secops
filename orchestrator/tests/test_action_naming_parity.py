# -*- coding: utf-8 -*-
"""ACT-DEBT: парити action-нейминга между FE и BE (read-only, static).

Сверяет, что контракт browser-действий между frontend (TypeScript) и backend
(Python browser_service) не разъезжается:

  * каждый DTO-action, который FE шлёт в backend (scenarioStepToBackendDto),
    обязан существовать в `_BrowserWorker._SUPPORTED_STEP_ACTIONS`;
  * FE-стратегии локатора (STRATEGY_KINDS) ⊂ BE-стратегии (`_resolve_step_locator`);
  * backend step-имена (fill/select_option/press_key) — легитимный слой, а не случайный дрейф;
  * observe-action-неймы (click/type) не вышли из канона.

Рабочие поверхности НЕ правит. Все факты извлекаются СТАТИЧЕСКИ (regex по
исходникам), без import·а — чтобы guard не падал от транзитных WIP-правок на
активных поверхностях (ACT-BE / ACT-FE) в параллельных окнах.
"""
from __future__ import annotations

import re
from pathlib import Path

# Канон wire action-нейминга (lowercase). Единый для FE и BE — см.
# docs/contracts/action-naming.md (человекочитаемый источник).
CANONICAL_ACTIONS = frozenset(
    {"click", "type", "wheel", "scroll", "drag", "hover", "key", "focus", "select"}
)

# Backend step-имена (Playwright-native) — легитимный слой имён, НЕ алиасы канона.
# НЕ подлежат сведению к wire-канону: FE маппит ActionKind в эти имена напрямую.
BACKEND_STEP_NAMES: dict[str, frozenset] = {
    "type": frozenset({"fill"}),
    "select": frozenset({"select_option"}),
    "key": frozenset({"press_key"}),
}

# Управление сессией (вне 9-элементного action-канона, но живут в том же маппинге).
SESSION_ACTIONS = frozenset({"goto", "navigate", "wait_for"})

# Корень репы: этот файл лежит в orchestrator/tests/, репо = .. / .. / ..
_REPO_ROOT = Path(__file__).resolve().parents[2]
_FE_DIR = _REPO_ROOT / "frontend" / "src"
_MODEL_TS = _FE_DIR / "studio" / "scenarioStepModel.ts"
_SESSION_TS = _FE_DIR / "studio" / "browserSession.ts"
_RECORDER_TS = _FE_DIR / "terminal" / "useCdpRecorder.ts"
_BE_SERVICE = _REPO_ROOT / "orchestrator" / "browser" / "browser_service.py"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# ───────────────────────────────────────────────────────────────
# Извлечение фактов (статично, read-only)
# ───────────────────────────────────────────────────────────────

def _be_supported_actions() -> set[str]:
    """Содержимое `_SUPPORTED_STEP_ACTIONS` из browser_service.py (без import)."""
    text = _read(_BE_SERVICE)
    m = re.search(r"_SUPPORTED_STEP_ACTIONS\s*=\s*\{([^}]*)\}", text, re.S)
    assert m, "_SUPPORTED_STEP_ACTIONS not found in browser_service.py"
    literals = re.findall(r'"(?:[^"\\]|\\.)*"|\'[^\']*\'', m.group(1))
    return {s.strip().strip('"\'') for s in literals if s.strip()}


def _be_locator_strategies() -> set[str]:
    """Стратегии в `_resolve_step_locator` (static scan всего файла)."""
    text = _read(_BE_SERVICE)
    strategies: set[str] = set()
    strategies |= set(re.findall(r'if\s+strategy\s*==\s*["\'](\w+)["\']', text))
    for group in re.findall(r'strategy\s+in\s*\(([^)]*)\)', text):
        strategies |= {s.strip().strip('"\'') for s in group.split(",") if s.strip()}
    strategies.add("css")  # default branch
    return strategies


def _fe_action_kinds() -> set[str]:
    text = _read(_MODEL_TS)
    m = re.search(r"ACTION_KINDS\s*=\s*\[([^\]]*)\]\s*as\s*const", text)
    assert m, "ACTION_KINDS not found in scenarioStepModel.ts"
    return {s.strip().strip('"\'') for s in m.group(1).split(",") if s.strip()}


def _fe_strategy_kinds() -> set[str]:
    text = _read(_MODEL_TS)
    m = re.search(r"STRATEGY_KINDS\s*=\s*\[([^\]]*)\]\s*as\s*const", text)
    assert m, "STRATEGY_KINDS not found in scenarioStepModel.ts"
    return {s.strip().strip('"\'') for s in m.group(1).split(",") if s.strip()}


def _fe_to_backend_dto_actions() -> set[str]:
    """Все action-значения, которые `scenarioStepToBackendDto` кладёт в DTO."""
    text = _read(_SESSION_TS)
    # case 'Click': return { action: 'click', ... }
    pattern = re.compile(r"case\s+'(\w+)':\s*return\s*\{[^}]*?\baction:\s*'(\w+)'", re.S)
    out: set[str] = set()
    for m in pattern.finditer(text):
        out.add(m.group(2))
    assert "scenarioStepToBackendDto" in text
    return out


def _observe_action_names() -> set[str]:
    """action-неймы, которые backend observe может прислать FE (CdpObservation.action)."""
    text = _read(_SESSION_TS)
    m = re.search(r"action:\s*((?:'[^']+'\s*\|\s*)*'[^']+')", text)
    assert m is not None, "CdpObservation.action union not found"
    return {s.strip().strip("'") for s in m.group(1).split("|") if s.strip()}


# ───────────────────────────────────────────────────────────────
# Тесты
# ───────────────────────────────────────────────────────────────


class TestFeToBackendActionParity:
    def test_every_fe_dto_action_supported_by_be(self):
        """FE не может прислать action, которого backend не умеет исполнять."""
        supported = _be_supported_actions()
        fe_actions = _fe_to_backend_dto_actions()
        assert fe_actions, "scenarioStepToBackendDto mapping not parsed"
        missing = fe_actions - supported
        assert not missing, (
            f"FE шлёт action'ы без поддержки backend: {sorted(missing)}. "
            f"BE поддерживает: {sorted(supported)}"
        )

    def test_fe_dto_actions_are_canonical_or_backend_step_name(self):
        """Каждый DTO-action — либо канон, либо backend step-имя слоя, либо сессионный."""
        fe_actions = _fe_to_backend_dto_actions()
        wrong: list[str] = []
        for a in fe_actions:
            if a in CANONICAL_ACTIONS or a in SESSION_ACTIONS:
                continue
            if any(a in names for names in BACKEND_STEP_NAMES.values()):
                continue
            wrong.append(a)
        assert not wrong, (
            f"Неизвестный action в FE-mapping (не канон, не backend step-имя, не сессионный): {wrong}"
        )

    def test_no_new_observe_action_outside_canon(self):
        """observe-неймы (click/type) не вышли из канона."""
        obs = _observe_action_names()
        assert obs, "CdpObservation.action union не распарсен"
        assert obs <= CANONICAL_ACTIONS, f"observe action вне канона: {obs - CANONICAL_ACTIONS}"


class TestStrategyParity:
    def test_fe_strategies_subset_of_be(self):
        """FE не шлёт стратегию, которую `_resolve_step_locator` не понимает."""
        be_strategies = _be_locator_strategies()
        fe_strategies = _fe_strategy_kinds()
        missing = fe_strategies - be_strategies
        assert not missing, (
            f"FE стратегии без поддержки BE `_resolve_step_locator`: {sorted(missing)}. "
            f"BE знает: {sorted(be_strategies)}"
        )


class TestCanonicalDictionary:
    def test_canonical_actions_defined(self):
        assert CANONICAL_ACTIONS == {
            "click", "type", "wheel", "scroll", "drag", "hover", "key", "focus", "select",
        }

    def test_backend_step_names_map_to_canonical(self):
        """Каждый backend step-имя связан с именем из канона (но НЕ сводится к нему)."""
        for canonical, names in BACKEND_STEP_NAMES.items():
            assert canonical in CANONICAL_ACTIONS, f"ключ {canonical!r} не в каноне"
            assert names, f"пустой набор backend step-имён для {canonical}"

    def test_backend_step_names_are_native_not_aliases(self):
        """fill/select_option/press_key — Playwright-native имена слоя, НЕ подлежат сведению."""
        for canonical, names in BACKEND_STEP_NAMES.items():
            for n in names:
                assert n not in CANONICAL_ACTIONS, (
                    f"{n!r} (слой {canonical}) внезапно совпал с каноном — "
                    f"это backend step-имя, а не каноничное wire-действие"
                )

    def test_currently_served_canonical_actions_present_in_be(self):
        """Каноничные действия, реализованные сегодня, достижимы из BE (прямо или step-именем)."""
        supported = _be_supported_actions()
        implemented = {"click", "type", "hover", "scroll", "select", "key"}
        resolved: set[str] = set()
        for action in implemented:
            if action in supported:
                resolved.add(action)
            elif any(a in supported for a in BACKEND_STEP_NAMES.get(action, ())):
                resolved.add(action)
        assert resolved == implemented, (
            f"реализованные канонические действия потерялись: {implemented - resolved}"
        )