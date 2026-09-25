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
from adapters.scanner_adapter import ScannerAdapter, ACTIVE_SCAN_NOISE_EXCLUDES  # noqa: E402
from core.errors import WiredError  # noqa: E402


# --- G-48 Logout Avoidance ---


def test_method_id_logout_avoidance():
    assert lookup_facade_method("scanner", "ИзбегатьLogout") == (
        "scanner",
        "set_logout_avoidance",
    )
    assert resolve_call("scanner ИзбегатьLogout true") == "scanner|set_logout_avoidance|true"


def test_set_logout_avoidance_mock():
    adapter = ScannerAdapter.__new__(ScannerAdapter)
    adapter._connected = True
    adapter._scanner = MagicMock()
    adapter._scanner.spider.set_option_logout_avoidance = MagicMock()
    adapter._scanner.ajaxSpider.set_option_logout_avoidance = MagicMock()

    assert ScannerAdapter.set_logout_avoidance(adapter, True) is True
    adapter._scanner.spider.set_option_logout_avoidance.assert_called_once_with(True)
    adapter._scanner.ajaxSpider.set_option_logout_avoidance.assert_called_once_with(True)


def test_spider_scan_applies_logout_avoidance_mock():
    adapter = ScannerAdapter.__new__(ScannerAdapter)
    adapter._connected = True
    adapter._maybe_apply_logout_avoidance = MagicMock()
    adapter._set_spider_options = MagicMock()
    adapter._spider_scan_impl = MagicMock(return_value=3)

    ScannerAdapter.spider_scan(adapter, "http://app.test", logout_avoidance=True)
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
    assert lookup_facade_method("scanner", "СканПоследовательности") == (
        "scanner",
        "sequence_active_scan",
    )
    assert (
        resolve_call("scanner СканПоследовательности checkout")
        == "scanner|sequence_active_scan|checkout"
    )


def test_sequence_active_scan_af_fallback_mock(tmp_path):
    adapter = ScannerAdapter.__new__(ScannerAdapter)
    adapter._connected = True
    adapter.context_name = "juice_ctx"
    adapter.active_scan_timeout = 5
    adapter._scanner = MagicMock()
    adapter._scanner.urlopen.side_effect = RuntimeError("no sequence API")

    captured = {}

    def fake_run(plan_path, timeout_minutes=None):
        captured["content"] = Path(plan_path).read_text(encoding="utf-8")
        return "plan-9"

    with patch.object(ScannerAdapter, "run_automation_plan", side_effect=fake_run):
        result = ScannerAdapter.sequence_active_scan(
            adapter, "checkout", context_name="juice_ctx", timeout_minutes=0.1
        )
    assert result == "plan-9"
    assert "sequence-activeScan" in captured["content"]
    assert "checkout" in captured["content"]


def test_sequence_active_scan_empty_name():
    adapter = ScannerAdapter.__new__(ScannerAdapter)
    adapter._connected = True
    adapter._scanner = MagicMock()
    with pytest.raises(WiredError, match="пустое имя"):
        ScannerAdapter.sequence_active_scan(adapter, "")


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
    assert smoke["policy_name"] == "pk-smoke"
    assert depth_spec_for_profile("crawler") is None


def test_af_plan_active_scan_policy_job():
    text = build_af_plan(base_url="http://app.test", scan_policy="custom_policy")
    assert "type: activeScan-policy" in text
    assert "defaultStrength: Low" in text
    assert "policy: pk-smoke" in text


def test_method_id_scan_depth_profile():
    assert lookup_facade_method("scanner", "ПрофильСканирования") == (
        "scanner",
        "apply_scan_depth_profile",
    )


def test_apply_scan_depth_profile_mock():
    adapter = ScannerAdapter.__new__(ScannerAdapter)
    adapter._connected = True
    adapter._scanner = MagicMock()
    adapter._scanner.ascan.set_scan_policy = MagicMock()
    adapter._scanner.ascan.set_policy_attack_strength = MagicMock()
    adapter._scanner.ascan.set_policy_alert_threshold = MagicMock()

    out = ScannerAdapter.apply_scan_depth_profile(adapter, "smoke")
    assert out["profile"] == "smoke"
    assert out["strength"] == "Low"
    adapter._scanner.ascan.set_scan_policy.assert_called_with("pk-smoke")


