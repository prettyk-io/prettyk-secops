# -*- coding: utf-8 -*-
"""
Экспорт каталога ключевых слов (keywords) из адаптеров в JSON для фронтенд-редактора.

Скрипт разбирает исходники адаптеров через `ast` и НЕ импортирует их: у адаптеров
тяжёлые внешние зависимости (selenium, zapv2, allure, requests), которых может не быть
в CI-раннере и на машине, где собирается форма.

Состав компонентов повторяет `Controller._register_actions`:
    webdriver  -> WebDriverAdapter
    browser    -> BrowserAdapter
    zap        -> ZapAdapter
    http       -> HttpAdapter
    core       -> DataProcessor
    inspector  -> Inspector
    allure     -> utils.reporter.Reporter (вложения; не адаптер)


Рантайм регистрирует действия через `dir(obj)`, поэтому в каталог попадают и
унаследованные публичные методы (BaseAdapter.set_context / BaseAdapter.resolve).

Использование:
    python orchestrator/tools/export_keywords.py            # сгенерировать файл
    python orchestrator/tools/export_keywords.py --check     # проверить актуальность (для CI)
    python orchestrator/tools/export_keywords.py -o path.json
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

SCRIPT_REL_PATH = "orchestrator/tools/export_keywords.py"

REPO_ROOT = Path(__file__).resolve().parents[2]
ORCHESTRATOR_DIR = REPO_ROOT / "orchestrator"
ADAPTERS_DIR = ORCHESTRATOR_DIR / "adapters"
DEFAULT_OUTPUT = REPO_ROOT / "cosmo" / "src" / "generated" / "keywords.json"

# component -> (путь от orchestrator/, имя класса)
COMPONENT_SOURCES: Dict[str, Tuple[str, str]] = {
    "webdriver": ("adapters/webdriver_adapter.py", "WebDriverAdapter"),
    "browser": ("adapters/browser_adapter.py", "BrowserAdapter"),
    "zap": ("adapters/zap_adapter.py", "ZapAdapter"),
    "http": ("adapters/http_adapter.py", "HttpAdapter"),
    "grpc": ("adapters/grpc_adapter.py", "GrpcAdapter"),
    "connector": ("adapters/connector_adapter.py", "ConnectorAdapter"),
    "data": ("adapters/data_adapter.py", "DataAdapter"),
    "core": ("adapters/data_processor.py", "DataProcessor"),
    "inspector": ("adapters/inspector.py", "Inspector"),
    "allure": ("utils/reporter.py", "Reporter"),
    "fuzz": ("core/fuzzing.py", "FuzzAdapter"),
}

# Controller регистрирует для allure только этот перечень методов.
ALLURE_ALLOWED_METHODS = frozenset(
    {"attach_screenshot", "attach_text", "attach_json", "attach_html", "attach_file"}
)

# Совпадает с Controller._NON_KEYWORD_METHODS — не светить в каталоге/валидаторе.
NON_KEYWORD_METHODS = frozenset({"bind", "set_context", "shutdown", "shutdown_all", "update_driver", "resolve"})

# Синхрон с core.language_words.KNOWN_STUB_ACTIONS — в каталог/AC не светим.
KNOWN_STUB_ACTIONS = frozenset(
    {
        "browser.set_proxy",
        "browser.disable_proxy",
    }
)

# Dev-only (Максим): wire zap|… работает, MethodId/AC/банк — нет.
# shutdown_all — внутренний стоп по idle/work timeout из формы, не keyword.
HIDDEN_FROM_KEYWORD_CATALOG = frozenset(
    {
        "zap.start_webswing",
        "zap.stop_daemon_start_webswing",
        "zap.shutdown_all",
    }
)

# G-09 / R-09: wire-компонент inspector не в AC рядом с Проверить*.
# Действия остаются в legacy_components — validate + MethodId → inspector|* ок.
LEGACY_WIRE_COMPONENTS = frozenset({"inspector"})

SELF_NAMES = frozenset({"self", "cls"})

PARAM_KIND_POSITIONAL = "positional"
PARAM_KIND_KEYWORD_ONLY = "keyword_only"
PARAM_KIND_VAR_POSITIONAL = "var_positional"
PARAM_KIND_VAR_KEYWORD = "var_keyword"


class ExportError(RuntimeError):
    """Ошибка сборки каталога: отсутствующий файл, класс или неразбираемый модуль."""


# ---------------------------------------------------------------- разбор модулей


def _parse_module(path: Path) -> ast.Module:
    try:
        source = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ExportError(f"Не удалось прочитать {path}: {exc}") from exc
    try:
        return ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        raise ExportError(f"Синтаксическая ошибка в {path}: {exc}") from exc


def _collect_classes(directory: Path) -> Dict[str, Tuple[Path, ast.ClassDef]]:
    """Все классы верхнего уровня в пакете адаптеров: имя класса -> (файл, узел)."""
    classes: Dict[str, Tuple[Path, ast.ClassDef]] = {}
    for path in sorted(directory.glob("*.py")):
        module = _parse_module(path)
        for node in module.body:
            if isinstance(node, ast.ClassDef):
                classes.setdefault(node.name, (path, node))
    return classes


def _decorator_names(node: ast.FunctionDef) -> List[str]:
    names: List[str] = []
    for decorator in node.decorator_list:
        target = decorator.func if isinstance(decorator, ast.Call) else decorator
        if isinstance(target, ast.Name):
            names.append(target.id)
        elif isinstance(target, ast.Attribute):
            names.append(target.attr)
    return names


def _is_exported_method(node: ast.stmt) -> bool:
    """Публичный метод класса, который рантайм зарегистрирует как action."""
    if not isinstance(node, ast.FunctionDef):
        # AsyncFunctionDef рантайм вызвать не сможет (вернётся корутина), поэтому пропускаем.
        return False
    if node.name.startswith("_"):
        return False
    decorators = _decorator_names(node)
    # property/setter/deleter и cached_property не являются вызываемыми действиями.
    if any(name in {"property", "cached_property", "setter", "deleter", "getter"} for name in decorators):
        return False
    return True


# ------------------------------------------------------------------- параметры


def _literal_default(node: ast.expr) -> Tuple[bool, Any, Optional[str]]:
    """(json_serializable, значение, выражение-исходник) для значения по умолчанию."""
    expression = ast.unparse(node)
    try:
        value = ast.literal_eval(node)
    except (ValueError, TypeError, SyntaxError):
        return False, None, expression
    try:
        json.dumps(value)
    except (TypeError, ValueError):
        return False, None, expression
    return True, value, expression


def _describe_param(
    name: str,
    kind: str,
    default_node: Optional[ast.expr],
    annotation: Optional[ast.expr],
) -> Dict[str, Any]:
    param: Dict[str, Any] = {"name": name, "kind": kind}
    if annotation is not None:
        param["type"] = ast.unparse(annotation)

    if kind in (PARAM_KIND_VAR_POSITIONAL, PARAM_KIND_VAR_KEYWORD):
        param["required"] = False
        return param

    if default_node is None:
        param["required"] = True
        return param

    param["required"] = False
    serializable, value, expression = _literal_default(default_node)
    if serializable:
        param["default"] = value
    else:
        param["default_expr"] = expression
    return param


def _method_params(node: ast.FunctionDef, drop_self: bool) -> List[Dict[str, Any]]:
    """Параметры в том порядке, в котором Controller раскладывает по ним аргументы."""
    args = node.args
    positional = list(args.posonlyargs) + list(args.args)
    if drop_self and positional and positional[0].arg in SELF_NAMES:
        positional = positional[1:]

    params: List[Dict[str, Any]] = []

    # Значения по умолчанию выравниваются по правому краю позиционных параметров.
    defaults = list(args.defaults)
    all_positional = list(args.posonlyargs) + list(args.args)
    offset = len(all_positional) - len(defaults)
    for index, arg in enumerate(all_positional):
        if arg not in positional:
            continue
        default_node = defaults[index - offset] if index >= offset else None
        params.append(_describe_param(arg.arg, PARAM_KIND_POSITIONAL, default_node, arg.annotation))

    if args.vararg is not None:
        params.append(
            _describe_param(args.vararg.arg, PARAM_KIND_VAR_POSITIONAL, None, args.vararg.annotation)
        )

    for arg, default_node in zip(args.kwonlyargs, args.kw_defaults):
        params.append(_describe_param(arg.arg, PARAM_KIND_KEYWORD_ONLY, default_node, arg.annotation))

    if args.kwarg is not None:
        params.append(
            _describe_param(args.kwarg.arg, PARAM_KIND_VAR_KEYWORD, None, args.kwarg.annotation)
        )

    return params


def _first_docstring_line(node: ast.FunctionDef) -> Optional[str]:
    docstring = ast.get_docstring(node, clean=True)
    if not docstring:
        return None
    for line in docstring.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return None


# ---------------------------------------------------------------------- сборка


def _iter_class_chain(
    class_name: str, classes: Dict[str, Tuple[Path, ast.ClassDef]]
) -> List[Tuple[Path, ast.ClassDef]]:
    """Класс и его базы из пакета адаптеров: рантайм видит унаследованные методы через dir()."""
    chain: List[Tuple[Path, ast.ClassDef]] = []
    seen: set[str] = set()
    queue = [class_name]
    while queue:
        name = queue.pop(0)
        if name in seen or name not in classes:
            continue
        seen.add(name)
        path, node = classes[name]
        chain.append((path, node))
        for base in node.bases:
            if isinstance(base, ast.Name):
                queue.append(base.id)
            elif isinstance(base, ast.Attribute):
                queue.append(base.attr)
    return chain


def _component_actions(
    component: str,
    class_name: str,
    classes: Dict[str, Tuple[Path, ast.ClassDef]],
) -> Dict[str, Dict[str, Any]]:
    if class_name not in classes:
        raise ExportError(
            f"Класс {class_name} для компонента {component!r} не найден "
            f"(искали в adapters/ и utils/)"
        )

    actions: Dict[str, Dict[str, Any]] = {}
    for path, class_node in _iter_class_chain(class_name, classes):
        module_rel = path.relative_to(REPO_ROOT).as_posix()
        for node in class_node.body:
            if not _is_exported_method(node):
                continue
            if node.name in NON_KEYWORD_METHODS:
                continue
            if f"{component}.{node.name}" in KNOWN_STUB_ACTIONS:
                continue
            if f"{component}.{node.name}" in HIDDEN_FROM_KEYWORD_CATALOG:
                continue
            if component == "allure" and node.name not in ALLURE_ALLOWED_METHODS:
                continue
            if node.name in actions:
                # Переопределение в наследнике обрабатывается раньше базового класса.
                continue

            decorators = _decorator_names(node)
            is_static = "staticmethod" in decorators
            action: Dict[str, Any] = {
                "params": _method_params(node, drop_self=not is_static),
                "defined_in": module_rel,
            }
            if class_node.name != class_name:
                action["inherited_from"] = class_node.name
            description = _first_docstring_line(node)
            if description:
                action["description"] = description
            actions[node.name] = action

    if component == "allure":
        missing = sorted(ALLURE_ALLOWED_METHODS - set(actions))
        if missing:
            raise ExportError(
                "В Reporter отсутствуют методы, которые регистрирует Controller: "
                + ", ".join(missing)
            )
    return actions


def build_catalog() -> Dict[str, Any]:
    if not ADAPTERS_DIR.is_dir():
        raise ExportError(f"Каталог адаптеров не найден: {ADAPTERS_DIR}")

    classes = _collect_classes(ADAPTERS_DIR)
    utils_dir = ORCHESTRATOR_DIR / "utils"
    if utils_dir.is_dir():
        classes.update(_collect_classes(utils_dir))
    # Fuzz-адаптер живёт в core/, а не в adapters/: подхватываем точечно.
    core_fuzzing = ORCHESTRATOR_DIR / "core" / "fuzzing.py"
    if core_fuzzing.is_file():
        for node in _parse_module(core_fuzzing).body:
            if isinstance(node, ast.ClassDef):
                classes.setdefault(node.name, (core_fuzzing, node))

    components: Dict[str, Any] = {}
    legacy_components: Dict[str, Any] = {}
    for component, (rel_path, class_name) in COMPONENT_SOURCES.items():
        module_path = ORCHESTRATOR_DIR / rel_path
        if not module_path.is_file():
            raise ExportError(f"Файл источника не найден: {module_path}")
        body = {
            "class": class_name,
            "module": module_path.relative_to(REPO_ROOT).as_posix(),
            "actions": _component_actions(component, class_name, classes),
        }
        if component in LEGACY_WIRE_COMPONENTS:
            body["legacy_wire"] = True
            legacy_components[component] = body
        else:
            components[component] = body

    return {
        "$comment": (
            "СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не редактировать вручную. "
            f"Источник: orchestrator/adapters + utils/reporter, генератор: {SCRIPT_REL_PATH}. "
            "Обновить: npm run generate:keywords. "
            "legacy_components — wire вне AC (G-09); validate мержит с components."
        ),
        "generator": SCRIPT_REL_PATH,
        "components": components,
        "legacy_components": legacy_components,
    }


def render_catalog(catalog: Dict[str, Any]) -> str:
    """Детерминированный JSON: стабильный порядок ключей и LF-переводы строк."""
    return json.dumps(catalog, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


# ------------------------------------------------------------------------- CLI


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"путь к результату (по умолчанию {DEFAULT_OUTPUT.relative_to(REPO_ROOT).as_posix()})",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="не писать файл, а проверить, что он совпадает с исходниками (код возврата 1 при расхождении)",
    )
    args = parser.parse_args(argv)

    try:
        catalog = build_catalog()
        content = render_catalog(catalog)
    except ExportError as exc:
        print(f"export_keywords: {exc}", file=sys.stderr)
        return 2

    output: Path = args.output
    if args.check:
        if not output.is_file():
            print(f"export_keywords: файл не найден: {output}", file=sys.stderr)
            return 1
        current = output.read_text(encoding="utf-8")
        if current != content:
            print(
                f"export_keywords: {output} разошёлся с исходниками адаптеров. "
                "Перегенерируйте: python orchestrator/tools/export_keywords.py",
                file=sys.stderr,
            )
            return 1
        print(f"export_keywords: {output} актуален")
        return 0

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(content, encoding="utf-8", newline="\n")
    surface = sum(len(c["actions"]) for c in catalog["components"].values())
    legacy = sum(len(c["actions"]) for c in catalog.get("legacy_components", {}).values())
    print(
        f"export_keywords: записано {surface} действий (+{legacy} legacy) в {output}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
