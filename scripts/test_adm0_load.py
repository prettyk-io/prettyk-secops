"""Minimal test — just load Wired, no browser."""
import sys, json, logging
from pathlib import Path

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(message)s")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "orchestrator"))

from models.wired import Wired

fixture = Path(__file__).resolve().parent.parent / "orchestrator" / "consumer" / "fixtures" / "adm0_contract_proof.json"
print("Loading:", fixture)
data = json.loads(fixture.read_text(encoding="utf-8"))
print("Data keys:", list(data.keys()))

from models.wired import strip_legacy_wired_dict
data, _ = (lambda d: (strip_legacy_wired_dict(d), {}))(data) if callable(strip_legacy_wired_dict) else (data, {})
print("After strip:", list(data.keys()) if data else "None")

wired = Wired.model_validate(data)
print("Wired loaded. Scenarios:", len(wired.test_suites.scenarios) if wired.test_suites else 0)
print("DONE")