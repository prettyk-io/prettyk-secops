# -*- coding: utf-8 -*-
# PoC — NOT production. Cosmoport boundary. Do not import into DAST runtime.
"""COS-013/014/015: infra tests — compose, Caddy, health endpoints."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_orch_root = Path(__file__).resolve().parents[1]
_repo_root = _orch_root.parent
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


SERVICES_DIR = _repo_root / "services"


# ═══════════════════════════════════════════════════════════════════════════
# COS-013: Docker Compose
# ═══════════════════════════════════════════════════════════════════════════

class TestCosmoCompose:
    def test_compose_file_exists(self):
        assert (SERVICES_DIR / "docker-compose.cosmo.yml").is_file()

    def test_services_present(self):
        text = (SERVICES_DIR / "docker-compose.cosmo.yml").read_text(encoding="utf-8")
        for svc in ("gitea", "woodpecker", "minio", "cosmo-api"):
            assert f"  {svc}:" in text, f"missing service {svc}"

    def test_ports(self):
        text = (SERVICES_DIR / "docker-compose.cosmo.yml").read_text(encoding="utf-8")
        assert "3000:3000" in text   # Gitea
        assert "8000:8000" in text   # Woodpecker
        assert "9000:9000" in text   # MinIO
        assert "8100:8100" in text   # Cosmo API

    def test_healthchecks(self):
        text = (SERVICES_DIR / "docker-compose.cosmo.yml").read_text(encoding="utf-8")
        assert text.count("healthcheck:") >= 4

    def test_depends_on_service_healthy(self):
        text = (SERVICES_DIR / "docker-compose.cosmo.yml").read_text(encoding="utf-8")
        assert "condition: service_healthy" in text


# ═══════════════════════════════════════════════════════════════════════════
# COS-014: Caddy
# ═══════════════════════════════════════════════════════════════════════════

class TestCaddy:
    def test_caddyfile_exists(self):
        assert (SERVICES_DIR / "Caddyfile").is_file()

    def test_single_entry_443(self):
        text = (SERVICES_DIR / "Caddyfile").read_text(encoding="utf-8")
        assert ":443" in text

    def test_reverse_proxy_all_services(self):
        text = (SERVICES_DIR / "Caddyfile").read_text(encoding="utf-8")
        assert "cosmo-api:8100" in text
        assert "cosmo-gitea:3000" in text
        assert "cosmo-minio:9000" in text

    def test_auto_tls(self):
        text = (SERVICES_DIR / "Caddyfile").read_text(encoding="utf-8")
        assert "auto_https" in text or "tls" in text.lower()


# ═══════════════════════════════════════════════════════════════════════════
# COS-015: Health endpoints
# ═══════════════════════════════════════════════════════════════════════════

class TestCosmoHealth:
    def test_live_response(self):
        from infra.cosmo_health import live_response
        r = live_response()
        assert r["live"] is True
        assert r["service"] == "cosmo-api"

    def test_ready_response(self):
        from infra.cosmo_health import ready_response
        r = ready_response()
        assert "ready" in r
        assert "checks" in r

    def test_health_response(self):
        from infra.cosmo_health import health_response
        r = health_response()
        assert r["live"] is True
        assert r["version"] == "2.0.0"
        assert "uptime_s" in r

    def test_build_cosmo_health_returns_service(self):
        from infra.cosmo_health import build_cosmo_health
        h = build_cosmo_health()
        assert h._name == "cosmo-api"

    def test_pure_box_self_contained(self, monkeypatch):
        """COS-015: Pure Box — только filesystem check, без PG/Valkey."""
        monkeypatch.setenv("PK_DEPLOY_PROFILE", "pure-box")
        from infra.cosmo_health import build_cosmo_health
        h = build_cosmo_health()
        checks = h._checks
        assert "filesystem" in checks
        assert "postgres" not in checks  # Pure Box не требует PG
        assert "valkey" not in checks