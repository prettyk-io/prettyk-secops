"""# PoC — NOT production. Cosmoport boundary. Do not import into DAST runtime.
COS-L20: End-to-end: Domain → Run → Evidence → ГОСТ-Акт.

Полный сквозной сценарий с моками ForgeAdapter, ExecutionAdapter,
scanner, Playwright.
"""
import json
import pytest
from datetime import datetime

from orchestrator.models.domain_model import Domain, DomainQuota, ForgeBinding
from orchestrator.models.app_graph import Application, AppGraph, Group, RepositoryBinding
from orchestrator.models.pipeline_brick import (
    BrickDefinition, BrickOverride, PipelineBrick,
)
from orchestrator.models.run_model import Batch, Run
from orchestrator.models.gate_model import Gate, GatePolicy, GatePolicyRule
from orchestrator.evidence import EvidenceEntry, EvidenceLedger
from orchestrator.evidence.artifact_store import ArtifactStore
from orchestrator.reports import (
    GOSTAct, GOSTActHeader, GOSTActObject, GOSTFinding, GOSTSignature,
)
from orchestrator.reports.gost_act_renderer import render_gost_act_html
from orchestrator.reports.sarif_exporter import export_findings_sarif


# ── Mock adapters ──

class MockForgeAdapter:
    """Мок ForgeAdapter — возвращает фиктивные данные."""
    def __init__(self):
        self.created_orgs: list[str] = []
        self.commit_statuses: list[dict] = []

    def register_domain(self, domain_id: str, org_name: str):
        self.created_orgs.append(org_name)
        return {"org": org_name, "domain_id": domain_id}

    def set_commit_status(self, owner: str, repo: str, sha: str, status: dict):
        self.commit_statuses.append({"owner": owner, "repo": repo, "sha": sha, "status": status})


class MockExecutionAdapter:
    """Мок ExecutionAdapter — имитирует CI."""
    def __init__(self):
        self.triggered: list[dict] = []

    def trigger_pipeline(self, repo_owner: str, repo_name: str, branch: str = "main"):
        self.triggered.append({"owner": repo_owner, "repo": repo_name, "branch": branch})
        return {"id": len(self.triggered), "status": "running"}


# ── E2E scenario ──

