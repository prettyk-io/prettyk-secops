"""
HEALTH-1: Стандартный health-контракт для всех управляемых сервисов PrettyK.

Каждый сервис через единый модуль возвращает:
  - /live — процесс жив
  - /ready — готов принимать трафик (зависимости живы)
  - /health — полный статус (live + ready + draining + checks)
  - draining — сервис завершает текущие задачи, новые не принимает

Контракт: "готов" ≠ "жив" — без PG сервис возвращает live=True, ready=False.
"""
from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class HealthStatus:
    """Стандартный health-ответ для любого сервиса PrettyK."""
    service: str
    live: bool          # процесс жив
    ready: bool         # готов к трафику (зависимости OK)
    draining: bool      # graceful shutdown
    checks: dict[str, bool] = field(default_factory=dict)  # dependency checks
    uptime_s: float = 0.0
    timestamp: float = field(default_factory=time.time)
    version: str = "1.0.0"

    def as_dict(self) -> dict:
        return {
            "service": self.service,
            "live": self.live,
            "ready": self.ready,
            "draining": self.draining,
            "checks": self.checks,
            "uptime_s": round(self.uptime_s, 1),
            "timestamp": self.timestamp,
            "version": self.version,
        }


class ServiceHealth:
    """Health-контроллер сервиса.

    Регистрирует проверки зависимостей и управляет draining.
    Контракт HEALTH-1: live (процесс жив), ready (зависимости), draining.
    """

    def __init__(self, service_name: str, version: str = "1.0.0"):
        self._name = service_name
        self._version = version
        self._start_time = time.time()
        self._draining = False
        self._checks: dict[str, Callable[[], bool]] = {}
        self._lock = threading.Lock()

    def register_check(self, name: str, fn: Callable[[], bool]) -> None:
        """Зарегистрировать проверку зависимости (например PG connectivity)."""
        self._checks[name] = fn

    def start_draining(self) -> None:
        """Перевести сервис в draining — не принимать новую работу."""
        with self._lock:
            self._draining = True

    def live(self) -> HealthStatus:
        """Только liveness — процесс жив? Никаких проверок зависимостей."""
        return HealthStatus(
            service=self._name,
            live=True,          # если код исполнился — процесс жив
            ready=False,        # /live не проверяет зависимости
            draining=self._draining,
            uptime_s=time.time() - self._start_time,
            version=self._version,
        )

    def ready(self) -> HealthStatus:
        """Readiness — все зарегистрированные проверки зависимостей зелёные?"""
        checks = {}
        for name, fn in self._checks.items():
            try:
                checks[name] = fn()
            except Exception:
                checks[name] = False

        all_ready = all(checks.values()) if checks else True
        return HealthStatus(
            service=self._name,
            live=True,
            ready=all_ready and not self._draining,
            draining=self._draining,
            checks=checks,
            uptime_s=time.time() - self._start_time,
            version=self._version,
        )

    def health(self) -> HealthStatus:
        """Полный health: live + ready + все checks."""
        return self.ready()  # ready уже включает live


# ── Встроенные проверки зависимостей ──

def check_postgres() -> bool:
    """Проверка: PostgreSQL доступен."""
    try:
        import psycopg2
        dsn = os.environ.get("PK_PG_DSN", "postgresql://postgres:postgres@localhost:5432/postgres")
        conn = psycopg2.connect(dsn, connect_timeout=3)
        conn.close()
        return True
    except Exception:
        return False


def check_valkey() -> bool:
    """Проверка: Valkey доступен."""
    try:
        import redis
        host = os.environ.get("PK_VALKEY_HOST", "localhost")
        port = int(os.environ.get("PK_VALKEY_PORT", "6379"))
        r = redis.Redis(host=host, port=port, socket_connect_timeout=3)
        return r.ping()
    except Exception:
        return False


def check_filesystem(path: str = ".") -> Callable[[], bool]:
    """Проверка: файловая система доступна на запись."""
    def _check() -> bool:
        import tempfile
        try:
            d = os.path.join(path, ".pk_health_check")
            os.makedirs(d, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=d, delete=True):
                pass
            return True
        except Exception:
            return False
    return _check


# ── Глобальный health синглтон для Playground ──

_playground_health = ServiceHealth("playground")


def get_playground_health() -> ServiceHealth:
    return _playground_health