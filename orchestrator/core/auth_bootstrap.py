# -*- coding: utf-8 -*-
"""
Auth bootstrap из security_configuration.

Http (по умолчанию, PK_AUTH_BOOTSTRAP): Basic / Bearer / Cookie / API Key /
Query Key → HttpAdapter.
ZAP (явный шаг ПрименитьAuth или PK_ZAP_AUTH_BOOTSTRAP=1): context / Replacer /
Authentication Helper — см. apply_zap_auth.

AUTH-12: success check (URL/string) после apply; compose list для multi-auth later.
"""
from __future__ import annotations
from utils.env_dual import pk_env

import logging
import os
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

logger = logging.getLogger("auth_bootstrap")

_BASIC = "Базовая авторизация"
_BEARER = "Bearer Token"
_API_COOKIE = "API Cookie"
_API_KEY = "API Key"
_QUERY_KEY = "Query Key"
_WEB_COOKIE = "На основе Cookie"
_SSO = "Последовательность действий / SSO"
_FORM = "На основе формы"
_NONE = "Без авторизации"
# Call chain (HTTP) vs action chain (browser) — taxonomy; browser stub not in Http set.
_CALL_CHAIN = "Последовательность вызовов / SSO"

SUPPORTED_HTTP = frozenset(
    {_BASIC, _BEARER, _API_COOKIE, _API_KEY, _QUERY_KEY, _WEB_COOKIE}
)
SUPPORTED_ZAP_HEADER = frozenset(
    {_BASIC, _BEARER, _API_COOKIE, _API_KEY, _QUERY_KEY, _WEB_COOKIE}
)
SUPPORTED_ZAP_BROWSER = frozenset({_SSO, _FORM, "Form-based", "form"})

AuthProfileSpec = Tuple[Optional[str], Optional[Dict[str, Any]]]


def _env_enabled() -> bool:
    raw = (pk_env("AUTH_BOOTSTRAP") or "1").strip().lower()
    return raw not in ("0", "false", "off", "no")


def zap_auth_env_enabled() -> bool:
    raw = (pk_env("ZAP_AUTH_BOOTSTRAP") or "0").strip().lower()
    return raw in ("1", "true", "on", "yes")


def _detail(details: Dict[str, Any], *keys: str) -> str:
    for key in keys:
        val = details.get(key)
        if val is not None and str(val).strip() != "":
            return str(val).strip()
    return ""


def _normalize_place(raw: str, *, default: str = "header") -> str:
    p = (raw or default).strip().lower()
    aliases = {
        "header": "header",
        "hdr": "header",
        "cookie": "cookie",
        "query": "query",
        "param": "query",
        "querystring": "query",
    }
    return aliases.get(p, default if p not in aliases else p)


def verify_auth_success(
    http_adapter: Any,
    details: Dict[str, Any],
) -> Dict[str, Any]:
    """PT-style SUCCESS_URL / SUCCESS_STRING after credentials applied.

    Without success URL — skip (noop ok). With URL: GET must succeed; if
    check string set, body/text must contain it. Fail → applied gate false.
    """
    out: Dict[str, Any] = {"ok": True, "notes": [], "skipped": False}
    success_url = _detail(
        details,
        "Адрес страницы при успешном входе",
        "success_url",
        "SUCCESS_URL",
    )
    check_string = _detail(
        details,
        "Проверочная строка",
        "success_string",
        "SUCCESS_STRING",
        "REGEXP_OF_SUCCESS",
    )
    if not success_url:
        out["skipped"] = True
        return out
    if http_adapter is None or not hasattr(http_adapter, "get"):
        out["ok"] = False
        out["notes"].append("success check: нет HttpAdapter.get")
        return out
    try:
        resp = http_adapter.get(success_url)
    except Exception as exc:
        out["ok"] = False
        out["notes"].append(f"success check GET failed: {exc}")
        return out
    status = 0
    body = ""
    if isinstance(resp, dict):
        try:
            status = int(resp.get("status_code") or resp.get("status") or 0)
        except (TypeError, ValueError):
            status = 0
        body = str(resp.get("text") or resp.get("body") or resp.get("content") or "")
    else:
        body = str(resp or "")
    if status and status >= 400:
        out["ok"] = False
        out["notes"].append(f"success check: HTTP {status} for {success_url}")
        return out
    if check_string and check_string not in body:
        out["ok"] = False
        out["notes"].append(
            "success check: проверочная строка не найдена в ответе"
        )
        return out
    out["notes"].append(f"success check ok: {success_url}")
    return out


