import sys, json
sys.path.insert(0, 'orchestrator')
from utils.discovery_element_extractor import extract_elements
from lab.discovery_session import create_or_update_family, stop_session, compile_session

sid = 'disc_0096a3f4bcf4'
family_id = 'pf_juice_register'

elements = [
    {"tagName": "INPUT", "role": "", "properties": {"id": "emailControl", "type": "text"}, "name": "Email address field", "focusable": True},
    {"tagName": "INPUT", "role": "", "properties": {"id": "passwordControl", "type": "password"}, "name": "Field for the password", "focusable": True},
    {"tagName": "INPUT", "role": "", "properties": {"id": "repeatPasswordControl", "type": "password"}, "name": "Field to confirm the password", "focusable": True},
    {"tagName": "INPUT", "role": "", "properties": {"id": "securityAnswerControl", "type": "text", "placeholder": "Answer to your security question"}, "name": "Field for the answer", "focusable": True},
    {"tagName": "BUTTON", "role": "", "properties": {"id": "registerButton"}, "name": "Button to complete the registration", "focusable": True},
]

raw = extract_elements(elements)
create_or_update_family(sid, family_id, '/#/register', raw, persona_hash='anonymous')

r = stop_session(sid)
print(f"STOP: ok={r['ok']} path={r.get('ir_path','')}")

r2 = compile_session(sid)
wired = r2.get('wired', {})
print(f"COMPILE: ok={r2['ok']}")
pages = wired.get('test_suites', {}).get('pages', {})
for pid, page in pages.items():
    print(f"  Page {pid}: {page.get('url','')} ({len(page.get('elements',[]))} elements)")
    for el in page.get('elements', [])[:7]:
        print(f"    [{el.get('_trust','')}] {el.get('label','')[:40]}  {el.get('constructor',[''])[0][:50]}")
da = wired.get('test_suites', {}).get('data_module', {})
if da.get('auth'):
    print(f"  Auth: {da['auth']}")
if da.get('dynamic'):
    print(f"  Dynamic: {da['dynamic']}")
print(f"\nIR saved: reports/live/discovery_{sid}.json")