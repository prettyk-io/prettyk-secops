# -*- coding: utf-8 -*-
"""
AUTH-10 / 10a: auth module dialect → AuthProfile IR → validate / dry-run / apply.

Static::

    auth=bearer
    token=...

    auth=apikey
    name=X-Api-Key
    value=...
    # place=header|query|cookie (default header)
    # success_url=... / success_string=...

    auth=querykey
    name=api_key
    value=...

Compose (AUTH-13) — список static/call модулей::

    auth=compose
    modules=key_mod,bearer_mod

Или ``active_auth_module`` = ``id1,id2`` (CSV, без новых SoT-полей).

Form (AUTH-14) — Selenium + full locators (не id-only как PT)::

    auth=form
    login_url=https://app/login
    login=u
    #password=p
    user_locator=css input[name=email]
    pass_locator=id password
    submit_locator=css button[type=submit]
    # form_locator=css form#login
    # success_url=... / success_string=...
    # live: PK_AUTH_FORM_BROWSER=1

Action / MFA (factor-2 after password, ZAP-style TOTP field)::

    auth=action
    login_url=https://app/login
    login=u
    #password=p
    user_locator=css #email
    pass_locator=id password
    submit_locator=css button[type=submit]
    mfa=totp
    #totp_secret=BASE32SECRET
    totp_period=30
    totp_digits=6
    otp_locator=css input[name=otp]
    otp_submit_locator=css button.continue
    success_string=Logout
    # mfa=sms + otp_code=… — код с оператора / vault

Chain (AUTH-10a) — HTTP call chain, не browser action-chain::

    auth=chain
    login=user
    POST https://idp/token
      Header Content-Type = application/json
      Body {"user":"$login"}
      Capture $.access_token as token

Не dual-write в security_configuration.auth_details.
"""
from __future__ import annotations

from utils.env_dual import pk_env

import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from core.errors import WiredError

logger = logging.getLogger("auth_module")

AUTH_MODULE_TYPE = "Авторизация"

_PROP_LINE = re.compile(r"^(#?)([A-Za-z_][A-Za-z0-9_.]*)=(.*)$")
_BARE_HASH_COMMENT = re.compile(r"^\s*#(?:\s.*)?$")
_STEP_HEAD = re.compile(
    r"^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s*$",
    re.IGNORECASE,
)
_HEADER_LINE = re.compile(
    r"^Header\s+([^=:\s]+)\s*[=:]\s*(.*)$",
    re.IGNORECASE,
)
_BODY_LINE = re.compile(r"^Body\s+(.*)$", re.IGNORECASE)
_CAPTURE_LINE = re.compile(
    r"^Capture\s+(\S+)\s+[Aa][Ss]\s+([A-Za-z_][A-Za-z0-9_]*)\s*$",
)
_VAR_REF = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*)")

_KIND_ALIASES = {
    "bearer": "bearer",
    "token": "bearer",
    "basic": "basic",
    "cookie": "cookie",
    "header": "header",
    "api_cookie": "header",
    "apikey": "apikey",
    "api_key": "apikey",
    "api-key": "apikey",
    "querykey": "querykey",
    "query_key": "querykey",
    "query-key": "querykey",
    "compose": "compose",
    "form": "form",
    "htmlform": "form",
    "html_form": "form",
    "action": "action",
    "sso": "action",
    "chain": "chain",
    "none": "none",
    "": "none",
}

_KIND_TO_AUTH_TYPE = {
    "bearer": "Bearer Token",
    "basic": "Базовая авторизация",
    "cookie": "На основе Cookie",
    "header": "API Cookie",
    "apikey": "API Key",
    "querykey": "Query Key",
    "compose": "Без авторизации",
    "form": "Страница авторизации",
    "action": "Последовательность действий / SSO",
    "chain": "Последовательность вызовов / SSO",
    "none": "Без авторизации",
}

_STATIC_KINDS = frozenset(
    {"bearer", "basic", "cookie", "header", "apikey", "querykey"}
)

