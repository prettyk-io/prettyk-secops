# -*- coding: utf-8 -*-
"""Alpha fuzz: генерация httpsender + MethodId wire (без live scanner)."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.fuzz_sender import DEFAULT_VAR_KEY, render_mask_httpsender
from core.method_id import lookup_facade_method, resolve_call
from adapters.scanner_adapter import ScannerAdapter


def test_render_mask_httpsender_contains_mask_and_var():
    code = render_mask_httpsender("§FUZZ§", "fuzz_payload")
    assert "§FUZZ§" in code
    assert "fuzz_payload" in code
    assert "function sendingRequest" in code
    assert "ScriptVars.getGlobalVar" in code
    assert "function responseReceived" in code
    assert "pkReplaceAll" not in code
    assert "function replaceAll" in code


def test_render_escapes_quotes_in_mask():
    code = render_mask_httpsender('a"b', DEFAULT_VAR_KEY)
    assert 'a\\"b' in code


def test_render_rejects_empty_mask():
    with pytest.raises(ValueError):
        render_mask_httpsender("")


def test_method_ids_mask_path():
    assert lookup_facade_method("scanner", "HttpSender") == (
        "scanner",
        "install_mask_http_sender",
    )
    assert lookup_facade_method("scanner", "ПодменаHttpSender") == (
        "scanner",
        "install_mask_http_sender",
    )
    assert lookup_facade_method("scanner", "ПейлоадПодмены") == (
        "scanner",
        "set_fuzz_payload",
    )
    assert lookup_facade_method("scanner", "УдалитьHttpSender") == (
        "scanner",
        "remove_http_sender_script",
    )
    assert (
        resolve_call('scanner HttpSender fuzz_mask "§FUZZ§"')
        == "scanner|install_mask_http_sender|fuzz_mask|§FUZZ§"
    )
    assert (
        resolve_call('scanner ПодменаHttpSender fuzz_mask "§FUZZ§"')
        == "scanner|install_mask_http_sender|fuzz_mask|§FUZZ§"
    )
    assert (
        resolve_call('scanner ПейлоадПодмены "<script>"')
        == "scanner|set_fuzz_payload|<script>"
    )


def test_install_mask_http_sender_loads_generated_script(tmp_path, monkeypatch):
    adapter = ScannerAdapter(host="127.0.0.1", port="0")
    adapter._connected = True
    script_api = MagicMock()
    adapter._scanner = MagicMock(script=script_api)

    written = {}

    def fake_load(name, stype, engine, path):
        written["name"] = name
        written["stype"] = stype
        written["engine"] = engine
        written["path"] = path
        written["code"] = Path(path).read_text(encoding="utf-8")

    script_api.load.side_effect = fake_load
    script_api.enable = MagicMock()
    script_api.set_global_var = MagicMock()

    ok = adapter.install_mask_http_sender(
        "fuzz_mask", "§FUZZ§", initial_payload="payload-1"
    )
    assert ok is True
    assert written["name"] == "fuzz_mask"
    assert written["stype"] == "httpsender"
    assert written["engine"] == "Graal.js"
    assert "§FUZZ§" in written["code"]
    assert "function sendingRequest" in written["code"]
    script_api.enable.assert_called_with("fuzz_mask")
    script_api.set_global_var.assert_called_with("fuzz_payload", "payload-1")


def test_set_fuzz_payload_uses_script_vars():
    adapter = ScannerAdapter(host="127.0.0.1", port="0")
    adapter._connected = True
    script_api = MagicMock()
    adapter._scanner = MagicMock(script=script_api)
    script_api.set_global_var = MagicMock()

    adapter.set_fuzz_payload("<script>", "my_key")
    script_api.set_global_var.assert_called_with("my_key", "<script>")


def test_start_fuzzer_gone_from_method_ids():
    assert lookup_facade_method("scanner", "ЗапуститьFuzzer") is None
    assert resolve_call("scanner ЗапуститьFuzzer http://x") is None
