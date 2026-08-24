# -*- coding: utf-8 -*-
"""G-38 / G-35 / G-45: генератор AF YAML + MethodId План / mock runPlan."""
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.af_plan import (  # noqa: E402
    AUTH_ENV_BEARER,
    AUTH_ENV_PASSWORD,
    AUTH_ENV_USERNAME,
    build_af_plan,
    plan_from_wired_dict,
    profile_for_scan_policy,
)
from core.method_id import lookup_facade_method, resolve_call  # noqa: E402
from adapters.zap_adapter import ZapAdapter  # noqa: E402
from core.errors import WiredError  # noqa: E402
from core.controller import Controller  # noqa: E402
from models.wired import Infrastructure, Wired, Meta, SecurityConfiguration
from models.wired import TestSuites as TestSuites


def test_profile_map():
    assert profile_for_scan_policy("custom_policy") == "smoke"
    assert profile_for_scan_policy("scanner_crawler") == "crawler"
    assert profile_for_scan_policy("api_scanner") == "api"


def test_build_smoke_yaml_snapshot():
    text = build_af_plan(
        base_url="http://juice-shop:3000",
        context_name="juice_ctx",
        scan_policy="custom_policy",
        report_file="juice-from-wired",
    )
    assert "name: juice_ctx" in text
    assert "http://juice-shop:3000" in text
    assert "type: spider" in text
    assert "type: spiderAjax" in text
    assert "type: activeScan" in text
    assert "type: report" in text
    assert "profile=smoke" in text
    assert "logoutAvoidance: true" in text
    assert "type: activeScan-policy" in text
    assert "type: openapi" not in text


def test_crawler_profile_no_active():
    text = build_af_plan(
        base_url="http://example.test",
        scan_policy="scanner_crawler",
    )
    assert "type: spiderAjax" in text
    assert "type: spiderClient" in text
    assert "type: activeScan" not in text


def test_from_Wired_dict():
    text = plan_from_wired_dict(
        {
            "security_configuration": {
                "base_url_override": "http://juice-shop:3000",
                "scan_policy": "custom_policy",
            }
        },
        context_name="juice_ctx",
        report_file="juice-from-wired",
    )
    assert "juice_ctx" in text


def test_openapi_url_job_before_spider():
    text = plan_from_wired_dict(
        {
            "security_configuration": {
                "base_url_override": "http://api.example.test",
                "scan_policy": "api_scanner",
                "allowed_extra_domains": "",
            },
            "openapi_swagger_scanning": {
                "scan_schema": "https://api.example.test/swagger.json",
            },
        }
    )
    assert "type: openapi" in text
    assert "apiUrl:" in text
    assert "https://api.example.test/swagger.json" in text
    openapi_pos = text.index("type: openapi")
    spider_pos = text.index("type: spider")
    assert openapi_pos < spider_pos
    assert "maxDepth: 2" in text


def test_openapi_absent_no_job():
    text = plan_from_wired_dict(
        {
            "security_configuration": {
                "base_url_override": "http://example.test",
                "scan_policy": "custom_policy",
            },
        }
    )
    assert "type: openapi" not in text


def test_inline_openapi_honest_note_only():
    text = plan_from_wired_dict(
        {
            "security_configuration": {
                "base_url_override": "http://example.test",
                "scan_policy": "openapi_schema",
            },
            "openapi_swagger_scanning": {
                "scan_schema": '{"openapi":"3.0.0"}',
            },
        }
    )
    assert "inline OpenAPI spec" in text
    assert "type: openapi" not in text


def test_extra_domains_include_paths():
    text = plan_from_wired_dict(
        {
            "security_configuration": {
                "base_url_override": "http://main.test",
                "scan_policy": "custom_policy",
                "allowed_extra_domains": "https://cdn.test,*.internal.test",
            },
        }
    )
    assert "includePaths:" in text
    # regex-формы из domains_csv_to_include_regexes (escaped dots)
    assert "cdn" in text and "internal" in text
    assert text.count("includePaths:") == 1
    assert text.count("- ") >= 3  # base + 2 extra


def test_gui_targets_requestor():
    text = plan_from_wired_dict(
        {
            "security_configuration": {
                "base_url_override": "http://app.test",
                "scan_policy": "scanner_crawler",
            },
            "gui_elements_scanning": {
                "scan_targets": "http://app.test/#/login\nhttp://app.test/#/search",
            },
        }
    )
    assert "type: requestor" in text
    assert "#/login" in text


def test_crawler_profile_includes_spider_client():
    text = plan_from_wired_dict(
        {
            "security_configuration": {
                "base_url_override": "http://spa.test",
                "scan_policy": "scanner_crawler",
            },
        }
    )
    assert "type: spiderClient" in text


def test_basic_auth_in_env_uses_vars_not_plaintext():
    text = plan_from_wired_dict(
        {
            "security_configuration": {
                "base_url_override": "http://secure.test",
                "scan_policy": "custom_policy",
                "auth_type": "Базовая авторизация",
                "auth_details": {"Логин": "alice", "Пароль": "s3cr3t"},
            },
        }
    )
    assert "method: http" in text
    assert f"${{{AUTH_ENV_USERNAME}}}" in text
    assert f"${{{AUTH_ENV_PASSWORD}}}" in text
    assert "s3cr3t" not in text
    assert "alice" not in text or "${" in text


def test_bearer_auth_replacer_not_plaintext():
    text = plan_from_wired_dict(
        {
            "security_configuration": {
                "base_url_override": "http://api.test",
                "scan_policy": "api_scanner",
                "auth_type": "Bearer Token",
                "auth_details": {"Токен": "jwt-secret-value"},
            },
        }
    )
    assert "type: replacer" in text
    assert f"${{{AUTH_ENV_BEARER}}}" in text
    assert "jwt-secret-value" not in text


