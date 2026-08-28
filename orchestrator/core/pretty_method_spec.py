"""
DSL-B4: PrettyMethodSpec — канонический реестр методов PrettyK.

Pydantic-модель PrettyMethodSpec (валидируемая, типизированная).
P0_ALLOWLIST — 25 методов, прошедших parity-проверку (PW и Selenium).
Интегрирована с method_ids.json: валидация «method_id есть в реестре».
"""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

StrictModel = ConfigDict(extra="ignore", frozen=True)

MethodTier = Literal["ui", "assert", "util"]
RuntimeSupport = Literal["pw", "selenium", "both"]


class MethodParam(BaseModel):
    """Параметр метода с контрактом."""
    model_config = StrictModel

    name: str = Field(..., min_length=1)
    type: str = Field(default="str", description="Тип: str, int, bool, dict")
    required: bool = Field(default=False)
    default: str | None = Field(default=None)
    description: str = Field(default="")


class PrettyMethodSpec(BaseModel):
    """Спецификация одного метода PrettyK — полный контракт."""
    model_config = StrictModel

    method_id: str = Field(..., min_length=1, description="RU-имя: Открыть, Клик")
    component: str = Field(..., min_length=1, description="webdriver | browser")
    action: str = Field(..., min_length=1, description="Python-имя метода: open, click")
    gate: str = Field(..., min_length=1, description="ui | assert | util")
    tier: MethodTier = Field(..., description="ui | assert | util")
    runtime_support: RuntimeSupport = Field(..., description="pw | selenium | both")
    aliases: tuple[str, ...] = Field(default_factory=tuple, description="Альтернативные имена")
    params: tuple[MethodParam, ...] = Field(default_factory=tuple)
    description: str = Field(default="")

    @field_validator("gate")
    @classmethod
    def gate_must_be_valid(cls, v: str) -> str:
        if v not in ("ui", "assert", "util"):
            raise ValueError(f"gate must be ui/assert/util, got {v}")
        return v

    @field_validator("component")
    @classmethod
    def component_must_be_valid(cls, v: str) -> str:
        if v not in ("webdriver", "browser"):
            raise ValueError(f"component must be webdriver/browser, got {v}")
        return v

    @property
    def wirek(self) -> str:
        """Wire-ключ: component|action."""
        return f"{self.component}|{self.action}"


# ── P0_ALLOWLIST: 25 методов ──

