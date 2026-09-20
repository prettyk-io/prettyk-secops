# -*- coding: utf-8 -*-
"""RC2-3: EDGE — единая точка входа, CORS и rate-limiting на границе.

Проверяет EDGE-1/2 (DoD RC2-3):
  * неразрешённый origin отклонён на gateway (403);
  * превышение лимита → 429, запрос не доходит до бэкенда;
  * легитимный трафик не блокируется;
  * внутренние сервисы (PG/Valkey/scanner/OpenBao/Grid) не публикуются наружу;
  * Caddy-конфиг и edge-compose несут ту же политику, что и код (анти-дрейф).
"""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from infra.edge_gateway import (
    DEFAULT_ALLOWED_ORIGINS,
    EDGE_PUBLIC_PORTS,
    INTERNAL_ONLY_PORTS,
    EdgeGateway,
    EdgePolicy,
    SlidingWindowRateLimiter,
    caddy_origin_allowlist,
    render_caddy_edge_block,
)

_REPO = Path(__file__).resolve().parents[2]
SERVICES = _REPO / "services"
CADDYFILE = SERVICES / "Caddyfile"
EDGE_COMPOSE = SERVICES / "docker-compose.edge.yml"
CADDY_DOCKERFILE = SERVICES / "caddy.Dockerfile"

ALLOWED = "https://localhost"
DENIED = "https://evil.example"


def make_gateway(**over) -> EdgeGateway:
    return EdgeGateway(EdgePolicy(**over) if over else EdgePolicy())


# ── EDGE-2: CORS ────────────────────────────────────────────────────────────


def test_allowed_origin_passes_with_cors_headers():
    decision = make_gateway().check(ALLOWED, client="1.2.3.4")

    assert decision.status == 200
    assert decision.allowed is True
    assert decision.headers["Access-Control-Allow-Origin"] == ALLOWED
    assert decision.headers["Vary"] == "Origin"


def test_disallowed_origin_rejected():
    decision = make_gateway().check(DENIED, client="1.2.3.4")

    assert decision.status == 403
    assert decision.reason == "origin_not_allowed"
    assert decision.allowed is False
    assert "Access-Control-Allow-Origin" not in decision.headers


def test_missing_origin_allowed_by_default():
    decision = make_gateway().check(None, client="1.2.3.4")

    assert decision.status == 200
    assert decision.headers == {}


def test_missing_origin_can_be_denied():
    decision = make_gateway(allow_missing_origin=False).check("", client="1.2.3.4")

    assert decision.status == 403


def test_preflight_allowed_and_denied():
    gw = make_gateway()

    ok = gw.preflight(ALLOWED)
    assert ok.status == 204
    assert ok.headers["Access-Control-Allow-Methods"].startswith("GET")

    bad = gw.preflight(DENIED)
    assert bad.status == 403


# ── EDGE-2: rate-limiting ───────────────────────────────────────────────────


def test_rate_limit_returns_429():
    gw = make_gateway(rate_limit_events=2, rate_limit_window_s=60.0)

    assert gw.check(ALLOWED, client="c1").status == 200
    assert gw.check(ALLOWED, client="c1").status == 200

    third = gw.check(ALLOWED, client="c1")
    assert third.status == 429
    assert third.reason == "rate_limited"
    assert int(third.headers["Retry-After"]) >= 1


def test_rate_limit_is_per_client():
    gw = make_gateway(rate_limit_events=1, rate_limit_window_s=60.0)

    assert gw.check(ALLOWED, client="c1").status == 200
    assert gw.check(ALLOWED, client="c1").status == 429
    assert gw.check(ALLOWED, client="c2").status == 200  # сосед не страдает


def test_rate_limit_window_recovers():
    now = {"t": 0.0}
    gw = EdgeGateway(
        EdgePolicy(rate_limit_events=1, rate_limit_window_s=10.0),
        clock=lambda: now["t"],
    )

    assert gw.check(ALLOWED, client="c1").status == 200
    now["t"] = 1.0
    assert gw.check(ALLOWED, client="c1").status == 429
    now["t"] = 10.0
    assert gw.check(ALLOWED, client="c1").status == 200


