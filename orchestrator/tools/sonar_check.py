import json, urllib.request, base64
cred = base64.b64encode(b'admin:thereIsNoShameInIt#1').decode()
files = [
    'prettyk-backend:orchestrator/utils/discovery_compiler.py',
    'prettyk-backend:orchestrator/utils/discovery_element_extractor.py',
    'prettyk-backend:orchestrator/utils/discovery_candidate_builder.py',
    'prettyk-backend:orchestrator/utils/baseline_delta.py',
    'prettyk-backend:orchestrator/utils/finding_identity.py',
    'prettyk-frontend:frontend/src/admin/BaselineDelta.tsx',
    'prettyk-frontend:frontend/src/admin/PreflightAdvisoryStrip.tsx',
    'prettyk-frontend:frontend/src/studio/ScenarioPhaseFolder.tsx',
]
ck = ','.join(files)
url = f'http://127.0.0.1:9000/api/issues/search?projectKeys=prettyk-backend,prettyk-frontend&statuses=OPEN&ps=100&componentKeys={ck}'
req = urllib.request.Request(url, headers={'Authorization': f'Basic {cred}'})
with urllib.request.urlopen(req, timeout=10) as r:
    data = json.load(r)
by_file = {}
for i in data['issues']:
    c = i['component'].split(':')[-1]
    sev = i['severity']
    rule = i['rule'].split(':')[-1]
    msg = i['message'][:120]
    line = i.get('line', '?')
    if c not in by_file:
        by_file[c] = []
    by_file[c].append(f'  [{sev}] S{rule}:{line} | {msg}')
for fname, issues in sorted(by_file.items()):
    short = fname.split('/')[-1]
    print(f'{short}: {len(issues)} issues')
    for iss in issues:
        print(iss)
    print()
print(f'total: {data["total"]}')