P0_ALLOWLIST: tuple[PrettyMethodSpec, ...] = (
    # ═══ Навигация (4) ═══
    PrettyMethodSpec(
        method_id="Открыть", component="webdriver", action="open",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="url", required=True, description="URL страницы"),),
        description="Открыть URL в браузере",
    ),
    PrettyMethodSpec(
        method_id="Назад", component="webdriver", action="back",
        gate="ui", tier="ui", runtime_support="both",
        aliases=("Вернуться",),
        description="Навигация назад по истории браузера",
    ),
    PrettyMethodSpec(
        method_id="Вперёд", component="webdriver", action="forward",
        gate="ui", tier="ui", runtime_support="both",
        description="Навигация вперёд по истории браузера",
    ),
    PrettyMethodSpec(
        method_id="Обновить", component="webdriver", action="refresh",
        gate="ui", tier="ui", runtime_support="both",
        aliases=("Перезагрузить",),
        description="Обновить текущую страницу",
    ),
    # ═══ Действия (7) ═══
    PrettyMethodSpec(
        method_id="Клик", component="webdriver", action="click",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        description="Клик по элементу",
    ),
    PrettyMethodSpec(
        method_id="КликJS", component="webdriver", action="click_js",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        description="Клик через JavaScript",
    ),
    PrettyMethodSpec(
        method_id="Навести", component="webdriver", action="hover",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        description="Навести курсор на элемент",
    ),
    PrettyMethodSpec(
        method_id="Ввести", component="webdriver", action="send_keys",
        gate="ui", tier="ui", runtime_support="both",
        params=(
            MethodParam(name="locator", required=True),
            MethodParam(name="text", required=True, description="Текст для ввода"),
        ),
        aliases=("ВставитьТекст", "Напечатать"),
        description="Ввести текст в поле",
    ),
    PrettyMethodSpec(
        method_id="Очистить", component="webdriver", action="clear",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        description="Очистить поле ввода",
    ),
    PrettyMethodSpec(
        method_id="Выбрать", component="webdriver", action="select_by_text",
        gate="ui", tier="ui", runtime_support="both",
        params=(
            MethodParam(name="locator", required=True),
            MethodParam(name="text", required=True),
        ),
        aliases=("ВыбратьИзСписка",),
        description="Выбрать значение из выпадающего списка",
    ),
    PrettyMethodSpec(
        method_id="ПрокрутитьДо", component="webdriver", action="scroll_to_element",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        aliases=("СкроллДоЭлемента",),
        description="Прокрутить страницу до элемента",
    ),
    # ═══ Чтение (6) ═══
    PrettyMethodSpec(
        method_id="ПолучитьТекст", component="webdriver", action="get_text",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        aliases=("ТекстЭлемента",),
        description="Получить текстовое содержимое элемента",
    ),
    PrettyMethodSpec(
        method_id="ПолучитьЗначение", component="webdriver", action="get_value",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        aliases=("ЗначениеПоля",),
        description="Получить value атрибут поля ввода",
    ),
    PrettyMethodSpec(
        method_id="ПолучитьАтрибут", component="webdriver", action="get_attribute",
        gate="ui", tier="ui", runtime_support="both",
        params=(
            MethodParam(name="locator", required=True),
            MethodParam(name="name", required=True, description="Имя атрибута"),
        ),
        description="Получить значение атрибута элемента",
    ),
    PrettyMethodSpec(
        method_id="КоличествоЭлементов", component="webdriver", action="get_elements_count",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        description="Количество элементов по локатору",
    ),
    PrettyMethodSpec(
        method_id="ТекстЭлементаПоИндексу", component="webdriver", action="get_element_text_by_index",
        gate="ui", tier="ui", runtime_support="both",
        params=(
            MethodParam(name="locator", required=True),
            MethodParam(name="index", required=True, type="int"),
        ),
        description="Текст N-го элемента по локатору",
    ),
    PrettyMethodSpec(
        method_id="ТекстыЭлементов", component="webdriver", action="get_elements_texts",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        description="Все тексты элементов по локатору",
    ),
    # ═══ Ожидания (3) ═══
    PrettyMethodSpec(
        method_id="ЖдатьЭлемент", component="webdriver", action="wait_for_element",
        gate="ui", tier="ui", runtime_support="both",
        params=(
            MethodParam(name="locator", required=True),
            MethodParam(name="timeout", type="int", default="10"),
        ),
        description="Дождаться появления элемента",
    ),
    PrettyMethodSpec(
        method_id="ЖдатьТекст", component="webdriver", action="wait_for_text",
        gate="ui", tier="ui", runtime_support="both",
        params=(
            MethodParam(name="text", required=True),
            MethodParam(name="timeout", type="int", default="10"),
        ),
        description="Дождаться текста на странице",
    ),
    PrettyMethodSpec(
        method_id="ЖдатьURL", component="webdriver", action="wait_url",
        gate="ui", tier="ui", runtime_support="both",
        params=(
            MethodParam(name="url", required=True),
            MethodParam(name="timeout", type="int", default="10"),
        ),
        description="Дождаться URL в адресной строке",
    ),
    # ═══ Проверки (3) ═══
    PrettyMethodSpec(
        method_id="ЭлементСуществует", component="webdriver", action="is_element_present",
        gate="assert", tier="assert", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        description="Проверить существование элемента",
    ),
    PrettyMethodSpec(
        method_id="ЭлементВидим", component="webdriver", action="is_visible",
        gate="assert", tier="assert", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        description="Проверить видимость элемента",
    ),
    PrettyMethodSpec(
        method_id="ЭлементДоступен", component="webdriver", action="is_enabled",
        gate="assert", tier="assert", runtime_support="both",
        params=(MethodParam(name="locator", required=True),),
        description="Проверить доступность элемента (enabled)",
    ),
    # ═══ Скриншот + JS (2) ═══
    PrettyMethodSpec(
        method_id="Скриншот", component="webdriver", action="take_screenshot",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="filename", default="screenshot.png"),),
        description="Сохранить скриншот страницы",
    ),
    PrettyMethodSpec(
        method_id="ВыполнитьJS", component="webdriver", action="execute_script",
        gate="ui", tier="ui", runtime_support="both",
        params=(MethodParam(name="script", required=True, description="JavaScript-код"),),
        description="Выполнить JavaScript на странице",
    ),
)