def _http_basic(details: Dict[str, Any], http_adapter: Any) -> List[str]:
    login = _detail(details, "Логин", "login", "username")
    password = _detail(details, "Пароль", "password")
    if not login:
        raise ValueError("Базовая авторизация: пустой Логин")
    http_adapter.set_auth_basic(login, password)
    return ["HttpAdapter: Basic"]


def _http_bearer(details: Dict[str, Any], http_adapter: Any) -> List[str]:
    token = _detail(details, "Токен", "token", "bearer")
    if not token:
        raise ValueError("Bearer Token: пустой Токен")
    http_adapter.set_auth_bearer(token)
    return ["HttpAdapter: Bearer"]


def _http_api_cookie(details: Dict[str, Any], http_adapter: Any) -> List[str]:
    header = _detail(details, "Заголовок", "header")
    token = _detail(details, "Токен", "token", "value")
    if not header or not token:
        raise ValueError("API Cookie: нужны Заголовок и Токен")
    http_adapter.set_default_header(header, token)
    return [f"HttpAdapter: header {header}"]


def _http_api_key(details: Dict[str, Any], http_adapter: Any) -> List[str]:
    place = _normalize_place(
        _detail(details, "Место", "place", "PLACE"), default="header"
    )
    name = _detail(details, "Заголовок", "header", "name", "NAME")
    token = _detail(details, "Токен", "token", "value", "VALUE")
    if place == "query":
        name = name or _detail(details, "Query-параметр", "query", "param")
    if not name or not token:
        raise ValueError("API Key: нужны имя (Заголовок/Query) и Токен")
    http_adapter.set_auth_api_key(name, token, location=place)
    return [f"HttpAdapter: API Key {place}={name}"]


def _http_query_key(details: Dict[str, Any], http_adapter: Any) -> List[str]:
    name = _detail(details, "Query-параметр", "query", "param", "name", "NAME")
    token = _detail(details, "Токен", "token", "value", "VALUE")
    if not name or not token:
        raise ValueError("Query Key: нужны Query-параметр и Токен")
    http_adapter.set_auth_api_key(name, token, location="query")
    return [f"HttpAdapter: Query Key {name}"]


def _http_web_cookie(details: Dict[str, Any], http_adapter: Any) -> List[str]:
    cookie_raw = _detail(details, "Cookie", "cookie")
    if not cookie_raw:
        raise ValueError("На основе Cookie: пустое поле Cookie")
    _apply_cookie_string(http_adapter, cookie_raw)
    return [
        "HttpAdapter: Cookie",
        "Browser cookie не выставляем без Открыть на домен — "
        "используйте Сессия УстановитьCookie после навигации",
    ]


def _apply_http_auth_kind(kind: str, details: Dict[str, Any], http_adapter: Any) -> List[str]:
    handlers = {
        _BASIC: _http_basic,
        _BEARER: _http_bearer,
        _API_COOKIE: _http_api_cookie,
        _API_KEY: _http_api_key,
        _QUERY_KEY: _http_query_key,
        _WEB_COOKIE: _http_web_cookie,
    }
    handler = handlers.get(kind)
    if handler is None:
        raise ValueError(f"unsupported http auth kind: {kind}")
    return handler(details, http_adapter)


