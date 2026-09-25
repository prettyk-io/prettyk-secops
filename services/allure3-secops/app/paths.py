# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import re
from pathlib import Path


class PathError(ValueError):
    pass


_PROJECT_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")

RESULTS_ROOT = Path(os.environ.get("ALLURE_RESULTS_DIR", "/app/allure-results"))
REPORT_ROOT = Path(os.environ.get("ALLURE_REPORT_DIR", "/app/default-reports"))


def validate_project_id(project_id: str) -> str:
    pid = (project_id or "default").strip() or "default"
    if not _PROJECT_RE.match(pid):
        raise PathError(f"invalid project_id: {project_id!r}")
    return pid


def results_dir(project_id: str = "default") -> Path:
    pid = validate_project_id(project_id)
    if pid == "default":
        return RESULTS_ROOT
    return RESULTS_ROOT / pid


def report_dir(project_id: str = "default") -> Path:
    pid = validate_project_id(project_id)
    # AL3-FRESH-REPAIR: default-отчёт живёт в СОБСТВЕННОЙ подпапке, а не в
    # корне REPORT_ROOT. Корень держит подпапки всех проектов/чеков, и раньше
    # генерация default (`_clear_dir(report_dir("default"))` == корень)
    # рекурсивно сносила отчёты чеков.
    if pid == "default":
        return REPORT_ROOT / "default"
    return REPORT_ROOT / pid


def _newest_file_mtime(directory: Path) -> float:
    """Max mtime файлов каталога (не рекурсивно); 0.0 — пусто/нет каталога."""
    if not directory.is_dir():
        return 0.0
    newest = 0.0
    for child in directory.iterdir():
        try:
            if child.is_file():
                newest = max(newest, child.stat().st_mtime)
        except OSError:
            continue
    return newest


def latest_report_dir(root: Path | None = None) -> Path | None:
    """AL3-FRESH-REPAIR: папка отчёта самого свежего scope.

    «Свежесть» считается по mtime СЫРЫХ results scope (последняя активность
    прогона), а не по mtime отчёта: иначе авто-регенерация старого scope
    делала бы его «последним» навсегда. Учитываются только scope'ы с уже
    существующим отчётом (index.html); None — если таких нет.
    """
    base = Path(root) if root is not None else REPORT_ROOT
    if not base.is_dir():
        return None
    newest: tuple[float, Path] | None = None
    for child in base.iterdir():
        if not child.is_dir() or not (child / "index.html").is_file():
            continue
        scope_results = RESULTS_ROOT if child.name == "default" else RESULTS_ROOT / child.name
        activity = _newest_file_mtime(scope_results)
        if activity <= 0:
            continue
        if newest is None or activity > newest[0]:
            newest = (activity, child)
    return newest[1] if newest is not None else None
