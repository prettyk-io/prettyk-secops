"""
EDGE-1/2: Политика сетевой границы (self-hosted профиль).

EDGE-1: внешний мир видит один порт (443). Внутренние сервисы (PG, Valkey,
        scanner, OpenBao, Grid) наружу не выставляются. Реальный reverse proxy —
        стандартный Caddy (`services/Caddyfile`), не самописный.
EDGE-2: CORS и rate-limiting — единая политика на границе, а не в каждом
        сервисе. Неразрешённый origin → 403; превышение лимита → 429.

Этот модуль — ЕДИНЫЙ ИСТОЧНИК политики: Caddy-конфиг и in-process middleware
проверяются против одних и тех же значений (`EdgePolicy`), поэтому конфиг
границы и код не расходятся.

Модуль не делает I/O и не зависит от web-фреймворка — его можно подключить
как FastAPI/ASGI middleware, но авторитетный шлюз — Caddy.
"""
from __future__ import annotations

import math
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Callable, Iterable


# Порты, которые НИКОГДА не публикуются наружу (EDGE-1).
# Значение = человекочитаемое имя сервиса для диагностики.
INTERNAL_ONLY_PORTS: dict[int, str] = {
    5432: "postgres",
    6379: "valkey",
    8200: "openbao",
    8080: "scanner",
    9000: "minio",
    3000: "gitea",
    8000: "woodpecker",
    8100: "cosmo-api",
    5173: "frontend",
    9223: "playwright-authoring-cdp",
    7902: "playwright-authoring-novnc",
}

# Единственные порты, которые разрешено публиковать (EDGE-1).
EDGE_PUBLIC_PORTS: frozenset[int] = frozenset({443, 80})

# Дефолтный allowlist origin'ов self-hosted профиля.
DEFAULT_ALLOWED_ORIGINS: frozenset[str] = frozenset({"https://localhost", "https://127.0.0.1"})


@dataclass(frozen=True)
class EdgePolicy:
    """Единая политика границы: кому отвечаем (CORS) и как часто (rate limit)."""

    allowed_origins: frozenset[str] = DEFAULT_ALLOWED_ORIGINS
    rate_limit_events: int = 120
    rate_limit_window_s: float = 60.0
    allow_missing_origin: bool = True

    def is_origin_allowed(self, origin: str | None) -> bool:
        """Origin разрешён? Пустой origin (same-origin/non-browser) — по флагу."""
        if origin is None or origin == "":
            return self.allow_missing_origin
        return origin in self.allowed_origins

    def to_dict(self) -> dict:
        return {
            "allowed_origins": sorted(self.allowed_origins),
            "rate_limit_events": self.rate_limit_events,
            "rate_limit_window_s": self.rate_limit_window_s,
            "allow_missing_origin": self.allow_missing_origin,
        }


@dataclass(frozen=True)
class EdgeDecision:
    """Решение границы по запросу. `allowed` = пропустить к бэкенду."""

    status: int
    reason: str
    headers: dict[str, str] = field(default_factory=dict)

    @property
    def allowed(self) -> bool:
        return self.status == 200

    def to_dict(self) -> dict:
        return {"status": self.status, "reason": self.reason, "headers": dict(self.headers)}


class SlidingWindowRateLimiter:
    """Rate limiter со скользящим окном на ключ клиента (потокобезопасный)."""

    def __init__(self, limit: int, window_s: float) -> None:
        if limit <= 0:
            raise ValueError("limit must be > 0")
        if window_s <= 0:
            raise ValueError("window_s must be > 0")
        self._limit = limit
        self._window_s = float(window_s)
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, now: float | None = None) -> tuple[bool, float]:
        """Вернуть (пропущен, retry_after_s). Превышение → (False, >0)."""
        now = time.monotonic() if now is None else now
        cutoff = now - self._window_s
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self._limit:
                retry_after = max(hits[0] + self._window_s - now, 0.0)
                return False, max(retry_after, 0.001)
            hits.append(now)
            return True, 0.0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._hits)


