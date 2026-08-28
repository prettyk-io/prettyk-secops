# -*- coding: utf-8 -*-
"""SOR-B2: Session Manager — ядро жизненного цикла сессий (in-memory).

Спецификация: 2026-08-28-session-orchestration-and-multi-substrate-architecture.md §4.

Отвечает за:
  - Стейт-машину сессии: creating→provisioning→ready→releasing→released→failed
  - Идемпотентные переходы (повторный create не дублирует)
  - SessionRecord — отдельная сущность, не зависит от Run
  - In-memory store (без БД/SQL/файлов)

Чистое ядро без I/O — тестируемо напрямую.
"""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional


# ── Состояния жизненного цикла сессии ──

class SessionState(str, Enum):
    CREATING = "creating"       # сессия создана, ресурсы ещё не провижнены
    PROVISIONING = "provisioning"  # идёт выделение ресурсов (compose/k8s)
    READY = "ready"             # ресурсы готовы, можно запускать сканер/браузер
    PAUSED = "paused"           # приостановлена административно (keep resources)
    RELEASING = "releasing"     # идёт освобождение ресурсов
    RELEASED = "released"       # ресурсы освобождены, сессия завершена
    FAILED = "failed"           # терминальная ошибка (провижн не удался)


# Атомарные переходы
_VALID_TRANSITIONS: dict[SessionState, frozenset[SessionState]] = {
    SessionState.CREATING: frozenset({SessionState.PROVISIONING, SessionState.FAILED}),
    SessionState.PROVISIONING: frozenset({SessionState.READY, SessionState.FAILED}),
    SessionState.READY: frozenset({SessionState.PAUSED, SessionState.RELEASING}),
    SessionState.PAUSED: frozenset({SessionState.READY, SessionState.RELEASING}),
    SessionState.RELEASING: frozenset({SessionState.RELEASED, SessionState.FAILED}),
    SessionState.RELEASED: frozenset(),
    SessionState.FAILED: frozenset(),
}

_TERMINAL_STATES = frozenset({SessionState.RELEASED, SessionState.FAILED})


# ── Session Record ──

@dataclass
class SessionEndpoints:
    """Адреса ресурсов внутри изолированной сессионной сети."""
    scanner_url: str = ""
    scanner_port: int = 8080
    browser_authoring_url: str = ""
    cdp_relay_url: str = ""
    target_url: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "scanner_url": self.scanner_url,
            "scanner_port": self.scanner_port,
            "browser_authoring_url": self.browser_authoring_url,
            "cdp_relay_url": self.cdp_relay_url,
            "target_url": self.target_url,
        }


@dataclass
class SessionRecord:
    """Запись одной изолированной сессии."""
    id: str
    state: SessionState = SessionState.CREATING
    generation: int = 1
    endpoints: SessionEndpoints = field(default_factory=SessionEndpoints)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    provisioned_at: Optional[float] = None
    released_at: Optional[float] = None
    history: list[tuple[str, float, str]] = field(default_factory=list)  # (from, ts, to)
    error: Optional[str] = None
    labels: dict[str, str] = field(default_factory=dict)

    @property
    def is_terminal(self) -> bool:
        return self.state in _TERMINAL_STATES

    @property
    def is_active(self) -> bool:
        return self.state in {SessionState.CREATING, SessionState.PROVISIONING, SessionState.READY, SessionState.PAUSED}

    @property
    def duration_seconds(self) -> float:
        end = self.released_at or time.time()
        return max(0.0, end - self.created_at)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "state": self.state.value,
            "generation": self.generation,
            "endpoints": self.endpoints.to_dict(),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "provisioned_at": self.provisioned_at,
            "released_at": self.released_at,
            "error": self.error,
            "labels": self.labels,
            "is_active": self.is_active,
            "is_terminal": self.is_terminal,
            "duration_seconds": self.duration_seconds,
        }


# ── Session Manager ──

