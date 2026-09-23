# HEALTH-2: order-of-start — статическая валидация docker compose hardening.
#
# Проверяем инвариант «инфраструктура → бизнес» без поднятия стенда:
#   1. Каждый DB-сервис (postgres / valkey / redis / openbao / vault по image)
#      ОБЯЗАН иметь healthcheck — иначе `service_healthy` не сработает.
#   2. Любой бизнес-сервис, зависящий от DB-сервиса, ОБЯЗАН ждать его через
#      `condition: service_healthy`, а не `service_started` (started не
#      гарантирует, что БД принимает соединения).
#
# Читает YAML статически (read-only), не требует docker. Ломается при регрессии:
# кто-то откатил healthcheck или заменил service_healthy на service_started.
from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

# Инфраструктурные БД/хранилища, которым нужен healthcheck + health-gating.
_DB_IMAGE_RE = re.compile(r"(postgres|valkey|redis|openbao|vault)", re.IGNORECASE)

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _compose_files() -> list[Path]:
    files = sorted((_REPO_ROOT / "services").glob("docker-compose*.yml"))
    keycloak = _REPO_ROOT / "frontend" / "docker-compose.keycloak.yml"
    if keycloak.exists():
        files.append(keycloak)
    return files


def _load(path: Path) -> dict:
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    return doc or {}


def _db_service_names(doc: dict) -> set[str]:
    """Имена сервисов, которые по image являются БД/хранилищем."""
    names: set[str] = set()
    for name, svc in (doc.get("services") or {}).items():
        image = str(svc.get("image", ""))
        if _DB_IMAGE_RE.search(image):
            names.add(name)
    return names


def _collect() -> list[tuple[Path, dict]]:
    return [(f, _load(f)) for f in _compose_files()]


# ── 1. DB-сервисы обязаны иметь healthcheck ────────────────────────────────

class TestDbServicesHaveHealthcheck:
    @pytest.mark.parametrize("path,doc", _collect(), ids=[f.name for f in _compose_files()])
    def test_every_db_service_has_healthcheck(self, path, doc):
        db_names = _db_service_names(doc)
        services = doc.get("services") or {}
        missing = [n for n in sorted(db_names) if "healthcheck" not in services.get(n, {})]
        assert not missing, (
            f"{path.name}: DB-сервисы без healthcheck: {missing}. "
            f"Без healthcheck `condition: service_healthy` не сработает."
        )


# ── 2. Бизнес-сервисы ждут БД через service_healthy ────────────────────────

class TestBusinessWaitsForDbHealthy:
    @pytest.mark.parametrize("path,doc", _collect(), ids=[f.name for f in _compose_files()])
    def test_db_dependencies_use_service_healthy(self, path, doc):
        db_names = _db_service_names(doc)
        services = doc.get("services") or {}
        violations: list[str] = []
        for name, svc in services.items():
            deps = svc.get("depends_on") or []
            # Унифицируем обе формы: {svc: {condition: X}} и [svc, ...]
            entries = deps.items() if isinstance(deps, dict) else [(d, {}) for d in deps]
            for dep, opts in entries:
                if dep not in db_names:
                    continue
                condition = opts.get("condition") if isinstance(opts, dict) else None
                if condition != "service_healthy":
                    violations.append(f"{name} → {dep} ({condition or 'нет condition'})")
        assert not violations, (
            f"{path.name}: сервисы ждут БД не через service_healthy: {violations}"
        )