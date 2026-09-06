# -*- coding: utf-8 -*-
"""RUN-CTL-2: Идемпотентность create_run на API-границе.

Семантика дедупликации:
    dedup_key = sha256(f"{pipeline_id}:{inputs_hash}")

    1. Внутри TTL-окна (по умолчанию 30 с) повторный вызов с тем же ключом
       возвращает СУЩЕСТВУЮЩИЙ run, пока он активен
       (pending/queued/running — защита от двойного клика).
    2. TERMINAL run (succeeded/failed/cancelled) никогда не блокирует
       новый запуск: повторный вызов создаёт НОВЫЙ run.
    3. После истечения TTL записи дедупликации «забываются»: даже активный
       run старше окна не блокирует свежий create (защита от зависаний).

Слой хранения — сознательно без внешних зависимостей: in-memory dict
с ленивой зачисткой просроченных записей. Enterprise-персистентность
(Valkey) добавляется позже за тем же интерфейсом без изменения call-site.

Alias PENDING: в спецификации пакета начальное состояние называется
RunStatus(PENDING); в ядре (core.run_control_plane) это QUEUED.
_is_active() принимает обе лексики, поэтому run_state.py (контракт Boss)
подключается без правок этого модуля.

Границы: сам модуль run'ы НЕ создаёт и состояние НЕ хранит — фабрика и
резолвер инжектируются (dependency inversion). Это позволяет тестировать
TTL-логику изолированно и подключить RunStore одной строкой при интеграции.
"""
from __future__ import annotations

import hashlib
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Optional

from core.run_control_plane import RunState

# ── Контракты состояний ──

TERMINAL_STATES: frozenset[RunState] = frozenset(
    {RunState.SUCCEEDED, RunState.FAILED, RunState.CANCELLED}
)
ACTIVE_STATES: frozenset[RunState] = frozenset({RunState.QUEUED, RunState.RUNNING})

DEFAULT_TTL_S: float = 30.0


def compute_dedup_key(pipeline_id: str, inputs_hash: str) -> str:
    """Стабильный ключ дедупликации: sha256(pipeline_id + ':' + inputs_hash)."""
    raw = f"{pipeline_id}:{inputs_hash}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def _is_active(run: Any) -> bool:
    """Активен ли run (не в терминальном состоянии).

    Понимает и Enum ядра (RunState.QUEUED/RUNNING), и строковые статусы
    («pending»/«queued»/«running») — совместимость с run_state.py.
    """
    state = getattr(run, "state", None)
    if state is None:
        return False
    if isinstance(state, RunState):
        return state in ACTIVE_STATES
    value = str(getattr(state, "value", state)).lower()
    return value in {"pending", "queued", "running"}


def _is_terminal(run: Any) -> bool:
    state = getattr(run, "state", None)
    if isinstance(state, RunState):
        return state in TERMINAL_STATES
    value = str(getattr(state, "value", state)).lower()
    return value in {"succeeded", "failed", "cancelled"}


# ── Хранилище дедупликации ──


@dataclass
class DedupEntry:
    """Запись dedup_key → run_id с TTL."""

    run_id: str
    correlation_id: Optional[str]
    created_at: float
    expires_at: float

    def is_expired(self, now: float) -> bool:
        """Строго старше TTL: «если dedup_key старше 30с → не считать дубликатом»."""
        return now > self.expires_at


class DedupStore:
    """In-memory хранилище dedup_key → run_id с TTL-окном.

    Потокобезопасно (RLock). Просроченные записи удаляются лениво при
    чтении и явно через sweep().
    """

    def __init__(self, clock: Callable[[], float] = time.time) -> None:
        self._clock = clock
        self._lock = threading.RLock()
        self._entries: dict[str, DedupEntry] = {}
        self._by_correlation: dict[str, str] = {}  # correlation_id -> dedup_key

    def put(
        self,
        dedup_key: str,
        run_id: str,
        correlation_id: Optional[str] = None,
        ttl_s: float = DEFAULT_TTL_S,
        now: Optional[float] = None,
    ) -> DedupEntry:
        _now = now if now is not None else self._clock()
        with self._lock:
            entry = DedupEntry(
                run_id=run_id,
                correlation_id=correlation_id,
                created_at=_now,
                expires_at=_now + ttl_s,
            )
            self._entries[dedup_key] = entry
            if correlation_id:
                self._by_correlation[correlation_id] = dedup_key
            return entry

    def get(self, dedup_key: str, now: Optional[float] = None) -> Optional[DedupEntry]:
        """Живая запись или None (просроченная удаляется на месте)."""
        _now = now if now is not None else self._clock()
        with self._lock:
            entry = self._entries.get(dedup_key)
            if entry is None:
                return None
            if entry.is_expired(_now):
                self._entries.pop(dedup_key, None)
                if entry.correlation_id:
                    self._by_correlation.pop(entry.correlation_id, None)
                return None
            return entry

    def peek(self, dedup_key: str) -> Optional[DedupEntry]:
        """Недеструктивное чтение: запись даже если просрочена (надгробие).

        Используется для различения «первый вызов вообще» и «повтор после
        истечения TTL-окна» — reason-отчётность без продления окна.
        """
        with self._lock:
            return self._entries.get(dedup_key)

    def find_by_correlation(
        self, correlation_id: str, now: Optional[float] = None
    ) -> Optional[DedupEntry]:
        """Вторичный индекс: клиентский idempotency-token → запись."""
        with self._lock:
            key = self._by_correlation.get(correlation_id)
            if key is None:
                return None
            return self.get(key, now=now)

    def sweep(self, now: Optional[float] = None) -> int:
        """Явная зачистка просроченных записей. Возвращает число удалённых."""
        _now = now if now is not None else self._clock()
        removed = 0
        with self._lock:
            for key in list(self._entries):
                if self._entries[key].is_expired(_now):
                    entry = self._entries.pop(key)
                    if entry.correlation_id:
                        self._by_correlation.pop(entry.correlation_id, None)
                    removed += 1
        return removed

    def __len__(self) -> int:
        with self._lock:
            return len(self._entries)


