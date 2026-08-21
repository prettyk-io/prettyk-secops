import sys, json
sys.path.insert(0, 'orchestrator')
from utils.discovery_element_extractor import extract_elements
from lab.discovery_session import start_session, create_or_update_family, stop_session, compile_session

elements = [
    {"tagName": "INPUT", "role": "", "properties": {"id": "emailControl", "type": "text"}, "name": "Email address field", "focusable": True},
    {"tagName": "INPUT", "role": "", "properties": {"id": "passwordControl", "type": "password"}, "name": "Field for the password", "focusable": True},
    {"tagName": "INPUT", "role": "", "properties": {"id": "repeatPasswordControl", "type": "password"}, "name": "Field to confirm the password", "focusable": True},
    {"tagName": "INPUT", "role": "", "properties": {"id": "securityAnswerControl", "type": "text", "placeholder": "Answer to your security question"}, "name": "Field for the answer", "focusable": True},
    {"tagName": "BUTTON", "role": "", "properties": {"id": "registerButton"}, "name": "Button to complete the registration", "focusable": True},
]

s = start_session("http://127.0.0.1:3000/#/register")
sid = s["session_id"]
print(f"SESSION: {sid}")

raw = extract_elements(elements)
create_or_update_family(sid, 'pf_juice_register', '/#/register', raw, persona_hash='anonymous')

r = stop_session(sid)
print(f"STOP: ok={r['ok']} path={r.get('ir_path','')}")

r2 = compile_session(sid)
wired = r2.get('wired', {})
print(f"COMPILE: ok={r2['ok']}")

pages = wired.get('test_suites', {}).get('pages', {})
for pid, page in pages.items():
    els = page.get('elements', [])
    print(f"  Page '{pid}': {page.get('url','')} ({len(els)} elements)")
    for el in els:
        trust = el.get('_trust', '?')
        label = el.get('label', '')
        ctor = el.get('constructor', ['?'])[0] if el.get('constructor') else '?'
        print(f"    [{trust:20s}] {label[:35]:35s} {ctor[:55]}")

da = wired.get('test_suites', {}).get('data_module', {})
auth = da.get('auth', {})
if auth:
    print(f"  Auth bindings: {auth}")
dyn = da.get('dynamic', {})
if dyn:
    print(f"  Dynamic bindings: {dyn}")

ir_path = f"reports/live/discovery_{sid}.json"
print(f"\nIR artifact: {ir_path}")