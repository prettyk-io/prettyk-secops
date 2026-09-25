# -*- coding: utf-8 -*-
"""Allure 3 Awesome generate (opt-in brand spike)."""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, List

from .paths import report_dir, results_dir, validate_project_id

logger = logging.getLogger("allure3-secops")

ALLURE_BIN = os.environ.get("ALLURE_BIN", "allure")
KEEP_HISTORY = os.environ.get("KEEP_HISTORY", "1").strip() not in {"0", "false", "False", ""}

# AL3-FRESH-REPAIR: контракт свежести — любой пайплайн, пишущий results,
# получает свежий отчёт БЕЗ ручного триггера. Watcher сверяет сигнатуру
# results по scope и регенерирует после «устоявшегося» хвоста (debounce).
AUTO_REGEN = os.environ.get("ALLURE_AUTO_REGEN", "0").strip().lower() in {"1", "true", "yes", "on"}
AUTO_REGEN_INTERVAL_SEC = float(os.environ.get("ALLURE_AUTO_REGEN_INTERVAL_SEC", "2.0"))
AUTO_REGEN_DEBOUNCE_SEC = float(os.environ.get("ALLURE_AUTO_REGEN_DEBOUNCE_SEC", "8.0"))

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()
_job_status: dict[str, dict[str, Any]] = {}
_job_guard = threading.Lock()


def _lock_for(project_id: str) -> threading.Lock:
    with _locks_guard:
        if project_id not in _locks:
            _locks[project_id] = threading.Lock()
        return _locks[project_id]


def _set_status(project_id: str, payload: dict[str, Any]) -> None:
    with _job_guard:
        _job_status[project_id] = {**payload, "project_id": project_id, "updated_at": time.time()}


def get_status(project_id: str = "default") -> dict[str, Any]:
    with _job_guard:
        current = _job_status.get(project_id)
    if current is None:
        return {"status": "idle", "project_id": project_id}
    return dict(current)


def _copy_history(results: Path, report: Path) -> bool:
    src = report / "history"
    if not src.is_dir():
        return False
    dst = results / "history"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    return True


def _clear_dir(path: Path) -> None:
    if not path.exists():
        path.mkdir(parents=True, exist_ok=True)
        return
    for child in path.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink(missing_ok=True)


def _clear_files(path: Path) -> None:
    """Удалить только файлы каталога; подпапки не трогаем (AL3-FRESH-REPAIR)."""
    if not path.exists():
        return
    for child in path.iterdir():
        if child.is_file() or child.is_symlink():
            child.unlink(missing_ok=True)


def clean_results(project_id: str = "default") -> dict:
    """Очистить сырые results текущего scope.

    AL3-FRESH-REPAIR: default живёт в корне RESULTS_ROOT, где рядом лежат
    подпапки проектов/чеков. Раньше `_clear_dir` вычищал и их — clean-results
    по default сносил результаты всех чеков. Для default чистим ТОЛЬКО файлы
    корня; per-project — весь свой подкаталог.
    """
    pid = validate_project_id(project_id)
    results = results_dir(pid)
    results.mkdir(parents=True, exist_ok=True)
    with _lock_for(pid):
        if pid == "default":
            _clear_files(results)
        else:
            _clear_dir(results)
    return {"status": "ok", "project_id": pid, "results_dir": str(results)}


def _run_allure(cmd: List[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd="/app",
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("ALLURE_GENERATE_TIMEOUT_SEC", "300")),
        check=False,
        env={**os.environ, "CI": "1"},
    )


def generate_report(project_id: str = "default") -> dict:
    results = results_dir(project_id)
    report = report_dir(project_id)
    results.mkdir(parents=True, exist_ok=True)
    report.mkdir(parents=True, exist_ok=True)

    lock = _lock_for(project_id)
    if not lock.acquire(blocking=False):
        return {
            "status": "busy",
            "project_id": project_id,
            "message": "generate already running for this project",
        }

    _set_status(project_id, {"status": "running"})
    started = time.monotonic()
    try:
        history_copied = False
        if KEEP_HISTORY:
            history_copied = _copy_history(results, report)

        # Clear previous HTML so --output is clean.
        _clear_dir(report)

        # Use `allure generate` (not `awesome`): `awesome` hardcodes its own plugin and
        # resets `categories` from allurerc. `generate` honours allurerc.mjs (SecOps
        # categories + variables) and our fork override of @allurereport/plugin-awesome
        # (packages/kdt-plugin-awesome → branded Overview header + minimal dashboard +
        # no external analytics) produces a flat index.html (Overview) + full.html (SPA).
        report_name = (
            os.environ.get("ALLURE_REPORT_NAME")
            or os.environ.get("KDT_ALLURE_REPORT_NAME")
            or os.environ.get("KDT_CHECK_NAME")
            or os.environ.get("KDT_SCENARIO_NAME")
            or (f"Проверка {project_id}" if project_id != "default" else "SecOps Lab")
        ).strip()
        theme = (os.environ.get("ALLURE_THEME") or "dark").strip() or "dark"
        lang = (os.environ.get("ALLURE_LANG") or "ru").strip() or "ru"
        awesome_cmd = [
            ALLURE_BIN,
            "generate",
            str(results),
            "--output",
            str(report),
            "--name",
            report_name,
        ]
        logger.info(
            "generate start project_id=%s history=%s cmd=%s",
            project_id,
            history_copied,
            " ".join(awesome_cmd),
        )
        proc = _run_allure(awesome_cmd)

        elapsed_ms = int((time.monotonic() - started) * 1000)
        index = report / "index.html"
        if proc.returncode != 0 or not index.is_file():
            result = {
                "status": "error",
                "project_id": project_id,
                "exit_code": proc.returncode,
                "elapsed_ms": elapsed_ms,
                "stderr": (proc.stderr or proc.stdout or "")[:2000],
            }
            _set_status(project_id, result)
            return result

        report_url = (
            "/reports/latest/index.html"
            if project_id == "default"
            else f"/projects/{project_id}/reports/latest/index.html"
        )
        result = {
            "status": "ok",
            "project_id": project_id,
            "elapsed_ms": elapsed_ms,
            "history_copied": history_copied,
            "report_url": report_url,
            "engine": "allure3",
        }
        _set_status(project_id, result)
        return result
    except subprocess.TimeoutExpired:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        result = {
            "status": "error",
            "project_id": project_id,
            "elapsed_ms": elapsed_ms,
            "message": "allure3 generate timed out",
        }
        _set_status(project_id, result)
        return result
    finally:
        lock.release()