class SessionManager:
    """Управляемый жизненный цикл изолированных сессий (in-memory).

    Отдельная сущность от Run: сессия = ресурсы (сеть + контейнеры),
    run = исполняемый wired-прогон поверх сессии.

    Стейт-машина:
      creating → provisioning → ready → [paused ⇄] → releasing → released
                                                    ↘ failed ↗
    """

    def __init__(
        self,
        max_sessions: int = 10,
        default_lease_seconds: float = 3600.0,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._max_sessions = max_sessions
        self._default_lease_seconds = default_lease_seconds
        self._clock = clock

        self._lock = threading.RLock()
        self._sessions: dict[str, SessionRecord] = {}

    # ── CRUD ──

    def create_session(
        self,
        session_id: Optional[str] = None,
        labels: Optional[dict[str, str]] = None,
    ) -> tuple[SessionRecord, bool]:
        """Идемпотентно создать сессию. Возвращает (session, is_new).

        Если сессия с таким id уже существует и активна — возвращаем её,
        не создавая дубль. Терминальные сессии не переиспользуются.
        """
        sid = (session_id or "").strip() or f"session-{uuid.uuid4().hex[:12]}"
        with self._lock:
            existing = self._sessions.get(sid)
            if existing is not None:
                if existing.is_active:
                    return existing, False
                # Терминальная сессия — допустима новая (но не восстанавливаем)
                # Удаляем старую запись для чистоты
            if len(self._sessions) >= self._max_sessions:
                raise RuntimeError(
                    f"Session limit reached: {self._max_sessions} active sessions"
                )
            s = SessionRecord(
                id=sid,
                state=SessionState.CREATING,
                labels=dict(labels or {}),
                created_at=self._clock(),
                updated_at=self._clock(),
            )
            self._sessions[sid] = s
            return s, True

    def get_session(self, session_id: str) -> Optional[SessionRecord]:
        with self._lock:
            return self._sessions.get(session_id)

    def list_sessions(self, *, active_only: bool = False) -> list[SessionRecord]:
        with self._lock:
            sessions = list(self._sessions.values())
        if active_only:
            return [s for s in sessions if s.is_active]
        return sessions

    # ── Состояния ──

    def _transition(self, session: SessionRecord, target: SessionState) -> None:
        allowed = _VALID_TRANSITIONS[session.state]
        if target not in allowed:
            raise ValueError(
                f"Invalid session transition: {session.state.value} → {target.value} "
                f"(session {session.id})"
            )
        now = self._clock()
        session.history.append((session.state.value, now, target.value))
        session.state = target
        session.updated_at = now
        if target == SessionState.READY:
            session.provisioned_at = now
        elif target == SessionState.RELEASED:
            session.released_at = now

    def start_provisioning(self, session_id: str) -> None:
        """Начать выделение ресурсов (creating → provisioning)."""
        with self._lock:
            s = self._sessions.get(session_id)
            if s is None:
                raise ValueError(f"Session not found: {session_id}")
            self._transition(s, SessionState.PROVISIONING)

    def mark_ready(self, session_id: str, endpoints: Optional[SessionEndpoints] = None) -> None:
        """Ресурсы готовы (provisioning → ready)."""
        with self._lock:
            s = self._sessions.get(session_id)
            if s is None:
                raise ValueError(f"Session not found: {session_id}")
            if endpoints is not None:
                s.endpoints = endpoints
            self._transition(s, SessionState.READY)

    def pause(self, session_id: str) -> None:
        """Приостановить готовую сессию (ready → paused)."""
        with self._lock:
            s = self._sessions.get(session_id)
            if s is None:
                raise ValueError(f"Session not found: {session_id}")
            self._transition(s, SessionState.PAUSED)

    def resume(self, session_id: str) -> None:
        """Возобновить приостановленную сессию (paused → ready)."""
        with self._lock:
            s = self._sessions.get(session_id)
            if s is None:
                raise ValueError(f"Session not found: {session_id}")
            self._transition(s, SessionState.READY)

    def start_release(self, session_id: str) -> None:
        """Начать освобождение ресурсов (ready/paused → releasing)."""
        with self._lock:
            s = self._sessions.get(session_id)
            if s is None:
                raise ValueError(f"Session not found: {session_id}")
            self._transition(s, SessionState.RELEASING)

    def mark_released(self, session_id: str) -> None:
        """Ресурсы освобождены (releasing → released)."""
        with self._lock:
            s = self._sessions.get(session_id)
            if s is None:
                raise ValueError(f"Session not found: {session_id}")
            self._transition(s, SessionState.RELEASED)

    def mark_failed(self, session_id: str, error: str = "") -> None:
        """Пометить сессию как упавшую (любое нетерминальное → failed)."""
        with self._lock:
            s = self._sessions.get(session_id)
            if s is None or s.is_terminal:
                return
            s.error = error or s.error
            self._transition(s, SessionState.FAILED)

    # ── Lifecycle helpers ──

    def delete_session(self, session_id: str) -> None:
        """Удалить запись сессии (только для терминальных)."""
        with self._lock:
            s = self._sessions.get(session_id)
            if s is not None and not s.is_terminal:
                raise ValueError(
                    f"Cannot delete active session '{session_id}' "
                    f"(state={s.state.value}). Release it first."
                )
            self._sessions.pop(session_id, None)

    def snapshot(self) -> dict[str, Any]:
        """Сводка состояния всех сессий."""
        with self._lock:
            sessions = list(self._sessions.values())
        by_state: dict[str, int] = {}
        for s in sessions:
            by_state[s.state.value] = by_state.get(s.state.value, 0) + 1
        return {
            "total": len(sessions),
            "active": sum(1 for s in sessions if s.is_active),
            "terminal": sum(1 for s in sessions if s.is_terminal),
            "by_state": by_state,
        }

    def reset(self) -> None:
        """Test helper: сбросить всё состояние."""
        with self._lock:
            self._sessions.clear()