# ── Фасад create_run ──

# Причины возврата — для отчётности и тестов.
REASON_CREATED = "created"                        # новый run (дублей не было)
REASON_DEDUP_ACTIVE = "dedup-active"              # активный run в TTL-окне → возвращён
REASON_RECREATED_TERMINAL = "recreated-terminal"  # прошлый run завершён → новый
REASON_RECREATED_TTL = "recreated-ttl"            # TTL истёк при активном run → новый
REASON_RECREATED_MISSING = "recreated-missing"    # запись есть, run не найден → новый


class RunIdempotency:
    """RUN-CTL-2: идемпотентная обёртка над созданием запусков.

    run_factory  — Callable(pipeline_id, inputs_hash, correlation_id, dedup_key) -> run.
                   Вызывается ТОЛЬКО когда решено создать новый run.
    run_resolver — Callable(run_id) -> run | None. Для проверки состояния
                   существующего run'а (active/terminal/исчез).

    Инварианты (acceptance RUN-CTL-2):
      * двойной клик (повтор в пределах TTL, run активен) → тот же run;
      * run завершён → новый run при тех же параметрах;
      * разные inputs_hash → разные run;
      * dedup_key старше TTL → дубликатом не считается.
    """

    def __init__(
        self,
        run_factory: Callable[..., Any],
        run_resolver: Callable[[str], Optional[Any]],
        store: Optional[DedupStore] = None,
        clock: Callable[[], float] = time.time,
        ttl_s: float = DEFAULT_TTL_S,
    ) -> None:
        self._factory = run_factory
        self._resolver = run_resolver
        self._store = store if store is not None else DedupStore(clock=clock)
        self._clock = clock
        self._default_ttl = ttl_s

    # ── Публичный API ──

    def create_run(
        self,
        pipeline_id: str,
        inputs_hash: str,
        correlation_id: Optional[str] = None,
        *,
        ttl_s: Optional[float] = None,
    ) -> tuple[Any, bool, str]:
        """Идемпотентный create. Возвращает (run, is_new, reason).

        is_new=False — вернулся существующий активный run (дубль отклонён).
        reason — одна из констант REASON_* для отчётности/журнала.

        Порядок решения (строго по спецификации):
          1. Записи нет вообще                        → новый run (created).
          2. Запись истекла (dedup_key старше TTL)    → новый run
             (дубликатом не считается, даже если прошлый активен).
          3. Запись жива, run исчез из хранилища       → новый run (missing).
          4. Запись жива, run завершён                → новый run.
          5. Запись жива, run активен                 → существующий (дубль).
        """
        key = compute_dedup_key(pipeline_id, inputs_hash)
        ttl = ttl_s if ttl_s is not None else self._default_ttl
        now = self._clock()

        # Недеструктивная проверка: была ли запись когда-либо (вкл. истёкшие).
        if self._store.peek(key) is None:
            return self._create_new(
                pipeline_id, inputs_hash, correlation_id, key, ttl,
                now, REASON_CREATED,
            )

        # Живая запись? (просроченная удаляется лениво на месте)
        if self._store.get(key, now=now) is None:
            # TTL-окно истекло → dedup_key старше окна дубликатом не считается.
            return self._create_new(
                pipeline_id, inputs_hash, correlation_id, key, ttl,
                now, REASON_RECREATED_TTL,
            )

        live = self._store.get(key, now=now)
        existing = self._safe_resolve(live.run_id)
        if existing is None:
            # Запись есть, а run'а нет (store рассинхронизировался) → новый.
            return self._create_new(
                pipeline_id, inputs_hash, correlation_id, key, ttl,
                now, REASON_RECREATED_MISSING,
            )
        if _is_active(existing):
            # Дубль: активный run в пределах TTL-окна.
            return existing, False, REASON_DEDUP_ACTIVE
        # Завершённый run не блокирует новый запуск.
        return self._create_new(
            pipeline_id, inputs_hash, correlation_id, key, ttl,
            now, REASON_RECREATED_TERMINAL,
        )

    # ── Внутреннее ──

    def _safe_resolve(self, run_id: str) -> Optional[Any]:
        try:
            return self._resolver(run_id)
        except Exception:
            return None

    def _create_new(
        self,
        pipeline_id: str,
        inputs_hash: str,
        correlation_id: Optional[str],
        dedup_key: str,
        ttl_s: float,
        now: float,
        reason: str,
    ) -> tuple[Any, bool, str]:
        """Создать новый run через фабрику и зафиксировать в store.

        Фабрике передаётся свежий nonce: нижележащий слой (RunControlPlane /
        RunStore) не должен «проглотить» вызов собственным дедупом —
        решение о дедупликации принимает ТОЛЬКО этот слой.
        """
        run = self._factory(
            pipeline_id=pipeline_id,
            inputs_hash=inputs_hash,
            correlation_id=correlation_id,
            dedup_key=dedup_key,
            nonce=uuid.uuid4().hex,
        )
        run_id = getattr(run, "id", None) or str(run)
        self._store.put(dedup_key, run_id, correlation_id, ttl_s=ttl_s, now=now)
        return run, True, reason

    # ── Диагностика ──

    @property
    def store(self) -> DedupStore:
        return self._store
