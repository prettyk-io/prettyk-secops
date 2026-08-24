"""AutoTest — launch reference Juice Shop check via Playground API.
Usage: py autotest_launch.py [--wait]
"""
import json, sys, time, requests

PLAYGROUND = "http://127.0.0.1:8765"
LIVE = "http://127.0.0.1:8767"
WIRED_PATH = "wired/autotest/wired-full.json"
DM_PATH = "wired/autotest/resources/data_module.txt"

def load(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

# 1. Load wired
wired = json.loads(load(WIRED_PATH))

# 2. Load data_module resource
dm = load(DM_PATH)

# 3. Ensure playground is alive
try:
    r = requests.get(f"{PLAYGROUND}/api/health", timeout=3)
    print(f"Playground health: {r.status_code}")
except:
    print("ERROR: Playground :8765 not reachable")
    sys.exit(1)

# 4. Start run
body = {
    "wired": wired,
    "check_id": "autotest-mt4ipsbt-7mbdyo",
    "resource_contents": {"data_module": dm},
    "owner_user_id": "admin",
}

print(f"POST {PLAYGROUND}/api/run/start ...")
r = requests.post(f"{PLAYGROUND}/api/run/start", json=body, timeout=15)

result = r.json()
print(f"Response {r.status_code}: ok={result.get('ok')}, run_id={result.get('run_id')}, phase={result.get('phase')}")

if not result.get("ok"):
    print("ERROR:", result.get("error"))
    sys.exit(1)

run_id = result["run_id"]
print(f"\n=== RUN STARTED: {run_id} ===")
print(f"Live monitor: {LIVE}/?run_id={run_id}")
print()

# 5. Poll until done (if --wait)
if "--wait" not in sys.argv:
    sys.exit(0)

print("Polling for completion...")
deadline = time.time() + 30 * 60  # 30 min
while time.time() < deadline:
    time.sleep(10)
    try:
        s = requests.get(f"{PLAYGROUND}/api/run/status", timeout=5).json()
        phase = s.get("phase", "?")
        exit_code = s.get("exit_code")
        pid = s.get("pid", "")
        print(f"  [{time.strftime('%H:%M:%S')}] phase={phase} exit={exit_code} pid={pid}")
        if phase in ("finished", "idle"):
            print(f"\n=== RUN FINISHED: exit_code={exit_code} ===")
            break
    except Exception as e:
        print(f"  poll error: {e}")

print("\nDone.")