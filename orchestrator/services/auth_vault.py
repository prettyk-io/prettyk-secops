# -*- coding: utf-8 -*-
"""AUTH-VAULT-CHAIN-INJECTOR: pre-flight auth, зашифрованный vault и динамическая
инъекция токенов.

Слой сервиса поверх ``core.auth_vault`` / ``core.auth_module`` / ``core.auth_bootstrap``.
Отвечает за enterprise-часть friend-request:

  1. **EncryptedVault** — AES-256-GCM шифрование секретов at-rest (ключ ``KDT_VAULT_KEY``
     или производный от ``KDT_MANIFEST_KEY``). Формат ``kdt:vault:v1:<b64 nonce>:<b64 ct>``.
  2. **mask_secret** — маскирование Bearer/JWT/password в логах и JSON-отчётах.
  3. **OAuth2 / OIDC** — Authorization Code + PKCE, Client Credentials, Password Grant.
  4. **extract_session_tokens** — JWT/Bearer/JSESSIONID из JSON/headers/cookies.
  5. **apply_to_zap_replacer** — правила ZAP Replacer REQ_HEADER для свежего токена.
  6. **AutoRefreshSession** — авто-продление: при 401/403 повторный pre-flight и retry.
  7. **Playwright headless** — browser auth с извлечением localStorage/cookies
     (опциональный import; без playwright в окружении — честный degrade).
  8. **mTLS** — загрузка PEM/PFX client certs для взаимной аутентификации.

Все сетевые операции — через инъектируемый ``http_fn`` (requests-совместимый), чтобы
тесты мокались без живого IdP. ZAP — через duck-typed adapter (``add_replacer_rule``).
"""
from __future__ import annotations
from utils.env_dual import pk_env

import base64
import hashlib
import json
import logging
import os
import re
import time
import urllib.parse
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

logger = logging.getLogger("orchestrator.auth_vault_service")

# ───────────────────────── constants ─────────────────────────

_VAULT_PREFIX = "kdt:vault:v1:"
_MASK = "***"
_JWT_RE = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")
_BEARER_RE = re.compile(r"(?i)(bearer\s+)([A-Za-z0-9._~+/=-]+)")
_SECRET_KEY_HINTS = (
    "password", "passwd", "pwd", "secret", "client_secret", "client_id",
    "token", "api_key", "apikey", "access_token", "refresh_token",
    "session", "cookie", "authorization", "private_key", "cert",
)


# ───────────────────────── encrypted vault ─────────────────────────


def _vault_key() -> bytes:
    """32-байтный AES-256 ключ: ``KDT_VAULT_KEY`` (hex/base64/raw) или SHA-256 от
    ``KDT_MANIFEST_KEY``. Без ключа — детерминированный dev-ключ (не для prod)."""
    raw = pk_env("VAULT_KEY") or pk_env("MANIFEST_KEY") or ""
    if raw:
        try:
            data = bytes.fromhex(raw)
            if len(data) == 32:
                return data
        except ValueError:
            pass
        if len(raw) == 32:
            return raw.encode("utf-8")
        return hashlib.sha256(raw.encode("utf-8")).digest()
    # Dev-only fallback: стабильный, но небезопасный ключ.
    return hashlib.sha256(b"kdt-dev-vault-key-do-not-use-in-prod").digest()


def encrypt_secret(plaintext: str) -> str:
    """AES-256-GCM → ``kdt:vault:v1:<nonce_b64>:<ct_b64>``."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _vault_key()
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    return (
        _VAULT_PREFIX
        + base64.b64encode(nonce).decode("ascii")
        + ":"
        + base64.b64encode(ct).decode("ascii")
    )


def decrypt_secret(ciphertext: str) -> str:
    """Обратная операция ``encrypt_secret``. Возвращает пустую строку на неверном формате."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    if not isinstance(ciphertext, str) or not ciphertext.startswith(_VAULT_PREFIX):
        return ""
    payload = ciphertext[len(_VAULT_PREFIX):]
    if ":" not in payload:
        return ""
    nonce_b64, ct_b64 = payload.split(":", 1)
    try:
        nonce = base64.b64decode(nonce_b64)
        ct = base64.b64decode(ct_b64)
        return AESGCM(_vault_key()).decrypt(nonce, ct, None).decode("utf-8")
    except Exception as exc:  # noqa: BLE001 — неверный ключ/данные
        logger.warning("decrypt_secret failed: %s", exc)
        return ""