def apply_auth_bootstrap(
    *,
    auth_type: Optional[str],
    auth_details: Optional[Dict[str, Any]],
    http_adapter: Any,
    zap_adapter: Any = None,
    run_success_check: bool = True,
) -> Dict[str, Any]:
    """
    Применить поддерживаемый auth_type к HttpAdapter.
    zap_adapter намеренно не используется здесь — ZAP только через apply_zap_auth /
    MethodId ПрименитьAuth (Honest Contract).
    """
    del zap_adapter
    result: Dict[str, Any] = {
        "applied": False,
        "auth_type": auth_type or "",
        "notes": [],
    }
    if not _env_enabled():
        result["notes"].append("PK_AUTH_BOOTSTRAP=0 — bootstrap пропущен")
        logger.info("Auth bootstrap disabled via PK_AUTH_BOOTSTRAP")
        return result

    kind = (auth_type or "").strip() or _NONE
    if kind == _NONE or kind == "":
        result["notes"].append("auth_type пуст / Без авторизации — ничего не делаем")
        return result

    if kind not in SUPPORTED_HTTP:
        result["notes"].append(
            f"auth_type={kind!r} не в Http-bootstrap "
            "(Basic/Bearer/Cookie/API Key/Query Key) — "
            "задайте auth шагами или ZAP ПрименитьAuth для browser/SSO; "
            "action-chain (browser MFA) — AUTH-13"
        )
        logger.info("Auth bootstrap skip unsupported type: %s", kind)
        return result

    details = dict(auth_details or {})
    try:
        result["notes"].extend(_apply_http_auth_kind(kind, details, http_adapter))
        result["applied"] = True
        if run_success_check:
            gate = verify_auth_success(http_adapter, details)
            result["notes"].extend(gate.get("notes") or [])
            if not gate.get("ok", True):
                result["applied"] = False
                result["error"] = "success check failed"
        logger.info(
            "Auth bootstrap applied=%s: %s (%s)",
            result["applied"],
            kind,
            "; ".join(result["notes"]),
        )
    except Exception as exc:
        result["error"] = str(exc)
        result["notes"].append(f"ошибка: {exc}")
        logger.warning("Auth bootstrap failed: %s", exc)

    return result


def _compose_skip_profile(kind: str) -> Optional[str]:
    if kind in (_CALL_CHAIN, _SSO) or "вызовов" in kind.lower():
        return (
            f"{kind!r}: call-chain — используйте auth=chain / apply_auth_chain, "
            "не static compose"
        )
    if kind not in SUPPORTED_HTTP:
        return (
            f"{kind!r}: не static Http — skip "
            "(form/action → ZAP ПрименитьAuth; MFA step-executor residual)"
        )
    return None


def _compose_apply_one(
    kind: str,
    details: Dict[str, Any],
    http_adapter: Any,
    zap_adapter: Any,
) -> Dict[str, Any]:
    per: Dict[str, Any] = {"auth_type": kind, "applied": False, "notes": []}
    skip = _compose_skip_profile(kind)
    if skip is not None:
        per["notes"].append(skip)
        return per
    one = apply_auth_bootstrap(
        auth_type=kind,
        auth_details=details,
        http_adapter=http_adapter,
        zap_adapter=zap_adapter,
        run_success_check=False,
    )
    per["applied"] = bool(one.get("applied"))
    per["notes"] = list(one.get("notes") or [])
    if one.get("error"):
        per["error"] = one["error"]
    return per


