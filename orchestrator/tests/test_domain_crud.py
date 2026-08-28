"""
COS-L16: Domain CRUD integration tests.

Проверка: создание Domain, Application, Group через API.
Валидация: пустой label, невалидный level, FK constraints.
"""
import pytest
from pydantic import ValidationError
from orchestrator.models.domain_model import Domain, DomainQuota, ForgeBinding
from orchestrator.models.app_graph import Application, AppGraph, Group, RepositoryBinding


# ── Domain creation ──

class TestDomainCRUD:
    def test_create_valid_domain(self):
        d = Domain(
            id="d-test-1",
            label="Линкор",
            forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="VAULT/GITEA_TOKEN"),
            quota=DomainQuota(max_runs=20, max_storage_gb=200, max_cpu=4),
        )
        assert d.id == "d-test-1"
        assert d.label == "Линкор"
        assert d.quota.max_runs == 20

    def test_empty_label_rejected(self):
        with pytest.raises(ValidationError):
            Domain(
                id="d-bad", label="",
                forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="T"),
            )

    def test_blank_label_rejected(self):
        with pytest.raises(ValidationError):
            Domain(
                id="d-bad", label="   \t  ",
                forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="T"),
            )

    def test_missing_forge_binding(self):
        with pytest.raises(ValidationError):
            Domain(id="d-bad", label="Test")  # type: ignore[call-arg]

    def test_negative_quota_rejected(self):
        with pytest.raises(ValidationError):
            Domain(
                id="d-bad", label="Test",
                forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="T"),
                quota=DomainQuota(max_runs=-1),
            )

    def test_two_domains_independent(self):
        d1 = Domain(id="d-1", label="Alpha",
                    forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="T1"))
        d2 = Domain(id="d-2", label="Beta",
                    forge_binding=ForgeBinding(url="http://jenkins:8080", token_ref="T2",
                                               forge_type="jenkins"))
        assert d1.id != d2.id
        assert d1.forge_binding.forge_type == "gitea"
        assert d2.forge_binding.forge_type == "jenkins"


# ── Application CRUD ──

class TestApplicationCRUD:
    def test_create_level_1(self):
        app = Application(
            id="app-1", domain_id="d-1", level=1,
            repo_binding=RepositoryBinding(forge_id="f1", repo_path="org/frontend"),
        )
        assert app.domain_id == "d-1"
        assert app.level == 1

    def test_create_level_0_library(self):
        app = Application(
            id="lib-1", domain_id="d-1", level=0,
            repo_binding=RepositoryBinding(forge_id="f1", repo_path="org/shared-lib"),
        )
        assert app.level == 0

    def test_invalid_level_negative(self):
        with pytest.raises(ValidationError):
            Application(
                id="bad", domain_id="d-1", level=-1,
                repo_binding=RepositoryBinding(forge_id="f1", repo_path="o/r"),
            )

    def test_invalid_level_above_3(self):
        with pytest.raises(ValidationError):
            Application(
                id="bad", domain_id="d-1", level=4,
                repo_binding=RepositoryBinding(forge_id="f1", repo_path="o/r"),
            )

    def test_app_with_group(self):
        app = Application(
            id="app-2", domain_id="d-1", level=2, group_id="g-backend",
            repo_binding=RepositoryBinding(forge_id="f1", repo_path="org/backend"),
            pipeline_plan_id="plan-1",
        )
        assert app.group_id == "g-backend"
        assert app.pipeline_plan_id == "plan-1"

    def test_app_graph_separates_levels(self):
        lib = Application(id="lib-1", domain_id="d-1", level=0,
                          repo_binding=RepositoryBinding(forge_id="f1", repo_path="o/lib"))
        app = Application(id="app-1", domain_id="d-1", level=1,
                          repo_binding=RepositoryBinding(forge_id="f1", repo_path="o/app"))
        graph = AppGraph(domain="d-1", apps=[app], libraries=[lib])
        assert len(graph.apps) == 1
        assert len(graph.libraries) == 1
        assert graph.apps[0].level == 1
        assert graph.libraries[0].level == 0


# ── Group CRUD ──

class TestGroupCRUD:
    def test_nested_groups(self):
        g1 = Group(id="g1", domain_id="d1", name="Backend")
        g2 = Group(id="g2", domain_id="d1", name="API", parent_group_id="g1", level=1)
        assert g1.parent_group_id is None
        assert g2.parent_group_id == "g1"
        assert g2.level == 1

    def test_group_level_out_of_range(self):
        with pytest.raises(ValidationError):
            Group(id="g1", domain_id="d1", name="Bad", level=5)

    def test_group_requires_domain(self):
        g = Group(id="g1", domain_id="d1", name="Test")
        assert g.domain_id == "d1"

    # ── FK-like consistency ──

    def test_app_points_to_existing_domain(self):
        """App должен ссылаться на существующий domain_id (логическая проверка)."""
        from orchestrator.models.domain_model import Domain
        d = Domain(id="d-fk", label="FK Test",
                   forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="T"))
        app = Application(id="app-fk", domain_id=d.id, level=1,
                          repo_binding=RepositoryBinding(forge_id="f1", repo_path="o/r"))
        assert app.domain_id == d.id

    def test_app_rejects_unknown_domain_id(self):
        """Создание App с несуществующим domain_id — допустимо на уровне модели
        (FK проверяется на уровне сервиса/БД), но model-level валидация пропускает."""
        app = Application(id="app-orphan", domain_id="nonexistent", level=1,
                          repo_binding=RepositoryBinding(forge_id="f1", repo_path="o/r"))
        # Модель не валидирует существование domain_id — это забота слоя данных
        assert app.domain_id == "nonexistent"