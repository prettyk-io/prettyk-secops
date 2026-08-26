# -*- coding: utf-8 -*-
"""PERS-1L lab: caller from X-PK-User / Cookie; strip foreign novnc/hooks.

MON-13: короткоживущий подписанный bind-токен. Editor → playground mint token
(owner привязывается к run_id), Live проверяет подпись — «свой инстанс без логина».
"""
from __future__ import annotations
from utils.env_dual import pk_env, pk_env_name

import base64
import hashlib
import hmac
import json
import os
import re
import time
from typing import Any, Dict, Mapping, MutableMapping, Optional, Tuple

# admin_appsec / admin_abnormal — видят ЛЮБОЙ инстанс (админ ИБ / abnormal).
# «admin» оставлен для legacy lab (не сносим).
ADMIN_USERS = frozenset({"admin", "admin_appsec", "admin_abnormal"})

# Runner/lab: prefer explicit owner env (Editor → playground → subprocess).
_OWNER_ENV_KEYS = ("PK_OWNER_USER", "PK_USER")

# MON-13: dev-секрет для HMAC bind-токена. В airgap/банке — через env.
_MONITOR_TOKEN_SECRET = (
    pk_env("MONITOR_TOKEN_SECRET")
    or "pk-monitor-bind-dev-secret-2026"
).encode("utf-8")

try:
    MONITOR_TOKEN_TTL_SECONDS = max(
        60, int(pk_env("MONITOR_TOKEN_TTL", "604800"))
    )
except (TypeError, ValueError):
    MONITOR_TOKEN_TTL_SECONDS = 604800  # 7 дней — полный срок жизни артефактов


def resolve_run_owner_user_id(explicit: Optional[str] = None) -> Optional[str]:
    """Owner for diary meta / runs index. Explicit → env → None (lab unscoped)."""
    raw = (explicit or "").strip()
    if raw:
        return raw
    for key in _OWNER_ENV_KEYS:
        val = pk_env_name(key).strip()
        if val:
            return val
    return None


def parse_caller_user(headers: Mapping[str, str]) -> Optional[str]:
    """Lab stub: ``X-PK-User`` header or Cookie ``pk_user=``."""
    raw = ""
    for key, value in headers.items():
        if key.lower() == "x-pk-user":
            raw = str(value or "").strip()
            break
    if raw:
        return raw
    cookie = ""
    for key, value in headers.items():
        if key.lower() == "cookie":
            cookie = str(value or "")
            break
    m = re.search(r"(?:^|;\s*)pk_user=([^;]+)", cookie)
    if m:
        return m.group(1).strip()
    return None


def is_secops_admin(user: Optional[str]) -> bool:
    return (user or "").strip() in ADMIN_USERS


def may_view_owner(*, caller: Optional[str], owner: Optional[str]) -> bool:
    if is_secops_admin(caller):
        return True
    own = (owner or "").strip()
    if not own or own == "legacy":
        return True
    if not caller:
        return False
    return caller.strip() == own


