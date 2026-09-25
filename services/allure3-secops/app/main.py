# -*- coding: utf-8 -*-
"""allure3-secops — Allure 3 Awesome HTTP API (:5050). Канон после миграции."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse

from . import generate as gen
from .app_dashboard import render_app_dashboard
from .paths import PathError, latest_report_dir, report_dir, validate_project_id

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("allure3-secops")


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # AL3-FRESH-REPAIR: фоновый watcher регенерирует отчёт scope'а, чьи results
    # изменились (run finalize, стабы, smoke) — без ручного триггера.
    if gen.start_auto_regen():
        logger.info("auto-regen enabled")
    yield


app = FastAPI(
    title="allure3-secops",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=_lifespan,
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "allure3-secops", "engine": "allure3"}


@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse(url="/reports/latest/index.html")


def _project_id(project_id: str) -> str:
    try:
        return validate_project_id(project_id)
    except PathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _as_bool(value: str | bool | None) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "async"}


@app.get("/generate-report")
def generate_report_endpoint(
    project_id: str = Query(default="default"),
    async_mode: str = Query(default="false", alias="async"),
):
    pid = _project_id(project_id)
    if _as_bool(async_mode):
        result = gen.enqueue_generate(pid)
        if result.get("status") == "busy":
            raise HTTPException(status_code=409, detail=result)
        return JSONResponse(status_code=202, content=result)

    result = gen.generate_report(pid)
    if result.get("status") == "busy":
        raise HTTPException(status_code=409, detail=result)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result)
    return result


@app.get("/generate-status")
def generate_status_endpoint(
    project_id: str = Query(default="default"),
) -> dict:
    return gen.get_status(_project_id(project_id))


@app.get("/clean-results")
def clean_results_endpoint(
    project_id: str = Query(default="default"),
) -> dict:
    return gen.clean_results(_project_id(project_id))


@app.get("/app/{app_code}")
def app_dashboard(app_code: str):
    """AL3-INSTANCE I2: self-contained app dashboard from runs_index."""
    html = render_app_dashboard(app_code)
    return HTMLResponse(content=html, status_code=200)


@app.get("/apps")
def apps_dashboard():
    """AL3-INSTANCE I2: all apps dashboard."""
    html = render_app_dashboard("_all")
    return HTMLResponse(content=html, status_code=200)


@app.get("/projects/{project_id}/reports/latest")
def report_latest_redirect(project_id: str) -> RedirectResponse:
    pid = _project_id(project_id)
    if pid == "default":
        return RedirectResponse(url="/reports/latest/index.html")
    return RedirectResponse(url=f"/projects/{pid}/reports/latest/index.html")


@app.get("/projects/{project_id}/reports/latest/{rest:path}")
def project_report_serve(project_id: str, rest: str = "") -> FileResponse:
    """Динамическая раздача per‑project статики (Allure3)."""
    pid = _project_id(project_id)
    if pid == "default":
        raise HTTPException(status_code=404, detail="use /reports/latest/ for default")
    return _serve_report_file(report_dir(pid), rest)


def _serve_report_file(scope: Path, rest: str) -> FileResponse:
    """Отдать файл из папки отчёта с защитой от path-escape."""
    target = (scope / (rest or "index.html")).resolve()
    try:
        target.relative_to(scope.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="path escape")
    if not target.is_file():
        raise HTTPException(status_code=404, detail=f"not a file: {rest}")
    mt = "text/html" if target.suffix == ".html" else None
    return FileResponse(str(target), media_type=mt)


@app.get("/reports/latest")
def latest_report_bare() -> RedirectResponse:
    return RedirectResponse(url="/reports/latest/index.html")


@app.get("/reports/latest/{rest:path}")
def latest_report_serve(rest: str = "") -> FileResponse:
    """AL3-FRESH-REPAIR: канон `/reports/latest/...` = САМЫЙ СВЕЖИЙ отчёт.

    Раньше здесь был статик-маунт корня default-отчёта: если прогоны шли
    per-check, `/reports/latest` показывал залежавшийся default (жалоба
    «лог с 22 августа»). Теперь отдаём папку отчёта scope'а с самым свежим
    mtime СЫРЫХ results (последняя активность прогона; paths.latest_report_dir):
    default или последнего чека; default-режим работает как раньше.
    """
    scope = latest_report_dir() or report_dir("default")
    return _serve_report_file(scope, rest)


def _prepare_default_report() -> None:
    report = report_dir("default")
    report.mkdir(parents=True, exist_ok=True)
    index = report / "index.html"
    if not index.exists():
        index.write_text(
            "<!doctype html><html><body><p>allure3-secops: report not generated yet. "
            "Call <code>/generate-report</code>. Brand: SecOps dark RU.</p></body></html>",
            encoding="utf-8",
        )
    logger.info("default report dir ready at %s (served via /reports/latest)", report)


_prepare_default_report()
