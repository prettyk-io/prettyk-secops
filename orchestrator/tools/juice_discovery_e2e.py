import sys, json
sys.path.insert(0, "orchestrator")
from utils.discovery_element_extractor import extract_elements
from utils.discovery_candidate_builder import build_candidates
from utils.discovery_compiler import compile_wired

juice_dom = [
    {"tagName": "INPUT", "role": "", "properties": {"id": "emailControl", "type": "text"}, "name": "Email address field", "focusable": True},
    {"tagName": "INPUT", "role": "", "properties": {"id": "passwordControl", "type": "password"}, "name": "Field for the password", "focusable": True},
    {"tagName": "INPUT", "role": "", "properties": {"id": "repeatPasswordControl", "type": "password"}, "name": "Field to confirm the password", "focusable": True},
    {"tagName": "INPUT", "role": "", "properties": {"id": "securityAnswerControl", "type": "text", "placeholder": "Answer to your security question"}, "name": "Field for the answer to the security question", "focusable": True},
    {"tagName": "BUTTON", "role": "", "properties": {"id": "registerButton"}, "name": "Button to complete the registration", "focusable": True},
]

raw = extract_elements(juice_dom)
built = build_candidates(raw)
print(f"Extracted: {len(built)} elements")
for el in built:
    best = el["candidates"][0] if el["candidates"] else {"tier": "-", "value": "none"}
    print(f'  {el["accessible_name"]:50s} vclass={el["value_class"]:10s} tier={best["tier"]} val={best["value"][:70]}')

# Build full IR session and compile
ir = {
    "pages": [{
        "name": "Juice Shop Register",
        "url": "/#/register",
        "elements": [
            {
                "id": el.get("accessible_name", f"el_{i}"),
                "label": el.get("accessible_name", ""),
                "accessible_name": el.get("accessible_name", ""),
                "value_class": el.get("value_class", "unknown"),
                "candidates": el.get("candidates", []),
            }
            for i, el in enumerate(built)
        ],
    }],
    "target_url": "http://127.0.0.1:3000",
    "project_id": "juice-shop-discovery",
    "initiator": "Discovery Engine E2E",
}

wired = compile_wired(ir)
print(f"\nCompiled wired.json:")
print(f"  Pages: {len(wired['test_suites']['pages'])}")
for pid, page in wired["test_suites"]["pages"].items():
    print(f"    {pid}: {page['url']} ({len(page['elements'])} elements)")
    for el in page["elements"]:
        trust = el.get("_trust", "?")
        constructor = el.get("constructor", [])
        locator = constructor[0] if constructor else "?"
        print(f"      {el['label']:30s} trust={trust:20s} {locator}")
da = wired["test_suites"].get("data_module", {})
if da.get("auth"):
    print(f"  Auth bindings: {da['auth']}")
if da.get("dynamic"):
    print(f"  Dynamic bindings: {da['dynamic']}")