# -*- coding: utf-8 -*-
"""ВыполнитьЦепь / СканированиеЦепи / РасследованиеЦепи (mock ZAP)."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.zap_adapter import ZapAdapter
from core.errors import WiredError
from core.method_id import ensure_wire, lookup_method_id
from utils.chain_investigate import seed_prettyk_investigate_chain
from utils.chain_ops import chain_from_har
from utils.chain_runtime import (
    resolve_chain_arg,
    seed_prettyk_execute_chain,
    seed_prettyk_scan_chain,
)


MINI = {
    "log": {
        "version": "1.2",
        "creator": {"name": "t", "version": "1"},
        "entries": [
            {
                "request": {
                    "method": "GET",
                    "url": "https://api.example/v1/me",
                    "headers": [
                        {"name": "Authorization", "value": "Bearer OLD"},
                    ],
                },
                "response": {"status": 200},
            }
        ],
    }
}


def test_method_id_wire():
    assert lookup_method_id("ВыполнитьЦепь") == ("zap", "execute_chain_module")
    assert lookup_method_id("СканированиеЦепи") == ("zap", "scan_chain_module")
    assert lookup_method_id("РасследованиеЦепи") == ("zap", "investigate_chain_module")
    assert lookup_method_id("ПодготовитьЦепь") == ("zap", "prepare_chain_module")
    assert ensure_wire("ВыполнитьЦепь pay") == "zap|execute_chain_module|pay"
    assert ensure_wire("СканированиеЦепи pay") == "zap|scan_chain_module|pay"
    assert ensure_wire("РасследованиеЦепи pay") == "zap|investigate_chain_module|pay"
    assert ensure_wire("ПодготовитьЦепь pay") == "zap|prepare_chain_module|pay"


def test_seed_prettyk():
    assert seed_prettyk_execute_chain("pay") == "ВыполнитьЦепь pay"
    assert seed_prettyk_scan_chain("pay") == "СканированиеЦепи pay"
    assert seed_prettyk_investigate_chain("pay") == "РасследованиеЦепи pay"


def test_resolve_chain_module(tmp_path):
    built = chain_from_har(MINI, har_as="me")
    fields = {
        "har_as": "me",
        "sequence_name": "me",
        "template_har": built["template_har"],
        "slots": built["slots"],
        "bindings": {"authorization": "Bearer LIVE"},
    }
    mod = SimpleNamespace(
        id="flow_me",
        module_type="Цепь",
        chain_fields=fields,
    )
    suites = SimpleNamespace(test_data_constructor=[mod], imports=[])
    wired = SimpleNamespace(test_suites=suites)
    resolved = resolve_chain_arg(Wired, "flow_me", wired_dir=tmp_path)
    assert resolved.from_module is True
    assert resolved.har_as == "me"


def test_execute_and_scan_chain_module(tmp_path, monkeypatch):
    built = chain_from_har(MINI, har_as="me")
    slots = []
    for s in built["slots"]:
        row = dict(s)
        if s["id"] == "authorization":
            row["bind"] = "literal:Bearer LIVE"
        slots.append(row)
    fields = {
        "har_as": "me",
        "sequence_name": "me_seq",
        "template_har": built["template_har"],
        "slots": slots,
        "bindings": {"authorization": "Bearer LIVE"},
    }
    mod = SimpleNamespace(id="flow_me", module_type="Цепь", chain_fields=fields)
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(test_data_constructor=[mod], imports=[])
    )

    zap = ZapAdapter.__new__(ZapAdapter)
    zap._run_wired = wired
    zap._wired_dir = tmp_path
    zap._ensure_connected = lambda: None
    zap._zap = MagicMock()
    calls = []

    def fake_import(name, path, assert_code=True, assert_length=None):
        calls.append(("import", name, path))
        assert Path(path).is_file()
        assert "Bearer LIVE" in Path(path).read_text(encoding="utf-8")
        return True

    def fake_scan(name, context_name=None, policy="Sequence", timeout_minutes=None):
        calls.append(("scan", name))
        return True

    zap.import_har_sequence = fake_import
    zap.sequence_active_scan = fake_scan

    assert zap.execute_chain_module("flow_me") is True
    assert calls == [("import", "me_seq", str(tmp_path / "resources" / "me.har"))]

    calls.clear()
    assert zap.scan_chain_module("flow_me") is True
    assert calls[0][0] == "import"
    assert calls[1] == ("scan", "me_seq")


def test_execute_chain_missing_raises():
    zap = ZapAdapter.__new__(ZapAdapter)
    zap._run_wired = SimpleNamespace(
        test_suites=SimpleNamespace(test_data_constructor=[], imports=[])
    )
    zap._wired_dir = None
    with pytest.raises(WiredError, match="ВыполнитьЦепь"):
        zap.execute_chain_module("nope")


def test_extract_auth_from_har_bearer(tmp_path):
    from utils.chain_investigate import extract_auth_from_har

    har = tmp_path / "a.har"
    har.write_text(
        json.dumps(
            {
                "log": {
                    "entries": [
                        {
                            "request": {
                                "url": "https://api.example/v1/me",
                                "headers": [
                                    {
                                        "name": "Authorization",
                                        "value": "Bearer LIVE",
                                    }
                                ],
                            }
                        }
                    ]
                }
            }
        ),
        encoding="utf-8",
    )
    hint = extract_auth_from_har(har)
    assert hint["found"] is True
    assert hint["auth_type"] == "Bearer Token"
    assert hint["auth_details"]["Токен"] == "LIVE"


def test_investigate_chain_module_phase_order(tmp_path, monkeypatch):
    built = chain_from_har(MINI, har_as="me")
    slots = []
    for s in built["slots"]:
        row = dict(s)
        if s["id"] == "authorization":
            row["bind"] = "literal:Bearer LIVE"
        slots.append(row)
    fields = {
        "har_as": "me",
        "sequence_name": "me_seq",
        "template_har": built["template_har"],
        "slots": slots,
        "bindings": {"authorization": "Bearer LIVE"},
    }
    mod = SimpleNamespace(id="flow_me", module_type="Цепь", chain_fields=fields)
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(test_data_constructor=[mod], imports=[])
    )

    zap = ZapAdapter.__new__(ZapAdapter)
    zap._run_wired = wired
    zap._wired_dir = tmp_path
    zap._ensure_connected = lambda: None
    zap._zap = MagicMock()
    zap.context_name = "prev_ctx"
    zap.base_url = "https://api.example"
    calls = []
    rules = []

    monkeypatch.setattr(
        "adapters.data_processor.DataProcessor.start_log_cut",
        lambda name, options="", comment="": calls.append(("start_log", name)) or "ok",
    )
    monkeypatch.setattr(
        "adapters.data_processor.DataProcessor.end_log_cut",
        lambda name: calls.append(("end_log", name)) or "ok",
    )

    def fake_create(name, description=""):
        calls.append(("create_context", name))
        zap.context_name = name
        return name

    def fake_delete(name):
        calls.append(("delete_context", name))

    def fake_switch(name):
        calls.append(("switch_context", name))
        zap.context_name = name

    def fake_include(ctx, regex=None):
        calls.append(("include", ctx, regex))

    def fake_import(name, path, assert_code=True, assert_length=None):
        calls.append(("import", name))
        return True

    def fake_seq(name, context_name=None, policy="Sequence", timeout_minutes=None):
        calls.append(("seq_scan", name))
        return True

    def fake_spider(url=None, context_name=None, timeout_minutes=None, logout_avoidance=None):
        calls.append(("spider", context_name))
        return True

    def fake_ascan(url=None, context_name=None, timeout_minutes=None):
        calls.append(("ascan", context_name))
        return 0

    def fake_pscan(timeout_minutes=None):
        calls.append(("pscan", timeout_minutes))
        return True

    def fake_add_rule(description, match_type, match_string, replacement, match_regex=False):
        calls.append(("replacer_add", description))
        rules.append({"description": description, "id": description})
        return True

    def fake_list_rules():
        return list(rules)

    def fake_remove_rule(rule_id):
        calls.append(("replacer_rm", rule_id))
        rules[:] = [r for r in rules if r.get("id") != rule_id and r.get("description") != rule_id]

    zap.create_context = fake_create
    zap.delete_context = fake_delete
    zap.switch_context = fake_switch
    zap.set_context_include = fake_include
    zap.import_har_sequence = fake_import
    zap.sequence_active_scan = fake_seq
    zap.spider_scan = fake_spider
    zap.active_scan = fake_ascan
    zap.passive_scan_wait = fake_pscan
    zap.add_replacer_rule = fake_add_rule
    zap.list_replacer_rules = fake_list_rules
    zap.remove_replacer_rule = fake_remove_rule

    assert zap.investigate_chain_module("flow_me") is True
    kinds = [c[0] for c in calls]
    assert kinds == [
        "start_log",
        "create_context",
        "import",
        "include",
        "replacer_add",
        "seq_scan",
        "spider",
        "ascan",
        "pscan",
        "replacer_rm",
        "end_log",
        "delete_context",
        "switch_context",
    ]
    assert calls[-1] == ("switch_context", "prev_ctx")
    notes = zap._last_chain_investigate["notes"]
    assert "auth_applied" in notes
    assert any(n.startswith("purge_kdt_auth") for n in notes)
    assert any(n.startswith("evidence ") for n in notes)
    ev = tmp_path / "meta" / "chain_investigate_flow_me.json"
    assert ev.is_file()
    body = json.loads(ev.read_text(encoding="utf-8"))
    assert body["module_id"] == "flow_me"


def test_prepare_chain_module_imports_setup(tmp_path):
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
                        "content": {"text": "{}"},
                    },
                },
                {
                    "request": {
                        "method": "GET",
                        "url": "https://api.example/pay",
                        "headers": [],
                    },
                    "response": {"status": 200, "content": {"text": "{}"}},
                },
            ]
        }
    }
    built = chain_from_har(har, har_as="me")
    steps = built["steps"]
    steps[0]["role"] = "precondition"
    steps[1]["role"] = "attack"
    fields = {
        "har_as": "me",
        "sequence_name": "me",
        "template_har": built["template_har"],
        "steps": steps,
        "slots": [],
        "bindings": {},
    }
    mod = SimpleNamespace(id="flow_me", module_type="Цепь", chain_fields=fields)
    wired = SimpleNamespace(
        test_suites=SimpleNamespace(test_data_constructor=[mod], imports=[])
    )
    zap = ZapAdapter.__new__(ZapAdapter)
    zap._run_wired = wired
    zap._wired_dir = tmp_path
    zap._ensure_connected = lambda: None
    calls = []

    def fake_import(name, path, assert_code=True, assert_length=None):
        calls.append((name, path))
        assert Path(path).is_file()
        text = Path(path).read_text(encoding="utf-8")
        assert "login" in text
        assert "pay" not in text
        return True

    zap.import_har_sequence = fake_import
    assert zap.prepare_chain_module("flow_me") is True
    assert calls[0][0] == "me_setup"
