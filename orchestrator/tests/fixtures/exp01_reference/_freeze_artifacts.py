"""Collect and freeze all baseline artifacts for EXP-01."""
import json, os, sys, requests, shutil

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE, '..', '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'orchestrator'))

os.environ['PK_DEFECTDOJO_URL'] = 'http://127.0.0.1:8081'
os.environ['PK_DEFECTDOJO_TOKEN'] = 'dc8ad25a2685b4e5b65603c67925914559b3d28b'

# 1. Dojo findings full export
from utils.dojo_findings import fetch_findings_for_project
dojo_result = fetch_findings_for_project('exp01-baseline')
with open(os.path.join(BASE, 'dojo_baseline_findings.json'), 'w', encoding='utf-8') as f:
    json.dump(dojo_result, f, ensure_ascii=False, indent=2)
print(f"Dojo findings: {dojo_result.get('findings_n')} saved")

# 2. Spider URLs from ZAP
zap_urls = []
try:
    r = requests.get('http://127.0.0.1:8080/JSON/core/view/urls/', timeout=15)
    data = r.json()
    zap_urls = data.get('urls', []) if isinstance(data, dict) else []
except Exception as e:
    print(f"Spider URLs WARN: {e}")
with open(os.path.join(BASE, 'spider_urls.json'), 'w', encoding='utf-8') as f:
    json.dump({'urls': zap_urls, 'count': len(zap_urls)}, f, ensure_ascii=False, indent=2)
print(f"Spider URLs: {len(zap_urls)} saved")

# 3. ZAP raw alerts (paginated)
all_alerts = []
try:
    start = 0
    while True:
        r = requests.get(
            f'http://127.0.0.1:8080/JSON/core/view/alerts/?start={start}&count=500',
            timeout=60
        )
        data = r.json()
        batch = data.get('alerts', [])
        if not batch:
            break
        all_alerts.extend(batch)
        if len(batch) < 500:
            break
        start += len(batch)
except Exception as e:
    print(f"Raw alerts WARN: {e}")
with open(os.path.join(BASE, 'zap_raw_alerts.json'), 'w', encoding='utf-8') as f:
    json.dump({'alerts': all_alerts, 'count': len(all_alerts)}, f, ensure_ascii=False, indent=2)
print(f"ZAP raw alerts: {len(all_alerts)} saved")

# 4. Run summary snapshot
summary_path = os.path.join(ROOT, 'run_summary.json')
if os.path.exists(summary_path):
    shutil.copy2(summary_path, os.path.join(BASE, 'run_summary.json'))
    print("Run summary copied")

# 5. Baseline collapse stats
from core.finding_collapse import collapse_findings
collapse = collapse_findings(all_alerts)
print(f"\n=== BASELINE METRICS ===")
print(f"Raw alerts: {len(all_alerts)}")
print(f"Collapsed clusters: {len(collapse.clusters)}")
print(f"Systemic clusters: {collapse.systemic_clusters}")
cr = max(len(collapse.clusters), 1)
print(f"Compression ratio: {len(all_alerts)} -> {len(collapse.clusters)} ({len(all_alerts) / cr:.1f}x)")
print(f"Severity breakdown: {collapse.totals}")
for c in collapse.clusters:
    print(f"  [{c.severity}] {c.title} (x{c.instance_count}) {'SYSTEMIC' if c.systemic else ''}")