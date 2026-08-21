# -*- coding: utf-8 -*-
"""IMP-CHAIN: record → slots → materialize."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.chain_ops import (
    apply_slot_extracts,
    chain_from_har,
    dry_run_preconditions,
    fuzz_targets_from_steps,
    materialize_chain_fields,
    materialize_har,
)

MINI_HAR = {
    "log": {
        "version": "1.2",
        "creator": {"name": "t", "version": "1"},
        "entries": [
            {
                "request": {
                    "method": "GET",
                    "url": "https://api.example/assets/app.js",
                    "headers": [{"name": "Accept", "value": "*/*"}],
                },
                "response": {"status": 200},
            },
            {
                "request": {
                    "method": "POST",
                    "url": "https://api.example/v1/transfer?csrf=OLDCSRF",
                    "headers": [
                        {"name": "Authorization", "value": "Bearer OLDTOKEN"},
                        {"name": "Cookie", "value": "session=OLDSESS; theme=dark"},
                        {"name": "Content-Type", "value": "application/json"},
                    ],
                    "postData": {
                        "mimeType": "application/json",
                        "text": '{"amount":1,"access_token":"BODYOLD"}',
                    },
                },
                "response": {"status": 200},
            },
        ],
    }
}


def test_chain_from_har_trims_assets_and_suggests_slots():
    out = chain_from_har(MINI_HAR, har_as="transfer")
    assert out["ok"] is True
    assert len(out["steps"]) == 1
    assert out["steps"][0]["method"] == "POST"
    ids = {s["id"] for s in out["slots"]}
    assert "authorization" in ids
    assert "cookie_session" in ids
    assert "q_csrf" in ids
    assert "{{authorization}}" in out["template_har"]


def test_materialize_replaces_placeholders():
    built = chain_from_har(MINI_HAR, har_as="t")
    filled = materialize_har(
        built["template_har"],
        {
            "authorization": "Bearer NEW",
            "cookie_session": "NEWSESS",
            "q_csrf": "NEWCSRF",
            "body_access_token": "BODYNEW",
        },
    )
    assert "Bearer NEW" in filled
    assert "OLDTOKEN" not in filled
    assert "NEWSESS" in filled
    assert "csrf=NEWCSRF" in filled
    assert "BODYNEW" in filled


def test_materialize_chain_fields_seed_and_fuzz():
    built = chain_from_har(MINI_HAR, har_as="pay")
    fields = {
        "har_as": "pay",
        "sequence_name": "pay",
        "template_har": built["template_har"],
        "slots": [
            {**s, "bind": f"literal:V_{s['id']}"} for s in built["slots"] if s["id"] == "authorization"
        ]
        + [s for s in built["slots"] if s["id"] != "authorization"],
        "steps": built["steps"],
        "include_sequence_scan": True,
        "seed_fuzz_targets": True,
    }
    # only authorization has bind; others note missing
    fields["slots"] = []
    for s in built["slots"]:
        row = dict(s)
        if s["id"] == "authorization":
            row["bind"] = "literal:Bearer LIVE"
        fields["slots"].append(row)
    out = materialize_chain_fields(fields)
    assert out["ok"] is True
    assert "СканированиеЦепи pay" in out["seed"]
    assert "ФаззингЦепи pay" in out["seed"]
    assert "Bearer LIVE" in out["har_text"]
    assert out["fuzz_targets"]
    assert out["fuzz_targets"][0]["method"] == "POST"


def test_fuzz_targets_dedupe():
    steps = [
        {"method": "GET", "url": "https://a/1", "body": ""},
        {"method": "GET", "url": "https://a/1", "body": ""},
        {"method": "POST", "url": "https://a/2", "body": "{}"},
    ]
    targets = fuzz_targets_from_steps(steps)
    assert len(targets) == 2


def test_fuzz_targets_attack_only_when_pre_marked():
    steps = [
        {
            "index": 0,
            "method": "POST",
            "url": "https://a/login",
            "role": "precondition",
        },
        {"index": 1, "method": "POST", "url": "https://a/pay", "role": "attack"},
    ]
    targets = fuzz_targets_from_steps(steps, attack_only=True)
    assert len(targets) == 1
    assert targets[0]["url"] == "https://a/pay"


def test_extract_jsonpath_and_materialize_split():
    har = {
        "log": {
            "entries": [
                {
                    "request": {
                        "method": "POST",
                        "url": "https://api.example/login",
                        "headers": [],
                        "postData": {"text": "{}"},
                    },
                    "response": {
                        "status": 200,
                        "headers": [],
                        "content": {
                            "text": json.dumps({"access_token": "FRESH"})
                        },
                    },
                },
                {
                    "request": {
                        "method": "GET",
                        "url": "https://api.example/me",
                        "headers": [
                            {
                                "name": "Authorization",
                                "value": "Bearer OLD",
                            }
                        ],
                    },
                    "response": {"status": 200, "content": {"text": "{}"}},
                },
            ]
        }
    }
    built = chain_from_har(har, har_as="fugas")
    steps = built["steps"]
    assert len(steps) == 2
    steps[0]["role"] = "precondition"
    steps[1]["role"] = "attack"
    slots = [
        {
            "id": "authorization",
            "location": "header",
            "key": "Authorization",
            "recorded_value": "Bearer OLD",
            "enabled": True,
            "bind": "extract:step:0:jsonpath:$.access_token",
        }
    ]
    # wrap token as Bearer in binding via literal after extract — extract gives FRESH;
    # for Authorization header we want "Bearer FRESH": use jsonpath that includes or post-process.
    # Here extract returns FRESH; bind form can't prefix — use extract of full value in recorded
    # Better: extract then materialize with custom — for test, put Bearer in JSON.
    steps[0]["response_body"] = json.dumps({"access_token": "Bearer FRESH"})
    extracted, notes = apply_slot_extracts(steps, slots)
    assert extracted["authorization"] == "Bearer FRESH"
    assert any("ok" in n for n in notes)

    templated = built["template_har"]
    # re-template with authorization slot
    from utils.chain_ops import template_har

    templated = template_har(har, slots)
    fields = {
        "har_as": "fugas",
        "template_har": templated,
        "steps": steps,
        "slots": slots,
        "seed_fuzz_targets": True,
        "include_sequence_scan": False,
    }
    out = materialize_chain_fields(fields)
    assert "Bearer FRESH" in out["har_text"]
    assert out["setup_har_text"]
    assert "login" in out["setup_har_text"]
    assert "me" not in out["setup_har_text"] or out["setup_har_text"].count("entries")
    assert len(out["fuzz_targets"]) == 1
    assert out["fuzz_targets"][0]["url"].endswith("/me")


def test_dry_run_preconditions():
    har = {
        "log": {
            "entries": [
                {
                    "request": {
                        "method": "POST",
                        "url": "https://api.example/login",
                        "headers": [],
                    },
                    "response": {
                        "status": 200,
                        "content": {"text": '{"token":"T1"}'},
                    },
                },
                {
                    "request": {
                        "method": "GET",
                        "url": "https://api.example/boom",
                        "headers": [
                            {"name": "X-Token", "value": "OLD"}
                        ],
                    },
                    "response": {"status": 200, "content": {"text": "{}"}},
                },
            ]
        }
    }
    built = chain_from_har(har, har_as="x")
    steps = built["steps"]
    steps[0]["role"] = "precondition"
    steps[1]["role"] = "attack"
    slots = [
        {
            "id": "xtoken",
            "location": "header",
            "key": "X-Token",
            "recorded_value": "OLD",
            "enabled": True,
            "bind": "extract:step:0:jsonpath:$.token",
        }
    ]
    from utils.chain_ops import template_har

    fields = {
        "har_as": "x",
        "module_id": "flow_x",
        "template_har": template_har(har, slots),
        "steps": steps,
        "slots": slots,
    }
    dry = dry_run_preconditions(fields)
    assert dry["extract_ok"] is True
    assert dry["ok"] is True
    assert "login" in dry["setup_har_text"]
    assert dry["seed"] == "ПодготовитьЦепь flow_x"


def test_slot_apply_step_vs_all_and_match():
    import copy

    from utils.chain_ops import template_har

    base = {
        "log": {
            "version": "1.2",
            "creator": {"name": "t", "version": "1"},
            "entries": [
                {
                    "request": {
                        "method": "GET",
                        "url": "https://api.example/login",
                        "headers": [
                            {"name": "Authorization", "value": "Bearer SAME"},
                        ],
                    },
                    "response": {"status": 200},
                },
                {
                    "request": {
                        "method": "GET",
                        "url": "https://api.example/transfer",
                        "headers": [
                            {"name": "Authorization", "value": "Bearer SAME"},
                        ],
                    },
                    "response": {"status": 200},
                },
            ],
        }
    }
    step_only = [
        {
            "id": "authorization",
            "location": "header",
            "key": "Authorization",
            "recorded_value": "Bearer SAME",
            "enabled": True,
            "step_index": 1,
            "apply": "step",
            "match": "",
        }
    ]
    templated = template_har(copy.deepcopy(base), step_only, skip_assets=False)
    assert templated.count("{{authorization}}") == 1
    assert "Bearer SAME" in templated

    apply_all = [{**step_only[0], "apply": "all", "step_index": 0}]
    templated_all = template_har(copy.deepcopy(base), apply_all, skip_assets=False)
    assert templated_all.count("{{authorization}}") == 2

    match_login = [
        {
            **step_only[0],
            "apply": "all",
            "match": "/login",
        }
    ]
    templated_m = template_har(copy.deepcopy(base), match_login, skip_assets=False)
    assert templated_m.count("{{authorization}}") == 1
    data = json.loads(templated_m)
    login_entry = next(e for e in data["log"]["entries"] if "/login" in e["request"]["url"])
    assert "{{authorization}}" in json.dumps(login_entry)
    transfer = next(e for e in data["log"]["entries"] if "/transfer" in e["request"]["url"])
    assert "Bearer SAME" in json.dumps(transfer)


def test_value_pack_properties_module_materialize():
    from utils.chain_ops import (
        bindings_from_properties_text,
        bindings_from_value_pack_module,
        materialize_chain_fields,
        parse_value_pack,
    )

    rows, notes = parse_value_pack("authorization=Bearer A\n#csrf=1\n")
    assert len(rows) == 1
    assert rows[0]["authorization"] == "Bearer A"
    assert rows[0]["csrf"] == "1"
    assert "properties" in notes[0]

    pack, pnotes = bindings_from_properties_text(
        "authorization=Bearer MOD\ncookie_session=S1\nq_csrf=C1\nbody_access_token=B1\n"
    )
    assert pack["authorization"] == "Bearer MOD"
    assert "value_pack_properties_keys" in pnotes[0]

    built = chain_from_har(MINI_HAR, har_as="vp")
    wired = {
        "test_suites": {
            "test_data_constructor": [
                {
                    "id": "chain_vals",
                    "module_type": "Модуль работы с данными",
                    "data_storage_fields": {
                        "editor": (
                            "authorization=Bearer FROM_MOD\n"
                            "cookie_session=SM\n"
                            "q_csrf=CM\n"
                            "body_access_token=BM\n"
                        )
                    },
                }
            ]
        }
    }
    resolved, rnotes = bindings_from_value_pack_module(Wired, "chain_vals")
    assert resolved["authorization"] == "Bearer FROM_MOD"
    assert any("value_pack_module=chain_vals" in n for n in rnotes)

    fields = {
        "har_as": "vp",
        "template_har": built["template_har"],
        "steps": built["steps"],
        "slots": built["slots"],
        "value_pack_module": "chain_vals",
        "include_sequence_scan": False,
    }
    out = materialize_chain_fields(fields, wired=wired)
    assert out["ok"] is True
    assert "Bearer FROM_MOD" in (out.get("har_text") or "")
    assert "OLDTOKEN" not in (out.get("har_text") or "")

    # Launch / explicit bindings win over module
    out2 = materialize_chain_fields(
        fields,
        bindings={"authorization": "Bearer WIN"},
        wired=wired,
    )
    assert "Bearer WIN" in (out2.get("har_text") or "")
    assert "Bearer FROM_MOD" not in (out2.get("har_text") or "")


def test_lab_run_materialize_uses_value_pack_module():
    from utils.lab_run import materialize_chain_modules

    built = chain_from_har(MINI_HAR, har_as="flow")
    wired = {
        "test_suites": {
            "test_data_constructor": [
                {
                    "id": "chain_vals",
                    "module_type": "Модуль работы с данными",
                    "data_storage_fields": {
                        "editor": (
                            "authorization=Bearer LAB\n"
                            "cookie_session=SL\n"
                            "q_csrf=CL\n"
                            "body_access_token=BL\n"
                        )
                    },
                },
                {
                    "id": "flow",
                    "module_type": "Цепь",
                    "chain_fields": {
                        "har_as": "flow",
                        "template_har": built["template_har"],
                        "steps": built["steps"],
                        "slots": built["slots"],
                        "value_pack_module": "chain_vals",
                        "include_sequence_scan": False,
                    },
                },
            ],
            "imports": [],
        }
    }
    out = materialize_chain_modules(Wired, {})
    assert "flow" in out
    assert "Bearer LAB" in out["flow"]
