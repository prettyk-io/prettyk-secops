# -*- coding: utf-8 -*-
"""RUN-CTL-3: Позиция в очереди и оценка времени ожидания.

Оператор должен видеть: «ваш запуск 3-й в очереди, примерное ожидание 6 мин».

  queue_position(run_id) -> {"position": int, "estimated_wait_s": int}
      Позиция считается от головы очереди, 1-базированная (первый = 1).
      Оценка ожидания = позиция × среднее время выполнения.

      Среднее — по последним N (default 10) завершённым run'ам
      (DurationTracker); при отсутствии статистики — default 120 s.
      Принятое в acceptance: позиция 3 × 120 s = 360 s.

  queue_depth() -> int — общее число run'ов в очереди.

Ключи-алиасы: dict содержит и канонические "position"/"estimated_wait_s",
и краткие "pos"/"est_wait_s" (используются в acceptance-критериях и
фронтенд-контракте). Модуль не владеет очередью — RunQueue инжектируется.
"""
from __future__ import annotations

import threading
from collections import deque
from typing import Any, Dict, Optional

DEFAULT_MEAN_DURATION_S: float = 120.0
DEFAULT_SAMPLE_WINDOW: int = 10


class DurationTracker:
    """Скользящее окно последних длительностей выполнения (секунды).

    record(duration_s) вызывается интеграцией при завершении run'а
    (finished_at - started_at). mean() — среднее по окну; при пустом окне
    возвращается default (120 s), чтобы оценка была честной с первого дня.
    """

    def __init__(
        self,
        window: int = DEFAULT_SAMPLE_WINDOW,
        default_duration_s: float = DEFAULT_MEAN_DURATION_S,
    ) -> None:
        self._samples: deque[float] = deque(maxlen=window)
        self._default = default_duration_s
        self._lock = threading.RLock()

    def record(self, duration_s: float) -> None:
        """Зафиксировать длительность завершившегося run'а."""
        if duration_s < 0:
            return
        with self._lock:
            self._samples.append(float(duration_s))

    def mean(self) -> Optional[float]:
        """Среднее по окну или None, если выборка пуста."""
        with self._lock:
            if not self._samples:
                return None
            return sum(self._samples) / len(self._samples)

    def mean_with_default(self) -> float:
        """Среднее по окну, а при пустой выборке — default (120 s)."""
        mean = self.mean()
        return mean if mean is not None else self._default

    def __len__(self) -> int:
        with self._lock:
            return len(self._samples)


class QueuePositionService:
    """Позиция run'а в очереди и примерное время ожидания."""

    def __init__(
        self,
        queue: Any,
        durations: Optional[DurationTracker] = None,
        default_duration_s: float = DEFAULT_MEAN_DURATION_S,
    ) -> None:
        self._queue = queue
        self._durations = durations
        self._default_duration = default_duration_s

    def position(self, run_id: str) -> Optional[Dict[str, int]]:
        """Позиция (1 = голова) и оценка ожидания в секундах.

        None — run не найден в очереди (уже RUNNING/терминален/отменён).
        """
        items = self._queue.items()
        try:
            index = items.index(run_id)
        except ValueError:
            return None
        pos = index + 1

        if self._durations is not None:
            mean = self._durations.mean_with_default()
        else:
            mean = self._default_duration

        est_wait = int(round(pos * mean))
        # Канонические ключи + краткие алиасы (acceptance-контракт).
        return {
            "position": pos,
            "estimated_wait_s": est_wait,
            "pos": pos,
            "est_wait_s": est_wait,
        }

    def depth(self) -> int:
        """Глубина очереди: сколько run'ов ждут."""
        return self._queue.depth()


# ── Функциональные обёртки (для точечных вызовов без сервиса) ──


def queue_position(
    run_id: str,
    queue: Any,
    durations: Optional[DurationTracker] = None,
    default_duration_s: float = DEFAULT_MEAN_DURATION_S,
) -> Optional[Dict[str, int]]:
    """Одноразовый запрос позиции run'а в очереди."""
    return QueuePositionService(queue, durations, default_duration_s).position(run_id)


def queue_depth(queue: Any) -> int:
    """Одноразовый запрос глубины очереди."""
    return queue.depth()
