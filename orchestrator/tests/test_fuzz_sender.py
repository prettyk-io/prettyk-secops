# -*- coding: utf-8 -*-
"""Alpha fuzz: генерация httpsender + MethodId wire (без live ZAP)."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.fuzz_sender import DEFAULT_VAR_KEY, render_mask_httpsender
from core.method_id import lookup_facade_method, resolve_call
from adapters.zap_adapter import ZapAdapter


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
    assert lookup_facade_method("ZAP", "HttpSender") == (
        "zap",
        "install_mask_http_sender",
    )
    assert lookup_facade_method("ZAP", "ПодменаHttpSender") == (
        "zap",
        "install_mask_http_sender",
    )
    assert lookup_facade_method("ZAP", "ПейлоадПодмены") == (
        "zap",
        "set_fuzz_payload",
    )
    assert lookup_facade_method("ZAP", "УдалитьHttpSender") == (
        "zap",
        "remove_http_sender_script",
    )
    assert (
        resolve_call('ZAP HttpSender fuzz_mask "§FUZZ§"')
        == "zap|install_mask_http_sender|fuzz_mask|§FUZZ§"
    )
    assert (
        resolve_call('ZAP ПодменаHttpSender fuzz_mask "§FUZZ§"')
        == "zap|install_mask_http_sender|fuzz_mask|§FUZZ§"
    )
    assert (
        resolve_call('ZAP ПейлоадПодмены "<script>"')
        == "zap|set_fuzz_payload|<script>"
    )


def test_install_mask_http_sender_loads_generated_script(tmp_path, monkeypatch):
    adapter = ZapAdapter(host="127.0.0.1", port="0")
    adapter._connected = True
    script_api = MagicMock()
    adapter._zap = MagicMock(script=script_api)

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
    adapter = ZapAdapter(host="127.0.0.1", port="0")
    adapter._connected = True
    script_api = MagicMock()
    adapter._zap = MagicMock(script=script_api)
    script_api.set_global_var = MagicMock()

    adapter.set_fuzz_payload("<script>", "my_key")
    script_api.set_global_var.assert_called_with("my_key", "<script>")


def test_start_fuzzer_gone_from_method_ids():
    assert lookup_facade_method("ZAP", "ЗапуститьFuzzer") is None
    assert resolve_call("ZAP ЗапуститьFuzzer http://x") is None
