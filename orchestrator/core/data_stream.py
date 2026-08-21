# -*- coding: utf-8 -*-
"""
Поток данных: переменные сценария, path-доступ, подстановка ссылок.

Канон: $name, $user.email, $names[0] (legacy ${…} ок)
Секреты: явный Секрет / secret=True и авто-имена (password/login/…) → mask_for_log.
"""
from __future__ import annotations

import re
from typing import Any, Iterable, List, Set

from core import expr
from core.errors import WiredError

# Подстановка вместо plaintext секрета в логах / diary / Allure.
SECRET_LOG_MASK = " А еще вам дать ключи от квартиры, где деньги лежат? "

# G-60: имена, которые маскируем даже без `Секрет` (корень переменной / page slot).
_AUTO_SECRET_NAME_RE = re.compile(
    r"^(password|passwd|pwd|secret|token|api_?key|access_token|refresh_token|"
    r"client_secret|login|пароль|токен)$",
    re.IGNORECASE,
)

# G-63: слоты страницы id=login — username/логин тоже в mask (не только password).
_LOGIN_PAGE_SLOT_RE = re.compile(
    r"^(password|passwd|pwd|пароль|username|user|login|логин)$",
    re.IGNORECASE,
)


class DataStream:
    def __init__(self, initial=None):
        self._vars = dict(initial or {})
        self._secrets: Set[str] = set()
        # Значения из ${ENV:} / secretref (G-62) — маскируем даже без имени в _secrets.
        self._extra_secret_values: Set[str] = set()
        # Локальные оверлеи (slot-bind page_call): ищем сверху вниз, Пусть пишет в корень.
        self._locals_stack: List[dict] = []
        if initial:
            for name in self._vars:
                if self._auto_secret_name(name):
                    self._secrets.add(name)

    def push_locals(self, mapping: dict, *, page_key: str | None = None) -> None:
        layer = dict(mapping or {})
        self._locals_stack.append(layer)
        login_page = (page_key or "").strip().lower() == "login"
        for name in layer:
            root = self._root_name(name)
            if self._auto_secret_name(root) or (
                login_page and _LOGIN_PAGE_SLOT_RE.match(root)
            ):
                self._secrets.add(root)

    def pop_locals(self) -> None:
        if not self._locals_stack:
            raise WiredError("pop_locals: стек пуст")
        self._locals_stack.pop()

    def set(self, key: str, value: Any, *, secret: bool = False) -> None:
        key = self._root_name(key)
        self._vars[key] = value
        if secret or self._auto_secret_name(key):
            self._secrets.add(key)
        else:
            self._secrets.discard(key)

    def get(self, key: str, default=None) -> Any:
        for layer in reversed(self._locals_stack):
            if key in layer:
                return layer[key]
        return self._vars.get(key, default)

    def mark_secret(self, key: str) -> None:
        self._secrets.add(self._root_name(key))

    def is_secret(self, key: str) -> bool:
        return self._root_name(key) in self._secrets

    def names(self) -> Iterable[str]:
        return self._vars.keys()

    def seed_secret_values(self, values: Iterable[str]) -> None:
        """Запомнить plaintext секретов (ENV/secretref) для mask_for_log."""
        for value in values or ():
            if isinstance(value, str) and value:
                self._extra_secret_values.add(value)

    def get_path(self, path_expr: str) -> Any:
        """Строгий доступ: нет ключа/индекса → WiredError. `${ENV:NAME}` — os.environ."""
        from core.wired_secretref import env_name_from_path, read_env_secret

        env_name = env_name_from_path(path_expr)
        if env_name is not None:
            value = read_env_secret(env_name)
            self._extra_secret_values.add(value)
            return value

        parts = expr.parse_path(path_expr)
        if not parts:
            raise WiredError("Пустой путь")
        root = parts[0]
        if not isinstance(root, str):
            raise WiredError(f"Переменная ${{{root}}} не объявлена")
        cur: Any = None
        found = False
        for layer in reversed(self._locals_stack):
            if root in layer:
                cur = layer[root]
                found = True
                break
        if not found:
            if root not in self._vars:
                raise WiredError(f"Переменная ${{{root}}} не объявлена")
            cur = self._vars[root]
        walked = [root]
        for seg in parts[1:]:
            cur = self._step(cur, seg, walked)
            walked.append(seg)
        return cur

    def set_path(self, path_expr: str, value: Any, *, secret: bool = False) -> None:
        parts = expr.parse_path(path_expr)
        if len(parts) == 1 and isinstance(parts[0], str):
            self.set(parts[0], value, secret=secret)
            return
        root = parts[0]
        if not isinstance(root, str) or root not in self._vars:
            raise WiredError(f"Переменная ${{{root}}} не объявлена")
        cur = self._vars[root]
        for seg in parts[1:-1]:
            cur = self._step(cur, seg, [root])
        last = parts[-1]
        if isinstance(last, int):
            if not isinstance(cur, list):
                raise WiredError(f"Ожидался список по пути {path_expr}")
            cur[last] = value
        else:
            if not isinstance(cur, dict):
                raise WiredError(f"Ожидался объект по пути {path_expr}")
            cur[last] = value
        if secret or self._auto_secret_name(root):
            self._secrets.add(root)

    def resolve(self, value: Any, *, strict: bool = False) -> Any:
        """
        Подстановка, если аргумент целиком ссылка: $x / ${x} / $ENV:NAME.
        Также целиком `secretref:NAME` (G-62).

        Внутри литералов списка/объекта ссылки разбирает parse_value — здесь
        НЕ интерполируем mid-string (иначе ["a",$b] сломается до парсера).
        Для шаблонов в wire-аргументах (URL и т.п.) — resolve_arg().
        """
        if not isinstance(value, str):
            return value
        text = value.strip()
        from core.wired_secretref import parse_secretref_string, read_env_secret

        ref_name = parse_secretref_string(text)
        if ref_name is not None and not text.startswith("$"):
            # secretref:VAR (не $ENV:… — тот путь через strip_ref → get_path)
            try:
                resolved = read_env_secret(ref_name)
            except WiredError:
                if strict:
                    raise
                return value
            self._extra_secret_values.add(resolved)
            return resolved
        inner = expr.strip_ref(text)
        if inner is not None:
            try:
                return self.get_path(inner)
            except WiredError:
                if strict:
                    raise
                return value
        return value

    def resolve_arg(self, value: Any, *, strict: bool = False) -> Any:
        """
        Аргумент constructor/leaf: целая ссылка → значение любого типа;
        иначе mid-string `$…` в шаблоне (URL, заголовок) → interpolate.
        """
        if not isinstance(value, str):
            return value
        resolved = self.resolve(value, strict=strict)
        if isinstance(resolved, str) and "$" in resolved:
            return self.interpolate(resolved, strict=strict)
        return resolved

    def interpolate(self, text: str, *, strict: bool = False) -> str:
        """Подставить все $… / ${…} внутри строки (URL, заголовки, сообщения)."""
        if not isinstance(text, str):
            return text
        return expr.interpolate(text, self.get_path, strict=strict)

    def parse_value(self, text: str, *, strict: bool = True) -> Any:
        """Разобрать аргумент let/list/object (литерал, ref, либо +/−)."""
        resolve = self.get_path if strict else self._soft_ref
        return expr.parse_value_or_arith(text, resolve)

    def secret_string_values(self) -> List[str]:
        """Известные plaintext-значения секретов (корень + locals + ENV seeds)."""
        out: List[str] = []
        seen: Set[str] = set()
        for name in self._secrets:
            val = self.get(name)
            if isinstance(val, str) and val and val not in seen:
                seen.add(val)
                out.append(val)
        for val in self._extra_secret_values:
            if val and val not in seen:
                seen.add(val)
                out.append(val)
        return out

    def mask_for_log(self, value: Any) -> Any:
        """Маскирование секретов для логов/Allure/diary (строки, dict/list рекурсивно)."""
        secrets = self.secret_string_values()
        if isinstance(value, str):
            out = value
            for secret_val in secrets:
                if secret_val in out:
                    out = out.replace(secret_val, SECRET_LOG_MASK)
            return out
        if isinstance(value, expr.KindDict):
            return expr.KindDict(
                {k: self.mask_for_log(v) for k, v in value.items()},
                kind=value.kind,
            )
        if isinstance(value, dict):
            return {k: self.mask_for_log(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self.mask_for_log(v) for v in value]
        if isinstance(value, tuple):
            return tuple(self.mask_for_log(v) for v in value)
        for name in self._secrets:
            if self.get(name) is value:
                return SECRET_LOG_MASK
        return value

    def mask_parts(self, *parts: Any) -> tuple:
        """Кортеж частей для diary/лога — каждая через mask_for_log."""
        return tuple(self.mask_for_log(p) for p in parts)

    def __contains__(self, key: str) -> bool:
        if key in self._vars:
            return True
        return any(key in layer for layer in self._locals_stack)

    def merge(self, other: "DataStream") -> None:
        self._vars.update(other._vars)
        self._secrets |= other._secrets
        self._extra_secret_values |= other._extra_secret_values

    def _soft_ref(self, path_expr: str) -> Any:
        try:
            return self.get_path(path_expr)
        except WiredError:
            return expr.format_ref(path_expr)

    @staticmethod
    def _auto_secret_name(key: str) -> bool:
        return bool(_AUTO_SECRET_NAME_RE.match(str(key).strip()))

    @staticmethod
    def _root_name(key: str) -> str:
        key = str(key).strip()
        inner = expr.strip_ref(key)
        if inner is not None:
            parts = expr.parse_path(inner)
            if len(parts) != 1 or not isinstance(parts[0], str):
                raise WiredError(
                    f"Имя переменной должно быть простым идентификатором, не path: {key!r}"
                )
            return parts[0]
        if not key or "." in key or "[" in key:
            # save_as исторически — голое имя без ${}.
            if key and key.isidentifier():
                return key
            raise WiredError(f"Некорректное имя переменной: {key!r}")
        return key

    @staticmethod
    def _step(cur: Any, seg, walked) -> Any:
        path_hint = ".".join(str(p) for p in walked + [seg])
        if isinstance(seg, int):
            if not isinstance(cur, list):
                raise WiredError(f"Ожидался список при доступе {path_hint}")
            try:
                return cur[seg]
            except IndexError as exc:
                raise WiredError(
                    f"Индекс {seg} вне списка (len={len(cur)}) по пути {path_hint}"
                ) from exc
        if not isinstance(cur, dict):
            raise WiredError(f"Ожидался объект при доступе {path_hint}")
        if seg not in cur:
            raise WiredError(f"Ключ {seg!r} не найден в объекте ({path_hint})")
        return cur[seg]