def test_browser_auth_sso_in_env():
    text = plan_from_wired_dict(
        {
            "security_configuration": {
                "base_url_override": "http://app.test",
                "scan_policy": "custom_policy",
                "auth_type": "Последовательность действий / SSO",
                "auth_details": {"URL входа": "http://app.test/login"},
            },
        }
    )
    assert "method: browser" in text
    assert "verification:" in text
    assert "method: autodetect" in text


def test_juice_from_Wired_artifact_matches_generator():
    seed = ROOT / "wired" / "juice_af_seed.json"
    artifact = ROOT / "plans" / "juice-from-wired.yaml"
    assert seed.is_file(), "juice_af_seed.json must exist"
    expected = plan_from_wired_dict(
        json.loads(seed.read_text(encoding="utf-8")),
        context_name="juice_ctx",
        report_file="juice-from-wired",
    )
    if not artifact.is_file():
        artifact.write_text(expected, encoding="utf-8")
    actual = artifact.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert actual == expected.replace("\r\n", "\n")


def test_method_id_plan():
    assert lookup_facade_method("ZAP", "План") == ("zap", "run_automation_plan")
    assert (
        resolve_call("ZAP План plans/juice-baseline.yaml")
        == "zap|run_automation_plan|plans/juice-baseline.yaml"
    )
    assert lookup_facade_method("ZAP", "СгенерироватьПлан") == (
        "zap",
        "generate_automation_plan",
    )
    assert lookup_facade_method("ZAP", "ПрименитьAuth") == (
        "zap",
        "apply_wired_auth",
    )
    assert lookup_facade_method("ZAP", "КраулерКлиент") == (
        "zap",
        "client_spider_scan",
    )


def test_controller_init_does_not_run_zap_scans(monkeypatch):
    """Honest Contract: load манифеста не вызывает spider/active/runPlan."""
    monkeypatch.setenv("KDT_AUTH_BOOTSTRAP", "0")
    monkeypatch.setenv("KDT_ZAP_AUTH_BOOTSTRAP", "0")

    zap = MagicMock()
    zap.run_automation_plan = MagicMock()
    zap.spider_scan = MagicMock()
    zap.generate_automation_plan = MagicMock()

    with patch.object(Controller, "_init_adapters", lambda self: None), patch.object(
        Controller, "_register_actions", lambda self: None
    ), patch.object(Controller, "_apply_infrastructure", lambda self: None), patch.object(
        Controller, "_apply_auth_bootstrap", lambda self: None
    ):
        ctrl = Controller(
            Wired(
                meta=Meta(assessment_purpose="scheduled"),
                infrastructure=Infrastructure(
                    zap_mode="demon", browser_type="chrome-headless"
                ),
                security_configuration=SecurityConfiguration(
                    base_url_override="http://juice-shop:3000",
                    allowed_extra_domains="",
                    scan_policy="api_scanner",
                    auth_type="Bearer Token",
                    auth_details={"Токен": "x"},
                ),
                test_suites=TestSuites(scenarios=[]),
            )
        )
        ctrl.adapters["zap"] = zap
        ctrl._log_declarative_gap()

    zap.run_automation_plan.assert_not_called()
    zap.spider_scan.assert_not_called()
    zap.generate_automation_plan.assert_not_called()


def test_run_automation_plan_mock(tmp_path):
    plan = tmp_path / "p.yaml"
    plan.write_text("env: {}\njobs: []\n", encoding="utf-8")

    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter.host = "127.0.0.1"
    adapter.port = 8080
    adapter.api_key = None
    adapter._connected = True
    adapter.active_scan_timeout = 30
    adapter.spider_stall_seconds = 60

    auto = MagicMock()
    auto.run_plan.return_value = {"planId": "7"}
    auto.plan_progress.side_effect = [
        {"finished": "", "error": ""},
        {"finished": "2026-01-01T00:00:00Z", "error": ""},
    ]
    adapter._zap = MagicMock()
    adapter._zap.automation = auto

    pid = ZapAdapter.run_automation_plan(adapter, str(plan), timeout_minutes=0.05)
    assert pid == "7"
    auto.run_plan.assert_called_once()
    assert auto.plan_progress.call_count >= 2


def test_client_spider_scan_mock():
    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter._connected = True
    adapter.client_spider_timeout = 15
    adapter.spider_stall_seconds = 60

    client = MagicMock()
    client.scan.return_value = "3"
    client.status.side_effect = ["10", "50", "100"]
    adapter._zap = MagicMock()
    adapter._zap.clientSpider = client

    progress = ZapAdapter.client_spider_scan(
        adapter, "http://spa.test", context_name="ctx1", timeout_minutes=0.05
    )
    assert progress == 100
    client.scan.assert_called_once()
    assert client.stop.call_count == 0


def test_generate_automation_plan_from_wired_json(tmp_path):
    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter._connected = True
    out = tmp_path / "gen.yaml"
    wired = {
        "security_configuration": {
            "base_url_override": "http://gen.test",
            "scan_policy": "api_scanner",
        },
        "openapi_swagger_scanning": {
            "scan_schema": "https://gen.test/openapi.json",
        },
    }
    path = ZapAdapter.generate_automation_plan(
        adapter,
        str(out),
        wired_json=json.dumps(wired),
    )
    text = Path(path).read_text(encoding="utf-8")
    assert "type: openapi" in text
    assert "gen.test" in text


def test_run_automation_plan_missing_file():
    adapter = ZapAdapter.__new__(ZapAdapter)
    adapter._connected = True
    adapter._zap = MagicMock()
    with pytest.raises(WiredError, match="not found"):
        ZapAdapter.run_automation_plan(adapter, "plans/no-such-plan-xyz.yaml")

