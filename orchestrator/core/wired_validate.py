# -*- coding: utf-8 -*-
"""Валидация манифеста без Controller / scanner / Grid (G-06 --validate-only)."""
from __future__ import annotations

import difflib
import inspect
import json
import re
from pathlib import Path
from typing import Any, List, Optional, Sequence, Tuple

from core.action_factory import ActionFactory
from core.errors import WiredError
from core.wire_split import split_wire

# Не регистрируем как keyword (как в Controller._NON_KEYWORD_METHODS / dir filter).
_SKIP_METHODS = frozenset(
    {
        "bind",
        "set_context",
        "shutdown",
        "shutdown_all",
        "update_driver",
        "add_local_server",
        "summarize_high_alerts",
        "summarize_alerts_for_live",
        "domains_csv_to_include_regexes",
        "_alert_filter_level",
    }
)


def step_label(scenario=None, step=None) -> str:
    sname = getattr(scenario, "scenario_name", None) or getattr(scenario, "id", None) or "?"
    desc = (getattr(step, "description", None) or "").strip()
    ctor = (getattr(step, "constructor", None) or "")[:48]
    tname = desc or ctor or getattr(step, "id", None) or "?"
    return f"{sname} / {tname}"


def signature_info(method) -> tuple:
    sig = inspect.signature(method)
    param_names = []
    required_count = 0
    accepts_extra = False
    for name, param in sig.parameters.items():
        if name in ("self", "cls"):
            continue
        if param.kind in (param.VAR_POSITIONAL, param.VAR_KEYWORD):
            accepts_extra = True
            continue
        param_names.append(name)
        if param.default is param.empty:
            required_count += 1
    return param_names, required_count, accepts_extra


def build_dry_action_factory() -> ActionFactory:
    """Регистрация wire-методов с классов адаптеров — без сети.

    DSL-B4 + PW-C3: webdriver и browser идут через P0_ALLOWLIST (25 методов)
    на PlaywrightAdapter — один мир, WebDriverAdapter выпилен из боевого пути.
    Остальные адаптеры (scanner, http, ...) — dir(cls).
    """
    from adapters.data_adapter import DataAdapter
    from adapters.data_processor import DataProcessor
    from adapters.connector_adapter import ConnectorAdapter
    from adapters.grpc_adapter import GrpcAdapter
    from adapters.http_adapter import HttpAdapter
    from adapters.inspector import Inspector
    from adapters.playwright_adapter import PlaywrightAdapter
    from adapters.scanner_adapter import ScannerAdapter
    from core.fuzzing import FuzzAdapter
    from utils.reporter import Reporter
    from core.pretty_method_spec import P0_ALLOWLIST, browser_standard_actions

    factory = ActionFactory()
    for m in (
        "attach_screenshot",
        "attach_text",
        "attach_json",
        "attach_html",
        "attach_file",
    ):
        factory.register("allure", m, getattr(Reporter, m))

    # ── P0_ALLOWLIST: webdriver — только доказанные методы (на PlaywrightAdapter) ──
    _pw = PlaywrightAdapter.__new__(PlaywrightAdapter)
    for spec in P0_ALLOWLIST:
        if spec.component != "webdriver":
            continue
        method = getattr(_pw, spec.action, None)
        if callable(method):
            factory.register(spec.component, spec.action, method)

    # ── Browser: PlaywrightAdapter (cookies/storage/console) ──
    for action in sorted(browser_standard_actions()):
        method = getattr(_pw, action, None)
        if callable(method):
            factory.register("browser", action, method)

    # ── Остальные адаптеры: dir(cls) ──
    adapters = {
        "scanner": ScannerAdapter,
        "scanner": ScannerAdapter,
        "http": HttpAdapter,
        "grpc": GrpcAdapter,
        "connector": ConnectorAdapter,
        "data": DataAdapter,
        "core": DataProcessor,
        "inspector": Inspector,
        "fuzz": FuzzAdapter,
    }
    for component, cls in adapters.items():
        for method_name in dir(cls):
            if method_name.startswith("_") or method_name in _SKIP_METHODS:
                continue
            method = getattr(cls, method_name)
            if not callable(method):
                continue
            factory.register(component, method_name, method)
    return factory


def parse_constructor(raw_string: str, action_factory: ActionFactory):
    from core.wire_split import split_save_as_arrow

    wire, _save_as = split_save_as_arrow(str(raw_string))
    parts = split_wire(wire)
    if len(parts) < 2:
        raise WiredError(
            f"Конструктор {raw_string!r} должен иметь вид "
            f"'<компонент>|<действие>[|аргументы]'"
        )
    component, action, args = parts[0], parts[1], parts[2:]
    method = action_factory.get_method(component, action)
    if method is None:
        known = action_factory.components()
        if component not in known:
            raise WiredError(
                f"Неизвестный компонент {component!r}. "
                f"Доступны: {', '.join(known)}"
            )
        actions = action_factory.actions_for(component)
        hint = difflib.get_close_matches(action, actions, n=3)
        message = f"Неизвестное действие {component}|{action}"
        if hint:
            message += f". Похожие: {', '.join(hint)}"
        raise WiredError(message)

    param_names, required_count, accepts_extra = signature_info(method)
    if len(args) < required_count or (not accepts_extra and len(args) > len(param_names)):
        raise WiredError(
            f"{component}|{action}: получено аргументов {len(args)}, "
            f"ожидается от {required_count} до "
            f"{'∞' if accepts_extra else len(param_names)}. "
            f"Сигнатура: {action}({', '.join(param_names)})"
        )
    params = {name: arg for name, arg in zip(param_names, args)}
    return component, action, params