def is_encrypted(value: Any) -> bool:
    return isinstance(value, str) and value.startswith(_VAULT_PREFIX)


class EncryptedVault:
    """Хранилище секретов с шифрованием at-rest (dict + прозрачный decrypt)."""

    def __init__(self, initial: Optional[Mapping[str, str]] = None) -> None:
        self._store: Dict[str, str] = {}
        for k, v in (initial or {}).items():
            self.put(k, v, encrypt=(not is_encrypted(v)))

    def put(self, key: str, value: str, *, encrypt: bool = True) -> None:
        self._store[key] = encrypt_secret(value) if encrypt and value else value

    def get(self, key: str, default: str = "") -> str:
        raw = self._store.get(key, default)
        return decrypt_secret(raw) if is_encrypted(raw) else raw

    def peek(self, key: str, default: str = "") -> str:
        """Зашифрованный вид (для безопасного дампа состояния)."""
        return self._store.get(key, default)

    def masked(self, key: str, default: str = "") -> str:
        return mask_secret(self.get(key, default))

    def keys(self) -> List[str]:
        return list(self._store.keys())

    def as_dict(self) -> Dict[str, str]:
        """Безопасный дамп: значения только зашифрованные."""
        return dict(self._store)


# ───────────────────────── masking ─────────────────────────


def mask_secret(value: Any) -> str:
    """Маскирует секрет для логов/отчётов. JWT → ``<head>.<sig***>``, Bearer → ``Bearer ***``."""
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    if not value:
        return ""
    # JWT: оставляем заголовок, скрываем payload и сигнатуру.
    if _JWT_RE.match(value):
        head, _, sig = value.split(".")
        return f"{head}.{_MASK}.{sig[:4]}{_MASK}"
    m = _BEARER_RE.search(value)
    if m:
        return value[: m.start()] + m.group(1) + _MASK + value[m.end():]
    # Длинные hex/base64 секреты.
    if len(value) > 16:
        return value[:4] + _MASK + value[-4:]
    return _MASK


def mask_headers(headers: Mapping[str, str]) -> Dict[str, str]:
    """Маскирует чувствительные заголовки (Authorization, Cookie, X-Api-Key)."""
    out: Dict[str, str] = {}
    for k, v in headers.items():
        lk = k.lower()
        if any(h in lk for h in ("authorization", "cookie", "api-key", "apikey", "token")):
            out[k] = mask_secret(v)
        else:
            out[k] = v
    return out


def mask_json(data: Any, *, secret_keys: Optional[Sequence[str]] = None) -> Any:
    """Рекурсивно маскирует значения по чувствительным ключам."""
    extra = {k.lower() for k in (secret_keys or ())}
    if isinstance(data, dict):
        out: Dict[str, Any] = {}
        for k, v in data.items():
            if isinstance(v, (dict, list)):
                out[k] = mask_json(v, secret_keys=secret_keys)
            elif str(k).lower() in extra or any(h in str(k).lower() for h in _SECRET_KEY_HINTS):
                out[k] = mask_secret(v)
            else:
                out[k] = v
        return out
    if isinstance(data, list):
        return [mask_json(x, secret_keys=secret_keys) for x in data]
    return data


# ───────────────────────── token extraction ─────────────────────────


