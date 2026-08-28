# PoC — NOT production. Cosmoport boundary. Do not import into DAST runtime.
"""
COS-015: Health endpoints — /live /ready /health для Cosmo API.

Три стандартных endpoint'а:
  /live  → 200 (процесс жив, без проверок зависимостей)
  /ready → 200 (PG + Valkey + Gitea доступны)
  /health → 200 + детали (версия, uptime, зависимости)

Переиспользует infra.health.ServiceHealth + инфра-проверки.
"""
from __future__ import annotations

from infra.health import ServiceHealth, check_postgres, check_valkey, check_filesystem
from infra.profiles import is_enterprise, is_pure_box


def build_cosmo_health() -> ServiceHealth:
    """Собрать health-контроллер для Cosmo API с учётом профиля.

    Enterprise: проверяет PG + Valkey + Gitea.
    Pure Box: самодостаточный — только filesystem.
    """
    h = ServiceHealth("cosmo-api", version="2.0.0")

    if is_enterprise():
        # Enterprise-зависимости
        h.register_check("postgres", check_postgres)
        h.register_check("valkey", check_valkey)
        # Gitea — мягкая проверка (не блокирует ready при недоступности в dev)
        def _check_gitea() -> bool:
            import os
            import requests
            url = os.environ.get("PK_GITEA_URL", "http://gitea:3000")
            try:
                r = requests.get(f"{url}/api/v1/version", timeout=3)
                return r.status_code == 200
            except Exception:
                return False
        h.register_check("gitea", _check_gitea)
    else:
        # Pure Box — самодостаточный
        h.register_check("filesystem", check_filesystem("."))

    return h


# Глобальный health-контроллер
_cosmo_health = build_cosmo_health()


def get_cosmo_health() -> ServiceHealth:
    return _cosmo_health


# ── Endpoint-хендлеры (используются в FastAPI routes) ──

def live_response() -> dict:
    """GET /live — процесс жив."""
    return get_cosmo_health().live().as_dict()


def ready_response() -> dict:
    """GET /ready — зависимости готовы."""
    return get_cosmo_health().ready().as_dict()


def health_response() -> dict:
    """GET /health — полный статус."""
    return get_cosmo_health().health().as_dict()