def test_apply_scan_depth_profile_unknown():
    adapter = ScannerAdapter.__new__(ScannerAdapter)
    adapter._connected = True
    adapter._scanner = MagicMock()
    with pytest.raises(WiredError, match="неизвестный профиль"):
        ScannerAdapter.apply_scan_depth_profile(adapter, "nope")


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
    adapter = ScannerAdapter.__new__(ScannerAdapter)
    adapter._connected = True
    out = tmp_path / "scan.sarif.json"
    adapter._scanner = MagicMock()
    adapter._generate_report_via_addon = MagicMock(return_value=out)

    path = ScannerAdapter.generate_report(
        adapter, format="sarif", output_file=str(out), attach_to_allure=False
    )
    assert path == str(out)
    adapter._generate_report_via_addon.assert_called_once()
    assert adapter._generate_report_via_addon.call_args[0][0] == "sarif-json"


def test_generate_report_xml_full_export_mock(tmp_path):
    adapter = ScannerAdapter.__new__(ScannerAdapter)
    adapter._connected = True
    adapter.base_url = "http://127.0.0.1:3000"
    adapter._scanner = MagicMock()
    adapter._fetch_alerts_paginated = MagicMock(
        return_value=[
            {
                "pluginId": "40018",
                "alertRef": "40018",
                "name": "SQL Injection",
                "alert": "SQL Injection",
                "risk": "High",
                "cweid": "89",
                "url": "http://127.0.0.1:3000/rest/products/search",
                "param": "q",
                "attack": "' OR 1=1 --",
            },
            {
                "pluginId": "10020",
                "alertRef": "10020-1",
                "name": "Missing Anti-clickjacking Header",
                "alert": "Missing Anti-clickjacking Header",
                "risk": "Low",
                "cweid": "1021",
                "url": "http://127.0.0.1:3000/",
                "param": "",
            },
        ]
    )

    path = ScannerAdapter.generate_report(
        adapter,
        format="xml",
        output_file=str(tmp_path / "dojo.xml"),
        attach_to_allure=False,
    )
    text = Path(path).read_text(encoding="utf-8")
    assert "SQL Injection" in text
    assert "riskcode" in text and ">3<" in text
    assert "40018" in text
    assert adapter._scanner.core.xmlreport.called is False


def test_generate_report_html_deterministic_file(tmp_path):
    adapter = ScannerAdapter.__new__(ScannerAdapter)
    adapter._connected = True
    adapter._scanner = MagicMock()
    adapter._scanner.core.htmlreport.return_value = "<html><body>report</body></html>"
    out = tmp_path / "juice_dojo.html"

    path = ScannerAdapter.generate_report(
        adapter,
        format="html",
        output_file=str(out),
        attach_to_allure=False,
    )
    assert path == str(out)
    assert Path(path).read_text(encoding="utf-8") == "<html><body>report</body></html>"
    adapter._scanner.core.htmlreport.assert_called_once()


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


def test_harden_active_scan_depth_and_scope():
    adapter = ScannerAdapter.__new__(ScannerAdapter)
    adapter._connected = True
    adapter.context_name = None
    adapter._active_scan_hardened = False
    adapter._scope_excluded_contexts = set()
    adapter._scanner = MagicMock()
    adapter._scanner.ascan.set_policy_attack_strength = MagicMock()
    adapter._scanner.ascan.set_policy_alert_threshold = MagicMock()

    ScannerAdapter.harden_active_scan(adapter, context_name="juice_ctx")

    # -1 (all) не работает в ZAP: strength/threshold выставляются по категориям 0-4.
    assert adapter._scanner.ascan.set_policy_attack_strength.call_count == 5
    assert adapter._scanner.ascan.set_policy_alert_threshold.call_count == 5
    adapter._scanner.ascan.set_policy_attack_strength.assert_any_call(
        "4", "High", scanpolicyname="Default Policy"
    )
    assert (
        adapter._scanner.context.exclude_from_context.call_count
        == len(ACTIVE_SCAN_NOISE_EXCLUDES)
    )
    assert adapter._active_scan_hardened is True
    assert "juice_ctx" in adapter._scope_excluded_contexts


def test_harden_active_scan_idempotent():
    adapter = ScannerAdapter.__new__(ScannerAdapter)
    adapter._connected = True
    adapter._active_scan_hardened = True
    adapter._scope_excluded_contexts = {"juice_ctx"}
    adapter._scanner = MagicMock()
    adapter._scanner.ascan.set_policy_attack_strength = MagicMock()
    adapter._scanner.ascan.set_policy_alert_threshold = MagicMock()

    ScannerAdapter.harden_active_scan(adapter, context_name="juice_ctx")

    adapter._scanner.ascan.set_policy_attack_strength.assert_not_called()
    adapter._scanner.context.exclude_from_context.assert_not_called()
