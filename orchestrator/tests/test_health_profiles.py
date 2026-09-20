# -*- coding: utf-8 -*-
"""RC2-4: HEALTH + PROFILES — жив/готов/draining, Pure Box без внешних сервисов.

Проверяет DoD RC2-4:
  * /live всегда 200, пока процесс жив (draining не влияет);
  * /ready → 503 при мёртвой зависимости или draining;
  * Pure Box НЕ опрашивает внешние сервисы (PG/Valkey/Gitea) — 0 подключений;
  * health-роуты реально зарегистрированы в Cosmo API.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))

from api import health_routes
from infra import cosmo_health
from infra.cosmo_health import build_cosmo_health
from infra.health import ServiceHealth
from infra.profiles import ENTERPRISE_PROFILE


# ── HEALTH-1: live / ready / draining ───────────────────────────────────────


def test_live_is_always_200_even_draining(monkeypatch):
    h = ServiceHealth("cosmo-api")
    h.start_draining()
    monkeypatch.setattr(health_routes, "get_cosmo_health", lambda: h)

    payload, code = health_routes.live_payload()

    assert code == 200
    assert payload["live"] is True
    assert payload["draining"] is True


def test_ready_is_503_when_draining(monkeypatch):
    h = ServiceHealth("cosmo-api")
    h.register_check("db", lambda: True)
    h.start_draining()
    monkeypatch.setattr(health_routes, "get_cosmo_health", lambda: h)

    _, ready_code = health_routes.ready_payload()
    _, health_code = health_routes.health_payload()

    assert ready_code == 503
    assert health_code == 503


def test_ready_is_503_when_dependency_down(monkeypatch):
    h = ServiceHealth("cosmo-api")
    h.register_check("db", lambda: False)
    monkeypatch.setattr(health_routes, "get_cosmo_health", lambda: h)

    payload, code = health_routes.ready_payload()

    assert code == 503
    assert payload["live"] is True  # жив, но не готов
    assert payload["checks"]["db"] is False


def test_health_is_200_when_ready(monkeypatch):
    h = ServiceHealth("cosmo-api")
    h.register_check("db", lambda: True)
    monkeypatch.setattr(health_routes, "get_cosmo_health", lambda: h)

    payload, code = health_routes.health_payload()

    assert code == 200
    assert payload["ready"] is True
    assert payload["draining"] is False


def test_draining_property_exposed():
    h = ServiceHealth("svc")
    assert h.draining is False
    h.start_draining()
    assert h.draining is True


# ── PROFILES-1: Pure Box не трогает внешние сервисы ─────────────────────────


def test_pure_box_does_not_probe_external_services(monkeypatch):
    calls: list[str] = []

    def _boom(name: str):
        def _fn():
            calls.append(name)
            raise AssertionError(f"Pure Box не должен звать {name}")
        return _fn

    monkeypatch.setattr(cosmo_health, "check_postgres", _boom("postgres"))
    monkeypatch.setattr(cosmo_health, "check_valkey", _boom("valkey"))

    h = build_cosmo_health("pure-box")

    assert set(h._checks) == {"filesystem"}
    assert calls == []          # ни одного подключения
    assert h.ready().ready is True


def test_enterprise_registers_external_checks():
    h = build_cosmo_health(ENTERPRISE_PROFILE)

    assert {"postgres", "valkey", "gitea"} <= set(h._checks)


def test_pure_box_endpoints_green(monkeypatch):
    h = build_cosmo_health("pure-box")
    monkeypatch.setattr(health_routes, "get_cosmo_health", lambda: h)

    assert health_routes.live_payload()[1] == 200
    assert health_routes.ready_payload()[1] == 200
    assert health_routes.health_payload()[1] == 200


def test_pure_box_profile_independent_of_env(monkeypatch):
    monkeypatch.setenv("PK_DEPLOY_PROFILE", "enterprise")

    h = build_cosmo_health("pure-box")

    assert set(h._checks) == {"filesystem"}


# ── Роуты реально зарегистрированы в Cosmo API ──────────────────────────────


def test_health_routes_registered_on_app():
    from fastapi.testclient import TestClient

    from api.cosmo_crud import app

    client = TestClient(app)

    live = client.get("/live")
    assert live.status_code == 200
    assert live.json()["service"] == "cosmo-api"

    # /ready зависит от профиля/доступности PG — код 200 или 503, но роут есть.
    assert client.get("/ready").status_code in (200, 503)
    assert client.get("/health").status_code in (200, 503)
