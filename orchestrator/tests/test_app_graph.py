"""COS-L2: Тесты App Graph модели."""
import pytest
from pydantic import ValidationError
from orchestrator.models.app_graph import (
    Application, AppGraph, Group, RepositoryBinding,
)


class TestRepositoryBinding:
    def test_minimal(self):
        rb = RepositoryBinding(forge_id="f1", repo_path="owner/repo")
        assert rb.default_branch == "main"

    def test_custom_branch(self):
        rb = RepositoryBinding(
            forge_id="f1", repo_path="owner/repo", default_branch="develop")
        assert rb.default_branch == "develop"


class TestGroup:
    def test_root_group(self):
        g = Group(id="g1", domain_id="d1", name="Backend")
        assert g.parent_group_id is None
        assert g.level == 0


class TestApplication:
    def test_level_1(self):
        app = Application(
            id="app1", domain_id="d1", level=1,
            repo_binding=RepositoryBinding(forge_id="f1", repo_path="o/r"),
        )
        assert app.level == 1

    def test_level_out_of_range(self):
        with pytest.raises(ValidationError):
            Application(
                id="x", domain_id="d1", level=5,
                repo_binding=RepositoryBinding(forge_id="f1", repo_path="o/r"),
            )


class TestAppGraph:
    def test_empty_graph(self):
        g = AppGraph(
            domain="d1", groups=[], apps=[], libraries=[],
        )
        assert g.domain == "d1"

    def test_libraries_must_be_level_0(self):
        lib = Application(
            id="lib1", domain_id="d1", level=0,
            repo_binding=RepositoryBinding(forge_id="f1", repo_path="o/lib"),
        )
        g = AppGraph(domain="d1", libraries=[lib])
        assert len(g.libraries) == 1

    def test_libraries_rejects_level_1(self):
        lib = Application(
            id="lib1", domain_id="d1", level=1,
            repo_binding=RepositoryBinding(forge_id="f1", repo_path="o/lib"),
        )
        with pytest.raises(ValidationError):
            AppGraph(domain="d1", libraries=[lib])

    def test_apps_rejects_level_0(self):
        app = Application(
            id="app1", domain_id="d1", level=0,
            repo_binding=RepositoryBinding(forge_id="f1", repo_path="o/r"),
        )
        with pytest.raises(ValidationError):
            AppGraph(domain="d1", apps=[app])

    def test_cycle_in_groups(self):
        g1 = Group(id="g1", domain_id="d1", name="A", parent_group_id="g2")
        g2 = Group(id="g2", domain_id="d1", name="B", parent_group_id="g1")
        with pytest.raises(ValidationError):
            AppGraph(domain="d1", groups=[g1, g2])