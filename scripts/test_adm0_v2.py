"""Minimal test -- load Wired, launch browser, run scenario."""
import sys, json, logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("test")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "orchestrator"))

from models.wired import Wired

fixture = Path(__file__).resolve().parent.parent / "orchestrator" / "consumer" / "fixtures" / "adm0_contract_proof.json"
log.info("Loading fixture: %s", fixture)

data = json.loads(fixture.read_text(encoding="utf-8"))
# Wired model has built-in validator that handles flat {regulation, editor}
wired = Wired.model_validate(data)
log.info("Wired loaded. Scenarios: %d", len(wired.test_suites.scenarios))

for scenario in wired.test_suites.scenarios:
    log.info("Scenario: %s (%d steps)", scenario.scenario_name, len(scenario.steps))
    for step in scenario.steps:
        log.info("  Step: %s", step.constructor)

# Now try actual run
from consumer.automation_runner import AutomationRunner

runner = AutomationRunner(str(fixture), results_dir="reports/adm0_test", headless=True)
results = runner.run()

for r in results:
    log.info("Result: %s | OK=%s | %d/%d passed", r.scenario_name, r.ok, r.passed_steps, r.total_steps)
    for step in r.steps:
        status = "PASS" if step["ok"] else "FAIL"
        log.info("  [%s] %s (%sms)", status, step["description"], step["elapsed_ms"])
        if step.get("error"):
            log.info("    Error: %s", step["error"])

log.info("DONE")