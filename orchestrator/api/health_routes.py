# -*- coding: utf-8 -*-
"""HEALTH-1/2: /live /ready /health для Cosmo API.

Контракт (HEALTH-1):
  /live   → 200 всегда, пока процесс жив (draining не влияет);
  /ready  → 200 если зависимости живы и сервис не draining, иначе 503;
  /health → полный статус (live + ready + draining + checks), 200/503.

Pure Box (PROFILES-1): зависимости не опрашиваются, /ready всегда 200.
"""
from __future__ import annotations

from typing import Any

from infra.cosmo_health import get_cosmo_health

try:
    from fastapi import APIRouter
    from fastapi.responses import JSONResponse
except ImportError:  # pragma: no cover — FastAPI опционален для CLI-профиля
    APIRouter = object  # type: ignore[assignment,misc]
    JSONResponse = None  # type: ignore[assignment]


def live_payload() -> tuple[dict[str, Any], int]:
    """Тело и HTTP-код /live — процесс жив."""
    return get_cosmo_health().live().as_dict(), 200


def ready_payload() -> tuple[dict[str, Any], int]:
    """Тело и HTTP-код /ready — 503, если зависимость мертва или draining."""
    status = get_cosmo_health().ready()
    return status.as_dict(), 200 if status.ready else 503


def health_payload() -> tuple[dict[str, Any], int]:
    """Тело и HTTP-код /health — полный статус."""
    status = get_cosmo_health().health()
    return status.as_dict(), 200 if status.ready else 503


def _response(payload: dict[str, Any], status_code: int) -> Any:
    if JSONResponse is None:  # pragma: no cover
        return payload
    return JSONResponse(payload, status_code=status_code)


router = APIRouter()


@router.get("/live")
def live() -> Any:
    payload, code = live_payload()
    return _response(payload, code)


@router.get("/ready")
def ready() -> Any:
    payload, code = ready_payload()
    return _response(payload, code)


@router.get("/health")
def health() -> Any:
    payload, code = health_payload()
    return _response(payload, code)


def register_health_routes(app: Any) -> Any:
    """Подключить health-роуты к FastAPI-приложению."""
    app.include_router(router)
    return app