# ─────────────────────────── MON-13: bind-токен ───────────────────────────


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64d(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def _sign(payload_b64: str) -> str:
    return _b64e(
        hmac.new(_MONITOR_TOKEN_SECRET, payload_b64.encode("ascii"), hashlib.sha256).digest()
    )


def issue_monitor_token(
    run_id: str,
    owner: str,
    *,
    ttl: int = MONITOR_TOKEN_TTL_SECONDS,
    now: Optional[float] = None,
) -> str:
    """Подписать bind-токен: {run_id, owner, exp} + HMAC-SHA256.

    Результат — ``<payload_b64>.<signature_b64>``; короткоживущий (default 1 час).
    """
    rid = (run_id or "").strip()
    own = (owner or "").strip()
    if not rid:
        raise ValueError("run_id required for monitor token")
    if not own:
        raise ValueError("owner required for monitor token")
    exp = int((now if now is not None else time.time()) + max(1, int(ttl)))
    payload = {"run_id": rid, "owner": own, "exp": exp}
    payload_b64 = _b64e(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{payload_b64}.{_sign(payload_b64)}"


def verify_monitor_token(token: str, run_id: str, *, now: Optional[float] = None) -> Optional[str]:
    """Проверить bind-токен для run_id → owner (или None при невалидности).

    Условия: подпись валидна, run_id совпадает, exp не истёк.
    """
    raw = (token or "").strip()
    rid = (run_id or "").strip()
    if not raw or not rid or "." not in raw:
        return None
    payload_b64, _, sig = raw.partition(".")
    if not payload_b64 or not sig:
        return None
    expected = _sign(payload_b64)
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        payload = json.loads(_b64d(payload_b64).decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    if str(payload.get("run_id") or "") != rid:
        return None
    exp = payload.get("exp")
    if not isinstance(exp, (int, float)):
        return None
    if (now if now is not None else time.time()) > float(exp):
        return None
    return str(payload.get("owner") or "").strip() or None


def resolve_run_owner(run_id: str) -> Optional[str]:
    """Owner для конкретного run_id: runs_index → diary meta (если текущий)."""
    rid = (run_id or "").strip()
    if not rid:
        return None
    try:
        from utils.runs_index import list_run_index

        for row in list_run_index():
            if str(row.get("run_id") or "") == rid:
                owner = str(row.get("owner_user_id") or "").strip()
                return owner or None
    except Exception:
        pass
    try:
        from utils.diary_bus import get_meta

        meta = get_meta()
        if str(meta.get("run_id") or "") == rid:
            owner = str(meta.get("owner_user_id") or "").strip()
            return owner or None
    except Exception:
        pass
    return None


def may_view_run(*, caller: Optional[str], run_id: str, token: str = "") -> bool:
    """MON-13: gate доступа к конкретному run_id.

    - token валиден → mint-эндпоинт уже авторизовал (подпись + run_id bound) → True.
    - без token → обычный ACL: admin/abnormal любой, оператор только свой run.
    """
    tok = (token or "").strip()
    if tok:
        return verify_monitor_token(tok, run_id) is not None
    owner = resolve_run_owner(run_id)
    return may_view_owner(caller=caller, owner=owner)


def redact_meta_for_caller(
    meta: MutableMapping[str, Any],
    *,
    caller: Optional[str],
) -> Dict[str, Any]:
    """If meta.owner_user_id foreign → drop novnc / sensitive hook URLs."""
    out = dict(meta)
    owner = out.get("owner_user_id") or out.get("owner")
    if may_view_owner(caller=caller, owner=str(owner) if owner else None):
        return out
    out["novnc_url"] = None
    out["pers_redacted"] = True
    hooks = out.get("hooks")
    if isinstance(hooks, dict):
        red = dict(hooks)
        for key in ("allure_report_url", "dojo_engagement_url", "report_url"):
            if key in red:
                red[key] = None
        out["hooks"] = red
    return out


def filter_evidence_list(
    items: list,
    *,
    caller: Optional[str],
) -> Tuple[list, int]:
    """Filter evidence rows with owner_user_id; keep unscoped (lab)."""
    kept = []
    hidden = 0
    for row in items:
        if not isinstance(row, dict):
            continue
        owner = row.get("owner_user_id")
        if may_view_owner(
            caller=caller, owner=str(owner) if owner is not None else None
        ):
            kept.append(row)
        else:
            hidden += 1
    return kept, hidden


# ─────────────────────── MH-7: ACL для HomePage ───────────────────────────


def filter_runs_for_caller(
    runs: list,
    *,
    caller: Optional[str],
) -> list:
    """MH-7: фильтр списка run_id → видимость по caller.

    Политика (черновик):
    - caller = None / без заголовка → все видят всё (HomePage без авторизации).
    - admin_appsec / admin_abnormal → видят все run_id любого владельца.
    - оператор (appsec-expert и др.) → видит ТОЛЬКО свои run_id.
    - гостевой bind-токен здесь не применяется (специфичен для конкретного run_id).

    Эта функция готова к включению — достаточно передать ``caller``
    из заголовка ``X-PK-User`` / Cookie в ``_serve_runs_apps``
    (или в ``_serve_runs_index`` для Admin).
    """
    if not caller:
        return list(runs)  # без авторизации — всё
    if is_secops_admin(caller):
        return list(runs)  # админ — всё
    caller_id = caller.strip()
    return [
        r
        for r in runs
        if str(r.get("owner_user_id") or "").strip() == caller_id
        or not r.get("owner_user_id")  # legacy lab без owner
    ]
