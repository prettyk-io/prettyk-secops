# -*- coding: utf-8 -*-
"""
Обработчик данных (DataProcessor).

Содержит методы для работы с данными, парсинга, преобразований, генерации,
логирования и работы с файлами. Используется в адаптерах и контроллере.
"""
from utils.env_dual import pk_env

import json
import re
import secrets
import time
import datetime
import uuid
import string
import logging
from typing import Any, List, Dict, Optional, Union

logger = logging.getLogger("orchestrator")


_DATETIME_FALLBACKS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
    "%d.%m.%Y %H:%M:%S",
    "%d.%m.%Y",
)


def _as_datetime(value: Any, fmt: str) -> "datetime.datetime":
    """В стриме дата чаще лежит строкой (`Сейчас`, JSON, поле формы), а не datetime."""
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, datetime.date):
        return datetime.datetime(value.year, value.month, value.day)
    text = str(value).strip()
    for candidate in (fmt, *_DATETIME_FALLBACKS):
        try:
            return datetime.datetime.strptime(text, candidate)
        except (TypeError, ValueError):
            continue
    try:
        return datetime.datetime.fromisoformat(text)
    except ValueError:
        raise ValueError(
            f"не разобрал дату {value!r}: нужен результат РазобратьДату/Сейчас "
            f"или строка формата {fmt!r}"
        )


def _as_int(value: Any, name: str) -> int:
    """Из wire аргументы приходят строками: 'core|generate_random_digits|4'."""
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        raise ValueError(f"{name}: ожидалось целое число, получено {value!r}")


def _as_float(value: Any, name: str) -> float:
    """Wire args — строки: 'core|sleep|2'."""
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        raise ValueError(f"{name}: ожидалось число, получено {value!r}")


def _tokenize_pattern(pattern: str) -> List[tuple]:
    tokens: List[tuple] = []
    i = 0
    while i < len(pattern):
        if pattern[i] == "[":
            end = pattern.find("]", i)
            if end == -1:
                raise ValueError(f"Unclosed bracket in pattern: {pattern}")
            char_class = pattern[i + 1 : end]
            i = end + 1
            quantifier = ""
            if i < len(pattern) and pattern[i] == "{":
                end_quant = pattern.find("}", i)
                if end_quant == -1:
                    raise ValueError(f"Unclosed quantifier in pattern: {pattern}")
                quantifier = pattern[i + 1 : end_quant]
                i = end_quant + 1
            tokens.append((char_class, quantifier))
        else:
            tokens.append((pattern[i], None))
            i += 1
    return tokens


_PATTERN_CHARSETS = {
    "A-Z": string.ascii_uppercase,
    "a-z": string.ascii_lowercase,
    "0-9": string.digits,
    "A-Za-z0-9": string.ascii_letters + string.digits,
    "A-Za-z": string.ascii_letters,
}


def _expand_pattern_token(char_class: str, quantifier: Optional[str]) -> str:
    if quantifier is None:
        return char_class
    chars = _PATTERN_CHARSETS.get(char_class, char_class)
    if quantifier.isdigit():
        count = int(quantifier)
        return "".join(secrets.choice(chars) for _ in range(count))
    if "," in quantifier:
        parts = quantifier.split(",")
        min_count = int(parts[0]) if parts[0] else 0
        max_count = int(parts[1]) if parts[1] else 10
        if max_count < min_count:
            min_count, max_count = max_count, min_count
        count = min_count + secrets.randbelow(max_count - min_count + 1)
        return "".join(secrets.choice(chars) for _ in range(count))
    return secrets.choice(chars)


def _env_flag_on(name: str) -> bool:
    import os

    return (os.getenv(name) or "").strip().lower() in {"1", "true", "yes", "on"}


def _command_allow_tokens(allow_raw: str) -> List[str]:
    return [t.strip().lower() for t in re.split(r"[|,;]+", allow_raw) if t.strip()]


def _command_timeout(timeout_sec: Any) -> float:
    try:
        timeout = float(timeout_sec)
    except (TypeError, ValueError):
        timeout = 120.0
    return 120.0 if timeout <= 0 else timeout


