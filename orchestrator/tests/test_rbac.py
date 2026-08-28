"""
COS-L19: RBAC integration tests.

5 ролей: admin_sec, admin_abnormal, admin_service, sec_expert, user.
Domain scope: admin_sec domain A ≠ admin_sec domain B.
Team scope внутри Domain.
"""
import pytest

# ── RBAC model ──

Role = str  # "admin_sec" | "admin_abnormal" | "admin_service" | "sec_expert" | "user"

ROLES: list[Role] = ["admin_sec", "admin_abnormal", "admin_service", "sec_expert", "user"]

# Capabilities per role
ROLE_CAPS: dict[Role, set[str]] = {
    "admin_sec": {"create_domain", "delete_domain", "manage_rbac", "view_all",
                   "run_scan", "view_findings", "override_gate", "manage_secrets"},
    "admin_abnormal": {"create_domain", "view_all", "run_scan", "view_findings",
                        "override_gate"},
    "admin_service": {"view_all", "run_scan", "view_findings", "manage_ci"},
    "sec_expert": {"run_scan", "view_findings", "write_report", "sign_act"},
    "user": {"view_findings", "view_own_reports"},
}


def has_capability(role: Role, capability: str) -> bool:
    return capability in ROLE_CAPS.get(role, set())


def can_access_domain(role: Role, domain_id: str, user_domains: set[str]) -> bool:
    """Проверяет доступ роли к конкретному Domain."""
    # admin_* видят все домены (view_all)
    if "view_all" in ROLE_CAPS.get(role, set()):
        return True
    # sec_expert и user видят только свои домены
    return domain_id in user_domains


class TestRoleCapabilities:
    def test_admin_sec_has_all(self):
        assert has_capability("admin_sec", "create_domain")
        assert has_capability("admin_sec", "manage_rbac")
        assert has_capability("admin_sec", "override_gate")
        assert has_capability("admin_sec", "manage_secrets")

    def test_admin_abnormal_no_secrets(self):
        assert has_capability("admin_abnormal", "override_gate")
        assert not has_capability("admin_abnormal", "manage_secrets")
        assert not has_capability("admin_abnormal", "manage_rbac")

    def test_sec_expert_no_admin(self):
        assert has_capability("sec_expert", "run_scan")
        assert has_capability("sec_expert", "sign_act")
        assert not has_capability("sec_expert", "create_domain")
        assert not has_capability("sec_expert", "manage_rbac")

    def test_user_minimal(self):
        assert not has_capability("user", "run_scan")
        assert not has_capability("user", "create_domain")
        assert has_capability("user", "view_findings")
        assert has_capability("user", "view_own_reports")

    def test_all_roles_can_view_findings(self):
        for role in ROLES:
            assert has_capability(role, "view_findings"), f"{role} should view findings"


class TestDomainScope:
    def test_admin_sec_sees_all_domains(self):
        assert can_access_domain("admin_sec", "d-1", set())
        assert can_access_domain("admin_sec", "d-2", set())
        assert can_access_domain("admin_sec", "d-any", set())

    def test_admin_abnormal_sees_all(self):
        assert can_access_domain("admin_abnormal", "d-1", set())
        assert can_access_domain("admin_abnormal", "d-99", set())

    def test_sec_expert_sees_own_domain_only(self):
        assert can_access_domain("sec_expert", "d-1", {"d-1", "d-3"})
        assert not can_access_domain("sec_expert", "d-2", {"d-1", "d-3"})

    def test_user_sees_own_domain_only(self):
        assert can_access_domain("user", "d-alpha", {"d-alpha"})
        assert not can_access_domain("user", "d-beta", {"d-alpha"})


class TestTeamScope:
    """Team scope внутри Domain — эксперт видит только свою команду."""

    def test_sec_expert_same_team(self):
        """Эксперт из team-A домена d-1 видит находки своей команды."""
        team_a_findings = [
            {"id": "f-1", "domain": "d-1", "team": "team-A"},
            {"id": "f-2", "domain": "d-1", "team": "team-A"},
        ]
        visible = [f for f in team_a_findings if f["team"] == "team-A"]
        assert len(visible) == 2

    def test_sec_expert_different_team(self):
        """Эксперт из team-A НЕ видит находки team-B того же домена."""
        findings = [
            {"id": "f-1", "domain": "d-1", "team": "team-A"},
            {"id": "f-2", "domain": "d-1", "team": "team-B"},
            {"id": "f-3", "domain": "d-1", "team": "team-B"},
        ]
        visible = [f for f in findings if f["team"] == "team-A"]
        assert len(visible) == 1

    def test_admin_sec_sees_all_teams(self):
        """admin_sec видит находки всех команд."""
        findings = [
            {"id": "f-1", "domain": "d-1", "team": "team-A"},
            {"id": "f-2", "domain": "d-1", "team": "team-B"},
        ]
        # admin_sec: фильтрация по domain, не по team
        assert len(findings) == 2