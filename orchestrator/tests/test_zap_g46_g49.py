# -*- coding: utf-8 -*-
"""G-46…G-49: logout avoidance, sequence scan, scan depth, report templates."""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.af_plan import (  # noqa: E402
    SCAN_DEPTH_PROFILES,
    build_af_plan,
    depth_spec_for_profile,
    normalize_report_template,
)
from core.method_id import lookup_facade_method, resolve_call  # noqa: E402
from adapters.zap_adapter import ZapAdapter  # noqa: E402
from core.errors import WiredError  # noqa: E402


# --- G-48 Logout Avoidance ---


def test_method_id_logout_avoidance():
    assert lookup_facade_method("ZAP", "ИзбегатьLogout") == (
        "zap",
        "set_logout_avoidance",
    )
    assert resolve_call("ZAP ИзбегатьLogout true") == "zap|set_logout_avoidance|true"


def test_set_logout_avoidance_mock():
    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter._connected = True
    adapter._zap = MagicMock()
    adapter._zap.spider.set_option_logout_avoidance = MagicMock()
    adapter._zap.ajaxSpider.set_option_logout_avoidance = MagicMock()

    assert ZapAdapter.set_logout_avoidance(adapter, True) is True
    adapter._zap.spider.set_option_logout_avoidance.assert_called_once_with(True)
    adapter._zap.ajaxSpider.set_option_logout_avoidance.assert_called_once_with(True)


def test_spider_scan_applies_logout_avoidance_mock():
    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter._connected = True
    adapter._maybe_apply_logout_avoidance = MagicMock()
    adapter._set_spider_options = MagicMock()
    adapter._spider_scan_impl = MagicMock(return_value=3)

    ZapAdapter.spider_scan(adapter, "http://app.test", logout_avoidance=True)
    adapter._maybe_apply_logout_avoidance.assert_called_once_with(True)


def test_af_plan_logout_avoidance_on_spider_jobs():
    text = build_af_plan(
        base_url="http://app.test",
        logout_avoidance=True,
    )
    assert "logoutAvoidance: true" in text
    assert text.count("logoutAvoidance: true") >= 2


# --- G-47 Sequence activeScan ---


def test_method_id_sequence_active_scan():
    assert lookup_facade_method("ZAP", "СканПоследовательности") == (
        "zap",
        "sequence_active_scan",
    )
    assert (
        resolve_call("ZAP СканПоследовательности checkout")
        == "zap|sequence_active_scan|checkout"
    )


def test_sequence_active_scan_af_fallback_mock(tmp_path):
    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter._connected = True
    adapter.context_name = "juice_ctx"
    adapter.active_scan_timeout = 5
    adapter._zap = MagicMock()
    adapter._zap.urlopen.side_effect = RuntimeError("no sequence API")

    captured = {}

    def fake_run(plan_path, timeout_minutes=None):
        captured["content"] = Path(plan_path).read_text(encoding="utf-8")
        return "plan-9"

    with patch.object(ZapAdapter, "run_automation_plan", side_effect=fake_run):
        result = ZapAdapter.sequence_active_scan(
            adapter, "checkout", context_name="juice_ctx", timeout_minutes=0.1
        )
    assert result == "plan-9"
    assert "sequence-activeScan" in captured["content"]
    assert "checkout" in captured["content"]


def test_sequence_active_scan_empty_name():
    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter._connected = True
    adapter._zap = MagicMock()
    with pytest.raises(WiredError, match="пустое имя"):
        ZapAdapter.sequence_active_scan(adapter, "")


def test_af_plan_har_sequence_job():
    text = build_af_plan(
        base_url="http://app.test",
        har_sequence_name="checkout",
    )
    assert "type: sequence-activeScan" in text
    assert "sequence: checkout" in text


# --- G-49 Scan depth profiles ---


def test_depth_spec_profiles():
    smoke = depth_spec_for_profile("smoke")
    assert smoke["defaultStrength"] == "Low"
    assert smoke["policy_name"] == "kdt-smoke"
    assert depth_spec_for_profile("crawler") is None


def test_af_plan_active_scan_policy_job():
    text = build_af_plan(base_url="http://app.test", scan_policy="custom_policy")
    assert "type: activeScan-policy" in text
    assert "defaultStrength: Low" in text
    assert "policy: kdt-smoke" in text


def test_method_id_scan_depth_profile():
    assert lookup_facade_method("ZAP", "ПрофильСканирования") == (
        "zap",
        "apply_scan_depth_profile",
    )


def test_apply_scan_depth_profile_mock():
    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter._connected = True
    adapter._zap = MagicMock()
    adapter._zap.ascan.set_scan_policy = MagicMock()
    adapter._zap.ascan.set_policy_attack_strength = MagicMock()
    adapter._zap.ascan.set_policy_alert_threshold = MagicMock()

    out = ZapAdapter.apply_scan_depth_profile(adapter, "smoke")
    assert out["profile"] == "smoke"
    assert out["strength"] == "Low"
    adapter._zap.ascan.set_scan_policy.assert_called_with("kdt-smoke")


def test_apply_scan_depth_profile_unknown():
    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter._connected = True
    adapter._zap = MagicMock()
    with pytest.raises(WiredError, match="неизвестный профиль"):
        ZapAdapter.apply_scan_depth_profile(adapter, "nope")


def test_scan_depth_catalog_has_smoke_deep_api():
    assert "smoke" in SCAN_DEPTH_PROFILES
    assert "active" in SCAN_DEPTH_PROFILES
    assert "api" in SCAN_DEPTH_PROFILES


# --- G-46 Report templates ---


def test_normalize_report_template_aliases():
    assert normalize_report_template("html") == "traditional-html"
    assert normalize_report_template("sarif") == "sarif-json"
    assert normalize_report_template("traditional-html") == "traditional-html"


def test_generate_report_sarif_via_addon_mock(tmp_path):
    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter._connected = True
    out = tmp_path / "scan.sarif.json"
    adapter._zap = MagicMock()
    adapter._generate_report_via_addon = MagicMock(return_value=out)

    path = ZapAdapter.generate_report(
        adapter, format="sarif", output_file=str(out), attach_to_allure=False
    )
    assert path == str(out)
    adapter._generate_report_via_addon.assert_called_once()
    assert adapter._generate_report_via_addon.call_args[0][0] == "sarif-json"


def test_generate_report_xml_legacy_core_mock(tmp_path):
    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter._connected = True
    adapter._zap = MagicMock()
    adapter._zap.core.xmlreport.return_value = "<report/>"

    path = ZapAdapter.generate_report(
        adapter,
        format="xml",
        output_file=str(tmp_path / "dojo.xml"),
        attach_to_allure=False,
    )
    assert Path(path).read_text(encoding="utf-8") == "<report/>"
    adapter._zap.core.xmlreport.assert_called_once()


def test_af_plan_report_template_and_sarif():
    text = build_af_plan(
        base_url="http://app.test",
        report_template="traditional-html",
        include_sarif_report=True,
        report_file="lab-run",
    )
    assert "template: traditional-html" in text
    assert "template: sarif-json" in text
    assert "lab-run-sarif" in text
