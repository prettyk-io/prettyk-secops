# Run Streams — Valkey Streams + Consumer Groups для координации worker'ов.
#
# Транспорт заданий между control plane и worker'ами (RUN-CTL-5):
#   - control plane кладёт задание в stream (XADD)
#   - worker читает через Consumer Group (XREADGROUP) — задание попадает
#     в его personal pending list
#   - worker выполняет run, периодически шлёт heartbeat в RunLeaseBridge,
#     при завершении подтверждает задание (XACK)
#   - если worker замолчал — другой worker перехватывает его pending-задания
#     (XAUTOCLAIM с min_idle_time = 60с, согласовано с RunLeaseBridge)
#
# Все ключи с префиксом prettyk:run: — единое пространство имён Run Control Plane.
#
# Гарантии:
#   - Задание не теряется: пока не XACK, оно остаётся в PEL (pending entries
#     list) группы и видно через XPENDING.
#   - Задание не выполняется дважды одновременно: XREADGROUP '>' выдаёт
#     сообщение ровно одному consumer'у группы; перехват возможен только
#     через XAUTOCLAIM после min_idle_time.
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

DEFAULT_STREAM_PREFIX = "prettyk:run:"
DEFAULT_MIN_IDLE_MS = 60_000  # согласовано с RunLeaseBridge.stale_after_seconds


