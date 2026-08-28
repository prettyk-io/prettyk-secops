# -*- coding: utf-8 -*-
"""GRD-L2: Codemod CLI — вычистить мёртвые webdriver-ключи из method_id.py.

Детерминированно: сверяет _METHOD_ID с dir(PlaywrightAdapter) через LibCST,
удаляет DictElement-записи только в webdriver-секции, не трогая gather_info.

Использование:
  py -m tools.prune_dead_keywords --dry-run
  py -m tools.prune_dead_keywords --apply
"""
from __future__ import annotations

import argparse
import py_compile
import sys
import tempfile
from pathlib import Path

import libcst as cst

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

METHOD_ID_PATH = REPO_ROOT / "orchestrator" / "core" / "method_id.py"


def _dead_keys() -> set[str]:
    """Все webdriver-ключи _METHOD_ID, которых нет в PlaywrightAdapter."""
    from core.method_id import _METHOD_ID
    from adapters.playwright_adapter import PlaywrightAdapter

    adapter_methods = set(dir(PlaywrightAdapter))
    dead: set[str] = set()
    for ru_name, (comp, py_method) in _METHOD_ID.items():
        if comp != "webdriver":
            continue
        if py_method == "gather_info":
            continue
        if py_method not in adapter_methods:
            dead.add(ru_name)
    return dead


class DropDeadKeywords(cst.CSTTransformer):
    """Удаляет DictElement, чей ключ — строковой литерал из dead_keys."""

    def __init__(self, dead_keys: set[str]):
        self.dead_keys = dead_keys
        self.removed = 0

    def leave_DictElement(self, original_node, updated_node):
        key = original_node.key
        if isinstance(key, cst.BaseString):
            # key.value — строковой литерал с кавычками: "ОбойтиСтраницы" / 'ОбойтиСтраницы'
            value = key.value[1:-1] if len(key.value) >= 2 else key.value
            if value in self.dead_keys:
                self.removed += 1
                return cst.RemovalSentinel.REMOVE
        return updated_node


def _read_module(path: Path) -> cst.Module:
    with open(path, encoding="utf-8-sig") as f:
        return cst.parse_module(f.read())


def _check_compiles(source: str) -> None:
    """py_compile-проверка ДО записи — пишем во временный файл и компилируем."""
    with tempfile.NamedTemporaryFile("w", suffix=".py", encoding="utf-8", delete=False) as tmp:
        tmp.write(source)
        tmp_path = tmp.name
    try:
        py_compile.compile(tmp_path, doraise=True)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Prune dead webdriver keywords from method_id.py")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true")
    group.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    dead = _dead_keys()
    if not dead:
        print("OK: мёртвых ключей нет — реестр согласован с PlaywrightAdapter.")
        return 0

    module = _read_module(METHOD_ID_PATH)
    transformer = DropDeadKeywords(dead)
    updated = module.visit(transformer)

    print(f"Мёртвые ключи ({len(dead)}):")
    for k in sorted(dead):
        print(f"  - {k}")

    if args.dry_run:
        print(f"\n[dry-run] удалено бы: {transformer.removed} записей. Файл НЕ изменён.")
        return 0

    source = updated.code
    _check_compiles(source)

    # Атомарная запись в UTF-8 (с BOM, как было)
    tmp = METHOD_ID_PATH.with_suffix(".py.tmp")
    tmp.write_text(source, encoding="utf-8-sig")
    tmp.replace(METHOD_ID_PATH)

    print(f"\n[apply] удалено {transformer.removed} записей. Файл скомпилирован и записан.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