def extract_session_tokens(
    *,
    body_json: Optional[Any] = None,
    headers: Optional[Mapping[str, str]] = None,
    body_raw: str = "",
) -> Dict[str, str]:
    """Извлекает токены из ответа IdP: JWT/Bearer из JSON, Authorization из headers,
    JSESSIONID/Set-Cookie из cookies. Возвращает карту ``{name: value}``."""
    out: Dict[str, str] = {}
    headers = headers or {}

    # JSON body
    if isinstance(body_json, dict):
        for key in ("access_token", "id_token", "token", "jwt"):
            if body_json.get(key):
                out[key] = str(body_json[key])
        nested = body_json.get("data") if isinstance(body_json.get("data"), dict) else {}
        for key in ("access_token", "token"):
            if nested.get(key):
                out[key] = str(nested[key])

    # Authorization header
    auth = headers.get("Authorization") or headers.get("authorization") or ""
    if auth:
        m = _BEARER_RE.search(auth)
        if m:
            out["access_token"] = m.group(2)

    # Cookies: Set-Cookie / JSESSIONID
    set_cookie = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
    if set_cookie:
        for name in ("JSESSIONID", "session", "sessionid", "sid"):
            m = re.search(rf"(?i){re.escape(name)}=([^;]+)", set_cookie)
            if m:
                out[name.lower()] = m.group(1)
    if "JSESSIONID" in (headers.get("Cookie") or ""):
        out["jsessionid"] = ""

    # body_raw fallback: ищем JWT
    if not out and body_raw:
        for token in re.findall(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", body_raw):
            out["access_token"] = token
            break
    return out


# ───────────────────────── OAuth2 / OIDC ─────────────────────────


@dataclass
class OAuth2Config:
    grant_type: str = "client_credentials"  # client_credentials | password | authorization_code
    token_url: str = ""
    client_id: str = ""
    client_secret: str = ""
    username: str = ""
    password: str = ""
    scope: str = ""
    audience: str = ""
    # authorization_code
    authorization_url: str = ""
    redirect_uri: str = ""
    code: str = ""
    code_verifier: str = ""  # PKCE
    # mTLS
    cert: str = ""  # path to PEM (cert+key) or PFX
    cert_password: str = ""
    # auth header style
    auth_style: str = "body"  # body | basic


def _pkce_challenge(verifier: str) -> str:
    """RFC 7636 S256 challenge."""
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _oauth2_token_form(cfg: OAuth2Config) -> Dict[str, str]:
    form: Dict[str, str] = {"grant_type": cfg.grant_type}
    if cfg.scope:
        form["scope"] = cfg.scope
    if cfg.audience:
        form["audience"] = cfg.audience
    if cfg.grant_type == "client_credentials":
        if cfg.client_id and cfg.auth_style == "body":
            form["client_id"] = cfg.client_id
        if cfg.client_secret and cfg.auth_style == "body":
            form["client_secret"] = cfg.client_secret
    elif cfg.grant_type == "password":
        form["username"] = cfg.username
        form["password"] = cfg.password
        if cfg.client_id and cfg.auth_style == "body":
            form["client_id"] = cfg.client_id
        if cfg.client_secret and cfg.auth_style == "body":
            form["client_secret"] = cfg.client_secret
    elif cfg.grant_type == "authorization_code":
        form["code"] = cfg.code
        form["redirect_uri"] = cfg.redirect_uri
        if cfg.code_verifier:
            form["code_verifier"] = cfg.code_verifier
    return form


def build_authorization_url(cfg: OAuth2Config) -> str:
    """Собирает Authorization URL для Authorization Code + PKCE."""
    params = {
        "response_type": "code",
        "client_id": cfg.client_id,
        "redirect_uri": cfg.redirect_uri,
        "state": hashlib.sha256(os.urandom(16)).hexdigest()[:16],
    }
    if cfg.scope:
        params["scope"] = cfg.scope
    if cfg.code_verifier:
        params["code_challenge"] = _pkce_challenge(cfg.code_verifier)
        params["code_challenge_method"] = "S256"
    sep = "&" if "?" in cfg.authorization_url else "?"
    return cfg.authorization_url + sep + urllib.parse.urlencode(params)


def execute_oauth2(
    cfg: OAuth2Config,
    *,
    http_fn: Optional[Callable[..., Any]] = None,
    timeout: int = 30,
) -> Dict[str, Any]:
    """Выполняет OAuth2 token exchange → ``{ok, status, tokens, error}``.

    ``http_fn(method, url, headers=..., data=..., verify=..., cert=...)`` — requests-совместимый.
    """
    if not cfg.token_url:
        return {"ok": False, "status": 0, "tokens": {}, "error": "token_url empty"}
    headers: Dict[str, str] = {"Content-Type": "application/x-www-form-urlencoded"}
    if cfg.auth_style == "basic" and cfg.client_id:
        creds = f"{cfg.client_id}:{cfg.client_secret}".encode("utf-8")
        headers["Authorization"] = "Basic " + base64.b64encode(creds).decode("ascii")

    data = urllib.parse.urlencode(_oauth2_token_form(cfg))
    cert_kwargs: Dict[str, Any] = {}
    if cfg.cert:
        cert_kwargs["cert"] = cfg.cert

    try:
        if http_fn is not None:
            resp = http_fn(
                "POST",
                cfg.token_url,
                headers=headers,
                data=data,
                timeout=timeout,
                **cert_kwargs,
            )
            status = int(getattr(resp, "status_code", 200))
            body = getattr(resp, "text", "") or ""
        else:
            import requests

            resp = requests.post(
                cfg.token_url, headers=headers, data=data, timeout=timeout, **cert_kwargs
            )
            status = resp.status_code
            body = resp.text
    except Exception as exc:  # noqa: BLE001 — IdP timeout/network
        return {"ok": False, "status": 0, "tokens": {}, "error": str(exc)}

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return {"ok": False, "status": status, "tokens": {}, "error": f"non-json ({body[:120]})"}

    if status >= 400:
        err = str(payload.get("error") or payload.get("error_description") or f"HTTP {status}")
        return {"ok": False, "status": status, "tokens": {}, "error": err}

    tokens = extract_session_tokens(body_json=payload)
    tokens.setdefault("expires_in", str(payload.get("expires_in", "")))
    return {"ok": bool(tokens.get("access_token")), "status": status, "tokens": tokens, "error": ""}


# ───────────────────────── ZAP Replacer ─────────────────────────


def apply_to_zap_replacer(
    tokens: Mapping[str, str],
    zap_adapter: Any,
    *,
    context_name: str = "kdt_ctx",
    header_name: str = "Authorization",
) -> Dict[str, str]:
    """Конфигурирует ZAP Replacer: ``Authorization: Bearer <token>`` + Cookie при наличии."""
    applied: Dict[str, str] = {}
    if zap_adapter is None or not hasattr(zap_adapter, "add_replacer_rule"):
        logger.warning("zap_adapter без add_replacer_rule — Replacer пропущен")
        return applied
    token = tokens.get("access_token") or tokens.get("id_token") or tokens.get("token")
    if token:
        try:
            zap_adapter.add_replacer_rule(
                "kdt-vault-bearer", "REQ_HEADER", header_name, f"Bearer {token}", False
            )
            applied["header"] = header_name
        except Exception as exc:  # noqa: BLE001
            logger.error("ZAP replacer bearer: %s", exc)
    cookie_val = ""
    for k, v in tokens.items():
        if k.lower() in ("jsessionid", "session", "sessionid", "sid") or k.lower().startswith("cookie"):
            cookie_val = cookie_val + f"{k}={v}; " if not k.lower().startswith("cookie") else v
    if cookie_val:
        try:
            zap_adapter.add_replacer_rule(
                "kdt-vault-cookie", "REQ_HEADER", "Cookie", cookie_val.strip(), False
            )
            applied["cookie"] = "Cookie"
        except Exception as exc:  # noqa: BLE001
            logger.error("ZAP replacer cookie: %s", exc)
    return applied


# ───────────────────────── auto-refresh session ─────────────────────────


class AutoRefreshSession:
    """Авто-продление сессии: pre-flight + retry при 401/403.

    ``refresh_fn() -> Dict[str, Any]`` — функция, возвращающая свежие токены
    (напр. ``execute_oauth2``). ``send_fn(method, url, headers, ...)`` — исходящий
    вызов, возвращающий объект с ``status_code`` / ``text``.
    """

    def __init__(
        self,
        refresh_fn: Callable[[], Dict[str, Any]],
        *,
        ttl_sec: float = 0.0,
    ) -> None:
        self.refresh_fn = refresh_fn
        self.tokens: Dict[str, str] = {}
        self.issued_at: float = 0.0
        self.ttl_sec = float(ttl_sec)
        self.last_error: str = ""

    def ensure_token(self) -> Optional[str]:
        """Возвращает актуальный access_token, перезапрашивая при протухании."""
        if self.tokens.get("access_token") and not self.expired():
            return self.tokens["access_token"]
        result = self.refresh_fn()
        if result.get("ok") and result.get("tokens"):
            self.tokens = {k: v for k, v in result["tokens"].items() if v}
            self.issued_at = time.time()
            try:
                self.ttl_sec = float(self.tokens.get("expires_in") or 0.0)
            except ValueError:
                self.ttl_sec = 0.0
            self.last_error = ""
            return self.tokens.get("access_token")
        self.last_error = str(result.get("error") or "refresh failed")
        return None

    def expired(self) -> bool:
        if self.ttl_sec <= 0:
            return not bool(self.tokens.get("access_token"))
        return (time.time() - self.issued_at) >= (self.ttl_sec - 5)  # запас 5с

    def send(
        self,
        method: str,
        url: str,
        *,
        send_fn: Callable[..., Any],
        headers: Optional[Mapping[str, str]] = None,
        max_retries: int = 1,
        **kwargs: Any,
    ) -> Any:
        """Отправляет запрос; при 401/403 перезапрашивает токен и повторяет."""
        token = self.ensure_token()
        hdrs = dict(headers or {})
        if token:
            hdrs["Authorization"] = f"Bearer {token}"

        resp = send_fn(method, url, headers=hdrs, **kwargs)
        for _ in range(max_retries):
            status = int(getattr(resp, "status_code", 200))
            if status not in (401, 403):
                return resp
            # 401/403 → refresh + retry
            token = self.ensure_token()
            if not token:
                return resp
            hdrs["Authorization"] = f"Bearer {token}"
            resp = send_fn(method, url, headers=hdrs, **kwargs)
        return resp

    def validity(self) -> Dict[str, Any]:
        """Индикатор валидности сессии (для Admin UI): ok + ttl + issued."""
        token = self.tokens.get("access_token", "")
        alive = bool(token) and not self.expired()
        return {
            "ok": alive,
            "ttl_sec": self.ttl_sec,
            "issued_at": self.issued_at,
            "expires_in": max(0.0, (self.issued_at + self.ttl_sec) - time.time()) if self.ttl_sec > 0 else None,
            "masked_token": mask_secret(token),
            "last_error": self.last_error,
        }


# ───────────────────────── Playwright headless ─────────────────────────


def browser_headless_auth(
    *,
    login_url: str,
    username: str,
    password: str,
    username_selector: str,
    password_selector: str,
    submit_selector: str,
    success_string: str = "",
    storage_state: str = "",  # path to save storage_state.json
) -> Dict[str, Any]:
    """Browser headless auth через Playwright (опционально). Извлекает localStorage/cookies.

    Без установленного ``playwright`` — честный degrade с ``ok=False, error="playwright_not_installed"``.
    """
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except ImportError:
        return {"ok": False, "tokens": {}, "cookies": [], "error": "playwright_not_installed"}

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(login_url, wait_until="domcontentloaded")
            page.fill(username_selector, username)
            page.fill(password_selector, password)
            page.click(submit_selector)
            page.wait_for_load_state("networkidle")
            if success_string:
                if success_string not in page.content():
                    browser.close()
                    return {"ok": False, "tokens": {}, "cookies": [], "error": "success_string_not_found"}
            tokens: Dict[str, str] = {}
            local = page.evaluate("() => { const o = {}; for (let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=localStorage.getItem(k);} return o; }")
            for k, v in (local or {}).items():
                kl = k.lower()
                if any(h in kl for h in ("token", "jwt", "session", "access")):
                    tokens[k] = str(v)
            cookies = page.context.cookies()
            for c in cookies:
                if "session" in c.get("name", "").lower() or "token" in c.get("name", "").lower():
                    tokens.setdefault(c["name"], c["value"])
            if storage_state:
                page.context.storage_state(path=storage_state)
            browser.close()
            return {
                "ok": bool(tokens),
                "tokens": tokens,
                "cookies": [{"name": c["name"], "value": mask_secret(c["value"])} for c in cookies],
                "error": "" if tokens else "no_tokens_extracted",
            }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "tokens": {}, "cookies": [], "error": str(exc)}


