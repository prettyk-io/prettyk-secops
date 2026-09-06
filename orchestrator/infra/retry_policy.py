# RUN-CTL-6: Классификация ошибок и retry policy.
"""
Инфраструктурная ошибка (потеря соединения, таймаут) → повторить до 3 раз.
Ошибка валидации (манифест невалиден) → мгновенный fail.
Цель недоступна → мгновенный fail.
Fail-closed: всё неизвестное не ретраится.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Type


class ErrorClass(str, Enum):
    """Классы ошибок. Строковый enum — удобно в логах и timeline."""
    INFRASTRUCTURE = "INFRASTRUCTURE"   # соединение потеряно, таймаут, worker vanished
    VALIDATION = "VALIDATION"           # ошибка манифеста, schema mismatch
    TARGET = "TARGET"                   # хост недоступен, DNS fail, сертификат
    UNKNOWN = "UNKNOWN"                 # всё остальное — fail-closed


# ── Таблицы классификации ────────────────────────────────────────────────────

# TARGET: цель недоступна — ретраить бессмысленно.
# ВАЖНО: ConnectionRefusedError — подкласс ConnectionError, поэтому
# TARGET-проверка обязана идти ДО общей INFRASTRUCTURE-проверки.
_TARGET_TYPES: tuple[type, ...] = (
    ConnectionRefusedError,   # acceptance: ConnectionRefusedError → TARGET
    ConnectionResetError,
)

# INFRASTRUCTURE: наше окружение сломалось, повтор имеет смысл
_INFRASTRUCTURE_TYPES: tuple[type, ...] = (
    TimeoutError,
    InterruptedError,
    ConnectionAbortedError,
    BrokenPipeError,
    OSError,                 # общий OSError = наша инфра (socket.timeout наследует OSError)
)

# VALIDATION: данные/манифест плохие — повтор не поможет
_VALIDATION_TYPES: tuple[type, ...] = (
    ValueError,
    KeyError,
)

# Опциональные зависимости (psycopg2, json, requests, socket)
_OPTIONAL_IMPORTS = [
    ("psycopg2", "OperationalError", ErrorClass.INFRASTRUCTURE),
    ("psycopg2", "InterfaceError", ErrorClass.INFRASTRUCTURE),
    ("json", "JSONDecodeError", ErrorClass.VALIDATION),
    ("requests.exceptions", "ConnectionError", ErrorClass.TARGET),
    ("socket", "gaierror", ErrorClass.TARGET),
]


def _resolve_optional(class_path: str, attr: str) -> type | None:
    try:
        module = __import__(class_path, fromlist=[attr])
        return getattr(module, attr, None)
    except Exception:
        return None


def _build_optional_tables() -> dict[str, set[type]]:
    tables: dict[str, set[type]] = {
        ErrorClass.INFRASTRUCTURE: set(),
        ErrorClass.VALIDATION: set(),
        ErrorClass.TARGET: set(),
    }
    for module_name, attr, cls_name in _OPTIONAL_IMPORTS:
        cls = _resolve_optional(module_name, attr)
        if cls is not None:
            tables[cls_name].add(cls)
    return tables


_OPTIONAL_TABLES = _build_optional_tables()


def classify_error(exception: BaseException) -> str:
    """Классифицировать исключение в ErrorClass.

    Порядок проверки (важен!):
      1. Точное совпадение типа: TARGET → VALIDATION → INFRASTRUCTURE
      2. Наследование (isinstance) по опциональным таблицам
      3. Маркеры в сообщении
      4. UNKNOWN (fail-closed)
    """
    exc_type = type(exception)
    message = str(exception).lower()

    # 1) Точное совпадение типа (TARGET раньше INFRA: ConnectionRefusedError
    #    — подкласс ConnectionError, но по контракту это TARGET)
    if exc_type in _TARGET_TYPES:
        return ErrorClass.TARGET
    if exc_type in _VALIDATION_TYPES:
        return ErrorClass.VALIDATION
    if exc_type in _INFRASTRUCTURE_TYPES:
        return ErrorClass.INFRASTRUCTURE

    # Опциональные типы (psycopg2, json, requests, socket)
    for cls in _OPTIONAL_TABLES[ErrorClass.TARGET]:
        if exc_type is cls or isinstance(exception, cls):
            return ErrorClass.TARGET
    for cls in _OPTIONAL_TABLES[ErrorClass.VALIDATION]:
        if exc_type is cls or isinstance(exception, cls):
            return ErrorClass.VALIDATION
    for cls in _OPTIONAL_TABLES[ErrorClass.INFRASTRUCTURE]:
        if exc_type is cls or isinstance(exception, cls):
            return ErrorClass.INFRASTRUCTURE

    # 2) Наследование от базовых таблиц
    for cls in _TARGET_TYPES:
        if isinstance(exception, cls):
            return ErrorClass.TARGET
    for cls in _VALIDATION_TYPES:
        if isinstance(exception, cls):
            return ErrorClass.VALIDATION
    for cls in _INFRASTRUCTURE_TYPES:
        if isinstance(exception, cls):
            return ErrorClass.INFRASTRUCTURE

    # 3) Маркеры в сообщении (для исключений без типа в таблицах)
    _INFRASTRUCTURE_MARKERS = (
        "worker vanished", "connection lost", "timed out",
        "temporarily unavailable", "lease expired",
    )
    _TARGET_MARKERS = (
        "no route to host", "network is unreachable",
        "host unreachable", "certificate", "getaddrinfo failed",
    )
    _VALIDATION_MARKERS = (
        "invalid manifest", "schema mismatch", "validation error",
        "malformed", "missing required field",
    )

    for marker in _INFRASTRUCTURE_MARKERS:
        if marker in message:
            return ErrorClass.INFRASTRUCTURE
    for marker in _TARGET_MARKERS:
        if marker in message:
            return ErrorClass.TARGET
    for marker in _VALIDATION_MARKERS:
        if marker in message:
            return ErrorClass.VALIDATION

    # 4) Fail-closed
    return ErrorClass.UNKNOWN


def should_retry(
    error_class: str | ErrorClass,
    attempt_number: int,
    max_attempts: int = 3,
) -> bool:
    """Повторять ли попытку.

    INFRASTRUCTURE + attempt < max → True
    INFRASTRUCTURE + attempt >= max → False
    VALIDATION → False (повтор бессмыслен)
    TARGET → False (цель недоступна, повтор не поможет)
    UNKNOWN → False (fail-closed)
    """
    cls = error_class.value if isinstance(error_class, ErrorClass) else str(error_class)
    if cls == ErrorClass.INFRASTRUCTURE.value:
        return attempt_number < max_attempts
    # VALIDATION, TARGET, UNKNOWN → не ретраим никогда
    return False


@dataclass(frozen=True)
class RetryPolicy:
    """Политика повторов. Фиксированный backoff (30с), без экспоненты."""
    max_attempts: int = 3
    backoff_s: float = 30.0
    retryable_classes: frozenset[str] = frozenset({ErrorClass.INFRASTRUCTURE.value})

    def should_retry(self, error_class: str | ErrorClass, attempt_number: int) -> bool:
        cls = error_class.value if isinstance(error_class, ErrorClass) else str(error_class)
        if cls not in self.retryable_classes:
            return False
        return should_retry(cls, attempt_number, self.max_attempts)

    def classify(self, exception: BaseException) -> ErrorClass:
        return classify_error(exception)
