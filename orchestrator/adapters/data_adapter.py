# -*- coding: utf-8 -*-
"""
Адаптер данных языка KDT: Пусть / Список / Объект / размер / секреты.

Wire: data|<action>|...
Pretty (позже): Пусть ${email} = "..."

Мутирует DataStream текущего сценария — Contoller делает bind(stream) на шаг.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

from core.data_stream import DataStream
from core.errors import WiredError

logger = logging.getLogger("orchestrator")


class DataAdapter:
    def __init__(self):
        self._stream: Optional[DataStream] = None

    def bind(self, stream: DataStream) -> None:
        self._stream = stream

    def _s(self) -> DataStream:
        if self._stream is None:
            raise RuntimeError("DataAdapter: stream не привязан (внутренняя ошибка Controller)")
        return self._stream

    # ——— присваивание ———

    def let(self, name: str, value: Any):
        """
        Пусть ${name} = <value> | Пусть ${user.role} = <value>

        value: литерал, ${ref}, +/−, Список [...], Объект/Словарь {...}, JSON.
        Keyword: data|let|<name-or-path>|<value>
        """
        stream = self._s()
        parsed = value if not isinstance(value, str) else stream.parse_value(value, strict=True)
        path = self._path_arg(name)
        stream.set_path(path, parsed, secret=False)
        logger.info("data.let %s = %s", path, stream.mask_for_log(parsed))
        return parsed

    def secret(self, name: str, value: Any):
        """
        Секрет ${name} = <value> — как let, но маскируется в логах.
        Keyword: data|secret|<name-or-path>|<value>
        """
        stream = self._s()
        parsed = value if not isinstance(value, str) else stream.parse_value(value, strict=True)
        path = self._path_arg(name)
        stream.set_path(path, parsed, secret=True)
        from core.data_stream import SECRET_LOG_MASK

        logger.info("data.secret %s = %s", path, SECRET_LOG_MASK.strip())
        return parsed

    @staticmethod
    def _path_arg(name: str) -> str:
        from core import expr as expr_mod

        raw = str(name).strip()
        inner = expr_mod.strip_ref(raw)
        path = inner if inner is not None else raw
        expr_mod.parse_path(path)  # validate
        return path

    # ——— список ———

    def list_append(self, name: str, value: str):
        """ДобавитьВСписок ${names} <value>. Keyword: data|list_append|<name>|<value>"""
        stream = self._s()
        key = stream._root_name(name)
        lst = stream.get(key)
        if not isinstance(lst, list):
            raise WiredError(f"${{{key}}} не список (type={type(lst).__name__})")
        item = stream.parse_value(value, strict=True)
        lst.append(item)
        logger.info("data.list_append %s += %s (len=%s)", key, stream.mask_for_log(item), len(lst))
        return lst

    def list_remove(self, name: str, index: str):
        """УдалитьИзСписка ${names} <index>. Keyword: data|list_remove|<name>|<index>"""
        stream = self._s()
        key = stream._root_name(name)
        lst = stream.get(key)
        if not isinstance(lst, list):
            raise WiredError(f"${{{key}}} не список")
        idx = int(stream.parse_value(index, strict=True))
        try:
            removed = lst.pop(idx)
        except IndexError as exc:
            raise WiredError(
                f"Индекс {idx} вне списка ${{{key}}} (len={len(lst)})"
            ) from exc
        logger.info("data.list_remove %s[%s] -> %s", key, idx, stream.mask_for_log(removed))
        return removed

    # ——— объект ———

    def object_put(self, name: str, key: str, value: str):
        """ПоложитьВОбъект ${user} <key> <value>. Keyword: data|object_put|<name>|<key>|<value>"""
        stream = self._s()
        obj_name = stream._root_name(name)
        obj = stream.get(obj_name)
        if not isinstance(obj, dict):
            raise WiredError(f"${{{obj_name}}} не объект")
        field = stream.parse_value(key, strict=True)
        if not isinstance(field, str):
            field = str(field)
        parsed = stream.parse_value(value, strict=True)
        obj[field] = parsed
        logger.info(
            "data.object_put %s.%s = %s",
            obj_name,
            field,
            stream.mask_for_log(parsed),
        )
        return parsed

    def object_get(self, name: str, key: str) -> Any:
        """
        ВзятьИзОбъекта — значение поля (обычно с save_as на шаге).
        Keyword: data|object_get|<name>|<key>
        """
        stream = self._s()
        obj_name = stream._root_name(name)
        obj = stream.get(obj_name)
        if not isinstance(obj, dict):
            raise WiredError(f"${{{obj_name}}} не объект")
        field = stream.parse_value(key, strict=True)
        if not isinstance(field, str):
            field = str(field)
        if field not in obj:
            raise WiredError(f"Ключ {field!r} нет в ${{{obj_name}}}")
        return obj[field]

    # ——— общее ———

    def size(self, name: str) -> int:
        """
        Размер списка/объекта/строки. Keyword: data|size|<name>
        Результат обычно в save_as.
        """
        from core import expr as expr_mod

        path = expr_mod.strip_ref(name.strip()) or name.strip()
        val = self._s().get_path(path)
        if isinstance(val, (list, dict, str)):
            return len(val)
        raise WiredError(
            f"Размер не определён для type={type(val).__name__} ({name})"
        )

    def concat(self, parts: Any) -> str:
        """
        Склеить куски в строку. Keyword: data|concat|<Список […]>
        Результат обычно в save_as (Пусть ${x} = Склеить …).
        """
        stream = self._s()
        parsed = parts if not isinstance(parts, str) else stream.parse_value(parts, strict=True)
        if not isinstance(parsed, list):
            parsed = [parsed]
        out = "".join("" if p is None else str(p) for p in parsed)
        logger.info("data.concat → %s", stream.mask_for_log(out))
        return out

    def contains(self, haystack: Any, needle: Any) -> bool:
        """
        Содержит как значение (bool). Keyword: data|contains|<hay>|<needle>
        Семантика как у условия «содержит» в Если.
        """
        stream = self._s()
        h = haystack if not isinstance(haystack, str) else stream.parse_value(haystack, strict=True)
        n = needle if not isinstance(needle, str) else stream.parse_value(needle, strict=True)
        if isinstance(h, (list, tuple, set, dict, str)):
            ok = n in h
        else:
            ok = str(n) in str(h)
        logger.info("data.contains → %s", ok)
        return ok

    def _value(self, raw: Any) -> Any:
        if not isinstance(raw, str):
            return raw
        return self._s().parse_value(raw, strict=True)

    def _as_int(self, raw: Any, label: str) -> int:
        val = self._value(raw)
        if isinstance(val, bool) or not isinstance(val, int):
            try:
                return int(val)
            except (TypeError, ValueError) as exc:
                raise WiredError(
                    f"{label}: ожидалось целое, получено {val!r}"
                ) from exc
        return val

    def substring(self, text: Any, start: Any, end: Any = None) -> str:
        """
        Подстрока (slice с 0). Keyword: data|substring|<text>|<start>[|<end>]
        """
        s = "" if self._value(text) is None else str(self._value(text))
        st = self._as_int(start, "Подстрока start")
        if end is None or (isinstance(end, str) and end.strip() == ""):
            out = s[st:]
        else:
            out = s[st : self._as_int(end, "Подстрока end")]
        logger.info("data.substring → %s", self._s().mask_for_log(out))
        return out

    def replace(self, text: Any, old: Any, new: Any) -> str:
        """Заменить все вхождения. Keyword: data|replace|<text>|<old>|<new>"""
        s = "" if self._value(text) is None else str(self._value(text))
        old_s = "" if self._value(old) is None else str(self._value(old))
        new_s = "" if self._value(new) is None else str(self._value(new))
        out = s.replace(old_s, new_s)
        logger.info("data.replace → %s", self._s().mask_for_log(out))
        return out

    def split(self, text: Any, sep: Any) -> list:
        """Разделить в список. Keyword: data|split|<text>|<sep>"""
        s = "" if self._value(text) is None else str(self._value(text))
        sep_s = "" if self._value(sep) is None else str(self._value(sep))
        out = s.split(sep_s)
        logger.info("data.split → %s parts", len(out))
        return out

    def trim(self, text: Any) -> str:
        """Обрезать пробелы по краям. Keyword: data|trim|<text>"""
        s = "" if self._value(text) is None else str(self._value(text))
        out = s.strip()
        logger.info("data.trim → %s", self._s().mask_for_log(out))
        return out

    @staticmethod
    def _compile_re(pattern: Any) -> re.Pattern:
        pat = "" if pattern is None else str(pattern)
        try:
            return re.compile(pat)
        except re.error as exc:
            raise WiredError(f"Битый regex {pat!r}: {exc}") from exc

    def match_re(self, text: Any, pattern: Any) -> bool:
        """СовпадаетРег — re.search. Keyword: data|match_re|<text>|<pattern>"""
        s = "" if self._value(text) is None else str(self._value(text))
        pat = self._value(pattern)
        ok = self._compile_re(pat).search(s) is not None
        logger.info("data.match_re → %s", ok)
        return ok

    def replace_re(self, text: Any, pattern: Any, repl: Any) -> str:
        """ЗаменитьРег — re.sub все. Keyword: data|replace_re|<text>|<pattern>|<repl>"""
        s = "" if self._value(text) is None else str(self._value(text))
        pat = self._value(pattern)
        r = "" if self._value(repl) is None else str(self._value(repl))
        out = self._compile_re(pat).sub(r, s)
        logger.info("data.replace_re → %s", self._s().mask_for_log(out))
        return out

    def extract_re(self, text: Any, pattern: Any) -> str:
        """
        ИзвлечьРег — первая группа или весь match. Нет матча → WiredError.
        Keyword: data|extract_re|<text>|<pattern>
        """
        s = "" if self._value(text) is None else str(self._value(text))
        rx = self._compile_re(self._value(pattern))
        m = rx.search(s)
        if m is None:
            raise WiredError(
                f"ИзвлечьРег: нет совпадения {rx.pattern!r} в {s!r}"
            )
        if m.lastindex:
            return m.group(1)
        return m.group(0)

    def extract_re_all(self, text: Any, pattern: Any) -> list:
        """
        ИзвлечьРегВсе → Список (группа 1 если есть, иначе full match).
        Keyword: data|extract_re_all|<text>|<pattern>
        """
        s = "" if self._value(text) is None else str(self._value(text))
        rx = self._compile_re(self._value(pattern))
        out: list = []
        for m in rx.finditer(s):
            out.append(m.group(1) if m.lastindex else m.group(0))
        logger.info("data.extract_re_all → %s matches", len(out))
        return out

    def split_re(self, text: Any, pattern: Any) -> list:
        """РазделитьРег — re.split → Список. Keyword: data|split_re|<text>|<pattern>"""
        s = "" if self._value(text) is None else str(self._value(text))
        out = self._compile_re(self._value(pattern)).split(s)
        logger.info("data.split_re → %s parts", len(out))
        return out

    def starts_with(self, text: Any, prefix: Any) -> bool:
        s = "" if self._value(text) is None else str(self._value(text))
        p = "" if self._value(prefix) is None else str(self._value(prefix))
        return s.startswith(p)

    def ends_with(self, text: Any, suffix: Any) -> bool:
        s = "" if self._value(text) is None else str(self._value(text))
        p = "" if self._value(suffix) is None else str(self._value(suffix))
        return s.endswith(p)

    def upper(self, text: Any) -> str:
        s = "" if self._value(text) is None else str(self._value(text))
        return s.upper()

    def lower(self, text: Any) -> str:
        s = "" if self._value(text) is None else str(self._value(text))
        return s.lower()

    def fetch_left(self, text: Any, delimiter: Any) -> str:
        """ВзятьДо — часть до первого delimiter (самого delim нет в результате)."""
        s = "" if self._value(text) is None else str(self._value(text))
        d = "" if self._value(delimiter) is None else str(self._value(delimiter))
        if d == "":
            return s
        if d not in s:
            raise WiredError(f"ВзятьДо: разделитель {d!r} не найден в {s!r}")
        return s.split(d, 1)[0]

    def fetch_right(self, text: Any, delimiter: Any) -> str:
        """ВзятьПосле — часть после первого delimiter."""
        s = "" if self._value(text) is None else str(self._value(text))
        d = "" if self._value(delimiter) is None else str(self._value(delimiter))
        if d == "":
            return ""
        if d not in s:
            raise WiredError(f"ВзятьПосле: разделитель {d!r} не найден в {s!r}")
        return s.split(d, 1)[1]

    def remove_str(self, text: Any, piece: Any) -> str:
        """Убрать — удалить все вхождения литерала. Keyword: data|remove_str|…"""
        s = "" if self._value(text) is None else str(self._value(text))
        p = "" if self._value(piece) is None else str(self._value(piece))
        return s.replace(p, "") if p else s

    def get(self, name: str) -> Any:
        """Прочитать переменную/path. Keyword: data|get|<name>"""
        from core import expr as expr_mod

        path = expr_mod.strip_ref(name.strip()) or name.strip()
        return self._s().get_path(path)
