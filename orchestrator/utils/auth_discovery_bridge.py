# -*- coding: utf-8 -*-
"""Auth module ↔ discovery login bridge notes (IMP-AD).

Не реализует АвтоАвторизоваться MethodId (DISC-1 / CANON дно).
Честный контракт: fail → applied=false + notes.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


# Операторская матрица (QUEUE) — дублируется в docs/internal/imp-auth-discovery-map.md
OPERATOR_MATRIX = [
    {
        "when": "повторный lab / Juice / известный login",
        "use": "Auth module (auth=bearer|basic|cookie|header|chain)",
        "not": "АвтоАвторизоваться",
    },
    {
        "when": "неизвестная форма в DOM, R&D discovery",
        "use": "АвтоАвторизоваться (DISC-1) — когда/если появится MethodId",
        "not": "подмена Auth IR «applied: true»",
    },
    {
        "when": "банк / промышленный контур",
        "use": "явный Auth IR + suite steps",
        "not": "угадывание формы как единственный путь",
    },
]


def discovery_login_result(
    *,
    ok: bool,
    notes: Optional[List[str]] = None,
    method_id: str = "АвтоАвторизоваться",
    session_hint: Optional[str] = None,
) -> Dict[str, Any]:
    """Единый shape результата discovery-login (lab)."""
    note_list = list(notes or [])
    if not ok and not note_list:
        note_list.append(f"{method_id}: fail без деталей")
    return {
        "applied": bool(ok),
        "kind": "discovery_login",
        "method_id": method_id,
        "session_hint": session_hint if ok else None,
        "notes": note_list,
    }


def merge_auth_or_discovery(
    auth_result: Optional[Dict[str, Any]],
    discovery_result: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Приоритет: успешный Auth IR → иначе discovery.
    Никогда не поднимает applied=true при обоих fail.
    """
    if auth_result and auth_result.get("applied"):
        return {
            "applied": True,
            "source": "auth_module",
            "auth": auth_result,
            "discovery": discovery_result,
            "notes": list(auth_result.get("notes") or []),
        }
    if discovery_result and discovery_result.get("applied"):
        return {
            "applied": True,
            "source": "discovery",
            "auth": auth_result,
            "discovery": discovery_result,
            "notes": list(discovery_result.get("notes") or []),
        }
    notes: List[str] = []
    if auth_result:
        notes.extend(auth_result.get("notes") or [])
        notes.append("auth_module: not applied")
    if discovery_result:
        notes.extend(discovery_result.get("notes") or [])
        notes.append("discovery: not applied")
    if not notes:
        notes.append("нет auth и discovery результата")
    return {
        "applied": False,
        "source": None,
        "auth": auth_result,
        "discovery": discovery_result,
        "notes": notes,
    }


def live_discovery_fail_clue(
    discovery_result: Dict[str, Any],
    *,
    run_id: str = "",
) -> Dict[str, Any]:
    """Запись для diary/clue — без фейкового applied."""
    return {
        "type": "auth_discovery_fail",
        "run_id": run_id or None,
        "applied": False,
        "method_id": discovery_result.get("method_id"),
        "notes": list(discovery_result.get("notes") or []),
        "diary_line": "auth-discovery fail: "
        + "; ".join(discovery_result.get("notes") or ["unknown"]),
    }