# ───────────────────────── mTLS ─────────────────────────


def load_mtls_context(
    *,
    cert_path: str = "",
    cert_password: str = "",
    verify: bool = True,
) -> Dict[str, Any]:
    """Готовит mTLS-параметры для requests. Возвращает ``{cert, verify, ok, error}``.

    Поддерживает PEM (cert+key) и PFX/P12 (через ``cryptography``)."""
    if not cert_path:
        return {"cert": None, "verify": verify, "ok": False, "error": "cert_path empty"}
    path = os.path.expandvars(os.path.expanduser(cert_path))
    if not os.path.isfile(path):
        return {"cert": None, "verify": verify, "ok": False, "error": f"not_found:{path}"}

    if path.lower().endswith((".pfx", ".p12")):
        # PFX → временный PEM-файл с cert+key
        try:
            from cryptography.hazmat.primitives import serialization
            from cryptography.hazmat.primitives.serialization import pkcs12

            with open(path, "rb") as fh:
                (private_key, cert, _) = pkcs12.load_key_and_certificates(
                    fh.read(), cert_password.encode("utf-8") if cert_password else None
                )
            pem_path = path + ".pem"
            with open(pem_path, "wb") as fh:
                fh.write(
                    private_key.private_bytes(
                        encoding=serialization.Encoding.PEM,
                        format=serialization.PrivateFormat.TraditionalOpenSSL,
                        encryption_algorithm=serialization.NoEncryption(),
                    )
                )
                fh.write(cert.public_bytes(serialization.Encoding.PEM))
            return {"cert": pem_path, "verify": verify, "ok": True, "error": ""}
        except Exception as exc:  # noqa: BLE001
            return {"cert": None, "verify": verify, "ok": False, "error": str(exc)}

    # PEM (или crt/key как есть)
    return {"cert": path, "verify": verify, "ok": True, "error": ""}