def apply_auth_profile_list(
    profiles: Sequence[AuthProfileSpec],
    http_adapter: Any,
    zap_adapter: Any = None,
) -> Dict[str, Any]:
    """Compose multi-auth: apply static profiles in order; one success check at end.

    Call-chain / action-chain kinds are skipped with honest notes (not fake applied).
    Success details taken from the last profile that defines success URL/string,
    else from the last profile overall.
    """
    result: Dict[str, Any] = {
        "applied": False,
        "auth_type": "compose",
        "notes": [],
        "profiles": [],
    }
    if not profiles:
        result["notes"].append("compose: пустой список профилей")
        return result

    last_success_details: Dict[str, Any] = {}
    any_static = False
    for auth_type, auth_details in profiles:
        kind = (auth_type or "").strip() or _NONE
        details = dict(auth_details or {})
        per = _compose_apply_one(kind, details, http_adapter, zap_adapter)
        result["notes"].extend(per["notes"])
        result["profiles"].append(per)
        if per["applied"]:
            any_static = True
        if _detail(
            details,
            "Адрес страницы при успешном входе",
            "success_url",
            "Проверочная строка",
            "success_string",
        ):
            last_success_details = details

    if not any_static:
        result["notes"].append("compose: ни один static-профиль не применён")
        return result

    gate_details = last_success_details or dict(profiles[-1][1] or {})
    gate = verify_auth_success(http_adapter, gate_details)
    result["notes"].extend(gate.get("notes") or [])
    if not gate.get("ok", True):
        result["applied"] = False
        result["error"] = "success check failed"
        return result
    result["applied"] = True
    return result


def apply_zap_auth(
    *,
    zap_adapter: Any,
    context_name: str,
    auth_type: Optional[str],
    auth_details: Optional[Dict[str, Any]] = None,
    base_url: str = "",
) -> Dict[str, Any]:
    """
    Настроить ZAP context / Replacer / Auth Helper под auth_type манифеста.
    Вызывается из ZapAdapter.apply_wired_auth (явный шаг).
    """
    result: Dict[str, Any] = {
        "applied": False,
        "auth_type": auth_type or "",
        "notes": [],
        "context_name": context_name,
    }
    kind = (auth_type or "").strip() or _NONE
    if kind == _NONE or kind == "":
        result["notes"].append("Без авторизации — ZAP auth noop")
        return result

    details = dict(auth_details or {})
    try:
        _apply_zap_auth_kind(kind, zap_adapter, context_name, details, base_url, result)
        if result["applied"]:
            logger.info(
                "ZAP auth applied: %s (%s)", kind, "; ".join(result["notes"])
            )
    except Exception as exc:
        result["error"] = str(exc)
        result["notes"].append(f"ошибка: {exc}")
        logger.warning("ZAP auth failed: %s", exc)

    return result


def _zap_mark(result: Dict[str, Any], note: str, *, applied: bool = True) -> None:
    result["notes"].append(note)
    result["applied"] = applied


def _zap_basic_kind(
    zap_adapter: Any,
    context_name: str,
    details: Dict[str, Any],
    base_url: str,
    result: Dict[str, Any],
) -> None:
    login = _detail(details, "Логин", "login", "username")
    password = _detail(details, "Пароль", "password")
    if not login:
        raise ValueError("Базовая авторизация: пустой Логин")
    _apply_zap_basic(zap_adapter, context_name, login, password, base_url, details)
    _zap_mark(result, "ZAP: httpAuthentication + Forced User (или Replacer Basic)")


def _zap_bearer_kind(
    zap_adapter: Any, details: Dict[str, Any], result: Dict[str, Any]
) -> None:
    token = _detail(details, "Токен", "token", "bearer")
    if not token:
        raise ValueError("Bearer Token: пустой Токен")
    zap_adapter.add_replacer_rule(
        "pk-auth-bearer", "REQ_HEADER", "Authorization", f"Bearer {token}", False
    )
    _zap_mark(result, "ZAP Replacer: Authorization Bearer")


def _zap_api_cookie_kind(
    zap_adapter: Any, details: Dict[str, Any], result: Dict[str, Any]
) -> None:
    header = _detail(details, "Заголовок", "header")
    token = _detail(details, "Токен", "token", "value")
    if not header or not token:
        raise ValueError("API Cookie: нужны Заголовок и Токен")
    zap_adapter.add_replacer_rule(
        f"pk-auth-header-{header}", "REQ_HEADER", header, token, False
    )
    _zap_mark(result, f"ZAP Replacer: header {header}")


