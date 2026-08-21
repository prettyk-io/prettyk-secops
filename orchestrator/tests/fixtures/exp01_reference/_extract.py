import json, os, shutil

with open('reports/live/checks_registry.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

item = [i for i in d.get('items', []) if i.get('check_id') == '39f0eaa3-9f48-45bc-9042-d56fa5f8b217'][0]
wired = item.get('wired')

out_dir = 'orchestrator/tests/fixtures/exp01_reference'
os.makedirs(out_dir, exist_ok=True)
os.makedirs(f'{out_dir}/resources', exist_ok=True)

src = 'orchestrator/manifests/lab/resources/r_2.txt'
dst = f'{out_dir}/resources/r_2.txt'
if os.path.exists(src):
    shutil.copy2(src, dst)
    print(f'Copied r_2.txt -> {dst}')
else:
    print(f'WARNING: r_2.txt not found at {src}')

wired['meta']['project_id'] = 'exp01-baseline'
wired['infrastructure']['debug_mode'] = True
wired['infrastructure']['browser_type'] = 'chrome-headless'

out_path = f'{out_dir}/Wired.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(Wired, f, ensure_ascii=False, indent=2)

print(f'Saved -> {out_path}')
print(f'project_id: {wired["meta"]["project_id"]}')
print(f'datasets: {[s["scenario_name"] for s in wired["test_suites"]["scenarios"]]}')
print(f'debug_mode: {wired["infrastructure"].get("debug_mode")}')