"""Quick test of AutomationRunner."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "orchestrator"))

from consumer.automation_runner import AutomationRunner

fixture = Path(__file__).resolve().parent.parent / "orchestrator" / "consumer" / "fixtures" / "adm0_contract_proof.json"
runner = AutomationRunner(str(fixture), results_dir="reports/adm0_auto_test", headless=True)
results = runner.run()

for r in results:
    print("Scenario:", r.scenario_name, "| OK:", r.ok, "| Steps:", r.passed_steps, "/", r.total_steps)
    for step in r.steps:
        status = "PASS" if step["ok"] else "FAIL"
        print("  [%s] %s (%sms)" % (status, step["description"], step["elapsed_ms"]))
        if step.get("error"):
            print("         Error:", step["error"])

print("DONE")