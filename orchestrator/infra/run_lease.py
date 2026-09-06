# Run Lease Bridge — мост между LeaseController и RunStore (RUN-CTL-5).
#
# Связывает два мира:
#   1. LeaseController (infra/lease_controller.py) — leases сессий, zombie GC,
#      восстановление по Docker-лейблам. НЕ МЕНЯЕМ — используем API.
#   2. RunStore (infra/run_state.py, RUN-CTL-1, владелец Boss) — жизненный
#      цикл Run: PENDING → QUEUED → RUNNING → SUCCEEDED/FAILED/EXPIRED/CANCELLED.
#
# Зачем мост: worker взял run и обязан подтверждать жизнь heartbeat'ом.
# Если worker замолчал (90+ секунд) — run не должен навсегда остаться
# в статусе «выполняется». sweep_stale() находит такие run'ы через
# RunStore.list_stale() и переводит их в EXPIRED, после чего они могут
# быть перехвачены другим worker'ом (см. infra/run_streams.py, XAUTOCLAIM).
#
# Контракт RunStore (внедряется снаружи, dependency injection):
#   transition(run_id: str, status: str) -> результат перехода
#   get(run_id: str) -> запись run'а или None
#   list_stale(threshold_seconds: float) -> list[str] (id зависших run'ов)
#   heartbeat(run_id: str)  — ОПЦИОНАЛЬНО; вызывается, если реализован
#
# Инварианты:
#   - register_run атомарен по смыслу: lease существует ⟺ run переведён в QUEUED.
#   - sweep_stale не трогает активные (не stale) run'ы.
#   - EXPIRED run освобождает свои ресурсы через provider.release_session_bundle.
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, List, Optional, Protocol, runtime_checkable

from orchestrator.infra.lease_controller import LeaseController, SessionLease

logger = logging.getLogger(__name__)


# ── Контракт RunStore (Boss, run_state.py / RUN-CTL-1) ──────────────────────

@runtime_checkable
class RunStoreProtocol(Protocol):
    """Минимальный контракт RunStore, необходимый мосту.

    Согласовано с фактическим run_state.py (Boss):
      transition(run_id, to_state, error=None, worker_id=None, reason="") -> RunStatus
      get(run_id) -> RunStatus | None
      list_stale(lease_timeout_s) -> list[RunStatus]   # НЕ строки!
      heartbeat(run_id, lease_seconds=3600.0) -> bool  # опционально для моста

    transition принимает RunState enum (str-подкласс); bridge нормализует
    статусы через _to_state() — сырые строки только для сторонних реализаций.
    list_stale возвращает RunStatus-объекты — bridge нормализует через
    _run_id_of() (строки тоже поддержаны).
    """

    def transition(self, run_id: str, new_status: Any) -> Any: ...

    def get(self, run_id: str) -> Any: ...

    def list_stale(self, threshold_seconds: float) -> Any: ...

    def heartbeat(self, run_id: str, lease_seconds: float) -> Any: ...


def _to_state(status: str) -> Any:
    """Нормализация статуса: RunState enum, если доступен (контракт Boss),
    иначе сырая строка (test doubles / сторонние реализации)."""
    try:
        from orchestrator.infra.run_state import RunState
        return RunState(status)
    except ImportError:
        return status


def _run_id_of(item: Any) -> Optional[str]:
    """Нормализация элемента list_stale: строка | RunStatus | dict."""
    if isinstance(item, str):
        return item
    run_id = getattr(item, "run_id", None)
    if run_id is not None:
        return str(run_id)
    if isinstance(item, dict):
        value = item.get("run_id")
        return str(value) if value is not None else None
    return None


async def _maybe_await(value: Any) -> Any:
    """Await, если значение — awaitable (RunStore может быть sync или async)."""
    if asyncio.iscoroutine(value) or hasattr(value, "__await__"):
        return await value
    return value


# ── Статусы жизненного цикла Run (строки — чтобы не зависеть от enum Boss) ──

RUN_QUEUED = "queued"
RUN_EXPIRED = "expired"


