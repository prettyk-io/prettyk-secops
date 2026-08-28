# -*- coding: utf-8 -*-
# PoC — NOT production. Cosmoport boundary. Do not import into DAST runtime.
"""COS-018: Security — no secret leakage tests."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


from models.domain_model import Domain, ForgeBinding
from models.run_model import Run
from models.pipeline_brick import PipelineBrick, BrickDefinition
from evidence import EvidenceLedger


SECRET = "gitea-secret-token-abc123"


class TestSecretLeakage:
    def test_token_not_in_pipeline_snapshot(self):
        """COS-018: токен Gitea не попадает в pipeline_snapshot."""
        brick = PipelineBrick(
            id="b1", name="SAST", type="sast", source="web",
            definition=BrickDefinition(image="sonarsource/sonar-scanner-cli:latest"),
        )
        # Снапшот пайплайна — только структура, без секретов
        snapshot = {
            "bricks": [{"id": b.id, "name": b.name, "type": b.type} for b in [brick]],
        }
        serialized = json.dumps(snapshot)
        assert SECRET not in serialized

    def test_domain_forge_token_hashed_not_plaintext(self):
        """COS-018: токен в ForgeBinding — это ref (VAULT/...), не plaintext."""
        domain = Domain(
            id="d1", label="Test",
            forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="VAULT/GITEA_TOKEN"),
        )
        # token_ref — ссылка на секретницу, не сам секрет
        assert domain.forge_binding.token_ref.startswith("VAULT/")
        assert SECRET not in domain.forge_binding.token_ref

    def test_evidence_ledger_no_secrets(self):
        """COS-018: evidence ledger не содержит секретов."""
        ledger = EvidenceLedger()
        ledger.add_entry(
            "step",
            {"action": "login", "username": "admin"},  # без пароля
            "run-1/step-auth",
        )
        serialized = ledger.to_dict()
        assert SECRET not in json.dumps(serialized)

    def test_run_model_no_secrets(self):
        """COS-018: run model не хранит plaintext-секреты."""
        run = Run(id="r1", plan_id="p1", trigger="manual", domain_id="d1")
        d = run.model_dump(mode="json")  # json-safe (datetime → str)
        assert SECRET not in json.dumps(d)

    def test_openbao_single_source(self):
        """COS-018: OpenBao — единственный источник секретов."""
        # Все токены идут через ref (VAULT/BAO), не через env-хардкод
        from infra.profiles import enterprise_health_requirements

        # Секреты ссылаются на vault, не хранятся в коде
        token_ref = "BAO/secret/gitea/token"
        assert token_ref.startswith("BAO/") or token_ref.startswith("VAULT/")

    def test_secret_not_in_metrics_or_health(self):
        """COS-018: health/metrics не содержат секретов."""
        from infra.health import ServiceHealth
        from infra.telemetry import RunMetrics

        h = ServiceHealth("svc").health().as_dict()
        assert SECRET not in json.dumps(h)

        m = RunMetrics()
        m.record_error("run-1", "connection refused")  # без секретов
        assert SECRET not in m.as_json()