class EdgeGateway:
    """In-process применение `EdgePolicy` (middleware-совместимый контракт).

    Авторитетный шлюз — Caddy; этот класс повторяет ту же политику для
    приложения и для тестов без поднятия reverse proxy.
    """

    def __init__(
        self,
        policy: EdgePolicy | None = None,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._policy = policy or EdgePolicy()
        self._clock = clock
        self._limiter = SlidingWindowRateLimiter(
            self._policy.rate_limit_events,
            self._policy.rate_limit_window_s,
        )

    @property
    def policy(self) -> EdgePolicy:
        return self._policy

    # ── CORS ────────────────────────────────────────────────────────

    def cors_headers(self, origin: str) -> dict[str, str]:
        """Заголовки для разрешённого origin."""
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "600",
            "Vary": "Origin",
        }

    def preflight(self, origin: str | None) -> EdgeDecision:
        """OPTIONS-предполёт: разрешённый origin → 204 с CORS-заголовками."""
        if not self._policy.is_origin_allowed(origin):
            return EdgeDecision(403, "origin_not_allowed", {"Vary": "Origin"})
        return EdgeDecision(204, "preflight_ok", self.cors_headers(origin or ""))

    # ── Основная проверка ───────────────────────────────────────────

    def check(
        self,
        origin: str | None,
        client: str,
        now: float | None = None,
    ) -> EdgeDecision:
        """Проверить запрос до передачи в бэкенд.

        Порядок: origin (403) → лимит (429) → пропуск (200 + CORS).
        """
        if not self._policy.is_origin_allowed(origin):
            return EdgeDecision(403, "origin_not_allowed", {"Vary": "Origin"})

        moment = self._clock() if now is None else now
        allowed, retry_after = self._limiter.check(client, moment)
        if not allowed:
            return EdgeDecision(
                429,
                "rate_limited",
                {"Retry-After": str(int(math.ceil(retry_after))), "Vary": "Origin"},
            )

        if origin:
            return EdgeDecision(200, "ok", self.cors_headers(origin))
        return EdgeDecision(200, "ok", {})

    def reset(self) -> None:
        self._limiter.reset()


# ── Анти-дрейф: Caddy-конфиг должен нести ту же политику ────────────


def caddy_origin_allowlist(origins: Iterable[str] | None = None) -> list[str]:
    """Origin'ы, которые обязаны присутствовать в Caddyfile (по одному на строку)."""
    source = DEFAULT_ALLOWED_ORIGINS if origins is None else origins
    return [f"{o} " for o in sorted(source)]


def render_caddy_edge_block(policy: EdgePolicy | None = None) -> str:
    """Фрагмент Caddy-конфига, реализующий `EdgePolicy` (EDGE-2).

    CORS-allowlist выражается стандартными матчерами Caddy (`header`/`not`):
    неразрешённый Origin → 403, preflight → 204. Rate limit — директивой
    `rate_limit` (плагин caddy-ratelimit).
    """
    policy = policy or EdgePolicy()
    origins = " ".join(sorted(policy.allowed_origins))
    window = f"{int(policy.rate_limit_window_s)}s"
    return (
        "# EDGE-2: единая CORS-политика (allowlist)\n"
        f"@allowed_origin header Origin {origins}\n"
        "@bad_origin {\n"
        "    header Origin *\n"
        "    not header Origin " + origins + "\n"
        "}\n"
        "respond @bad_origin 403\n"
        "\n"
        "# EDGE-2: preflight\n"
        "@preflight method OPTIONS\n"
        "handle @preflight {\n"
        "    header Access-Control-Allow-Origin \"{http.request.header.Origin}\"\n"
        "    header Access-Control-Allow-Methods \"GET, POST, PUT, PATCH, DELETE, OPTIONS\"\n"
        "    header Access-Control-Allow-Headers \"Content-Type, Authorization\"\n"
        "    header Access-Control-Max-Age \"600\"\n"
        "    header Vary \"Origin\"\n"
        "    respond 204\n"
        "}\n"
        "\n"
        "# EDGE-2: rate limit\n"
        "rate_limit {\n"
        "    zone edge {\n"
        "        key {http.request.remote.host}\n"
        f"        events {policy.rate_limit_events}\n"
        f"        window {window}\n"
        "    }\n"
        "}\n"
    )