_HTTP_METHODS = frozenset(
    {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
)


@dataclass
class AuthCallStep:
    method: str
    url: str
    headers: Dict[str, str] = field(default_factory=dict)
    body: str = ""
    capture: str = ""
    bind_as: str = ""
    line: int = 1


@dataclass
class AuthProfile:
    kind: str = "none"
    values: Dict[str, str] = field(default_factory=dict)
    secret_keys: List[str] = field(default_factory=list)
    module_id: str = ""
    steps: List[AuthCallStep] = field(default_factory=list)

    def bootstrap_auth_type(self) -> str:
        return _KIND_TO_AUTH_TYPE.get(self.kind, "Без авторизации")

    def bootstrap_auth_details(self) -> Dict[str, Any]:
        builder = _BOOTSTRAP_DETAILS.get(self.kind)
        return builder(self) if builder else {}

    def _merge_success_fields(self, details: Dict[str, Any]) -> None:
        for src, dst_ru, dst_en in (
            ("success_url", "Адрес страницы при успешном входе", "success_url"),
            ("success_string", "Проверочная строка", "success_string"),
        ):
            val = (self.values.get(src) or "").strip()
            if val:
                details[dst_ru] = val
                details[dst_en] = val

    def dry_run_public(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "kind": self.kind,
            "auth_type": self.bootstrap_auth_type(),
            "module_id": self.module_id,
            "headers": sorted(set(_dry_run_header_names(self))),
            "secret_keys": list(self.secret_keys),
            "value_keys": sorted(k for k in self.values if k not in self.secret_keys),
            "captures": [
                {"path": s.capture, "as": s.bind_as, "method": s.method}
                for s in self.steps
                if s.capture and s.bind_as
            ],
            "steps": len(self.steps),
        }
        if self.kind == "compose":
            out["modules"] = split_auth_module_ids(
                self.values.get("modules") or self.values.get("module") or ""
            )
        return out


def _v(profile: AuthProfile, *keys: str) -> str:
    for key in keys:
        val = profile.values.get(key)
        if val:
            return val
    return ""


def _details_bearer(profile: AuthProfile) -> Dict[str, Any]:
    return {"Токен": profile.values.get("token", "")}


def _details_basic(profile: AuthProfile) -> Dict[str, Any]:
    return {
        "Логин": _v(profile, "login", "username"),
        "Пароль": profile.values.get("password", ""),
    }


def _details_cookie(profile: AuthProfile) -> Dict[str, Any]:
    return {"Cookie": profile.values.get("cookie", "")}


def _details_header(profile: AuthProfile) -> Dict[str, Any]:
    return {
        "Заголовок": profile.values.get("header", ""),
        "Токен": _v(profile, "value", "token"),
    }


def _details_apikey(profile: AuthProfile) -> Dict[str, Any]:
    details: Dict[str, Any] = {
        "Заголовок": _v(profile, "name", "header"),
        "Токен": _v(profile, "value", "token"),
    }
    place = (profile.values.get("place") or "").strip()
    if place:
        details["Место"] = place
        details["place"] = place
    profile._merge_success_fields(details)
    return details


def _details_querykey(profile: AuthProfile) -> Dict[str, Any]:
    details: Dict[str, Any] = {
        "Query-параметр": _v(profile, "name", "query", "param"),
        "Токен": _v(profile, "value", "token"),
    }
    profile._merge_success_fields(details)
    return details


def _form_locator_bundle(profile: AuthProfile, *, with_form: bool, with_otp: bool) -> Dict[str, str]:
    nested: Dict[str, str] = {
        "Локатор поля логина": _v(profile, "user_locator", "login_locator"),
        "Локатор поля пароля": _v(profile, "pass_locator", "password_locator"),
        "Локатор кнопки отправки формы": _v(profile, "submit_locator", "submit"),
    }
    if with_form:
        nested["Локатор формы авторизации"] = _v(profile, "form_locator", "form")
    if with_otp:
        nested["Локатор OTP"] = _v(profile, "otp_locator", "totp_locator")
        nested["Локатор подтверждения OTP"] = _v(
            profile, "otp_submit_locator", "otp_submit"
        )
    return nested


def _details_action(profile: AuthProfile) -> Dict[str, Any]:
    details: Dict[str, Any] = {
        "URL входа": _v(profile, "login_url", "url"),
        "Логин": _v(profile, "login", "username"),
        "Пароль": profile.values.get("password", ""),
        "MFA": (profile.values.get("mfa") or "totp").strip(),
        "Дополнительные настройки формы": _form_locator_bundle(
            profile, with_form=False, with_otp=True
        ),
    }
    if profile.values.get("totp_secret"):
        details["TOTP secret"] = profile.values.get("totp_secret", "")
    if profile.values.get("otp_code"):
        details["OTP"] = profile.values.get("otp_code", "")
    profile._merge_success_fields(details)
    return details


def _details_form(profile: AuthProfile) -> Dict[str, Any]:
    details: Dict[str, Any] = {
        "URL входа": _v(profile, "login_url", "url"),
        "Логин": _v(profile, "login", "username"),
        "Пароль": profile.values.get("password", ""),
        "Дополнительные настройки формы": _form_locator_bundle(
            profile, with_form=True, with_otp=False
        ),
    }
    profile._merge_success_fields(details)
    return details


def _details_compose(profile: AuthProfile) -> Dict[str, Any]:
    return {"modules": _v(profile, "modules", "module")}


def _details_chain(profile: AuthProfile) -> Dict[str, Any]:
    # Legacy-совместимый снимок для ZAP helper / отладки — не SoT.
    return {
        "Последовательность вызовов": [
            {
                "Запрос": step.url,
                "Метод": step.method,
                "Заголовки запроса": dict(step.headers),
                "Тело запроса": step.body,
                "Получить динамический параметр": step.capture,
                "Присвоенный идентификатор": step.bind_as,
            }
            for step in profile.steps
        ]
    }


_BOOTSTRAP_DETAILS = {
    "bearer": _details_bearer,
    "basic": _details_basic,
    "cookie": _details_cookie,
    "header": _details_header,
    "apikey": _details_apikey,
    "querykey": _details_querykey,
    "action": _details_action,
    "form": _details_form,
    "compose": _details_compose,
    "chain": _details_chain,
}


def _dry_run_header_names(profile: AuthProfile) -> List[str]:
    kind = profile.kind
    if kind in ("bearer", "basic"):
        return ["Authorization"]
    if kind == "header" and profile.values.get("header"):
        return [profile.values["header"]]
    if kind == "cookie":
        return ["Cookie"]
    if kind == "apikey":
        place = (profile.values.get("place") or "header").strip().lower()
        name = profile.values.get("name") or profile.values.get("header") or ""
        if place in ("", "header", "hdr") and name:
            return [name]
        if place == "cookie":
            return ["Cookie"]
        return []
    if kind == "chain":
        names: List[str] = []
        for step in profile.steps:
            names.extend(step.headers.keys())
        return names
    return []


def looks_like_auth_module(text: str) -> bool:
    """Полотно auth dialect — не язык Пусть / MethodId."""
    raw = (text or "").strip()
    if not raw:
        return True
    from core.language_parse import is_language_script

    # auth=chain/compose/form/action — не language script.
    if re.search(
        r"(?im)^\s*auth\s*=\s*(chain|compose|form|action|sso|htmlform)\s*$",
        raw,
    ):
        return True
    if is_language_script(raw):
        return False
    has_auth = False
    prop_n = 0
    for line in raw.splitlines():
        st = line.strip()
        if not st or _BARE_HASH_COMMENT.match(st):
            continue
        if _STEP_HEAD.match(st):
            return True
        eq = st.find("=")
        if eq <= 0:
            return False
        left = st[:eq].rstrip().lstrip("#").strip().lower()
        if left == "auth":
            has_auth = True
        prop_n += 1
    return has_auth or prop_n >= 1


def parse_auth_module(text: str, *, module_id: str = "") -> AuthProfile:
    """Parse properties + optional HTTP chain → AuthProfile."""
    values: Dict[str, str] = {}
    secret_keys: List[str] = []
    kind_raw = ""
    steps: List[AuthCallStep] = []
    current: Optional[AuthCallStep] = None

    for line_no, line in enumerate((text or "").splitlines(), start=1):
        raw = line.rstrip("\n")
        st = raw.strip()
        if not st:
            continue
        if _BARE_HASH_COMMENT.match(st) and "=" not in st.lstrip("#"):
            continue

        head = _STEP_HEAD.match(st)
        if head:
            if current is not None:
                steps.append(current)
            current = AuthCallStep(
                method=head.group(1).upper(),
                url=head.group(2).strip(),
                line=line_no,
            )
            continue

        if current is not None and (raw.startswith((" ", "\t")) or st.lower().startswith(
            ("header ", "body ", "capture ")
        )):
            _parse_step_continuation(current, st, line_no)
            continue

        if current is not None:
            steps.append(current)
            current = None

        secret = False
        body = st
        if st.startswith("#"):
            rest = st[1:].lstrip()
            if "=" not in rest:
                continue
            secret = True
            body = rest
        eq = body.find("=")
        if eq <= 0:
            raise WiredError(
                f"auth модуль, строка {line_no}: ожидали key=value или METHOD URL, "
                f"получено {st!r}"
            )
        left, right = body[:eq].rstrip(), body[eq + 1 :].lstrip()
        key = left.strip()
        if not re.match(r"^[A-Za-z_][A-Za-z0-9_.]*$", key):
            raise WiredError(
                f"auth модуль, строка {line_no}: неверный ключ {key!r}"
            )
        val = _decode_prop_value(right)
        key_l = key.lower()
        if key_l == "auth":
            kind_raw = val.strip().lower()
            continue
        values[key_l] = val
        if secret:
            secret_keys.append(key_l)

    if current is not None:
        steps.append(current)

    kind = _KIND_ALIASES.get(kind_raw, None)
    if kind is None and kind_raw:
        raise WiredError(
            f"auth модуль: неизвестный auth={kind_raw!r} "
            f"(bearer|basic|cookie|header|apikey|querykey|compose|"
            f"form|action|chain|none)"
        )
    if kind is None:
        kind = _infer_kind_from_values(values, has_steps=bool(steps))
    if steps and kind in ("compose", "form", "action"):
        raise WiredError(
            f"auth={kind}: HTTP METHOD-шаги запрещены "
            "(call-chain → auth=chain)"
        )
    if steps and kind not in ("chain", "none"):
        # Явный static + шаги — цепь побеждает.
        kind = "chain"
    return AuthProfile(
        kind=kind,
        values=values,
        secret_keys=secret_keys,
        module_id=(module_id or "").strip(),
        steps=steps,
    )


def _infer_kind_from_values(values: Dict[str, str], *, has_steps: bool) -> str:
    if has_steps:
        return "chain"
    if not values:
        return "none"
    if "token" in values and "header" not in values and "name" not in values:
        return "bearer"
    if "login" in values or "username" in values:
        return "basic"
    if "cookie" in values:
        return "cookie"
    if "header" in values:
        return "header"
    if "name" in values and (
        (values.get("place") or "").strip().lower() == "query" or "query" in values
    ):
        return "querykey"
    if "name" in values:
        return "apikey"
    return "none"


def _parse_step_continuation(step: AuthCallStep, st: str, line_no: int) -> None:
    hm = _HEADER_LINE.match(st)
    if hm:
        name = hm.group(1).strip()
        if not name:
            raise WiredError(f"auth модуль, строка {line_no}: пустой Header")
        step.headers[name] = hm.group(2).strip()
        return
    bm = _BODY_LINE.match(st)
    if bm:
        step.body = bm.group(1).strip()
        return
    cm = _CAPTURE_LINE.match(st)
    if cm:
        step.capture = cm.group(1).strip()
        step.bind_as = cm.group(2).strip()
        return
    raise WiredError(
        f"auth модуль, строка {line_no}: в шаге ожидали Header/Body/Capture, "
        f"получено {st!r}"
    )


def _decode_prop_value(raw: str) -> str:
    v = (raw or "").strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def validate_auth_module(text: str, *, module_id: str = "") -> List[Dict[str, Any]]:
    try:
        profile = parse_auth_module(text, module_id=module_id)
    except WiredError as exc:
        return [
            {
                "severity": "error",
                "message": str(exc),
                "start": 0,
                "end": max(1, len(text or "")),
                "line": 1,
                "column": 1,
            }
        ]
    if profile.kind == "none":
        return []
    validator = _KIND_VALIDATORS.get(profile.kind)
    return validator(text, profile) if validator else []


def _require_login_password(
    text: str, profile: AuthProfile, *, kind: str
) -> List[Dict[str, Any]]:
    diags: List[Dict[str, Any]] = []
    login = _v(profile, "login", "username")
    if not login.strip():
        diags.append(_err(text, f"auth={kind}: нужен login=..."))
    if not (profile.values.get("password") or "").strip():
        diags.append(_err(text, f"auth={kind}: нужен password=..."))
    return diags


def _validate_locator_pair(
    text: str,
    profile: AuthProfile,
    *,
    kind: str,
    key: str,
    alt: str,
    label: str,
    hint: str = "",
) -> Optional[Dict[str, Any]]:
    raw = (profile.values.get(key) or profile.values.get(alt) or "").strip()
    if not raw:
        msg = f"auth={kind}: нужен {label}=«тип значение»"
        if hint:
            msg = f"{msg} {hint}"
        return _err(text, msg)
    try:
        parse_auth_locator(raw)
    except WiredError as exc:
        return _err(text, f"auth={kind} {key}: {exc}")
    return None


def _validate_bearer(text: str, profile: AuthProfile) -> List[Dict[str, Any]]:
    if not (profile.values.get("token") or "").strip():
        return [_err(text, "auth=bearer: нужен token=...")]
    return []


def _validate_basic(text: str, profile: AuthProfile) -> List[Dict[str, Any]]:
    return _require_login_password(text, profile, kind="basic")


def _validate_cookie(text: str, profile: AuthProfile) -> List[Dict[str, Any]]:
    if not (profile.values.get("cookie") or "").strip():
        return [_err(text, "auth=cookie: нужен cookie=...")]
    return []


def _validate_header(text: str, profile: AuthProfile) -> List[Dict[str, Any]]:
    diags: List[Dict[str, Any]] = []
    if not (profile.values.get("header") or "").strip():
        diags.append(_err(text, "auth=header: нужен header=..."))
    if not _v(profile, "value", "token").strip():
        diags.append(_err(text, "auth=header: нужен value=... или token=..."))
    return diags


def _validate_apikey(text: str, profile: AuthProfile) -> List[Dict[str, Any]]:
    diags: List[Dict[str, Any]] = []
    if not _v(profile, "name", "header").strip():
        diags.append(_err(text, "auth=apikey: нужен name=... (или header=...)"))
    if not _v(profile, "value", "token").strip():
        diags.append(_err(text, "auth=apikey: нужен value=... или token=..."))
    place = (profile.values.get("place") or "header").strip().lower()
    if place not in ("", "header", "hdr", "query", "param", "cookie"):
        diags.append(_err(text, "auth=apikey: place=header|query|cookie"))
    return diags


def _validate_querykey(text: str, profile: AuthProfile) -> List[Dict[str, Any]]:
    diags: List[Dict[str, Any]] = []
    if not _v(profile, "name", "query", "param").strip():
        diags.append(_err(text, "auth=querykey: нужен name=..."))
    if not _v(profile, "value", "token").strip():
        diags.append(_err(text, "auth=querykey: нужен value=... или token=..."))
    return diags


def _validate_compose(text: str, profile: AuthProfile) -> List[Dict[str, Any]]:
    mods = split_auth_module_ids(_v(profile, "modules", "module"))
    if not mods:
        return [_err(text, "auth=compose: нужен modules=id1,id2")]
    return []


def _validate_form_locators(text: str, profile: AuthProfile) -> List[Dict[str, Any]]:
    diags: List[Dict[str, Any]] = []
    hint = "(id|name|css|xpath — не сырой id как у PT)"
    for key, alt, label in (
        ("user_locator", "login_locator", "user_locator (или login_locator)"),
        ("pass_locator", "password_locator", "pass_locator (или password_locator)"),
        ("submit_locator", "submit", "submit_locator (или submit)"),
    ):
        err = _validate_locator_pair(
            text, profile, kind="form", key=key, alt=alt, label=label, hint=hint
        )
        if err:
            diags.append(err)
    form_raw = _v(profile, "form_locator", "form").strip()
    if form_raw:
        try:
            parse_auth_locator(form_raw)
        except WiredError as exc:
            diags.append(_err(text, f"auth=form form_locator: {exc}"))
    return diags


def _validate_form(text: str, profile: AuthProfile) -> List[Dict[str, Any]]:
    diags: List[Dict[str, Any]] = []
    if not _v(profile, "login_url", "url").strip():
        diags.append(_err(text, "auth=form: нужен login_url=..."))
    diags.extend(_require_login_password(text, profile, kind="form"))
    diags.extend(_validate_form_locators(text, profile))
    return diags


def _validate_action_otp(text: str, profile: AuthProfile, mfa: str) -> List[Dict[str, Any]]:
    diags: List[Dict[str, Any]] = []
    if mfa not in ("totp", "sms", ""):
        return diags
    otp_raw = _v(profile, "otp_locator", "totp_locator").strip()
    split_n = 0
    for i in range(1, 9):
        cell = (
            profile.values.get(f"otp_locator_{i}")
            or profile.values.get(f"otp_digit_{i}")
            or ""
        ).strip()
        if not cell:
            break
        split_n += 1
        try:
            parse_auth_locator(cell)
        except WiredError as exc:
            diags.append(_err(text, f"auth=action otp_locator_{i}: {exc}"))
    if not otp_raw and split_n == 0:
        diags.append(
            _err(text, "auth=action: нужен otp_locator=… или otp_locator_1..=…")
        )
    elif otp_raw:
        try:
            parse_auth_locator(otp_raw)
        except WiredError as exc:
            diags.append(_err(text, f"auth=action otp_locator: {exc}"))
    if mfa == "totp" and not (
        profile.values.get("totp_secret") or profile.values.get("otp_code") or ""
    ).strip():
        diags.append(
            _err(text, "auth=action mfa=totp: нужен totp_secret=… или otp_code=…")
        )
    if mfa == "sms" and not (profile.values.get("otp_code") or "").strip():
        diags.append(_err(text, "auth=action mfa=sms: нужен otp_code=…"))
    return diags


def _validate_action(text: str, profile: AuthProfile) -> List[Dict[str, Any]]:
    diags: List[Dict[str, Any]] = []
    if not _v(profile, "login_url", "url").strip():
        diags.append(_err(text, "auth=action: нужен login_url=..."))
    diags.extend(_require_login_password(text, profile, kind="action"))
    for key, alt, label in (
        ("user_locator", "login_locator", "user_locator"),
        ("pass_locator", "password_locator", "pass_locator"),
        ("submit_locator", "submit", "submit_locator"),
    ):
        err = _validate_locator_pair(
            text, profile, kind="action", key=key, alt=alt, label=label
        )
        if err:
            diags.append(err)
    mfa = (profile.values.get("mfa") or "totp").strip().lower()
    if mfa not in ("totp", "sms", "none", ""):
        diags.append(_err(text, "auth=action: mfa=totp|sms|none"))
    diags.extend(_validate_action_otp(text, profile, mfa))
    return diags


def _validate_chain(text: str, profile: AuthProfile) -> List[Dict[str, Any]]:
    diags: List[Dict[str, Any]] = []
    if not profile.steps:
        diags.append(_err(text, "auth=chain: нужен хотя бы один шаг METHOD URL"))
    for step in profile.steps:
        if step.method not in _HTTP_METHODS:
            diags.append(
                _err(text, f"шаг L{step.line}: неверный метод {step.method!r}")
            )
        if not step.url.strip():
            diags.append(_err(text, f"шаг L{step.line}: пустой URL"))
        if not step.capture.strip() or not step.bind_as.strip():
            diags.append(
                _err(text, f"шаг L{step.line}: нужен Capture <path> as <id>")
            )
    return diags


_KIND_VALIDATORS = {
    "bearer": _validate_bearer,
    "basic": _validate_basic,
    "cookie": _validate_cookie,
    "header": _validate_header,
    "apikey": _validate_apikey,
    "querykey": _validate_querykey,
    "compose": _validate_compose,
    "form": _validate_form,
    "action": _validate_action,
    "chain": _validate_chain,
}


def dry_run_auth_module(text: str, *, module_id: str = "") -> Dict[str, Any]:
    diags = validate_auth_module(text, module_id=module_id)
    try:
        profile = parse_auth_module(text, module_id=module_id)
    except WiredError:
        return {"ok": False, "diagnostics": diags, "profile": None}
    return {
        "ok": len(diags) == 0,
        "diagnostics": diags,
        "profile": profile.dry_run_public(),
    }


def auth_module_text_from_record(module: Any) -> str:
    fields = getattr(module, "auth_fields", None)
    if fields is None and isinstance(module, dict):
        fields = module.get("auth_fields")
    if fields is None:
        return ""
    ctor = getattr(fields, "constructor", None)
    if ctor is None and isinstance(fields, dict):
        ctor = fields.get("constructor")
    return str(ctor or "")


def find_auth_module(wired: Any, module_id: str) -> Any:
    mid = (module_id or "").strip()
    if not mid:
        return None
    suites = getattr(wired, "test_suites", None)
    if suites is None:
        return None
    for mod in getattr(suites, "test_data_constructor", None) or []:
        if getattr(mod, "module_type", None) != AUTH_MODULE_TYPE:
            continue
        if (getattr(mod, "id", None) or "").strip() == mid:
            return mod
    return None


def load_auth_profile_from_wired(
    wired: Any, module_id: str
) -> Tuple[Optional[AuthProfile], List[str]]:
    notes: List[str] = []
    mid = (module_id or "").strip()
    if not mid:
        notes.append("module_id пуст")
        return None, notes
    mod = find_auth_module(wired, mid)
    if mod is None:
        notes.append(f"auth-модуль {mid!r} не найден")
        return None, notes
    text = auth_module_text_from_record(mod)
    try:
        return parse_auth_module(text, module_id=mid), notes
    except WiredError as exc:
        notes.append(str(exc))
        return None, notes


def split_auth_module_ids(raw: str) -> List[str]:
    """CSV / `;` list of auth module ids (active_auth_module or modules=)."""
    text = (raw or "").strip()
    if not text:
        return []
    parts: List[str] = []
    for chunk in re.split(r"[,;]+", text):
        mid = chunk.strip()
        if mid:
            parts.append(mid)
    return parts


# BOT-A1: защита от A↔B recurse / глубокой вложенности compose.
_COMPOSE_MAX_DEPTH = 8


def _append_resolved_auth_profile(
    wired: Any,
    mid: str,
    *,
    seen: Set[str],
    depth: int,
    out: List[AuthProfile],
    notes: List[str],
    self_id: str = "",
) -> None:
    if self_id and mid == self_id:
        notes.append(f"compose: пропуск self-ref {mid!r}")
        return
    if mid in seen:
        notes.append(f"compose: cycle skip {mid!r}")
        return
    profile, mod_notes = load_auth_profile_from_wired(wired, mid)
    notes.extend(mod_notes)
    if profile is None:
        return
    if profile.kind == "compose":
        nested, nested_notes = expand_compose_profile(
            wired, profile, visited=seen, depth=depth + 1
        )
        notes.extend(nested_notes)
        out.extend(nested)
        return
    out.append(profile)


def expand_compose_profile(
    wired: Any,
    compose: AuthProfile,
    *,
    visited: Optional[Set[str]] = None,
    depth: int = 0,
) -> Tuple[List[AuthProfile], List[str]]:
    notes: List[str] = []
    if depth > _COMPOSE_MAX_DEPTH:
        notes.append(f"compose: depth cap {_COMPOSE_MAX_DEPTH}")
        return [], notes
    seen: Set[str] = set(visited or ())
    cid = (compose.module_id or "").strip()
    if cid:
        if cid in seen:
            notes.append(f"compose: cycle skip {cid!r}")
            return [], notes
        seen = set(seen)
        seen.add(cid)
    ids = split_auth_module_ids(_v(compose, "modules", "module"))
    if not ids:
        notes.append("auth=compose: пустой modules=")
        return [], notes
    out: List[AuthProfile] = []
    for mid in ids:
        _append_resolved_auth_profile(
            wired,
            mid,
            seen=seen,
            depth=depth,
            out=out,
            notes=notes,
            self_id=cid,
        )
    return out, notes


def resolve_active_auth_profiles(
    wired: Any, active_raw: str
) -> Tuple[List[AuthProfile], List[str]]:
    """Resolve active_auth_module (one id, CSV, or compose leaf) → profiles in order."""
    notes: List[str] = []
    ids = split_auth_module_ids(active_raw)
    if not ids:
        notes.append("active_auth_module пуст")
        return [], notes
    if len(ids) == 1:
        profile, mod_notes = load_auth_profile_from_wired(wired, ids[0])
        notes.extend(mod_notes)
        if profile is None:
            return [], notes
        if profile.kind == "compose":
            return expand_compose_profile(wired, profile)
        return [profile], notes
    out: List[AuthProfile] = []
    for mid in ids:
        _append_resolved_auth_profile(
            wired, mid, seen=set(), depth=0, out=out, notes=notes
        )
    return out, notes


def _legacy_locator(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    try:
        parse_auth_locator(s)
        return s
    except WiredError:
        # SoT historically без типа — id-fallback (PT parity), dialect лучше явный.
        return f"id {s}"


def _nested_form_settings(details: Dict[str, Any]) -> Dict[str, Any]:
    nested = details.get("Дополнительные настройки формы") or {}
    return nested if isinstance(nested, dict) else {}


def profile_from_page_auth_details(
    auth_details: Optional[Dict[str, Any]],
    *,
    module_id: str = "",
) -> Optional[AuthProfile]:
    """Legacy ``Страница авторизации`` auth_details → AuthProfile(form).

    Locators in SoT are bare strings — if without strategy prefix, treat as ``id``
    (PT-compat) but dialect validate still demands explicit type.
    """
    details = dict(auth_details or {})
    nested = _nested_form_settings(details)
    user = _legacy_locator(
        str(nested.get("Локатор поля логина") or details.get("user_locator") or "")
    )
    password_loc = _legacy_locator(
        str(nested.get("Локатор поля пароля") or details.get("pass_locator") or "")
    )
    submit = _legacy_locator(
        str(
            nested.get("Локатор кнопки отправки формы")
            or details.get("submit_locator")
            or ""
        )
    )
    form_l = _legacy_locator(
        str(nested.get("Локатор формы авторизации") or details.get("form_locator") or "")
    )
    login_url = str(
        details.get("URL входа")
        or details.get("login_url")
        or details.get("loginPageUrl")
        or ""
    ).strip()
    if not (login_url and user and password_loc and submit):
        return None
    values = {
        "login_url": login_url,
        "login": str(details.get("Логин") or details.get("login") or ""),
        "password": str(details.get("Пароль") or details.get("password") or ""),
        "user_locator": user,
        "pass_locator": password_loc,
        "submit_locator": submit,
    }
    if form_l:
        values["form_locator"] = form_l
    suc = str(
        details.get("Адрес страницы при успешном входе")
        or details.get("success_url")
        or ""
    ).strip()
    if suc:
        values["success_url"] = suc
    sstr = str(
        details.get("Проверочная строка") or details.get("success_string") or ""
    ).strip()
    if sstr:
        values["success_string"] = sstr
    return AuthProfile(kind="form", values=values, module_id=module_id or "")


def parse_auth_locator(raw: str) -> Tuple[str, str]:
    """PrettyK-style ``css #x`` / ``id user`` / ``xpath //…`` — не голый id как PT."""
    from core.errors import WiredError
    from core.expr import ExprError, parse_locator_text

    try:
        loc = parse_locator_text(raw)
    except ExprError as exc:
        raise WiredError(str(exc)) from exc
    by = (loc.by or "").strip().lower()
    allowed = ("id", "name", "css", "xpath", "link_text", "partial_link_text", "tag")
    if by not in allowed:
        raise WiredError(
            f"локатор: тип {by!r} не поддержан ({'|'.join(allowed)})"
        )
    if not (loc.value or "").strip():
        raise WiredError("локатор: пустое значение")
    return by, loc.value.strip()


def _auth_form_browser_enabled() -> bool:
    raw = (pk_env("AUTH_FORM_BROWSER") or "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _parse_login_locators(
    profile: AuthProfile,
) -> Tuple[Tuple[str, str], Tuple[str, str], Tuple[str, str]]:
    user_loc = parse_auth_locator(_v(profile, "user_locator", "login_locator"))
    pass_loc = parse_auth_locator(_v(profile, "pass_locator", "password_locator"))
    submit_loc = parse_auth_locator(_v(profile, "submit_locator", "submit"))
    return user_loc, pass_loc, submit_loc


def _wait_page_load(wd: Any, timeout: int = 15) -> None:
    if hasattr(wd, "wait_for_page_load"):
        try:
            wd.wait_for_page_load(timeout=timeout)
        except Exception:  # noqa: BLE001
            pass


def _success_gates_from_profile(profile: AuthProfile) -> Tuple[Dict[str, Any], str, str]:
    details = profile.bootstrap_auth_details()
    success_url = (
        profile.values.get("success_url")
        or details.get("Адрес страницы при успешном входе")
        or ""
    ).strip()
    success_string = (
        profile.values.get("success_string")
        or details.get("Проверочная строка")
        or ""
    ).strip()
    return details, success_url, success_string


def _apply_browser_success_check(
    result: Dict[str, Any],
    *,
    webdriver_adapter: Any,
    http_adapter: Any,
    details: Dict[str, Any],
    success_url: str,
    success_string: str,
    missing_note: str,
) -> bool:
    """Return True when success gate passes (or no gate). Mutates result on fail."""
    from core.auth_bootstrap import verify_auth_success

    if success_string and not success_url:
        body = _webdriver_page_text(webdriver_adapter)
        if success_string not in body:
            result["notes"].append(missing_note)
            result["error"] = "success check failed"
            return False
        result["notes"].append("success check ok (page text)")
        return True
    if http_adapter is not None and (success_url or success_string):
        gate = verify_auth_success(http_adapter, details)
        result["notes"].extend(gate.get("notes") or [])
        if not gate.get("ok", True):
            result["error"] = "success check failed"
            return False
    return True


def apply_auth_form(
    profile: AuthProfile,
    webdriver_adapter: Any,
    http_adapter: Any = None,
    zap_adapter: Any = None,
) -> Dict[str, Any]:
    """AUTH-14: Selenium form login — full locator strategies; cookies → Http/ZAP.

    Live только при ``PK_AUTH_FORM_BROWSER=1``.
    """
    result: Dict[str, Any] = {
        "applied": False,
        "auth_type": profile.bootstrap_auth_type(),
        "notes": [],
        "module_id": profile.module_id,
        "kind": "form",
        "attempted": False,
    }
    if profile.kind != "form":
        result["notes"].append(f"apply_auth_form: kind={profile.kind!r} не form")
        return result

    login_url = _v(profile, "login_url", "url").strip()
    login = _v(profile, "login", "username").strip()
    password = (profile.values.get("password") or "").strip()
    try:
        user_loc, pass_loc, submit_loc = _parse_login_locators(profile)
        form_raw = _v(profile, "form_locator", "form").strip()
        form_loc: Optional[Tuple[str, str]] = (
            parse_auth_locator(form_raw) if form_raw else None
        )
    except WiredError as exc:
        result["notes"].append(str(exc))
        result["error"] = str(exc)
        return result

    result["notes"].append(
        f"form locators: user={user_loc[0]} pass={pass_loc[0]} "
        f"submit={submit_loc[0]}"
        + (f" form={form_loc[0]}" if form_loc else "")
    )

    if webdriver_adapter is None:
        result["notes"].append("нет webdriver adapter — form not applied")
        return result
    if not _auth_form_browser_enabled():
        result["notes"].append(
            "form profile ready; set PK_AUTH_FORM_BROWSER=1 for browser"
        )
        return result

    result["attempted"] = True
    try:
        _open_auth_login_url(webdriver_adapter, login_url, result["notes"])
        _soft_dismiss_auth_overlays(webdriver_adapter, result["notes"])
        if form_loc is not None:
            webdriver_adapter._find_element(form_loc[0], form_loc[1])
            result["notes"].append(f"form root ok ({form_loc[0]})")
        webdriver_adapter.send_keys(user_loc[0], user_loc[1], login, clear_first=True)
        webdriver_adapter.send_keys(pass_loc[0], pass_loc[1], password, clear_first=True)
        webdriver_adapter.click(submit_loc[0], submit_loc[1])
        _wait_page_load(webdriver_adapter)
        result["notes"].append("Selenium: fill+submit ok")
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)
        result["notes"].append(f"Selenium form failed: {exc}")
        logger.info("Auth form failed: %s", exc)
        return result

    harvest = _harvest_browser_session(
        webdriver_adapter, http_adapter, zap_adapter, result["notes"]
    )
    result["cookies_http"] = harvest.get("http", 0)
    result["cookies_zap"] = harvest.get("zap", 0)

    details, success_url, success_string = _success_gates_from_profile(profile)
    if not _apply_browser_success_check(
        result,
        webdriver_adapter=webdriver_adapter,
        http_adapter=http_adapter,
        details=details,
        success_url=success_url,
        success_string=success_string,
        missing_note="success check: проверочная строка не найдена на странице",
    ):
        return result

    result["applied"] = True
    return result


def _open_auth_login_url(wd: Any, url: str, notes: List[str]) -> None:
    """Open absolute login URL; allowlist miss → driver.get (operator-trusted auth)."""
    from core.errors import WiredError

    if hasattr(wd, "open_by_url"):
        try:
            wd.open_by_url(url)
            notes.append(f"open_by_url: {url}")
            return
        except WiredError as exc:
            notes.append(f"open_by_url skip ({exc}); fallback driver.get")
        except Exception as exc:  # noqa: BLE001
            notes.append(f"open_by_url error ({exc}); fallback driver.get")
    driver = getattr(wd, "driver", None)
    if driver is None and hasattr(wd, "_ensure_driver"):
        wd._ensure_driver()
        driver = getattr(wd, "driver", None)
    if driver is None:
        raise WiredError("webdriver: нет driver для login_url")
    driver.get(url)
    notes.append(f"driver.get: {url}")


def _soft_dismiss_auth_overlays(wd: Any, notes: List[str]) -> None:
    """Best-effort close welcome/cookie overlays that block login fields (Juice lab)."""
    if not hasattr(wd, "click"):
        return
    selectors = (
        ("css", "button[aria-label='Close Welcome Banner']"),
        ("css", ".cc-dismiss"),
        ("css", "button.cc-dismiss"),
    )
    for strategy, value in selectors:
        try:
            wd.click(strategy, value, timeout=2)
            notes.append(f"overlay dismiss: {strategy} {value}")
        except Exception:  # noqa: BLE001 — optional chrome
            continue


def _browser_cookie_list(wd: Any) -> List[Dict[str, Any]]:
    driver = getattr(wd, "driver", None)
    if driver is None or not hasattr(driver, "get_cookies"):
        return []
    try:
        raw = driver.get_cookies() or []
    except Exception:  # noqa: BLE001
        return []
    out: List[Dict[str, Any]] = []
    for cookie in raw:
        if not isinstance(cookie, dict):
            continue
        name = str(cookie.get("name") or "").strip()
        if not name:
            continue
        out.append(cookie)
    return out


def _harvest_cookies_to_http(wd: Any, http_adapter: Any) -> int:
    if http_adapter is None or not hasattr(http_adapter, "set_auth_cookie"):
        return 0
    n = 0
    for cookie in _browser_cookie_list(wd):
        name = str(cookie.get("name") or "").strip()
        value = str(cookie.get("value") or "")
        domain = cookie.get("domain")
        try:
            if domain:
                http_adapter.set_auth_cookie(name, value, domain=domain)
            else:
                http_adapter.set_auth_cookie(name, value)
            n += 1
        except Exception:  # noqa: BLE001
            continue
    return n


def _harvest_cookies_to_zap(wd: Any, zap_adapter: Any) -> int:
    """Один Replacer REQ_HEADER Cookie=… для spider/scan той же сессии."""
    if zap_adapter is None or not hasattr(zap_adapter, "add_replacer_rule"):
        return 0
    parts: List[str] = []
    for cookie in _browser_cookie_list(wd):
        name = str(cookie.get("name") or "").strip()
        if not name:
            continue
        value = str(cookie.get("value") or "")
        parts.append(f"{name}={value}")
    if not parts:
        return 0
    header = "; ".join(parts)
    try:
        zap_adapter.add_replacer_rule(
            "pk-auth-browser-cookie",
            "REQ_HEADER",
            "Cookie",
            header,
            False,
        )
    except Exception as exc:  # noqa: BLE001
        logger.info("ZAP cookie replacer skip: %s", exc)
        return 0
    return len(parts)


def _harvest_browser_session(
    wd: Any,
    http_adapter: Any,
    zap_adapter: Any = None,
    notes: Optional[List[str]] = None,
) -> Dict[str, int]:
    http_n = _harvest_cookies_to_http(wd, http_adapter)
    zap_n = _harvest_cookies_to_zap(wd, zap_adapter)
    bag = notes if notes is not None else []
    bag.append(f"cookies→Http: {http_n}")
    if zap_adapter is not None:
        bag.append(f"cookies→ZAP Replacer: {zap_n}")
    return {"http": http_n, "zap": zap_n}


def _webdriver_page_text(wd: Any) -> str:
    driver = getattr(wd, "driver", None)
    if driver is None:
        return ""
    try:
        src = getattr(driver, "page_source", None) or ""
        return str(src)
    except Exception:  # noqa: BLE001
        return ""


def collect_otp_digit_locators(values: Dict[str, str]) -> List[Tuple[str, str]]:
    """otp_locator_1…otp_locator_8 — по одному символу кода (боль ZAP multi-field)."""
    out: List[Tuple[str, str]] = []
    for i in range(1, 9):
        raw = (
            (values.get(f"otp_locator_{i}") or values.get(f"otp_digit_{i}") or "")
        ).strip()
        if not raw:
            break
        out.append(parse_auth_locator(raw))
    return out


def _fill_otp_fields(
    wd: Any,
    otp_code: str,
    *,
    otp_loc: Optional[Tuple[str, str]],
    otp_split: Sequence[Tuple[str, str]],
    otp_submit: Optional[Tuple[str, str]],
    notes: List[str],
) -> None:
    code = (otp_code or "").strip()
    if otp_split:
        if len(code) < len(otp_split):
            raise WiredError(
                f"OTP code length {len(code)} < split fields {len(otp_split)}"
            )
        for idx, (st, sv) in enumerate(otp_split):
            wd.send_keys(st, sv, code[idx], clear_first=True)
        notes.append(f"MFA OTP split into {len(otp_split)} fields")
    elif otp_loc is not None:
        wd.send_keys(otp_loc[0], otp_loc[1], code, clear_first=True)
    else:
        raise WiredError("нет otp_locator / otp_locator_N")
    if otp_submit is not None:
        wd.click(otp_submit[0], otp_submit[1])
    elif otp_loc is not None and not otp_split:
        try:
            wd.send_keys(otp_loc[0], otp_loc[1], "\n", clear_first=False)
        except Exception:  # noqa: BLE001
            pass


def _sso_login_url(details: Dict[str, Any], base: Dict[str, Any]) -> str:
    return str(
        details.get("Провайдер авторизации (IdP URL)")
        or details.get("URL входа")
        or base.get("URL входа")
        or details.get("login_url")
        or ""
    ).strip()


def _sso_values_from_details(
    details: Dict[str, Any],
    base: Dict[str, Any],
    nested: Dict[str, Any],
    *,
    login_url: str,
    user: str,
    password_loc: str,
    submit: str,
    otp: str,
) -> Dict[str, str]:
    values: Dict[str, str] = {
        "login_url": login_url,
        "login": str(base.get("Логин") or details.get("Логин") or ""),
        "password": str(base.get("Пароль") or details.get("Пароль") or ""),
        "user_locator": user,
        "pass_locator": password_loc,
        "submit_locator": submit,
        "mfa": str(details.get("MFA") or details.get("mfa") or "none").strip().lower()
        or "none",
    }
    if otp:
        values["otp_locator"] = otp
        if values["mfa"] == "none":
            values["mfa"] = "totp"
    secret = str(details.get("TOTP secret") or details.get("totp_secret") or "").strip()
    if secret:
        values["totp_secret"] = secret
        values["mfa"] = "totp"
    otp_code = str(details.get("OTP") or details.get("otp_code") or "").strip()
    if otp_code:
        values["otp_code"] = otp_code
    sstr = str(
        base.get("Проверочная строка") or details.get("Проверочная строка") or ""
    ).strip()
    if sstr:
        values["success_string"] = sstr
    return values


def profile_from_sso_auth_details(
    auth_details: Optional[Dict[str, Any]],
    *,
    module_id: str = "",
) -> Optional[AuthProfile]:
    """Legacy ``Последовательность действий / SSO`` page-mode → AuthProfile(action)."""
    details = dict(auth_details or {})
    page = details.get("Страница авторизации")
    base = dict(page) if isinstance(page, dict) else details
    nested = _nested_form_settings(base)

    login_url = _sso_login_url(details, base)
    user = _legacy_locator(str(nested.get("Локатор поля логина") or ""))
    password_loc = _legacy_locator(str(nested.get("Локатор поля пароля") or ""))
    submit = _legacy_locator(str(nested.get("Локатор кнопки отправки формы") or ""))
    otp = _legacy_locator(
        str(nested.get("Локатор OTP") or details.get("otp_locator") or "")
    )
    if not (login_url and user and password_loc and submit):
        return None
    values = _sso_values_from_details(
        details,
        base,
        nested,
        login_url=login_url,
        user=user,
        password_loc=password_loc,
        submit=submit,
        otp=otp,
    )
    if values["mfa"] in ("totp", "sms") and not values.get("otp_locator"):
        return None
    return AuthProfile(kind="action", values=values, module_id=module_id or "")


def generate_totp_code(
    secret: str,
    *,
    period: int = 30,
    digits: int = 6,
    for_time: Optional[float] = None,
) -> str:
    """RFC 6238 TOTP (SHA-1) — как ZAP TOTP_FIELD / authenticator apps."""
    import base64
    import hashlib
    import hmac
    import struct
    import time

    raw = (secret or "").strip().replace(" ", "").upper()
    if not raw:
        raise WiredError("totp_secret пуст")
    pad = "=" * ((8 - len(raw) % 8) % 8)
    try:
        key = base64.b32decode(raw + pad, casefold=True)
    except Exception as exc:  # noqa: BLE001
        raise WiredError(f"totp_secret: неверный base32 ({exc})") from exc
    per = int(period) if period else 30
    dig = int(digits) if digits else 6
    if dig < 6 or dig > 8:
        dig = 6
    counter = int((for_time if for_time is not None else time.time()) // per)
    msg = struct.pack(">Q", counter)
    # RFC 6238 default HMAC-SHA-1 (interop with Google Authenticator / ZAP TOTP_FIELD).
    digest = hmac.new(key, msg, hashlib.sha1).digest()  # NOSONAR python:S4790
    offset = digest[-1] & 0x0F
    code_int = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    code_int %= 10**dig
    return f"{code_int:0{dig}d}"


def _parse_action_otp_locators(
    profile: AuthProfile, mfa: str
) -> Tuple[Optional[Tuple[str, str]], Optional[Tuple[str, str]], List[Tuple[str, str]]]:
    otp_loc = None
    otp_submit = None
    otp_split: List[Tuple[str, str]] = []
    if mfa not in ("totp", "sms"):
        return otp_loc, otp_submit, otp_split
    otp_split = collect_otp_digit_locators(profile.values)
    otp_single = _v(profile, "otp_locator", "totp_locator").strip()
    if otp_single:
        otp_loc = parse_auth_locator(otp_single)
    elif not otp_split:
        raise WiredError("нужен otp_locator или otp_locator_1…")
    otp_sub_raw = _v(profile, "otp_submit_locator", "otp_submit").strip()
    if otp_sub_raw:
        otp_submit = parse_auth_locator(otp_sub_raw)
    return otp_loc, otp_submit, otp_split


def _resolve_action_otp_code(
    profile: AuthProfile,
    mfa: str,
    otp_split: List[Tuple[str, str]],
    notes: List[str],
) -> str:
    otp_code = (profile.values.get("otp_code") or "").strip()
    if mfa == "totp" and not otp_code:
        try:
            period = int(profile.values.get("totp_period") or "30")
        except ValueError:
            period = 30
        try:
            digits = int(profile.values.get("totp_digits") or "6")
        except ValueError:
            digits = 6
        if otp_split:
            digits = max(digits, len(otp_split))
        otp_code = generate_totp_code(
            profile.values.get("totp_secret") or "",
            period=period,
            digits=digits,
        )
        notes.append(f"MFA TOTP code generated (digits={digits})")
    elif mfa == "sms":
        notes.append("MFA SMS: using provided otp_code")
    elif mfa == "none":
        notes.append("MFA none — password factor only")
    return otp_code


def apply_auth_action(
    profile: AuthProfile,
    webdriver_adapter: Any,
    http_adapter: Any = None,
    zap_adapter: Any = None,
) -> Dict[str, Any]:
    """Password factor + MFA (TOTP/SMS code) in browser — cookies → Http/ZAP."""
    result: Dict[str, Any] = {
        "applied": False,
        "auth_type": profile.bootstrap_auth_type(),
        "notes": [],
        "module_id": profile.module_id,
        "kind": "action",
        "attempted": False,
        "mfa": (profile.values.get("mfa") or "totp").strip().lower() or "totp",
    }
    if profile.kind != "action":
        result["notes"].append(f"apply_auth_action: kind={profile.kind!r}")
        return result

    mfa = result["mfa"]
    login_url = _v(profile, "login_url", "url").strip()
    login = _v(profile, "login", "username").strip()
    password = (profile.values.get("password") or "").strip()

    try:
        user_loc, pass_loc, submit_loc = _parse_login_locators(profile)
        otp_loc, otp_submit, otp_split = _parse_action_otp_locators(profile, mfa)
        otp_code = _resolve_action_otp_code(profile, mfa, otp_split, result["notes"])
    except WiredError as exc:
        result["notes"].append(str(exc))
        result["error"] = str(exc)
        return result

    if webdriver_adapter is None:
        result["notes"].append(
            f"MFA profile ready (mfa={mfa}, login_url={login_url})"
        )
        return result
    if not _auth_form_browser_enabled():
        result["notes"].append(
            f"MFA profile ready (mfa={mfa}); set PK_AUTH_FORM_BROWSER=1 for browser"
        )
        return result

    result["attempted"] = True
    try:
        _open_auth_login_url(webdriver_adapter, login_url, result["notes"])
        webdriver_adapter.send_keys(user_loc[0], user_loc[1], login, clear_first=True)
        webdriver_adapter.send_keys(pass_loc[0], pass_loc[1], password, clear_first=True)
        webdriver_adapter.click(submit_loc[0], submit_loc[1])
        _wait_page_load(webdriver_adapter)
        result["notes"].append("factor-1 password submitted")

        if mfa in ("totp", "sms"):
            _fill_otp_fields(
                webdriver_adapter,
                otp_code,
                otp_loc=otp_loc,
                otp_split=otp_split,
                otp_submit=otp_submit,
                notes=result["notes"],
            )
            _wait_page_load(webdriver_adapter)
            result["notes"].append(f"factor-2 {mfa} submitted")
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)
        result["notes"].append(f"MFA browser failed: {exc}")
        logger.info("Auth action/MFA failed: %s", exc)
        return result

    harvest = _harvest_browser_session(
        webdriver_adapter, http_adapter, zap_adapter, result["notes"]
    )
    result["cookies_http"] = harvest.get("http", 0)
    result["cookies_zap"] = harvest.get("zap", 0)

    details, success_url, success_string = _success_gates_from_profile(profile)
    if not _apply_browser_success_check(
        result,
        webdriver_adapter=webdriver_adapter,
        http_adapter=http_adapter,
        details=details,
        success_url=success_url,
        success_string=success_string,
        missing_note="success check: строка не найдена",
    ):
        return result

    result["applied"] = True
    return result


def _copy_apply_result(one: Dict[str, Any], per: Dict[str, Any]) -> None:
    per["applied"] = bool(one.get("applied"))
    per["notes"] = list(one.get("notes") or [])
    if one.get("error"):
        per["error"] = one["error"]


def _apply_one_compose_profile(
    profile: AuthProfile,
    *,
    http_adapter: Any,
    zap_adapter: Any,
    webdriver_adapter: Any,
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    """Returns (per-result, optional success-details for later gate)."""
    from core.auth_bootstrap import apply_auth_bootstrap

    per: Dict[str, Any] = {
        "auth_type": profile.bootstrap_auth_type(),
        "kind": profile.kind,
        "module_id": profile.module_id,
        "applied": False,
        "notes": [],
    }
    success_details: Optional[Dict[str, Any]] = None
    if profile.kind == "chain":
        _copy_apply_result(apply_auth_chain(profile, http_adapter), per)
    elif profile.kind == "form":
        _copy_apply_result(
            apply_auth_form(profile, webdriver_adapter, http_adapter, zap_adapter),
            per,
        )
    elif profile.kind == "action":
        _copy_apply_result(
            apply_auth_action(profile, webdriver_adapter, http_adapter, zap_adapter),
            per,
        )
    elif profile.kind in _STATIC_KINDS:
        details = profile.bootstrap_auth_details()
        one = apply_auth_bootstrap(
            auth_type=profile.bootstrap_auth_type(),
            auth_details=details,
            http_adapter=http_adapter,
            run_success_check=False,
        )
        _copy_apply_result(one, per)
        if any(
            details.get(k)
            for k in (
                "Адрес страницы при успешном входе",
                "success_url",
                "Проверочная строка",
                "success_string",
            )
        ):
            success_details = details
    else:
        per["notes"].append(f"auth={profile.kind}: не в compose apply — skip")
    return per, success_details


def _compose_gate_details(
    profiles: Sequence[AuthProfile],
    last_success_details: Dict[str, Any],
) -> Dict[str, Any]:
    if last_success_details:
        return last_success_details
    for profile in reversed(list(profiles)):
        if profile.kind in _STATIC_KINDS:
            return profile.bootstrap_auth_details()
    return {}


def apply_auth_profiles(
    profiles: Sequence[AuthProfile],
    http_adapter: Any,
    zap_adapter: Any = None,
    webdriver_adapter: Any = None,
) -> Dict[str, Any]:
    """Compose: static + call-chain + form + MFA action; one success gate."""
    from core.auth_bootstrap import verify_auth_success

    result: Dict[str, Any] = {
        "applied": False,
        "auth_type": "compose",
        "notes": [],
        "profiles": [],
        "kind": "compose",
    }
    if not profiles:
        result["notes"].append("compose: пустой список профилей")
        return result

    last_success_details: Dict[str, Any] = {}
    any_applied = False
    for profile in profiles:
        per, success_details = _apply_one_compose_profile(
            profile,
            http_adapter=http_adapter,
            zap_adapter=zap_adapter,
            webdriver_adapter=webdriver_adapter,
        )
        if success_details is not None:
            last_success_details = success_details
        result["notes"].extend(per["notes"])
        result["profiles"].append(per)
        if per["applied"]:
            any_applied = True

    if not any_applied:
        if any(p.kind in ("form", "action") for p in profiles):
            result["notes"].append(
                "compose: browser auth profile not applied "
                "(PK_AUTH_FORM_BROWSER=1 + webdriver)"
            )
        else:
            result["notes"].append(
                "compose: ни один static/call/form-профиль не применён"
            )
        return result

    gate_details = _compose_gate_details(profiles, last_success_details)
    if gate_details:
        gate = verify_auth_success(http_adapter, gate_details)
        result["notes"].extend(gate.get("notes") or [])
        if not gate.get("ok", True):
            result["applied"] = False
            result["error"] = "success check failed"
            return result
    result["applied"] = True
    return result


def _chain_http_call(
    http_adapter: Any,
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]],
    data: Any,
    json_data: Any,
) -> Dict[str, Any]:
    hdrs = headers or None
    if method == "GET":
        return http_adapter.get(url, headers=hdrs)
    if method == "POST":
        return http_adapter.post(url, data=data, json_data=json_data, headers=hdrs)
    if method == "PUT":
        return http_adapter.put(url, data=data, json_data=json_data, headers=hdrs)
    if method == "PATCH":
        return http_adapter.patch(url, data=data, json_data=json_data, headers=hdrs)
    if method == "DELETE":
        return http_adapter.delete(url, headers=hdrs)
    if method == "HEAD":
        return http_adapter.head(url, headers=hdrs)
    if method == "OPTIONS":
        return http_adapter.options(url, headers=hdrs)
    raise WiredError(f"метод {method} не поддержан")