def _zap_api_key_kind(
    zap_adapter: Any, details: Dict[str, Any], result: Dict[str, Any]
) -> None:
    place = _normalize_place(
        _detail(details, "Место", "place", "PLACE"), default="header"
    )
    name = _detail(details, "Заголовок", "header", "name", "NAME")
    token = _detail(details, "Токен", "token", "value", "VALUE")
    if place == "query":
        name = name or _detail(details, "Query-параметр", "query", "param")
    if not name or not token:
        raise ValueError("API Key: нужны имя и Токен")
    if place == "query":
        # Honest: ZAP query replacer not wired — Http bootstrap covers query.
        _zap_mark(
            result,
            f"ZAP: Query Key {name!r} — нет Replacer query; "
            "ключ на HttpAdapter (не врать ZAP applied)",
            applied=False,
        )
        return
    if place == "cookie":
        zap_adapter.add_replacer_rule(
            f"pk-auth-apikey-cookie-{name}",
            "REQ_HEADER",
            "Cookie",
            f"{name}={token}",
            False,
        )
        _zap_mark(result, f"ZAP Replacer: Cookie {name}=…")
        return
    zap_adapter.add_replacer_rule(
        f"pk-auth-apikey-{name}", "REQ_HEADER", name, token, False
    )
    _zap_mark(result, f"ZAP Replacer: API Key header {name}")


def _zap_query_key_kind(details: Dict[str, Any], result: Dict[str, Any]) -> None:
    name = _detail(details, "Query-параметр", "query", "param", "name", "NAME")
    token = _detail(details, "Токен", "token", "value", "VALUE")
    if not name or not token:
        raise ValueError("Query Key: нужны Query-параметр и Токен")
    _zap_mark(
        result,
        f"ZAP: Query Key {name!r} — нет Replacer query; "
        "ключ на HttpAdapter (не врать ZAP applied)",
        applied=False,
    )


def _zap_web_cookie_kind(
    zap_adapter: Any, details: Dict[str, Any], result: Dict[str, Any]
) -> None:
    cookie_raw = _detail(details, "Cookie", "cookie")
    if not cookie_raw:
        raise ValueError("На основе Cookie: пустое поле Cookie")
    zap_adapter.add_replacer_rule(
        "pk-auth-cookie", "REQ_HEADER", "Cookie", cookie_raw, False
    )
    _zap_mark(result, "ZAP Replacer: Cookie")


def _apply_zap_auth_kind(
    kind: str,
    zap_adapter: Any,
    context_name: str,
    details: Dict[str, Any],
    base_url: str,
    result: Dict[str, Any],
) -> None:
    if kind == _BASIC:
        _zap_basic_kind(zap_adapter, context_name, details, base_url, result)
        return
    if kind == _BEARER:
        _zap_bearer_kind(zap_adapter, details, result)
        return
    if kind == _API_COOKIE:
        _zap_api_cookie_kind(zap_adapter, details, result)
        return
    if kind == _API_KEY:
        _zap_api_key_kind(zap_adapter, details, result)
        return
    if kind == _QUERY_KEY:
        _zap_query_key_kind(details, result)
        return
    if kind == _WEB_COOKIE:
        _zap_web_cookie_kind(zap_adapter, details, result)
        return
    if kind in SUPPORTED_ZAP_BROWSER or "SSO" in kind or "форм" in kind.lower() or "Form" in kind:
        note = _apply_zap_browser_auth(zap_adapter, context_name, details, base_url)
        result["notes"].extend(note["notes"])
        result["applied"] = bool(note.get("applied"))
        if note.get("error"):
            result["error"] = note["error"]
        return
    result["notes"].append(
        f"auth_type={kind!r}: нет ZAP-ветки — настройте Auth шагами "
        "(AuthКонтекста / ForcedUser / Replacer)"
    )
    logger.info("ZAP auth skip unknown type: %s", kind)


