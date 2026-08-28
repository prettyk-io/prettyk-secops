"""COS-L1: Тесты Domain модели."""
import pytest
from pydantic import ValidationError
from orchestrator.models.domain_model import Domain, DomainQuota, ForgeBinding


class TestForgeBinding:
    def test_gitea_default(self):
        fb = ForgeBinding(url="http://gitea:3000", token_ref="VAULT/GITEA_TOKEN")
        assert fb.forge_type == "gitea"
        assert fb.url == "http://gitea:3000"

    def test_jenkins_type(self):
        fb = ForgeBinding(
            forge_type="jenkins",
            url="http://jenkins:8080",
            token_ref="JENKINS_TOKEN",
        )
        assert fb.forge_type == "jenkins"

    def test_invalid_forge_type(self):
        with pytest.raises(ValidationError):
            ForgeBinding(forge_type="bitbucket", url="http://x", token_ref="T")  # type: ignore[arg-type]


class TestDomainQuota:
    def test_defaults(self):
        q = DomainQuota()
        assert q.max_runs == 50
        assert q.max_storage_gb == 100
        assert q.max_cpu == 8

    def test_negative_runs(self):
        with pytest.raises(ValidationError):
            DomainQuota(max_runs=0)

    def test_custom_values(self):
        q = DomainQuota(max_runs=10, max_storage_gb=50, max_cpu=4)
        assert q.max_runs == 10
        assert q.max_storage_gb == 50
        assert q.max_cpu == 4


class TestDomain:
    def test_minimal_valid(self):
        d = Domain(
            id="domain-1",
            label="Линкор",
            forge_binding=ForgeBinding(
                url="http://gitea:3000",
                token_ref="VAULT/GITEA_TOKEN",
            ),
        )
        assert d.id == "domain-1"
        assert d.label == "Линкор"
        assert d.quota.max_runs == 50

    def test_empty_label(self):
        with pytest.raises(ValidationError):
            Domain(
                id="x",
                label="   ",
                forge_binding=ForgeBinding(
                    url="http://gitea:3000",
                    token_ref="VAULT/GITEA_TOKEN",
                ),
            )

    def test_quota_validates_positive(self):
        with pytest.raises(ValidationError):
            Domain(
                id="x",
                label="Test",
                forge_binding=ForgeBinding(
                    url="http://gitea:3000",
                    token_ref="T",
                ),
                quota=DomainQuota(max_runs=0),
            )

    def test_extra_fields_ignored(self):
        d = Domain(
            id="x", label="Test",
            forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="T"),
            unknown_field="should be ignored",  # type: ignore[call-arg]
        )
        assert not hasattr(d, "unknown_field")