# ───────────────────────── state ledger (Admin UI) ─────────────────────────


def _state_path() -> "os.PathLike[str] | str":
    from utils.paths import LIVE_DIR, ensure_live_dir

    ensure_live_dir()
    return os.path.join(LIVE_DIR, "auth_vault_state.json")


def save_vault_state(patch: Dict[str, Any]) -> Dict[str, Any]:
    state = load_vault_state()
    state.update({k: v for k, v in patch.items() if v is not None})
    try:
        with open(_state_path(), "w", encoding="utf-8") as fh:
            json.dump(state, fh, ensure_ascii=False, indent=0)
    except OSError as exc:
        logger.warning("auth_vault state write: %s", exc)
    return state


def load_vault_state() -> Dict[str, Any]:
    try:
        with open(_state_path(), "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


# ───────────────────────── profile registry + check flow ─────────────────────────

# In-memory реестр профилей (id → OAuth2Config). Заполняется из окружения/конфига
# или через save_vault_state; для Admin UI «Check Auth Flow» используем последний
# сохранённый OAuth2-конфиг профиля.
_PROFILE_REGISTRY: Dict[str, OAuth2Config] = {}


def register_oauth2_profile(profile_id: str, cfg: OAuth2Config) -> None:
    _PROFILE_REGISTRY[profile_id] = cfg


def profile_ids() -> List[str]:
    return list(_PROFILE_REGISTRY.keys()) or [
        str(p.get("id")) for p in (load_vault_state().get("profiles") or []) if isinstance(p, dict) and p.get("id")
    ]


def check_auth_flow(profile_id: str, *, http_fn: Optional[Callable[..., Any]] = None) -> Dict[str, Any]:
    """Живой pre-flight прогон профиля → токены → ZAP Replacer (duck-typed zap=None).

    Возвращает ``{ok, status, tokens:[masked], error}``. Сохраняет состояние профиля
    в ledger для Admin UI.
    """
    cfg = _PROFILE_REGISTRY.get(profile_id)
    if cfg is None:
        # Пытаемся восстановить из ledger (только metadata; секреты не храним в plaintext).
        return {
            "ok": False,
            "status": 0,
            "tokens": [],
            "error": f"profile_not_registered:{profile_id}",
        }
    result = execute_oauth2(cfg, http_fn=http_fn)
    tokens = result.get("tokens") or {}
    masked = [mask_secret(tokens[k]) for k in tokens if tokens[k]]
    ok = bool(result.get("ok"))

    # Обновляем ledger профиля (без секретов).
    state = load_vault_state()
    profiles = [p for p in (state.get("profiles") or []) if isinstance(p, dict) and p.get("id") != profile_id]
    token = tokens.get("access_token") or tokens.get("id_token") or ""
    profiles.append(
        {
            "id": profile_id,
            "kind": "oauth2",
            "auth_type": cfg.grant_type,
            "session_ok": ok,
            "ttl_sec": float(tokens.get("expires_in") or 0.0),
            "masked_token": mask_secret(token),
            "last_error": result.get("error") or "",
        }
    )
    save_vault_state({"profiles": profiles})

    return {
        "ok": ok,
        "status": result.get("status", 0),
        "tokens": masked,
        "error": result.get("error") or "",
    }


def apply_tokens_to_zap(tokens: Mapping[str, str], zap_adapter: Any) -> Dict[str, str]:
    """Alias для дружественного имени (совместимость с friend-request §2.1)."""
    return apply_to_zap_replacer(tokens, zap_adapter)