class RunLeaseBridge:
    """Мост LeaseController ↔ RunStore.

    Роли:
      - register_run: run получает lease + переходит в QUEUED (готов к выдаче worker'у).
      - heartbeat: worker подтверждает жизнь; lease продлевается, generation растёт.
      - sweep_stale: worker замолчал → run переводится в EXPIRED, ресурсы освобождаются.
      - snapshot: наблюдаемость — какие run'ы живы и сколько им осталось.

    lease_controller и run_store внедряются снаружи (DI) — мост не создаёт
    их сам и не знает деталей хранения.
    """

    def __init__(
        self,
        lease_controller: LeaseController,
        run_store: Any,
        provider: Any = None,
        lease_seconds: float = 90.0,
        stale_after_seconds: float = 90.0,
        queued_status: str = RUN_QUEUED,
        expired_status: str = RUN_EXPIRED,
    ) -> None:
        if stale_after_seconds <= 0:
            raise ValueError("stale_after_seconds must be positive")
        self._lease = lease_controller
        self._run_store = run_store
        self._provider = provider
        self._lease_seconds = lease_seconds
        self._stale_after = stale_after_seconds
        self._queued_status = queued_status
        self._expired_status = expired_status

    # ── Public API ─────────────────────────────────────────────────

    async def register_run(
        self,
        run_id: str,
        lease_seconds: Optional[float] = None,
    ) -> SessionLease:
        """Зарегистрировать run: lease в LeaseController + переход в QUEUED.

        Идемпотентность lease: повторный register с тем же run_id просто
        перезаписывает lease в LeaseController (его контракт), а run не
        «откатывается» из RUNNING в QUEUED — повторный transition в queued
        для уже активного run'а является no-op по решению RunStore.
        """
        lease = self._lease.register(run_id, lease_seconds or self._lease_seconds)
        try:
            await _maybe_await(
                self._run_store.transition(run_id, _to_state(self._queued_status))
            )
        except Exception:
            # Lease остаётся в LeaseController и истечёт через sweep zombie GC —
            # публичного release у LeaseController нет, а лезть в приватные
            # поля чужого класса нельзя. RunStore при этом остался в прежнем
            # статусе: противоречивого «lease есть, run не создан» не будет,
            # т.к. transition бросил исключение ДО фиксации.
            logger.exception("register_run(%s): transition to %s failed",
                             run_id, self._queued_status)
            raise
        logger.info("Run %s registered (lease +%ss, status=%s)",
                    run_id, lease_seconds or self._lease_seconds, self._queued_status)
        return lease

    def heartbeat(self, run_id: str, lease_seconds: Optional[float] = None) -> Optional[int]:
        """Worker подтверждает жизнь. Возвращает новый generation lease.

        None — run неизвестен LeaseController (не регистрировался / released).
        Если RunStore умеет heartbeat — продлеваем и его окно stale-детекции.
        """
        generation = self._lease.heartbeat(run_id, lease_seconds)
        if generation is None:
            logger.warning("heartbeat for unknown run %s", run_id)
            return None
        store_heartbeat = getattr(self._run_store, "heartbeat", None)
        if callable(store_heartbeat):
            try:
                result = store_heartbeat(run_id, lease_seconds or self._lease_seconds)
                if asyncio.iscoroutine(result) or hasattr(result, "__await__"):
                    # Sync-контекст не может await: планируем задачу, если есть loop.
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(result)
                    except RuntimeError:
                        logger.debug("heartbeat(%s): async RunStore.heartbeat "
                                     "без активного loop пропущен", run_id)
            except Exception:
                logger.exception("RunStore.heartbeat(%s) failed", run_id)
        return generation

    async def sweep_stale(self) -> List[str]:
        """Найти run'ы с истёкшим окном активности и пометить EXPIRED.

        Источник истины по «зависшим» — RunStore.list_stale(threshold).
        Для каждого: transition(EXPIRED) + освобождение ресурсов через
        provider.release_session_bundle (если provider задан).

        Возвращает список run_id, переведённых в EXPIRED.
        """
        stale_items = await _maybe_await(
            self._run_store.list_stale(self._stale_after)
        )
        expired: List[str] = []
        for item in list(stale_items or []):
            run_id = _run_id_of(item)
            if run_id is None:
                logger.warning("sweep_stale: unrecognizable stale item %r — skip", item)
                continue
            try:
                await _maybe_await(
                    self._run_store.transition(run_id, _to_state(self._expired_status))
                )
            except Exception:
                logger.exception("sweep_stale: transition(%s, %s) failed",
                                 run_id, self._expired_status)
                continue
            expired.append(run_id)
            logger.warning("Run %s EXPIRED (worker silent > %.0fs)",
                           run_id, self._stale_after)
            if self._provider is not None:
                try:
                    await self._provider.release_session_bundle(run_id, force=True)
                except Exception:
                    logger.exception("Failed to release resources for expired run %s",
                                     run_id)
        if expired:
            logger.info("sweep_stale: %d run(s) expired: %s", len(expired), expired)
        return expired

    # ── Интроспекция ───────────────────────────────────────────────

    def snapshot(self) -> dict:
        """Состояние активных run'ов и их lease (для health/мониторинга)."""
        lease_snap = self._lease.snapshot()
        runs: dict[str, Any] = {}
        for sid, info in lease_snap.get("leases", {}).items():
            record = self._run_store.get(sid)
            state = getattr(record, "state", None)
            if state is None and isinstance(record, dict):
                state = record.get("state")
            # RunState enum → строка; сырые значения остаются как есть.
            state_value = getattr(state, "value", state)
            runs[sid] = {
                "generation": info.get("generation"),
                "lease_status": info.get("status"),
                "expires_in": info.get("expires_in"),
                "run_state": state_value,
            }
        return {
            "total_leases": lease_snap.get("total", 0),
            "active": lease_snap.get("active", 0),
            "expired_runs": lease_snap.get("expired", 0),
            "runs": runs,
            "stale_after_seconds": self._stale_after,
            "generated_at": time.time(),
        }

    def is_leased(self, run_id: str) -> bool:
        """Есть ли живой lease у run'а (acceptance: has(run_id))."""
        return self._lease.get(run_id) is not None