def _apply_zap_basic(
    zap: Any,
    context_name: str,
    login: str,
    password: str,
    base_url: str,
    details: Dict[str, Any],
) -> None:
    host = _detail(details, "Хост", "hostname", "host")
    realm = _detail(details, "Realm", "realm") or ""
    port = _detail(details, "Порт", "port")
    if not host and base_url:
        parsed = urlparse(base_url)
        host = parsed.hostname or ""
        if not port and parsed.port:
            port = str(parsed.port)
        elif not port:
            port = "443" if parsed.scheme == "https" else "80"
    if not host:
        # Fallback: Replacer Basic без context httpAuthentication
        import base64

        token = base64.b64encode(f"{login}:{password}".encode("utf-8")).decode("ascii")
        zap.add_replacer_rule(
            "pk-auth-basic",
            "REQ_HEADER",
            "Authorization",
            f"Basic {token}",
            False,
        )
        return

    port = port or "80"
    try:
        zap.set_http_authentication(context_name, host, realm, port)
        user_id = zap.create_and_force_user(
            context_name, login, login=login, password=password
        )
        logger.info("ZAP Basic+ForcedUser user_id=%s", user_id)
    except Exception as exc:
        logger.warning("httpAuthentication failed (%s) — Replacer Basic", exc)
        import base64

        token = base64.b64encode(f"{login}:{password}".encode("utf-8")).decode("ascii")
        zap.add_replacer_rule(
            "pk-auth-basic",
            "REQ_HEADER",
            "Authorization",
            f"Basic {token}",
            False,
        )


def _apply_zap_browser_auth(
    zap: Any,
    context_name: str,
    details: Dict[str, Any],
    base_url: str,
) -> Dict[str, Any]:
    """Authentication Helper browser path + verification; иначе честный skip."""
    out: Dict[str, Any] = {"applied": False, "notes": []}
    login_url = _detail(
        details,
        "URL входа",
        "login_url",
        "loginPageUrl",
        "login_page_url",
    )
    if not login_url and base_url:
        login_url = base_url.rstrip("/") + "/login"
    if not login_url:
        out["notes"].append(
            "SSO/form: нет URL входа — только шагами сценария (Honest Contract)"
        )
        return out

    browser_id = _detail(details, "BrowserId", "browser_id", "browserId") or "firefox-headless"
    wait_s = _detail(details, "Ожидание", "login_page_wait", "loginPageWait") or "5"
    try:
        zap.set_browser_based_auth(
            context_name,
            login_url,
            browser_id=browser_id,
            login_page_wait=wait_s,
        )
        try:
            zap.set_auth_verification_autodetect(context_name)
            out["notes"].append("ZAP Auth Helper: verification=autodetect")
        except Exception as ver_exc:
            out["notes"].append(f"verification skip: {ver_exc}")
        try:
            zap.set_session_management_autodetect(context_name)
            out["notes"].append("ZAP sessionManagement=autodetect")
        except Exception as sess_exc:
            out["notes"].append(f"session autodetect skip: {sess_exc}")

        login = _detail(details, "Логин", "login", "username")
        password = _detail(details, "Пароль", "password")
        if login and password:
            try:
                zap.create_and_force_user(
                    context_name, login, login=login, password=password
                )
                out["notes"].append("Forced User после browser auth")
            except Exception as fu_exc:
                out["notes"].append(f"Forced User skip: {fu_exc}")

        out["applied"] = True
        out["notes"].append(f"ZAP Auth Helper browser: {login_url}")
    except Exception as exc:
        out["error"] = str(exc)
        out["notes"].append(
            f"Auth Helper недоступен ({exc}) — SSO/form только шагами сценария"
        )
        logger.warning("Browser auth helper failed: %s", exc)
    return out


def _apply_cookie_string(http_adapter: Any, cookie_raw: str) -> None:
    """'a=b; c=d' → session cookies (без domain — для http-клиента адаптера)."""
    parts = [p.strip() for p in cookie_raw.split(";") if p.strip()]
    if not parts:
        raise ValueError("Cookie пуст после разбора")
    for part in parts:
        if "=" not in part:
            raise ValueError(f"Некорректная пара cookie: {part!r}")
        name, value = part.split("=", 1)
        name, value = name.strip(), value.strip()
        if not name:
            raise ValueError(f"Пустое имя cookie в {part!r}")
        http_adapter.set_auth_cookie(name, value)
