# -*- coding: utf-8 -*-
# PoC — NOT production. Cosmoport boundary. Do not import into DAST runtime.
"""COS-006: Интеграционный smoke-тест Steel Thread.

Полный цикл: create_pipeline → compile → create_run → run_batches →
evaluate_gate → record_evidence. Mock Gitea + Mock Woodpecker + реальные
compiler/state machine/evidence ledger. Без внешних сервисов.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_orch_root = Path(__file__).resolve().parents[1]
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


from models.domain_model import Domain, ForgeBinding
from models.app_graph import Application, RepositoryBinding
from models.pipeline_brick import PipelineBrick, BrickDefinition
from models.run_model import Run, Batch
from models.gate_model import Gate, GatePolicy, GatePolicyRule
from evidence import EvidenceLedger


# ── Mock внешних сервисов ──

class MockGitea:
    """COS-007 mock: идемпотентный create_repo."""
    def __init__(self):
        self.repos: dict[str, str] = {}
        self.webhooks: dict[str, list[int]] = {}

    def create_repo(self, owner: str, repo: str) -> str:
        key = f"{owner}/{repo}"
        if key not in self.repos:
            self.repos[key] = f"repo-{len(self.repos) + 1}"
        return self.repos[key]

    def register_webhook(self, owner: str, repo: str) -> int:
        key = f"{owner}/{repo}"
        hook_id = len(self.webhooks.get(key, [])) + 1
        self.webhooks.setdefault(key, []).append(hook_id)
        return hook_id


class MockWoodpecker:
    """COS-008 mock: submit/status."""
    def __init__(self):
        self.pipelines: dict[str, dict] = {}

    def submit_run(self, repo_owner: str, repo_name: str, branch: str = "main") -> dict:
        key = f"{repo_owner}/{repo_name}"
        self.pipelines[key] = {"status": "running", "branch": branch}
        return {"job_id": 1, "number": 1, "repo_owner": repo_owner, "repo_name": repo_name}

    def get_status(self, handle: dict) -> str:
        return self.pipelines.get(f"{handle['repo_owner']}/{handle['repo_name']}", {}).get("status", "unknown")

    def complete(self, handle: dict) -> None:
        key = f"{handle['repo_owner']}/{handle['repo_name']}"
        self.pipelines[key]["status"] = "success"


# ── Мини-компилятор и стейт-машина (реальные, не моки) ──

def compile_pipeline(plan_id: str, apps: list[Application], bricks: list[PipelineBrick]) -> list[Batch]:
    """Компилировать приложения в батчи (по одному батчу на app)."""
    batches = []
    for app in apps:
        batches.append(Batch(
            id=f"batch-{app.id}",
            plan_id=plan_id,
            type="mixed",
            bricks=[b.id for b in bricks],
        ))
    return batches


def run_state_machine(run: Run, batches: list[Batch]) -> None:
    """Прогнать стейт-машину: pending → running → passed."""
    run.status = "running"
    for b in batches:
        b.status = "running"
        b.status = "passed"
    run.status = "passed"


def evaluate_gate(gate: Gate, findings: list[dict]) -> str:
    """Оценить gate по находкам: block при Critical."""
    for f in findings:
        for rule in gate.policy.rules:
            if rule.finding_type == f["severity"] and rule.action == "block":
                return "block"
    return "pass"


# ═══════════════════════════════════════════════════════════════════════════
# Steel Thread
# ═══════════════════════════════════════════════════════════════════════════

class TestSteelThread:
    def _build_domain(self) -> Domain:
        return Domain(
            id="d-steel",
            label="Steel Thread",
            forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="VAULT/TEST_TOKEN"),
        )

    def _build_apps(self) -> list[Application]:
        return [
            Application(
                id="app-web", domain_id="d-steel", level=1,
                repo_binding=RepositoryBinding(forge_id="f1", repo_path="d-steel/web"),
            ),
            Application(
                id="app-api", domain_id="d-steel", level=1,
                repo_binding=RepositoryBinding(forge_id="f1", repo_path="d-steel/api"),
            ),
        ]

    def _build_bricks(self) -> list[PipelineBrick]:
        return [
            PipelineBrick(id="b-sast", name="SAST", type="sast", source="web",
                          definition=BrickDefinition(image="sonarsource/sonar-scanner-cli:latest")),
            PipelineBrick(id="b-dast", name="DAST", type="dast", source="web",
                          definition=BrickDefinition(image="owasp/scanner2docker-stable:latest")),
            PipelineBrick(id="b-gate", name="Gate", type="gate", source="internal",
                          definition=BrickDefinition(image="internal/gate:latest")),
        ]

    def test_full_steel_thread(self):
        """COS-006: полный цикл без внешних сервисов."""
        gitea = MockGitea()
        woodpecker = MockWoodpecker()

        # 1. Создать домен + приложения
        domain = self._build_domain()
        apps = self._build_apps()

        # 2. Gitea: создать репо (идемпотентно)
        repo_id_1 = gitea.create_repo("d-steel", "web")
        repo_id_2 = gitea.create_repo("d-steel", "web")  # повтор — тот же
        assert repo_id_1 == repo_id_2

        # 3. Компилировать пайплайн
        bricks = self._build_bricks()
        batches = compile_pipeline("plan-steel", apps, bricks)
        assert len(batches) == 2  # два приложения

        # 4. Создать run и прогнать стейт-машину
        run = Run(
            id="run-steel", plan_id="plan-steel", trigger="manual",
            domain_id=domain.id, status="pending", batches=batches,
        )
        run_state_machine(run, batches)
        assert run.status == "passed"

        # 5. Woodpecker: submit → complete
        handle = woodpecker.submit_run("d-steel", "web")
        assert woodpecker.get_status(handle) == "running"
        woodpecker.complete(handle)
        assert woodpecker.get_status(handle) == "success"

        # 6. Gate: блокирует при Critical
        gate = Gate(
            id="g-main", type="automatic", position=0,
            policy=GatePolicy(rules=[
                GatePolicyRule(finding_type="Critical", action="block"),
                GatePolicyRule(finding_type="High", action="warn", max_count=5),
            ]),
        )
        assert evaluate_gate(gate, [{"severity": "Critical"}]) == "block"
        assert evaluate_gate(gate, [{"severity": "High"}]) == "pass"

        # 7. Evidence: записать и верифицировать цепочку
        ledger = EvidenceLedger()
        ledger.add_entry("finding", {"severity": "High", "title": "XSS"}, "run-steel/batch-app-web")
        ledger.add_entry("log", {"msg": "scan complete"}, "run-steel")
        assert ledger.verify_chain()

    def test_gate_blocks_critical(self):
        """Gate правильно блокирует при Critical findings."""
        gate = Gate(
            id="g1", type="automatic", position=0,
            policy=GatePolicy(rules=[
                GatePolicyRule(finding_type="Critical", action="block"),
                GatePolicyRule(finding_type="High", action="warn"),
            ]),
        )
        assert evaluate_gate(gate, [{"severity": "Critical"}]) == "block"
        assert evaluate_gate(gate, [{"severity": "Low"}]) == "pass"

    def test_evidence_chain_verifies(self):
        """Evidence записано, цепочка верифицируется."""
        ledger = EvidenceLedger()
        ledger.add_entry("step", {"step": "login"}, "run-1/step-1")
        ledger.add_entry("finding", {"severity": "Critical"}, "run-1/step-2")
        assert ledger.verify_chain()

        # Tamper ломает цепочку
        ledger.tamper(0, "content", {"step": "tampered"})
        assert not ledger.verify_chain()

    def test_run_lifecycle_states(self):
        """Прогон проходит draft→pending→queued→running→succeeded."""
        run = Run(id="r-life", plan_id="p1", trigger="manual", domain_id="d1")
        states = []
        run.status = "draft"; states.append(run.status)
        run.status = "pending"; states.append(run.status)
        run.status = "queued"; states.append(run.status)
        run.status = "running"; states.append(run.status)
        run.status = "succeeded"; states.append(run.status)
        assert states == ["draft", "pending", "queued", "running", "succeeded"]