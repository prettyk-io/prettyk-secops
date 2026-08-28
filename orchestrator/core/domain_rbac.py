"""
COS-B4: RBAC engine — 5 канонических ролей × Domain scope.

Роли (из sanctuary/pure/auth-roles.md):
  admin_sec       — Администратор ИБ домена
  admin_abnormal  — НШР домена (emergency)
  admin_service   — Инфраструктурный админ домена
  sec_expert      — Эксперт ИБ домена
  user            — Наблюдатель домена

Scope: роль + teams[] внутри Domain.
DomainPolicy.can?(user_id, action, resource) — Pundit-like.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

ROLES = frozenset({"admin_sec", "admin_abnormal", "admin_service", "sec_expert", "user"})


class Role(str, Enum):
    ADMIN_SEC = "admin_sec"
    ADMIN_ABNORMAL = "admin_abnormal"
    ADMIN_SERVICE = "admin_service"
    SEC_EXPERT = "sec_expert"
    USER = "user"


# Разрешения по ролям
_ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "admin_sec": frozenset({
        "domain:read", "domain:write", "domain:delete",
        "app:read", "app:write", "app:delete",
        "group:read", "group:write",
        "run:start", "run:stop", "run:read",
        "gate:decide", "gate:read",
        "report:generate", "report:read",
        "rbac:manage",
    }),
    "admin_abnormal": frozenset({
        "domain:read",
        "app:read", "app:write",
        "run:start", "run:stop", "run:read",
        "gate:read",
        "report:generate", "report:read",
    }),
    "admin_service": frozenset({
        "domain:read",
        "app:read", "app:write",
        "group:read",
        "run:read",
        "gate:read",
    }),
    "sec_expert": frozenset({
        "domain:read",
        "app:read",
        "run:start", "run:read",
        "gate:read",
        "report:read",
    }),
    "user": frozenset({
        "domain:read",
        "app:read",
        "run:read",
        "report:read",
    }),
}


class DomainRBAC:
    """RBAC внутри одного Domain: участники с ролями + командами."""

    def __init__(self, domain_id: str, members: list[dict] | None = None):
        self.domain_id = domain_id
        self.members: list[dict] = members or []

    def has_role(self, user_id: str, role: str) -> bool:
        for m in self.members:
            if m.get("user_id") == user_id and m.get("role") == role:
                return True
        return False

    def teams_for(self, user_id: str) -> list[str]:
        for m in self.members:
            if m.get("user_id") == user_id:
                teams = m.get("teams", [])
                return teams if isinstance(teams, list) else []
        return []

    def can(self, user_id: str, action: str, resource_team: str | None = None) -> bool:
        """Проверить: может ли user_id выполнить action на resource_team?"""
        for m in self.members:
            if m.get("user_id") != user_id:
                continue
            role = m.get("role", "")
            perms = _ROLE_PERMISSIONS.get(role, frozenset())
            if action not in perms:
                return False
            # team scope: если resource_team задан, проверяем команды
            if resource_team:
                teams: list[str] = m.get("teams", [])
                if "*" in teams:
                    return True
                if resource_team not in teams:
                    return False
            return True
        return False

    def add_member(self, user_id: str, role: str, teams: list[str] | None = None):
        if role not in ROLES:
            raise ValueError(f"Unknown role: {role}")
        # Удалить дубликат
        self.members = [m for m in self.members if m.get("user_id") != user_id]
        self.members.append({"user_id": user_id, "role": role, "teams": teams or []})

    def remove_member(self, user_id: str):
        self.members = [m for m in self.members if m.get("user_id") != user_id]


class DomainPolicy:
    """Глобальный policy engine: оркестрирует несколько DomainRBAC."""

    def __init__(self):
        self._domains: dict[str, DomainRBAC] = {}

    def register_domain(self, domain_id: str, members: list[dict] | None = None):
        self._domains[domain_id] = DomainRBAC(domain_id, members)

    def can(self, user_id: str, action: str, domain_id: str,
            resource_team: str | None = None) -> bool:
        rbac = self._domains.get(domain_id)
        if rbac is None:
            return False
        return rbac.can(user_id, action, resource_team)

    def add_member(self, domain_id: str, user_id: str, role: str,
                   teams: list[str] | None = None):
        rbac = self._domains.get(domain_id)
        if rbac is None:
            rbac = DomainRBAC(domain_id)
            self._domains[domain_id] = rbac
        rbac.add_member(user_id, role, teams)


# ── Глобальный синглтон (замена in-memory → PostgreSQL позже) ──
_domain_policy = DomainPolicy()


def get_domain_policy() -> DomainPolicy:
    return _domain_policy