class RunStreamCoordinator:
    """Координатор заданий запусков поверх Valkey/Redis Streams.

    client — любой redis-py-совместимый клиент (redis.Redis, Valkey,
    fakeredis для тестов). Методы тонкие обёртки над Streams-командами
    с фиксированным префиксом ключей и идемпотентным созданием групп.
    """

    def __init__(
        self,
        client: Any,
        stream_prefix: str = DEFAULT_STREAM_PREFIX,
    ) -> None:
        self._client = client
        self._prefix = stream_prefix

    # ── Ключи ──────────────────────────────────────────────────────

    def _key(self, stream_name: str) -> str:
        return f"{self._prefix}{stream_name}"

    # ── Группы ─────────────────────────────────────────────────────

    def create_consumer_group(
        self,
        stream_name: str,
        group_name: str,
        start_id: str = "0",
    ) -> bool:
        """Создать Consumer Group. Идемпотентно.

        start_id="0" — группа видит ВСЮ историю stream'а (для восстановления
        незавершённых заданий после рестарта control plane).
        Возвращает True если группа создана, False если уже существовала.
        """
        try:
            self._client.xgroup_create(
                self._key(stream_name), group_name, id=start_id, mkstream=True
            )
            logger.info("Consumer group created: %s / %s", stream_name, group_name)
            return True
        except Exception as exc:
            if "BUSYGROUP" in str(exc):
                return False
            raise

    # ── Публикация и чтение ────────────────────────────────────────

    def enqueue(self, stream_name: str, payload: Dict[str, str]) -> str:
        """Добавить задание в stream (XADD). Возвращает message id."""
        message_id = self._client.xadd(
            self._key(stream_name),
            {k: str(v) for k, v in payload.items()},
        )
        logger.debug("Enqueued %s into %s", message_id, stream_name)
        return message_id

    def read_new(
        self,
        stream_name: str,
        group_name: str,
        consumer_name: str,
        count: int = 1,
        block_ms: Optional[int] = None,
    ) -> List[Tuple[str, Dict[str, str]]]:
        """Worker читает НОВЫЕ задания группы (XREADGROUP '>').

        Прочитанное сообщение попадает в personal PEL consumer'а — до XACK
        оно числится за ним и может быть перехвачено через claim_stale.
        Возвращает [(message_id, payload), ...].
        """
        kwargs: Dict[str, Any] = {"count": count}
        if block_ms is not None:
            kwargs["block"] = block_ms
        response = self._client.xreadgroup(
            groupname=group_name,
            consumername=consumer_name,
            streams={self._key(stream_name): ">"},
            **kwargs,
        )
        messages: List[Tuple[str, Dict[str, str]]] = []
        for _stream, entries in response or []:
            for mid, fields in entries:
                messages.append((mid, _decode(fields)))
        if messages:
            logger.debug("read_new: consumer=%s got %d msg(s) from %s",
                         consumer_name, len(messages), stream_name)
        return messages

    def read_pending(
        self,
        stream_name: str,
        group_name: str,
        consumer_name: str,
        count: int = 10,
    ) -> List[Tuple[str, Dict[str, str]]]:
        """Дочитать СВОИ недоделанные задания после рестарта worker'а
        (XREADGROUP с id '0' — delivery attempt продолжается)."""
        response = self._client.xreadgroup(
            groupname=group_name,
            consumername=consumer_name,
            streams={self._key(stream_name): "0"},
            count=count,
        )
        messages: List[Tuple[str, Dict[str, str]]] = []
        for _stream, entries in response or []:
            for mid, fields in entries:
                if fields:  # пустые {} — сообщение уже ACKнуто, пропускаем
                    messages.append((mid, _decode(fields)))
        return messages

    # ── Подтверждение и наблюдение ─────────────────────────────────

    def ack(self, stream_name: str, group_name: str, message_id: str) -> int:
        """Подтвердить обработку (XACK). Возвращает число подтверждённых."""
        return self._client.xack(self._key(stream_name), group_name, message_id)

    def pending_summary(self, stream_name: str, group_name: str) -> Dict[str, Any]:
        """XPENDING: сколько сообщений в PEL группы, диапазон id, по consumer'ам."""
        return self._client.xpending(self._key(stream_name), group_name)

    def pending_by_consumer(self, stream_name: str, group_name: str,
                            consumer_name: str) -> int:
        """Число не-ACK сообщений конкретного consumer'а (для health worker'а)."""
        try:
            summary = self._client.xpending_range(
                self._key(stream_name), group_name,
                min="-", max="+", count=100,
            )
        except Exception:
            return 0
        return sum(1 for item in summary
                   if item.get("consumer") in (consumer_name, consumer_name.encode()))

    # ── Перехват зависших заданий ──────────────────────────────────

    def claim_stale(
        self,
        stream_name: str,
        group_name: str,
        consumer_name: str,
        min_idle_ms: int = DEFAULT_MIN_IDLE_MS,
        count: int = 10,
        start_id: str = "0-0",
    ) -> List[Tuple[str, Dict[str, str]]]:
        """XAUTOCLAIM: забрать себе задания, которые висят без ACK дольше
        min_idle_ms (worker замолчал; окно согласовано с RunLeaseBridge).

        Возвращает перехваченные [(message_id, payload), ...].
        """
        result = self._client.xautoclaim(
            name=self._key(stream_name),
            groupname=group_name,
            consumername=consumer_name,
            min_idle_time=min_idle_ms,
            start_id=start_id,
            count=count,
        )
        # redis-py RESP2: [next_cursor, messages, deleted_ids]
        messages: List[Tuple[str, Dict[str, str]]] = []
        if result and len(result) >= 2:
            for entry in result[1] or []:
                mid, fields = entry
                if fields:
                    messages.append((mid, _decode(fields)))
        if messages:
            logger.warning("claim_stale: consumer=%s took over %d stale "
                           "message(s) in %s (idle>=%dms)",
                           consumer_name, len(messages), stream_name, min_idle_ms)
        return messages

    # ── Утилиты ────────────────────────────────────────────────────

    def stream_length(self, stream_name: str) -> int:
        return self._client.xlen(self._key(stream_name))

    def full_key(self, stream_name: str) -> str:
        """Полный ключ stream'а (для тестов и интроспекции префикса)."""
        return self._key(stream_name)


def _decode(fields: Any) -> Dict[str, str]:
    """redis-py возвращает bytes; приводим payload к str для потребителей."""
    out: Dict[str, str] = {}
    for key, value in dict(fields).items():
        k = key.decode() if isinstance(key, bytes) else key
        v = value.decode() if isinstance(value, bytes) else value
        out[k] = v
    return out