def _run_auth_chain_steps(
    profile: AuthProfile, http_adapter: Any, notes: List[str]
) -> Optional[Dict[str, str]]:
    env: Dict[str, str] = dict(profile.values)
    for idx, step in enumerate(profile.steps, start=1):
        url = _subst(step.url, env)
        headers = {k: _subst(v, env) for k, v in step.headers.items()}
        body_raw = _subst(step.body, env) if step.body else ""
        json_data = None
        data = None
        if body_raw:
            try:
                json_data = json.loads(body_raw)
            except json.JSONDecodeError:
                data = body_raw
        method = step.method.upper()
        try:
            resp = _chain_http_call(
                http_adapter,
                method,
                url,
                headers=headers,
                data=data,
                json_data=json_data,
            )
        except WiredError:
            notes.append(f"шаг {idx}: метод {method} не поддержан")
            return None
        status = int(resp.get("status") or 0)
        if status >= 400:
            notes.append(f"шаг {idx} {method} {url}: HTTP {status}")
            return None
        captured = _extract_capture(resp, step.capture)
        if captured is None:
            notes.append(f"шаг {idx}: Capture {step.capture!r} не найден в ответе")
            return None
        env[step.bind_as] = str(captured)
        notes.append(f"шаг {idx}: capture → ${step.bind_as}")
    return env


