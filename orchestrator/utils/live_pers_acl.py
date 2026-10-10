# -*- coding: utf-8 -*-
"""PERS-1L lab: caller from X-PK-User / Cookie; strip foreign novnc/hooks.

В unified PW-AIRGAP архитектуре Monitor открывается внутри коробки — кука
уже летает во всех запросах. HMAC bind-токен (бывш. MON-13) удалён за
избыточностью. ACL работает исключительно через caller identity:
admin/abnormal видят всё, оператор — только свои прогоны.
"""
from __future__ import annotations
from utils.env_dual import pk_env, pk_env_name

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


def parse_caller_user(
    headers: Mapping[str, str],
    *,
    peer_host: Optional[str] = None,
) -> Optional[str]:
    """Lab stub: ``X-PK-User`` header or Cookie ``pk_user=``.

    MONITOR-ACL-IDENTITY: если identity не пришла явно, но запрос с loopback
    (``peer_host`` передан вызывающим), отдаём локальную identity стенда
    (``PK_LIVE_LOCAL_IDENTITY``, default ``admin``) — на dev-стенде deep-link
    открывается штатно, без ручных кук. Для НЕ-localhost fallback не
    применяется: ACL не ослабляется для удалённых клиентов.
    """
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
    if _is_loopback_host(peer_host):
        ident = local_identity()
        return ident or None
    return None


def _is_loopback_host(host: Optional[str]) -> bool:
    h = (host or "").strip().lower()
    return h in {"127.0.0.1", "::1", "localhost"} or h.startswith("127.")


def local_identity() -> str:
    """Локальная identity dev-стенда (loopback-fallback для монитора)."""
    return pk_env_name("PK_LIVE_LOCAL_IDENTITY", "admin").strip()


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


def may_view_run(*, caller: Optional[str], run_id: str) -> bool:
    """Gate доступа к конкретному run_id: admin/abnormal любой, оператор только свой."""
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