def _run_external_command(
    *,
    raw: str,
    tokens: List[str],
    timeout: float,
    notes: List[str],
):
    import os
    import subprocess

    if os.name == "nt":
        return subprocess.run(
            raw,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    return subprocess.run(
        tokens,
        shell=False,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


class DataProcessor:
    """Статический класс для операций с данными."""

    _last_command_result: Optional[Dict[str, Any]] = None

    # ========== ПАРСИНГ КОНСТРУКТОРА ==========

    @staticmethod
    def parse_constructor(raw_string: str) -> List[str]:
        """Разбивает строку конструктора по разделителю '|'."""
        if not raw_string:
            return []
        return raw_string.split("|")

    @staticmethod
    def parse_with_failsafe(raw_string: str) -> tuple:
        """Разбивает строку и проверяет наличие флага '> ?' в конце."""
        parts = raw_string.split("|")
        failsafe = False
        if parts and parts[-1].strip() == "> ?":
            failsafe = True
            parts = parts[:-1]
        return parts, failsafe

    # ========== ПРЕОБРАЗОВАНИЕ ТИПОВ ==========

    @staticmethod
    def to_int(value: Any) -> int:
        try:
            return int(value)
        except (ValueError, TypeError):
            raise ValueError(f"Cannot convert {value} to int")

    @staticmethod
    def to_float(value: Any) -> float:
        try:
            return float(value)
        except (ValueError, TypeError):
            raise ValueError(f"Cannot convert {value} to float")

    @staticmethod
    def to_bool(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            val = value.lower()
            if val in ("true", "1", "yes", "y"):
                return True
            if val in ("false", "0", "no", "n"):
                return False
        raise ValueError(f"Cannot convert {value} to bool")

    @staticmethod
    def to_string(value: Any) -> str:
        return str(value)

    @staticmethod
    def to_json(value: Any) -> str:
        try:
            return json.dumps(value, ensure_ascii=False, indent=2)
        except TypeError:
            raise ValueError(f"Cannot convert {value} to JSON")

    @staticmethod
    def from_json(json_string: str) -> Any:
        try:
            return json.loads(json_string)
        except json.JSONDecodeError:
            raise ValueError(f"Invalid JSON: {json_string}")

    @staticmethod
    def to_base64(value: str) -> str:
        import base64
        return base64.b64encode(value.encode()).decode()

    @staticmethod
    def from_base64(value: str) -> str:
        import base64
        return base64.b64decode(value).decode()

    # ========== РАБОТА СО СТРОКАМИ ==========

    @staticmethod
    def string_contains(string: str, substring: str) -> bool:
        return substring in string

    @staticmethod
    def string_starts_with(string: str, prefix: str) -> bool:
        return string.startswith(prefix)

    @staticmethod
    def string_ends_with(string: str, suffix: str) -> bool:
        return string.endswith(suffix)

    @staticmethod
    def string_replace(string: str, old: str, new: str) -> str:
        return string.replace(old, new)

    @staticmethod
    def string_regex_match(string: str, pattern: str) -> bool:
        return bool(re.search(pattern, string))

    @staticmethod
    def string_extract_regex(string: str, pattern: str, group: int = 0) -> Optional[str]:
        match = re.search(pattern, string)
        if match:
            return match.group(group)
        return None

    @staticmethod
    def string_to_lower(string: str) -> str:
        return string.lower()

    @staticmethod
    def string_to_upper(string: str) -> str:
        return string.upper()

    @staticmethod
    def string_length(string: str) -> int:
        return len(string)

    @staticmethod
    def string_trim(string: str) -> str:
        return string.strip()

    @staticmethod
    def string_split(string: str, delimiter: str) -> List[str]:
        return string.split(delimiter)

    @staticmethod
    def string_join(array: List[str], delimiter: str) -> str:
        return delimiter.join(array)

    # ========== РАБОТА С МАССИВАМИ ==========

    @staticmethod
    def array_length(array: List) -> int:
        return len(array)

    @staticmethod
    def array_get(array: List, index: int) -> Any:
        try:
            return array[index]
        except IndexError:
            raise IndexError(f"Index {index} out of range (length {len(array)})")

    @staticmethod
    def array_contains(array: List, value: Any) -> bool:
        return value in array

    @staticmethod
    def array_index_of(array: List, value: Any) -> int:
        try:
            return array.index(value)
        except ValueError:
            return -1

    @staticmethod
    def array_slice(array: List, start: int, end: Optional[int] = None) -> List:
        return array[start:end]

    @staticmethod
    def array_join(array: List, delimiter: str) -> str:
        return delimiter.join(array)

    # ========== РАБОТА СО ВРЕМЕНЕМ ==========

    @staticmethod
    def current_timestamp() -> int:
        return int(time.time())

    @staticmethod
    def current_datetime(format: str = "%Y-%m-%d %H:%M:%S") -> str:
        return datetime.datetime.now().strftime(format)

    @staticmethod
    def parse_datetime(string: str, format: str = "%Y-%m-%d %H:%M:%S") -> datetime.datetime:
        return _as_datetime(string, format)

    @staticmethod
    def format_datetime(dt: Any, format: str = "%Y-%m-%d %H:%M:%S") -> str:
        return _as_datetime(dt, format).strftime(format)

    @staticmethod
    def sleep(seconds: float) -> None:
        time.sleep(_as_float(seconds, "seconds"))

    @staticmethod
    def run_command(command: str, timeout_sec: float = 120) -> str:
        """
        ВыполнитьКоманду — внешний процесс (nuclei/trivy/…), как keyword-обёртка RF.

        Gate (честный, не silent):
        - нужен PK_EXECUTE_COMMAND=1;
        - если задан PK_COMMAND_ALLOWLIST (|,; или запятая) — первый токен
          (basename) должен совпасть; пустой allowlist + enable = lab power;
        - PK_API_LAB_DRY=1 — stub без subprocess.
        """
        import os
        import shlex
        import subprocess
        from pathlib import Path

        from core.errors import WiredError

        raw = (command or "").strip()
        if not raw:
            raise WiredError("ВыполнитьКоманду: пустая команда")

        dry = _env_flag_on("PK_API_LAB_DRY")
        enabled = _env_flag_on("PK_EXECUTE_COMMAND")
        allow_raw = (pk_env("COMMAND_ALLOWLIST") or "").strip()
        allow_tokens = _command_allow_tokens(allow_raw)

        try:
            tokens = shlex.split(raw, posix=os.name != "nt")
        except ValueError as exc:
            raise WiredError(f"ВыполнитьКоманду: не разобрать команду: {exc}") from exc
        if not tokens:
            raise WiredError("ВыполнитьКоманду: пустая команда после разбора")

        head = Path(tokens[0]).name.lower()
        if allow_tokens and head not in allow_tokens:
            raise WiredError(
                f"ВыполнитьКоманду: {head!r} вне PK_COMMAND_ALLOWLIST "
                f"({', '.join(allow_tokens)})"
            )
        if not enabled and not dry:
            raise WiredError(
                "ВыполнитьКоманду выключена: задайте PK_EXECUTE_COMMAND=1 "
                "(и при необходимости PK_COMMAND_ALLOWLIST=nuclei|trivy|…)"
            )

        timeout = _command_timeout(timeout_sec)
        notes: List[str] = []
        if dry:
            notes.append("PK_API_LAB_DRY — subprocess не запускался")
            payload = {
                "ok": True,
                "dry": True,
                "command": raw,
                "head": head,
                "returncode": 0,
                "stdout": "",
                "stderr": "",
                "notes": notes,
            }
            DataProcessor._last_command_result = payload
            logger.info("ВыполнитьКоманду dry: %s", raw)
            return json.dumps(payload, ensure_ascii=False)

        if not allow_tokens:
            notes.append("PK_COMMAND_ALLOWLIST пуст — lab power, любой basename")

        try:
            completed = _run_external_command(
                raw=raw, tokens=tokens, timeout=timeout, notes=notes
            )
        except subprocess.TimeoutExpired as exc:
            raise WiredError(
                f"ВыполнитьКоманду: таймаут {timeout}s: {raw}"
            ) from exc
        except OSError as exc:
            raise WiredError(f"ВыполнитьКоманду: OS error: {exc}") from exc

        out = (completed.stdout or "")[-8000:]
        err = (completed.stderr or "")[-4000:]
        payload = {
            "ok": completed.returncode == 0,
            "dry": False,
            "command": raw,
            "head": head,
            "returncode": int(completed.returncode),
            "stdout": out,
            "stderr": err,
            "notes": notes,
        }
        DataProcessor._last_command_result = payload
        logger.info(
            "ВыполнитьКоманду rc=%s head=%s",
            completed.returncode,
            head,
        )
        if completed.returncode != 0:
            raise WiredError(
                f"ВыполнитьКоманду: код {completed.returncode}: {raw}"
                + (f" | stderr: {err[:400]}" if err else "")
            )
        return json.dumps(payload, ensure_ascii=False)

    # ========== ГЕНЕРАЦИЯ ТЕСТОВЫХ ДАННЫХ ==========

    @staticmethod
    def generate_uuid() -> str:
        return str(uuid.uuid4())

    @staticmethod
    def generate_random_string(length: int = 8, chars: Optional[str] = None) -> str:
        if chars is None:
            chars = string.ascii_letters + string.digits
        n = _as_int(length, "length")
        return "".join(secrets.choice(chars) for _ in range(n))

    @staticmethod
    def generate_random_int(min_val: int, max_val: int) -> int:
        lo = _as_int(min_val, "min_val")
        hi = _as_int(max_val, "max_val")
        if hi < lo:
            lo, hi = hi, lo
        return lo + secrets.randbelow(hi - lo + 1)

    @staticmethod
    def generate_random_email(domain: str = "example.com") -> str:
        return f"{DataProcessor.generate_random_string(8)}@{domain}"

    @staticmethod
    def generate_random_phone(country_code: str = "+7") -> str:
        return f"{country_code}{1_000_000_000 + secrets.randbelow(9_000_000_000)}"

    @staticmethod
    def generate_from_pattern(pattern: str) -> str:
        tokens = _tokenize_pattern(pattern)
        return "".join(_expand_pattern_token(char_class, quantifier) for char_class, quantifier in tokens)

    @staticmethod
    def generate_random_letters(length: int = 8) -> str:
        return DataProcessor.generate_random_string(length, chars=string.ascii_letters)

    @staticmethod
    def generate_random_lowercase(length: int = 8) -> str:
        return DataProcessor.generate_random_string(length, chars=string.ascii_lowercase)

    @staticmethod
    def generate_random_uppercase(length: int = 8) -> str:
        return DataProcessor.generate_random_string(length, chars=string.ascii_uppercase)

    @staticmethod
    def generate_random_digits(length: int = 8) -> str:
        return DataProcessor.generate_random_string(length, chars=string.digits)

    # ========== ЛОГИРОВАНИЕ (для единообразия) ==========

    @staticmethod
    def log_message(message: str, level: str = "INFO") -> None:
        level = level.upper()
        if level == "INFO":
            logger.info(message)
        elif level == "WARNING":
            logger.warning(message)
        elif level == "ERROR":
            logger.error(message)
        elif level == "DEBUG":
            logger.debug(message)
        else:
            print(f"[{level}] {message}")

    @staticmethod
    def log_variable(name: str, value: Any) -> None:
        logger.info(f"[VARIABLE] {name} = {value}")
        try:
            from utils.diary_bus import publish

            publish(
                "LOG",
                f"ЛогПеременную | core|log_variable|{name}|{value}",
                channel="scanner",
            )
        except Exception:
            pass

    @staticmethod
    def start_log_cut(name: str, options: str = "", comment: str = "") -> str:
        """НачатьЛогирование — открыть именованную нарезку стримов."""
        from utils.log_cuts import start_cut

        path = start_cut(name, options=options or "", comment=comment or "")
        logger.info("Log cut opened: %s → %s", name, path)
        try:
            from utils.diary_bus import publish

            opts = (options or "").strip() or "security"
            publish(
                "LOG",
                f"НачатьЛогирование | {name} | {opts}",
                channel="diary",
            )
        except Exception:
            pass
        return str(path)

    @staticmethod
    def end_log_cut(name: str) -> str:
        """ОкончитьЛогирование — отрезать и сбросить нарезку на диск."""
        from utils.log_cuts import end_cut

        path = end_cut(name, with_sidecars=True)
        logger.info("Log cut closed: %s → %s", name, path)
        try:
            from utils.diary_bus import publish

            publish(
                "LOG",
                f"ОкончитьЛогирование | {name} | {path.name}",
                channel="diary",
            )
        except Exception:
            pass
        return str(path)

    # ========== КАСТОМНЫЕ СЛОВАРИ (CUSTOM PAYLOADS) ==========
    # Позволяет загружать свои наборы строк (payloads) для использования
    # в активном сканировании, фаззинге и других проверках.
    # ИБ-команда может подготовить специфические словари под свои задачи.

def add_custom_payload(self, name, payload_list_or_file):
    """
    Загружает кастомный словарь в scanner.

    Args:
        name (str): Имя словаря (для идентификации в scanner).
        payload_list_or_file (list | str): Либо список строк, либо путь к файлу
                                           (каждая строка — один payload).

    Returns:
        bool: True при успехе.

    Пример:
        scanner.add_custom_payload("sql_injection", ["' OR 1=1 --", "' UNION SELECT ..."])
        scanner.add_custom_payload("xss", "/path/to/xss_payloads.txt")
    """
    self._ensure_connected()
    if isinstance(payload_list_or_file, list):
        payloads = payload_list_or_file
    else:
        with open(payload_list_or_file, 'r', encoding='utf-8') as f:
            payloads = [line.strip() for line in f if line.strip()]
    self._scanner.custompayloads.load_payloads(name, payloads)
    logger.info(f"Loaded {len(payloads)} payloads as '{name}'")
    return True

def get_payloads(self):
    """
    Возвращает список всех загруженных кастомных словарей.

    Returns:
        list: Список словарей (каждый словарь — {'name': ..., 'payloads': [...]})
    """
    self._ensure_connected()
    return self._scanner.custompayloads.get_payloads()

def remove_payload(self, name):
    """
    Удаляет ранее загруженный кастомный словарь.

    Args:
        name (str): Имя словаря.
    """
    self._ensure_connected()
    self._scanner.custompayloads.remove_payload(name)


# ========== OAST (OUT-OF-BAND) ==========
# Позволяет детектировать внешние вызовы (DNS, HTTP) из приложения.
# Используется для поиска SSRF, XXE и других уязвимостей, связанных с внешними запросами.
# ИБ-команда может проверять, не обращается ли приложение к внешним ресурсам.

def start_oast_server(self):
    """
    Запускает встроенный OAST-сервер scanner.
    После запуска scanner будет перехватывать внешние запросы от приложения.
    """
    self._ensure_connected()
    self._scanner.oast.start()
    logger.info("OAST server started")

def stop_oast_server(self):
    """Останавливает OAST-сервер."""
    self._ensure_connected()
    self._scanner.oast.stop()
    logger.info("OAST server stopped")

def get_oast_alerts(self):
    """
    Возвращает алерты, сгенерированные OAST-сервером.
    Каждый алерт содержит информацию о внешнем запросе (тип, URL, время).

    Returns:
        list: Список алертов OAST.
    """
    self._ensure_connected()
    return self._scanner.oast.get_alerts()

# ========== GRPC ==========
# Позволяет импортировать .proto файлы и сканировать gRPC-сервисы.
# Актуально для современных микросервисных архитектур.

def import_grpc_proto(self, proto_file_or_dir):
    """
    Импортирует gRPC .proto файл или директорию с .proto файлами.

    Args:
        proto_file_or_dir (str): Путь к .proto файлу или директории.

    Returns:
        bool: True при успехе.
    """
    self._ensure_connected()
    self._scanner.grpc.import_proto(proto_file_or_dir)
    logger.info(f"Imported gRPC proto: {proto_file_or_dir}")
    return True

def scan_grpc(self, context_name=None):
    """
    Запускает сканирование gRPC-сервиса на основе импортированного .proto.

    Args:
        context_name (str, optional): Имя контекста. Если не указан, используется текущий.
    """
    self._ensure_connected()
    context = context_name or self.context_name
    if context:
        self._scanner.grpc.scan(context)
    else:
        self._scanner.grpc.scan()
    logger.info("gRPC scan started")
