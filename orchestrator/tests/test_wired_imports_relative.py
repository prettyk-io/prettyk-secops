# -*- coding: utf-8 -*-
"""BE-RT-4 lite: imports[].path резолвится относительно каталога манифеста."""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from core.controller import Controller
from core.data_stream import DataStream
from core.wired_validate import validate_wired_file
from models.wired import SuiteImport


def _minimal_Wired(*, import_path: str, as_name: str = "urls") -> dict:
    return {
        "meta": {
            "project_id": "imports-relative",
            "initiator_name": "a@b.c",
            "app_leader": "a@b.c",
            "assessment_purpose": "emergency",
            "emergency_reason": "imports path test",
            "release_domain": "lab",
            "compliance_requirements": "",
            "release_manager": "a@b.c",
        },
        "infrastructure": {
            "zap_mode": "demon",
            "browser_type": "chrome",
            "additional_local_server_port": 8085,
            "zap_work_timeout_min": 10,
            "idle_timeout_min": 5,
            "webswing_session_timeout_min": 60,
        },
        "security_configuration": {
            "base_url_override": "http://juice-shop:3000",
            "allowed_extra_domains": "",
            "scan_policy": "custom_policy",
            "auth_type": "Без авторизации",
        },
        "test_suites": {
            "imports": [
                {"path": import_path, "kind": "data_file", "as": as_name},
            ],
            "pages": {},
            "scenarios": [
                {
                    "scenario_name": "s1",
                    "continue_on_failure": False,
                    "steps": [
                        {
                            "description": "log",
                            "constructor": 'Лог "imports ok"',
                            "failsafe": False,
                            "retry": 0,
                            "retry_delay": 2,
                            "continue_on_failure": False,
                            "save_as": "",
                        }
                    ],
                }
            ],
            "test_data_constructor": [],
        },
    }


def _controller(imports, *, wired_path: Path, base="http://juice-shop:3000"):
    ctrl = Controller.__new__(Controller)
    ctrl.wired_path = str(wired_path.resolve())
    ctrl.wired = SimpleNamespace(
        test_suites=SimpleNamespace(
            imports=imports,
            test_data_constructor=[],
        ),
        security_configuration=SimpleNamespace(base_url_override=base),
    )
    return ctrl


def test_validate_and_load_resolve_imports_relative_to_wired_dir(tmp_path: Path):
    """Wired.json + resources/*.txt рядом → validate-only OK, load резолвит path."""
    res_dir = tmp_path / "resources"
    res_dir.mkdir()
    (res_dir / "urls.txt").write_text(
        "/#/login\n# comment\n/#/register\n",
        encoding="utf-8",
    )

    wired_path = tmp_path / "Wired.json"
    wired_path.write_text(
        json.dumps(_minimal_Wired(import_path="resources/urls.txt")),
        encoding="utf-8",
    )

    issues, wired = validate_wired_file(wired_path)
    assert issues == [], issues
    assert wired is not None
    assert wired.test_suites.imports[0].path == "resources/urls.txt"

    ctrl = _controller(
        wired.test_suites.imports,
        wired_path=wired_path,
    )
    stream = DataStream()
    ctrl._export_suite_imports(stream)
    assert stream.get("urls") == [
        "http://juice-shop:3000/#/login",
        "http://juice-shop:3000/#/register",
    ]

    resolved = ctrl._resolve_import_path("resources/urls.txt")
    assert Path(resolved) == (res_dir / "urls.txt").resolve()
