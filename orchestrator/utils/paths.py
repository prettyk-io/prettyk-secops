# -*- coding: utf-8 -*-
"""
Единая точка правды для путей к артефактам прогона.

Пути считаются от расположения пакета, а не от текущей рабочей директории:
services/docker-compose.yml монтирует ../reports из корня репозитория, поэтому
запуск из любой папки должен писать артефакты туда же, откуда их читают Allure и Selenoid.
Переменная окружения PK_REPORTS_DIR переопределяет корень артефактов (CI, airgap).
"""
from utils.env_dual import pk_env
import os
from pathlib import Path
from typing import Optional

ORCHESTRATOR_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ORCHESTRATOR_ROOT.parent

_reports_override = pk_env("REPORTS_DIR")
REPORTS_DIR = Path(_reports_override).resolve() if _reports_override else REPO_ROOT / "reports"
ALLURE_RESULTS_DIR = REPORTS_DIR / "allure-results"
ALLURE_REPORT_DIR = REPORTS_DIR / "allure-report"
scanner_RESULTS_DIR = REPORTS_DIR / "scanner-results"
VIDEO_DIR = REPORTS_DIR / "video"
LIVE_DIR = REPORTS_DIR / "live"
DIARY_NDJSON = LIVE_DIR / "diary.ndjson"
LIVE_META_JSON = LIVE_DIR / "meta.json"
RESULTS_HOOKS_JSON = LIVE_DIR / "results_hooks.json"
LIVE_EXPORTS_DIR = LIVE_DIR / "exports"
RUNS_DIR = REPORTS_DIR / "runs"


def ensure_live_dir() -> None:
    LIVE_DIR.mkdir(parents=True, exist_ok=True)


def ensure_runs_dir() -> Path:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    return RUNS_DIR


def ensure_live_exports_dir() -> Path:
    ensure_live_dir()
    LIVE_EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    return LIVE_EXPORTS_DIR


def ensure_reports_dirs() -> None:
    """
    Создаёт дерево артефактов до старта прогона.
    VIDEO_DIR создаётся здесь же: иначе каталог заведёт docker при монтировании тома
    в контейнер браузера, и владельцем окажется root.
    """
    for directory in (
        REPORTS_DIR,
        ALLURE_RESULTS_DIR,
        ALLURE_REPORT_DIR,
        scanner_RESULTS_DIR,
        VIDEO_DIR,
        LIVE_DIR,
    ):
        directory.mkdir(parents=True, exist_ok=True)


def artifact_path(file_path: str) -> Path:
    """
    Куда писать артефакт:
    - имя без директории → allure-results (скриншоты / вложения шагов);
    - reports/scanner-results/… или scanner-results/… → scanner XML для DefectDojo;
    - относительный путь → от корня репозитория;
    - абсолютный не меняется.

    Для scanner Отчёт см. scanner_report_path: голое имя → scanner-results, не allure-results.
    """
    path = Path(file_path)
    if path.is_absolute():
        return path
    if path.parent == Path("."):
        return ALLURE_RESULTS_DIR / path
    parts = path.parts
    if parts and parts[0] in ("scanner-results", "scanner-results"):
        return scanner_RESULTS_DIR.joinpath(*parts[1:])
    if len(parts) >= 2 and parts[0] == "reports" and parts[1] in ("scanner-results", "scanner-results"):
        return scanner_RESULTS_DIR.joinpath(*parts[2:])
    return REPO_ROOT / path


def scanner_report_path(file_path: str) -> Path:
    """
    Выход scanner Отчёт / generate_report:
    - имя без директории → reports/scanner-results/… (Dojo, финальный HTML);
    - иначе как artifact_path (включая scanner-results/… и reports/scanner-results/…).
    """
    path = Path(file_path)
    if not path.is_absolute() and path.parent == Path("."):
        return scanner_RESULTS_DIR / path
    return artifact_path(file_path)


def find_artifact(file_path: str) -> Optional[Path]:
    """Ищет уже созданный артефакт по имени или относительному пути."""
    path = Path(file_path)
    if path.is_absolute():
        return path if path.is_file() else None
    for candidate in (
        ALLURE_RESULTS_DIR / path,
        scanner_RESULTS_DIR / path,
        REPO_ROOT / path,
        Path.cwd() / path,
    ):
        if candidate.is_file():
            return candidate
    return None
