import sys, json
sys.path.insert(0, 'orchestrator')
from utils.discovery_element_extractor import extract_elements
from lab.discovery_session import (
    start_session, create_or_update_family,
    add_transition, stop_session, compile_session,
    route_from_url,
)

# Juice Shop registration form AX snapshot (from CDP)
register_elements = [
    {"tagName": "INPUT", "role": "textbox", "name": "Email address field",
     "properties": {"id": "emailControl", "type": "text"}, "focusable": True},
    {"tagName": "INPUT", "role": "textbox", "name": "Field for the password",
     "properties": {"id": "passwordControl", "type": "password"}, "focusable": True},
    {"tagName": "INPUT", "role": "textbox", "name": "Field to confirm the password",
     "properties": {"id": "repeatPasswordControl", "type": "password"}, "focusable": True},
    {"tagName": "SELECT", "role": "combobox", "name": "Selection list for the security question",
     "properties": {"id": ""}, "focusable": True},
    {"tagName": "INPUT", "role": "textbox", "name": "Field for the answer to the security question",
     "properties": {"id": "securityAnswerControl", "type": "text",
      "placeholder": "Answer to your security question"}, "focusable": True},
    {"tagName": "BUTTON", "role": "button", "name": "Button to complete the registration",
     "properties": {"id": "registerButton"}, "focusable": True},
]

# Login page AX snapshot (after redirect)
login_elements = [
    {"tagName": "INPUT", "role": "textbox", "name": "Text field for the login email",
     "properties": {"id": "email", "type": "text"}, "focusable": True},
    {"tagName": "INPUT", "role": "textbox", "name": "Text field for the login password",
     "properties": {"id": "password", "type": "password"}, "focusable": True},
    {"tagName": "BUTTON", "role": "button", "name": "Log in",
     "properties": {"id": "loginButton"}, "focusable": True},
]

print("=== Juice Shop Discovery E2E ===")
print()

s = start_session("http://127.0.0.1:3000/")
sid = s["session_id"]
print(f"Session: {sid}")

# 1. Extract registration form
raw_register = extract_elements(register_elements)
create_or_update_family(sid, 'pf_juice_register', '/#/register', raw_register,
                        persona_hash='anonymous')
print(f"Register page: {len(raw_register)} elements extracted")

# 2. Extract login page
raw_login = extract_elements(login_elements)
create_or_update_family(sid, 'pf_juice_login', '/#/login', raw_login,
                        persona_hash='anonymous')
print(f"Login page: {len(raw_login)} elements extracted")

# 3. Record transition: register → login
add_transition(
    sid,
    from_variant='sv_juice_register_main',
    action_type='click',
    action_target='registerButton',
    to_variant='sv_juice_login_main',
    url_change='/#/login',
    response_class='2xx',
)
print("Transition: register -> login recorded")

# 4. Stop + compile
r = stop_session(sid)
print(f"IR: {r['ir_path']}")

r2 = compile_session(sid)
wired = r2.get('wired', {})
print(f"Compile: ok={r2['ok']} mode={r2.get('compile_mode','fresh')}")
print()

pages = wired.get('test_suites', {}).get('pages', {})
for pid, page in pages.items():
    els = page.get('elements', [])
    print(f"Page {pid}: {page.get('url','')} ({len(els)} elements)")
    for el in els[:8]:
        trust = el.get('_trust', '?')
        label = el.get('label', '')
        ctor = el.get('constructor', ['?'])
        loc = ctor[0] if ctor else '?'
        print(f"  [{trust:20s}] {label[:40]:40s} {loc[:55]}")

da = wired.get('test_suites', {}).get('data_module', {})
auth = da.get('auth', {})
if auth:
    print(f"\nAuth bindings: {auth}")
dyn = da.get('dynamic', {})
if dyn:
    print(f"Dynamic bindings: {dyn}")

print(f"\n--- Incremental merge test (re-run) ---")
create_or_update_family(sid, 'pf_juice_register', '/#/register', raw_register,
                        persona_hash='anonymous')
r2b = compile_session(sid, existing_wired=wired)
print(f"Merge: ok={r2b['ok']} mode={r2b.get('compile_mode','?')}")