def apply_auth_chain(profile: AuthProfile, http_adapter: Any) -> Dict[str, Any]:
    """
    Выполнить HTTP-цепь; при bind `token` — set_auth_bearer.
    Honest: ошибки → applied=false + notes.
    """
    result: Dict[str, Any] = {
        "applied": False,
        "auth_type": profile.bootstrap_auth_type(),
        "notes": [],
        "module_id": profile.module_id,
        "kind": "chain",
    }
    if not profile.steps:
        result["notes"].append("auth=chain: нет шагов")
        return result
    for step in profile.steps:
        if not step.capture or not step.bind_as:
            result["notes"].append(
                f"шаг {step.method} {step.url}: нет Capture … as …"
            )
            return result

    try:
        env = _run_auth_chain_steps(profile, http_adapter, result["notes"])
    except Exception as exc:  # noqa: BLE001 — bootstrap не рвёт прогон
        result["notes"].append(f"auth chain failed: {exc}")
        logger.info("Auth chain failed: %s", exc)
        return result
    if env is None:
        return result

    token = (env.get("token") or "").strip()
    if token:
        http_adapter.set_auth_bearer(token)
        result["applied"] = True
        result["notes"].append("HttpAdapter: Bearer из chain bind token")
        return result
    result["notes"].append(
        "цепь ок, но нет bind `token` — Bearer не выставлен (задайте Capture … as token)"
    )
    return result