def _append_diag_errors(problems: List[str], label: str, diags: List[Any]) -> None:
    for d in diags:
        if not isinstance(d, dict) or d.get("severity") != "error":
            continue
        wirek = d.get("wirek") or ""
        suffix = f" [{wirek}]" if wirek else ""
        problems.append(f"  {label}: {d['message']}{suffix}")


def _problems_for_step_constructor(
    constructor: str,
    label: str,
    factory: ActionFactory,
) -> List[str]:
    from core.constructor_validate import validate_data_script, validate_language_script
    from core.language_engine import LanguageEngine
    from core.language_parse import is_language_script
    from core.method_id import ensure_wire
    from core.pretty_data import pretty_line_to_wire

    out: List[str] = []
    first = constructor.split("\n", 1)[0].strip()
    if is_language_script(constructor):
        _append_diag_errors(out, label, validate_language_script(constructor))
        return out
    try:
        data_pair = pretty_line_to_wire(first)
    except WiredError:
        data_pair = None
    if data_pair is not None or first.lower().startswith(
        ("пусть", "секрет", "добавить", "data|")
    ):
        _append_diag_errors(out, label, validate_data_script(constructor))
        return out
    try:
        leaf = LanguageEngine.parse_leaf(ensure_wire(constructor))
        parse_constructor(leaf.constructor, factory)
    except WiredError as e:
        out.append(f"  {label}: {e}")
    return out


def collect_wired_problems(
    wired,
    action_factory: Optional[ActionFactory] = None,
) -> List[str]:
    """
    Проблемы валидации конструкторов по всему манифесту.
    Не требует живых адаптеров.
    """
    factory = action_factory or build_dry_action_factory()
    problems: List[str] = []
    suites = getattr(wired, "test_suites", None)
    scenarios = (suites.scenarios if suites else None) or []
    for scenario in scenarios:
        for step in (scenario.steps or []):
            constructor = (step.constructor or "").strip()
            if constructor.startswith("${") and constructor.endswith("}"):
                continue
            label = step_label(scenario, step)
            problems.extend(_problems_for_step_constructor(constructor, label, factory))
    return problems


# Паритет с FE redactSecrets.ts (режим B → "***").
REDACT_PLACEHOLDER = "***"
_SECRET_KEY_EXACT = frozenset(
    {
        "Пароль",
        "password",
        "Password",
        "secret",
        "Secret",
        "api_key",
        "apiKey",
        "token",
        "access_token",
        "refresh_token",
        "client_secret",
    }
)
_SECRET_KEY_RE = re.compile(
    r"^(password|passwd|secret|token|api[_-]?key|client[_-]?secret)$",
    re.IGNORECASE,
)


def _is_secret_field_key(key: str) -> bool:
    return key in _SECRET_KEY_EXACT or bool(_SECRET_KEY_RE.match(key))


def collect_redact_mask_problems(data: Any, path: str = "") -> List[str]:
    """
    BE-RT-3: маска '***' в secret/password-полях — не тихий прогон с redact.
    """
    problems: List[str] = []
    if isinstance(data, dict):
        for key, value in data.items():
            loc = f"{path}/{key}" if path else key
            if (
                _is_secret_field_key(key)
                and isinstance(value, str)
                and value == REDACT_PLACEHOLDER
            ):
                problems.append(
                    f"secret {loc}: маска '{REDACT_PLACEHOLDER}' — "
                    f"секрет недоступен для прогона (режим B redact)"
                )
            else:
                problems.extend(collect_redact_mask_problems(value, loc))
    elif isinstance(data, list):
        for index, item in enumerate(data):
            loc = f"{path}/{index}"
            problems.extend(collect_redact_mask_problems(item, loc))
    return problems


def validate_wired_file(
    wired_path: str | Path,
) -> Tuple[List[str], Any]:
    """
    Полный контур validate-only.
    Возвращает (issues, wired_or_None). issues пуст → ok.
    """
    from models.wired import Wired, strip_legacy_wired_dict

    path = Path(wired_path)
    issues: List[str] = []
    try:
        # utf-8-sig — срезает BOM (U+FEFF); json.loads не переносит его.
        raw = path.read_text(encoding="utf-8-sig")
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        return [f"json: {e}"], None
    except OSError as e:
        return [f"io: {e}"], None

    data = strip_legacy_wired_dict(data)

    for p in collect_redact_mask_problems(data):
        issues.append(p)

    try:
        wired = Wired.model_validate(data)
    except Exception as e:
        issues.append(f"pydantic: {e}")
        return issues, None

    for p in collect_wired_problems(wired):
        issues.append(f"constructor:{p}")
    return issues, wired
