"""COS-L3: Тесты Pipeline Brick модели."""
import pytest
from pydantic import ValidationError
from orchestrator.models.pipeline_brick import (
    BrickDefinition, BrickOverride, PipelineBrick,
)


class TestBrickDefinition:
    def test_minimal(self):
        bd = BrickDefinition(image="sonarsource/sonar-scanner-cli:latest")
        assert bd.executor == "woodpecker"
        assert bd.timeout_s == 3600

    def test_invalid_executor(self):
        with pytest.raises(ValidationError):
            BrickDefinition(
                image="img", executor="circleci",  # type: ignore[arg-type]
            )


class TestPipelineBrick:
    def test_sast_brick(self):
        b = PipelineBrick(
            id="b1", name="SAST Frontend", type="sast",
            source="owner/frontend",
            definition=BrickDefinition(image="sonarsource/sonar-scanner-cli:latest"),
        )
        assert b.type == "sast"
        assert b.source == "owner/frontend"

    def test_with_deps(self):
        b = PipelineBrick(
            id="b2", name="DAST Scan", type="dast",
            source="owner/app",
            definition=BrickDefinition(image="owasp/zap2docker-stable:latest"),
            depends_on=["b1"],
        )
        assert b.depends_on == ["b1"]

    def test_with_gates(self):
        b = PipelineBrick(
            id="b3", name="Gate Check", type="gate",
            source="internal",
            definition=BrickDefinition(image="internal/gate-checker:latest"),
            gates=["g1", "g2"],
        )
        assert b.gates == ["g1", "g2"]


class TestBrickOverride:
    def test_override(self):
        bo = BrickOverride(
            brick_id="b1",
            domain_id="d1",
            overrides_json={"timeout_s": 7200},
        )
        assert bo.brick_id == "b1"
        assert bo.domain_id == "d1"
        assert bo.overrides_json["timeout_s"] == 7200