def test_legit_traffic_not_blocked():
    gw = make_gateway(rate_limit_events=120, rate_limit_window_s=60.0)
    statuses = {gw.check(ALLOWED, client="c1").status for _ in range(100)}

    assert statuses == {200}


def test_limiter_rejects_invalid_config():
    with pytest.raises(ValueError):
        SlidingWindowRateLimiter(limit=0, window_s=1.0)
    with pytest.raises(ValueError):
        SlidingWindowRateLimiter(limit=1, window_s=0.0)


def test_reset_clears_rate_limit():
    gw = make_gateway(rate_limit_events=1, rate_limit_window_s=60.0)
    assert gw.check(ALLOWED, client="c1").status == 200
    assert gw.check(ALLOWED, client="c1").status == 429

    gw.reset()
    assert gw.check(ALLOWED, client="c1").status == 200


# ── Анти-дрейф: код ↔ Caddy ↔ compose ───────────────────────────────────────


def test_render_caddy_block_matches_policy():
    policy = EdgePolicy(rate_limit_events=42, rate_limit_window_s=30.0)
    block = render_caddy_edge_block(policy)

    for origin in sorted(policy.allowed_origins):
        assert origin in block
    assert "events 42" in block
    assert "window 30s" in block
    assert "respond @bad_origin 403" in block
    assert "rate_limit" in block


def test_caddy_origin_allowlist_matches_default_policy():
    lines = caddy_origin_allowlist()
    assert len(lines) == len(DEFAULT_ALLOWED_ORIGINS)
    for origin in DEFAULT_ALLOWED_ORIGINS:
        assert f"{origin} " in lines


def test_caddyfile_is_single_entry_with_edge_policy():
    text = CADDYFILE.read_text(encoding="utf-8")

    assert ":443" in text          # единственная внешняя точка входа
    assert ":80" in text           # redirect на 443
    assert "admin off" in text     # admin API не выставляется
    assert "tls internal" in text  # TLS работает
    assert "rate_limit" in text    # EDGE-2: лимит на границе
    assert "respond @bad_origin 403" in text
    assert "flush_interval -1" in text  # WS/SSE не буферизуются
    assert ":2019 {" not in text   # admin-порт не открыт как site


def test_caddyfile_contains_all_allowed_origins():
    text = CADDYFILE.read_text(encoding="utf-8")
    for origin in DEFAULT_ALLOWED_ORIGINS:
        assert origin in text, f"Caddyfile не знает origin {origin}"


def test_caddy_dockerfile_has_ratelimit_plugin():
    text = CADDY_DOCKERFILE.read_text(encoding="utf-8")
    assert "caddy-ratelimit" in text
    assert "xcaddy build" in text


def _load_edge_compose() -> dict:
    return yaml.safe_load(EDGE_COMPOSE.read_text(encoding="utf-8"))


def _published_host_ports(compose: dict) -> list[tuple[str, int]]:
    published = []
    for name, svc in compose["services"].items():
        for entry in svc.get("ports", []):
            host = str(entry).split(":")[0].strip('"')
            published.append((name, int(host)))
    return published


def test_edge_compose_only_caddy_publishes_ports():
    compose = _load_edge_compose()
    with_ports = [n for n, s in compose["services"].items() if s.get("ports")]

    assert with_ports == ["caddy"]
    published = {p for _, p in _published_host_ports(compose)}
    assert published <= EDGE_PUBLIC_PORTS
    assert 443 in published


def test_edge_compose_internal_services_have_no_host_ports():
    compose = _load_edge_compose()
    internal = [n for n in compose["services"] if n != "caddy"]

    assert internal, "edge compose должен содержать внутренние сервисы"
    for name in internal:
        assert "ports" not in compose["services"][name], f"{name} публикует порт"
        assert "expose" in compose["services"][name], f"{name} не описывает expose"


def test_internal_only_ports_never_published():
    compose = _load_edge_compose()
    published = {p for _, p in _published_host_ports(compose)}

    leaked = published & set(INTERNAL_ONLY_PORTS)
    assert leaked == set(), f"внутренние порты наружу: {sorted(leaked)}"
