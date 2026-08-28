# PoC — NOT production. Cosmoport boundary. Do not import into DAST runtime.
"""
COS-011: SSE стриминг — Valkey PubSub → SSE → Monitor.

События прогона публикуются в Valkey (или in-memory fallback для Pure Box),
фронтенд получает их через SSE. Reconnect + backpressure + история через REST.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Callable, Iterator

logger = logging.getLogger(__name__)

# Типы событий прогона
RUN_EVENT_KINDS = {
    "run_created", "run_started", "state_changed",
    "batch_started", "batch_completed",
    "gate_evaluated", "gate_failed",
    "finding_created", "severity_critical",
    "run_succeeded", "run_failed",
}

MAX_HISTORY = 1000  # лимит истории событий на run


@dataclass
class RunEvent:
    """Одно событие прогона."""
    run_id: str
    kind: str
    payload: dict = field(default_factory=dict)
    seq: int = 0
    ts: float = field(default_factory=time.time)

    def as_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "kind": self.kind,
            "payload": self.payload,
            "seq": self.seq,
            "ts": self.ts,
        }

    def as_sse(self) -> str:
        """SSE-строка события."""
        data = json.dumps(self.as_dict(), ensure_ascii=False, default=str)
        return f"event: {self.kind}\ndata: {data}\n\n"


class EventBus:
    """Публикация событий прогона.

    Enterprise: публикует в Valkey PubSub.
    Pure Box: in-memory кольцевой буфер (без внешних зависимостей).
    """

    def __init__(self, use_valkey: bool = False, valkey_host: str = "localhost", valkey_port: int = 6379):
        self._use_valkey = use_valkey
        self._valkey = None
        self._lock = Lock()
        self._history: dict[str, deque[RunEvent]] = {}
        self._seq: dict[str, int] = {}
        self._subscribers: dict[str, list[Callable[[RunEvent], None]]] = {}

        if use_valkey:
            try:
                import redis
                self._valkey = redis.Redis(
                    host=valkey_host, port=valkey_port,
                    socket_connect_timeout=3, decode_responses=True,
                )
                self._valkey.ping()
            except Exception as e:
                logger.warning("Valkey unavailable, falling back to in-memory: %s", e)
                self._valkey = None

    # ── Publish ──

    def publish(self, run_id: str, kind: str, payload: dict | None = None) -> RunEvent:
        """Опубликовать событие. Возвращает событие."""
        with self._lock:
            seq = self._seq.get(run_id, 0) + 1
            self._seq[run_id] = seq
        evt = RunEvent(run_id=run_id, kind=kind, payload=payload or {}, seq=seq)

        # In-memory история (всегда)
        with self._lock:
            if run_id not in self._history:
                self._history[run_id] = deque(maxlen=MAX_HISTORY)
            self._history[run_id].append(evt)

        # Valkey PubSub (если доступен)
        if self._valkey is not None:
            try:
                self._valkey.publish(f"run:{run_id}", json.dumps(evt.as_dict(), default=str))
            except Exception as e:
                logger.debug("Valkey publish failed (ignored): %s", e)

        # In-process subscribers (для тестов и локального SSE)
        subs = self._subscribers.get(run_id, [])
        for cb in list(subs):
            try:
                cb(evt)
            except Exception:
                pass

        return evt

    # ── Subscribe ──

    def subscribe(self, run_id: str, callback: Callable[[RunEvent], None]) -> Callable[[], None]:
        """Подписаться на события run. Возвращает unsubscribe."""
        with self._lock:
            self._subscribers.setdefault(run_id, []).append(callback)
        def unsubscribe() -> None:
            with self._lock:
                if run_id in self._subscribers and callback in self._subscribers[run_id]:
                    self._subscribers[run_id].remove(callback)
        return unsubscribe

    def unsubscribe_all(self, run_id: str) -> None:
        with self._lock:
            self._subscribers.pop(run_id, None)

    # ── History (REST, не только SSE) ──

    def history(self, run_id: str, since_seq: int = 0, limit: int = 100) -> list[RunEvent]:
        """История событий run через REST (backpressure recovery)."""
        with self._lock:
            events = list(self._history.get(run_id, []))
        filtered = [e for e in events if e.seq > since_seq]
        return filtered[-limit:]

    # ── SSE streaming ──

    def stream_sse(self, run_id: str, since_seq: int = 0, heartbeat_s: float = 15.0) -> Iterator[str]:
        """Генератор SSE: сначала история, потом живые события.

        Используется в endpoint — генератор держит соединение открытым.
        """
        # Сначала отдаём историю
        for evt in self.history(run_id, since_seq):
            yield evt.as_sse()

        # Потом живые события через очередь
        import queue
        q: queue.Queue[RunEvent] = queue.Queue()
        unsub = self.subscribe(run_id, q.put)
        try:
            while True:
                try:
                    evt = q.get(timeout=heartbeat_s)
                    yield evt.as_sse()
                except queue.Empty:
                    # Heartbeat для поддержания соединения
                    yield f": heartbeat {time.time()}\n\n"
        finally:
            unsub()

    def snapshot(self) -> dict:
        """Состояние шины (для health/метрик)."""
        with self._lock:
            return {
                "runs": len(self._history),
                "events": sum(len(h) for h in self._history.values()),
                "subscribers": sum(len(s) for s in self._subscribers.values()),
                "valkey": self._valkey is not None,
            }


# Глобальный синглтон
_global_bus = EventBus(use_valkey=False)


def get_event_bus() -> EventBus:
    return _global_bus