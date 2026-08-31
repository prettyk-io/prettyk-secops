# Lease Controller — жизненный цикл сессий и zombie GC.
#
# Фоновый reconciler, который:
#   1. Зачищает истёкшие lease (оператор закрыл вкладку / pk-control упал).
#   2. Восстанавливает Session Map после рестарта по Docker-лейблам.
#   3. Предотвращает зомби-контейнеры: если lease не продлён, ресурсы
#      уничтожаются, а не висят бесхозными.
#
# Модель lease:
#   - Каждая сессия получает lease_expires_at (Unix timestamp).
#   - Живой оператор/Studio продлевает lease heartbeat'ом.
#   - Если lease истекает + grace_period — сессия признаётся зомби.
#   - Fencing token (generation) защищает от split-brain:
#     старый generation-запрос к рантайму получает 409 Conflict.
#
# Инварианты:
#   - Нет бесхозных контейнеров после рестарта pk-control.
#   - Нет утечек ресурсов при аварийном закрытии вкладки.
#   - Контейнеры ищутся по labels, а не по имени проекта (живучее in-memory карты).
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class SessionLease:
    """Lease одной сессии."""
    session_id: str
    generation: int
    status: str = "active"             # active | expired | zombie | released
    lease_expires_at: float = 0.0
    created_at: float = field(default_factory=time.time)
    last_heartbeat: float = field(default_factory=time.time)

    def is_expired(self, now: Optional[float] = None) -> bool:
        _now = now or time.time()
        return _now > self.lease_expires_at

    def renew(self, lease_seconds: float) -> None:
        self.lease_expires_at = time.time() + lease_seconds
        self.last_heartbeat = time.time()
        self.generation += 1


class LeaseController:
    """Фоновый контроллер lease и zombie GC.

    Работает как AsyncIO-таск внутри pk-control. Не требует базы данных
    для базовой работы — Docker labels служат source of truth.
    При наличии persistent store (PostgreSQL) пишет туда для audit.
    """

    def __init__(
        self,
        default_lease_seconds: float = 3600.0,
        sweep_interval_seconds: float = 30.0,
        grace_period_seconds: float = 60.0,
    ):
        self._leases: Dict[str, SessionLease] = {}
        self._default_lease = default_lease_seconds
        self._sweep_interval = sweep_interval_seconds
        self._grace_period = grace_period_seconds
        self._running = False
        self._task: Optional[asyncio.Task[None]] = None

    # ── Public API ─────────────────────────────────────────────────

    async def start(self, provider=None) -> None:
        """Запустить фоновый reconciler.

        provider — опциональный RuntimeProvider для force teardown зомби.
        """
        self._running = True
        self._provider = provider

        # Восстановить состояние по Docker-лейблам.
        await self._reconstruct_from_labels()

        self._task = asyncio.create_task(self._sweep_loop())
        logger.info("LeaseController started (sweep=%ds, grace=%ds)",
                     self._sweep_interval, self._grace_period)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                raise  # NOSONAR — re-raise after cleanup
            self._task = None
        logger.info("LeaseController stopped")

    def register(self, session_id: str, lease_seconds: Optional[float] = None) -> SessionLease:
        """Зарегистрировать новую сессию."""
        lease = SessionLease(
            session_id=session_id,
            generation=1,
            lease_expires_at=time.time() + (lease_seconds or self._default_lease),
        )
        self._leases[session_id] = lease
        logger.info("Lease registered: %s (expires +%ds)",
                     session_id, lease_seconds or self._default_lease)
        return lease

    def heartbeat(self, session_id: str, lease_seconds: Optional[float] = None) -> Optional[int]:
        """Продлить lease. Возвращает новый generation или None если сессия не найдена."""
        lease = self._leases.get(session_id)
        if lease is None:
            return None
        lease.renew(lease_seconds or self._default_lease)
        return lease.generation

    def get(self, session_id: str) -> Optional[SessionLease]:
        return self._leases.get(session_id)

    def active_sessions(self) -> List[SessionLease]:
        now = time.time()
        return [l for l in self._leases.values()
                if not l.is_expired(now) and l.status == "active"]

    def snapshot(self) -> dict:
        now = time.time()
        return {
            "total": len(self._leases),
            "active": sum(1 for l in self._leases.values() if l.status == "active" and not l.is_expired(now)),
            "expired": sum(1 for l in self._leases.values() if l.status != "released" and l.is_expired(now)),
            "zombie": sum(1 for l in self._leases.values() if l.status == "zombie"),
            "released": sum(1 for l in self._leases.values() if l.status == "released"),
            "leases": {
                sid: {
                    "generation": l.generation,
                    "status": l.status,
                    "expires_in": max(0.0, l.lease_expires_at - now),
                }
                for sid, l in self._leases.items()
            },
        }

    # ── Reconciler loop ─────────────────────────────────────────────

    async def _sweep_loop(self) -> None:
        while self._running:
            try:
                await self._sweep_expired()
            except Exception:
                logger.exception("Lease sweep failed")
            await asyncio.sleep(self._sweep_interval)

    async def _sweep_expired(self) -> None:
        """Найти истёкшие lease, уничтожить зомби-ресурсы."""
        now = time.time()
        expired: List[SessionLease] = []
        for lease in list(self._leases.values()):
            if lease.status == "released":
                continue
            if lease.is_expired(now):
                # Grace period: даём шанс на reconnect.
                age = now - lease.lease_expires_at
                if age < self._grace_period:
                    continue
                lease.status = "zombie"
                expired.append(lease)

        for lease in expired:
            logger.warning("Sweeping zombie session %s (gen=%d, age=%.0fs)",
                           lease.session_id, lease.generation,
                           now - lease.lease_expires_at)
            try:
                if self._provider:
                    await self._provider.release_session_bundle(
                        lease.session_id, force=True,
                    )
                lease.status = "released"
                del self._leases[lease.session_id]
            except Exception:
                logger.exception("Failed to release zombie %s", lease.session_id)

    # ── Label recovery ──────────────────────────────────────────────

    async def _reconstruct_from_labels(self) -> None:
        """После рестарта pk-control: найти живые контейнеры по labels.

        Контейнеры с com.prettyk.session-id восстанавливаются как active-сессии,
        даже если in-memory карта была потеряна при падении control plane.
        """
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker", "ps",
                "--filter", "label=com.prettyk.session-id",
                "--format", "{{.Label \"com.prettyk.session-id\"}} {{.Label \"com.prettyk.generation\"}}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            stdout, _ = await proc.communicate()
        except FileNotFoundError:
            logger.warning("docker not available; skipping label reconstruction")
            return

        seen: set[str] = set()
        for line in stdout.decode("utf-8", errors="replace").strip().splitlines():
            parts = line.split()
            if len(parts) < 2:
                continue
            sid = parts[0]
            if sid in seen or sid == "unknown":
                continue
            seen.add(sid)

            try:
                gen = int(parts[1])
            except (ValueError, IndexError):
                gen = 1

            if sid not in self._leases:
                lease = SessionLease(
                    session_id=sid,
                    generation=gen,
                    lease_expires_at=time.time() + self._default_lease,
                )
                self._leases[sid] = lease
                logger.info("Recovered session %s (gen=%d) from Docker labels", sid, gen)