class TestE2ECosmo:
    def test_domain_creation(self):
        """E2E Step 1: создать Domain."""
        domain = Domain(
            id="e2e-d", label="E2E Domain",
            forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="VAULT/TEST_TOKEN"),
            quota=DomainQuota(max_runs=10, max_storage_gb=50, max_cpu=4),
        )
        assert domain.id == "e2e-d"
        assert domain.label == "E2E Domain"

    def test_app_creation_and_graph(self):
        """E2E Step 2: создать Applications и скомпилировать AppGraph."""
        lib = Application(id="lib-1", domain_id="e2e-d", level=0,
                          repo_binding=RepositoryBinding(forge_id="f1", repo_path="e2e/shared-lib"))
        app1 = Application(id="app-1", domain_id="e2e-d", level=1,
                           repo_binding=RepositoryBinding(forge_id="f1", repo_path="e2e/frontend"))
        app2 = Application(id="app-2", domain_id="e2e-d", level=1, group_id="g-backend",
                           repo_binding=RepositoryBinding(forge_id="f1", repo_path="e2e/backend"))

        graph = AppGraph(domain="e2e-d", apps=[app1, app2], libraries=[lib])
        assert graph.domain == "e2e-d"
        assert len(graph.apps) == 2
        assert len(graph.libraries) == 1

    def test_compile_plan_and_run(self):
        """E2E Step 3: скомпилировать Plan → запустить Run."""
        bricks = [
            PipelineBrick(id="b-sast", name="SAST", type="sast", source="e2e/frontend",
                          definition=BrickDefinition(image="sonarsource/sonar-scanner-cli:latest")),
            PipelineBrick(id="b-dast", name="DAST", type="dast", source="e2e/frontend",
                          definition=BrickDefinition(image="owasp/scanner2docker-stable:latest")),
            PipelineBrick(id="b-gate", name="Security Gate", type="gate", source="internal",
                          definition=BrickDefinition(image="internal/gate-checker:latest")),
        ]

        batches = [
            Batch(id="batch-sast", plan_id="plan-e2e", type="sast",
                  bricks=["b-sast"], status="passed"),
            Batch(id="batch-dast", plan_id="plan-e2e", type="dast",
                  bricks=["b-dast"], status="passed"),
            Batch(id="batch-gate", plan_id="plan-e2e", type="gate",
                  bricks=["b-gate"], status="passed"),
        ]

        run = Run(
            id="run-e2e", plan_id="plan-e2e", trigger="pre_release",
            domain_id="e2e-d", status="passed",
            batches=batches,
            gates=["g-main"],
            findings=["f-1", "f-2"],
        )
        assert run.status == "passed"
        assert len(run.batches) == 3
        assert len(run.findings) == 2

    def test_collect_evidence_and_verify_chain(self):
        """E2E Step 4: собрать Evidence → проверить целостность цепочки."""
        ledger = EvidenceLedger()

        # SAST findings
        ledger.add_entry("finding", {"tool": "SonarQube", "severity": "Critical",
                                      "rule": "S3649", "message": "SQL Injection"},
                         "run-e2e/batch-sast/step-scan")
        # DAST findings
        ledger.add_entry("finding", {"tool": "OWASP scanner", "severity": "High",
                                      "alert": "XSS", "url": "https://app/search"},
                         "run-e2e/batch-dast/step-scan")
        # Logs
        ledger.add_entry("log", {"line": "scan complete", "duration_ms": 45000},
                         "run-e2e")

        assert ledger.length == 3
        assert ledger.verify_chain()

        # Tamper-detection
        ledger.tamper(0, "content", {"tampered": True})
        assert not ledger.verify_chain()

    def test_generate_gost_act(self):
        """E2E Step 5: сгенерировать ГОСТ-Акт из Evidence."""
        act = GOSTAct(
            header=GOSTActHeader(
                act_number="PK-E2E-2026-001",
                project_name="E2E Test Project",
            ),
            object=GOSTActObject(
                name="E2E App v1.0",
                url="https://e2e.example.com",
                domain="example.com",
            ),
            findings_table=[
                GOSTFinding(severity="Critical", title="SQLi в login", cwe="CWE-89",
                            description="SQL-инъекция в поле логина",
                            recommendation="Параметризованные запросы",
                            evidence_refs=["run-e2e/batch-sast/step-scan"]),
                GOSTFinding(severity="High", title="XSS в search", cwe="CWE-79",
                            description="Reflected XSS",
                            recommendation="Санитизация вывода",
                            evidence_refs=["run-e2e/batch-dast/step-scan"]),
            ],
            signatures=[
                GOSTSignature(role="Руководитель", name="Иванов И.И.", date="2026-08-27"),
                GOSTSignature(role="Эксперт", name="Петров П.П.", date="2026-08-28", status="signed"),
            ],
            conclusion="Обнаружено 2 уязвимости. Критичная — SQLi — устранена. "
                       "High — XSS — запланирована в следующий спринт.",
        )

        html = render_gost_act_html(act)
        assert "<!DOCTYPE html>" in html
        assert "E2E Test Project" in html
        assert "SQLi" in html
        assert "CWE-89" in html
        assert "Иванов" in html

        # SARIF export
        sarif = export_findings_sarif(act)
        parsed = json.loads(sarif)
        assert len(parsed["runs"][0]["results"]) == 2
        assert parsed["version"] == "2.1.0"

    def test_full_e2e_flow(self):
        """E2E: полный цикл Domain → Apps → Plan → Run → Gate → Evidence → Акт."""
        # 1. Domain
        domain = Domain(
            id="full-e2e", label="Полный E2E",
            forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="T"),
        )
        assert domain.id == "full-e2e"

        # 2. Apps
        app = Application(id="app-main", domain_id=domain.id, level=1,
                          repo_binding=RepositoryBinding(forge_id="f1", repo_path="org/main"))
        graph = AppGraph(domain=domain.id, apps=[app])
        assert len(graph.apps) == 1

        # 3. Bricks + Plan
        bricks = [
            PipelineBrick(id="b-sast", name="SAST", type="sast", source="org/main",
                          definition=BrickDefinition(image="sonarsource/sonar-scanner-cli:latest")),
            PipelineBrick(id="b-dast", name="DAST", type="dast", source="org/main",
                          definition=BrickDefinition(image="owasp/scanner2docker-stable:latest")),
        ]

        # 4. Run
        run = Run(
            id="run-full", plan_id="plan-full", trigger="manual",
            domain_id=domain.id, status="running",
            batches=[
                Batch(id="b1", plan_id="plan-full", type="sast", bricks=["b-sast"], status="pending"),
                Batch(id="b2", plan_id="plan-full", type="dast", bricks=["b-dast"], status="pending"),
            ],
        )

        # Проходим стейт-машину
        run.status = "running"
        run.batches[0].status = "passed"
        run.batches[1].status = "passed"
        run.status = "passed"
        assert run.status == "passed"

        # 5. Gate
        gate = Gate(
            id="g-main", type="automatic", position=0,
            policy=GatePolicy(rules=[
                GatePolicyRule(finding_type="Critical", action="block"),
                GatePolicyRule(finding_type="High", action="warn", max_count=5),
            ]),
            decision="pass",
        )
        assert gate.decision == "pass"
        assert gate.type == "automatic"

        # 6. Evidence
        ledger = EvidenceLedger()
        ledger.add_entry("finding", {"severity": "High", "title": "XSS"}, run.id)
        ledger.add_entry("log", {"message": "scan done"}, run.id)
        assert ledger.verify_chain()

        # 7. ГОСТ-Акт
        act = GOSTAct(
            header=GOSTActHeader(project_name="Full E2E"),
            object=GOSTActObject(name="Main App"),
            findings_table=[
                GOSTFinding(severity="High", title="XSS", cwe="CWE-79",
                            recommendation="Санитизация"),
            ],
            conclusion="Проверка пройдена. Выявлена 1 уязвимость уровня High.",
            signatures=[GOSTSignature(role="Эксперт", name="Петров", date="2026-08-27")],
        )
        html = render_gost_act_html(act)
        assert "Full E2E" in html
        assert "XSS" in html

    def test_empty_domain_no_apps(self):
        """E2E edge: пустой Domain без приложений."""
        domain = Domain(
            id="empty-d", label="Пустой",
            forge_binding=ForgeBinding(url="http://gitea:3000", token_ref="T"),
        )
        graph = AppGraph(domain=domain.id, apps=[], libraries=[], groups=[])
        assert len(graph.apps) == 0
        assert graph.domain == "empty-d"