def _subst(template: str, env: Dict[str, str]) -> str:
    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        return env.get(key, match.group(0))

    return _VAR_REF.sub(repl, template or "")


def _extract_header_capture(resp: Dict[str, Any], path: str) -> Optional[Any]:
    headers = resp.get("headers") or {}
    want = path.split(":", 1)[1].strip().lower()
    for key, value in headers.items():
        if str(key).lower() == want:
            return value
    return None


def _extract_json_capture(resp: Dict[str, Any], path: str) -> Optional[Any]:
    p = path
    if p.startswith("$."):
        p = p[2:]
    elif p.startswith("$"):
        p = p[1:]
    data = resp.get("json")
    if data is None:
        return None
    cur: Any = data
    for part in p.split("."):
        if not part:
            continue
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def _extract_capture(resp: Dict[str, Any], path: str) -> Optional[Any]:
    """Поддержка $.a.b / a.b / header:Name."""
    p = (path or "").strip()
    if not p:
        return None
    if p.lower().startswith("header:"):
        return _extract_header_capture(resp, p)
    return _extract_json_capture(resp, p)


def _err(text: str, message: str) -> Dict[str, Any]:
    return {
        "severity": "error",
        "message": message,
        "start": 0,
        "end": max(1, len(text or "")),
        "line": 1,
        "column": 1,
    }
