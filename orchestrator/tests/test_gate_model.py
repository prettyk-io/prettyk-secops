"""COS-L5: Тесты Security Gate модели."""
import pytest
from pydantic import ValidationError
from orchestrator.models.gate_model import (
    Gate, GatePolicy, GatePolicyRule,
)


class TestGatePolicyRule:
    def test_block_critical(self):
        r = GatePolicyRule(finding_type="Critical", action="block")
        assert r.action == "block"
        assert r.max_count is None

    def test_warn_with_limit(self):
        r = GatePolicyRule(
            finding_type="High", action="warn", max_count=5,
        )
        assert r.max_count == 5


class TestGate:
    def test_automatic_pass(self):
        g = Gate(
            id="g1", type="automatic", position=0,
            policy=GatePolicy(rules=[
                GatePolicyRule(finding_type="Critical", action="block"),
            ]),
        )
        assert g.type == "automatic"
        assert g.policy.rules[0].action == "block"

    def test_manual_gate_requires_decider(self):
        with pytest.raises(ValidationError):
            Gate(
                id="g1", type="manual", position=1, decision="pass",
                policy=GatePolicy(rules=[
                    GatePolicyRule(finding_type="Medium", action="warn"),
                ]),
            )

    def test_automatic_cannot_be_manual_required(self):
        with pytest.raises(ValidationError):
            Gate(
                id="g1", type="automatic", position=0,
                decision="manual_required",
                policy=GatePolicy(rules=[
                    GatePolicyRule(finding_type="Low", action="pass"),
                ]),
            )

    def test_empty_policy_rejected(self):
        with pytest.raises(ValidationError):
            GatePolicy(rules=[])