# ── Индексы ──

_BY_WIREK: dict[str, PrettyMethodSpec] = {m.wirek: m for m in P0_ALLOWLIST}
_BY_ID: dict[str, PrettyMethodSpec] = {m.method_id: m for m in P0_ALLOWLIST}
_ALL_ACTIONS: frozenset = frozenset(m.action for m in P0_ALLOWLIST)

BROWSER_STANDARD_ACTIONS: frozenset = frozenset({
    "get_cookie", "set_cookie", "delete_cookie", "clear_cookies",
    "get_all_cookies", "get_cookie_value", "cookie_exists",
    "get_cookies_count", "get_cookies_for_domain", "add_cookie_full",
    "export_cookies_to_json", "import_cookies_from_json",
    "get_session_id", "get_session_capabilities",
    "set_session_timeouts", "get_session_timeouts",
    "get_local_storage_item", "set_local_storage_item",
    "remove_local_storage_item", "clear_local_storage",
    "get_session_storage_item", "set_session_storage_item",
    "remove_session_storage_item", "clear_session_storage",
    "clear_state",
    "set_network_conditions", "get_network_conditions",
    "get_browser_logs", "get_console_errors", "get_performance_logs",
    "cdp_command",
})


def lookup_by_wirek(wirek: str) -> PrettyMethodSpec | None:
    return _BY_WIREK.get(wirek)


def lookup_by_method_id(method_id: str) -> PrettyMethodSpec | None:
    if method_id in _BY_ID:
        return _BY_ID[method_id]
    for m in P0_ALLOWLIST:
        if method_id in m.aliases:
            return m
    return None


def is_allowed_action(component: str, action: str) -> bool:
    if any(m.component == component and m.action == action for m in P0_ALLOWLIST):
        return True
    if component == "browser" and action in BROWSER_STANDARD_ACTIONS:
        return True
    return False


def all_actions_for(component: str) -> list[str]:
    result = sorted(m.action for m in P0_ALLOWLIST if m.component == component)
    if component == "browser":
        result.extend(sorted(BROWSER_STANDARD_ACTIONS))
    return result


def browser_standard_actions() -> frozenset:
    return BROWSER_STANDARD_ACTIONS


def p0_allowlist_actions() -> frozenset:
    return _ALL_ACTIONS


# ── Интеграция с method_ids.json ──

def validate_method_ids_against_registry() -> tuple[list[str], list[str]]:
    """Сверяет method_ids.json с P0_ALLOWLIST.
    Возвращает (missing_in_allowlist, missing_in_json).

    missing_in_allowlist — method_id из JSON, которых нет в P0_ALLOWLIST.
    missing_in_json — method_id из P0_ALLOWLIST, которых нет в JSON.
    """
    try:
        import json
        from pathlib import Path
        json_path = Path(__file__).parent.parent.parent / "frontend/src/generated/method_ids.json"
        data = json.loads(json_path.read_text(encoding="utf-8"))
        json_ids = {m["id"] for m in data.get("methods", [])}
    except Exception:
        return [], []

    allowlist_ids = {m.method_id for m in P0_ALLOWLIST}
    allowlist_actions = {(m.component, m.action) for m in P0_ALLOWLIST}
    # JSON привязка: (component, action) из wirek
    json_actions = {(m["component"], m["action"]) for m in data.get("methods", []) if "component" in m and "action" in m}

    missing_in_allowlist = sorted(json_actions - allowlist_actions)
    missing_in_json = sorted(allowlist_actions - json_actions)

    return (
        [f"{c}|{a}" for c, a in missing_in_allowlist],
        [f"{c}|{a}" for c, a in missing_in_json],
    )