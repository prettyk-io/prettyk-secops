# -*- coding: utf-8 -*-
"""G-01: scan_policy / domains — declarative, не автоскан при load."""
from unittest.mock import MagicMock, patch

from core.af_plan import profile_for_scan_policy
from core.controller import Controller
from models.wired import (
    Infrastructure,
    Wired,
    Meta,
    SecurityConfiguration,
)
from models.wired import TestSuites as SuitesModel


def test_scan_policy_only_maps_af_profile_declarative():
    """scan_policy → профиль AF YAML, не запуск скана."""
    assert profile_for_scan_policy("scanner_crawler") == "crawler"
    assert profile_for_scan_policy("custom_policy") == "smoke"


def test_controller_load_with_domains_does_not_apply_or_scan(monkeypatch):
    """allowed_extra_domains при load не вызывает spider / apply_context_domains."""
    monkeypatch.setenv("PK_AUTH_BOOTSTRAP", "0")
    monkeypatch.setenv("PK_SCANNER_AUTH_BOOTSTRAP", "0")

    scanner = MagicMock()
    scanner.spider_scan = MagicMock()
    scanner.run_automation_plan = MagicMock()
    scanner.apply_context_domains = MagicMock()

    with patch.object(Controller, "_init_adapters", lambda self: None), patch.object(
        Controller, "_register_actions", lambda self: None
    ), patch.object(Controller, "_apply_infrastructure", lambda self: None), patch.object(
        Controller, "_apply_auth_bootstrap", lambda self: None
    ):
        ctrl = Controller(
            Wired(
                meta=Meta(assessment_purpose="emergency", emergency_reason="g01"),
                infrastructure=Infrastructure(
                    scanner_mode="demon", browser_type="chrome-headless"
                ),
                security_configuration=SecurityConfiguration(
                    base_url_override="http://juice-shop:3000",
                    allowed_extra_domains="example.com,*.lab.local",
                    scan_policy="scanner_crawler",
                    auth_type="Без авторизации",
                ),
                test_suites=SuitesModel(scenarios=[]),
            )
        )
        ctrl.adapters["scanner"] = scanner
        ctrl._log_declarative_gap()

    scanner.spider_scan.assert_not_called()
    scanner.run_automation_plan.assert_not_called()
    if hasattr(scanner, "apply_context_domains"):
        scanner.apply_context_domains.assert_not_called()