def enqueue_generate(project_id: str = "default") -> dict[str, Any]:
    lock = _lock_for(project_id)
    if lock.locked():
        return {
            "status": "busy",
            "project_id": project_id,
            "message": "generate already running for this project",
        }

    def _worker() -> None:
        generate_report(project_id)

    thread = threading.Thread(
        target=_worker,
        name=f"allure3-generate-{project_id}",
        daemon=True,
    )
    _set_status(project_id, {"status": "accepted"})
    thread.start()
    return {
        "status": "accepted",
        "project_id": project_id,
        "message": "generate started in background",
        "status_url": f"/generate-status?project_id={project_id}",
        "report_url": (
            "/reports/latest/index.html"
            if project_id == "default"
            else f"/projects/{project_id}/reports/latest/index.html"
        ),
    }


# ── AL3-FRESH-REPAIR: auto-regen watcher (контракт свежести) ──

_auto_regen_started = False


def _results_root() -> Path:
    from .paths import RESULTS_ROOT

    return RESULTS_ROOT


def _result_files(project_id: str) -> List[Path]:
    d = results_dir(project_id)
    if not d.is_dir():
        return []
    return [p for p in d.iterdir() if p.is_file()]


def results_signature(project_id: str) -> tuple[int, float]:
    """Сигнатура сырых results scope: (число файлов, max mtime)."""
    files = _result_files(project_id)
    if not files:
        return (0, 0.0)
    try:
        newest = max(p.stat().st_mtime for p in files)
    except OSError:
        newest = 0.0
    return (len(files), newest)


def list_result_scopes() -> List[str]:
    """Scopes с сырыми results: default (файлы корня) + подпапки проектов."""
    root = _results_root()
    scopes: List[str] = []
    if not root.is_dir():
        return scopes
    if any(p.is_file() for p in root.iterdir()):
        scopes.append("default")
    for child in root.iterdir():
        if not child.is_dir():
            continue
        try:
            validate_project_id(child.name)
        except ValueError:
            continue
        try:
            has_files = any(p.is_file() for p in child.iterdir())
        except OSError:
            continue
        if has_files:
            scopes.append(child.name)
    return scopes


def _auto_regen_tick(state: dict[str, tuple[int, float, float]]) -> None:
    for scope in list_result_scopes():
        sig = results_signature(scope)
        prev = state.get(scope)
        if prev is None:
            # Baseline при старте: если results свежее отчёта — «лечим» stale
            # (например, результаты писались, а generate никто не дёргал),
            # иначе просто запоминаем и генерацию зря не запускаем.
            try:
                report_ts = (report_dir(scope) / "index.html").stat().st_mtime
            except OSError:
                report_ts = 0.0
            pending = time.time() if sig[1] > report_ts else 0.0
            state[scope] = (sig[0], sig[1], pending)
            continue
        if (sig[0], sig[1]) != (prev[0], prev[1]):
            # Результаты ещё пишутся — сдвигаем окно дебаунса.
            state[scope] = (sig[0], sig[1], time.time())
            continue
        if prev[2] and (time.time() - prev[2]) >= AUTO_REGEN_DEBOUNCE_SEC:
            if not _lock_for(scope).locked():
                logger.info("auto-regen scope=%s files=%d (debounce elapsed)", scope, sig[0])
                try:
                    generate_report(scope)
                except Exception:
                    logger.exception("auto-regen failed scope=%s", scope)
            state[scope] = (sig[0], sig[1], 0.0)


def _auto_regen_loop() -> None:
    state: dict[str, tuple[int, float, float]] = {}
    while True:
        time.sleep(max(0.2, AUTO_REGEN_INTERVAL_SEC))
        try:
            _auto_regen_tick(state)
        except Exception:
            logger.exception("auto-regen tick failed")


def start_auto_regen() -> bool:
    """Запустить фоновый watcher (idempotent). False — выключен/уже запущен."""
    global _auto_regen_started
    if not AUTO_REGEN:
        return False
    with _locks_guard:
        if _auto_regen_started:
            return False
        _auto_regen_started = True
    thread = threading.Thread(target=_auto_regen_loop, name="allure3-auto-regen", daemon=True)
    thread.start()
    logger.info(
        "auto-regen watcher started (interval=%.1fs debounce=%.1fs)",
        AUTO_REGEN_INTERVAL_SEC,
        AUTO_REGEN_DEBOUNCE_SEC,
    )
    return True
