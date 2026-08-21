# -*- coding: utf-8 -*-
"""test_suites.imports → DataStream (F-02 MVP data_file .txt)."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.controller import Controller
from core.data_stream import DataStream
from core.errors import WiredError
from models.wired import Wired, SuiteImport
from models.wired import TestSuites as SuitesModel


def _ctrl(imports, *, tmp_path: Path, base="http://juice-shop:3000"):
    mf_path = tmp_path / "Wired.json"
    mf_path.write_text("{}", encoding="utf-8")
    ctrl = Controller.__new__(Controller)
    ctrl.wired_path = str(mf_path.resolve())
    ctrl.wired = SimpleNamespace(
        test_suites=SimpleNamespace(
            imports=imports,
            test_data_constructor=[],
        ),
        security_configuration=SimpleNamespace(base_url_override=base),
    )
    return ctrl


def test_suite_import_coerces_string_path():
    suites = SuitesModel.model_validate({"imports": ["urls.txt"], "scenarios": []})
    assert len(suites.imports) == 1
    assert suites.imports[0].path == "urls.txt"
    assert suites.imports[0].kind == "data_file"


def test_export_txt_import_relative_to_manifest(tmp_path: Path):
    txt = tmp_path / "pages.txt"
    txt.write_text("/#/login\n# c\n/#/register\n", encoding="utf-8")
    ctrl = _ctrl(
        [SuiteImport(path="pages.txt", kind="data_file")],
        tmp_path=tmp_path,
    )
    stream = DataStream()
    ctrl._export_suite_imports(stream)
    assert stream.get("pages") == [
        "http://juice-shop:3000/#/login",
        "http://juice-shop:3000/#/register",
    ]


def test_export_txt_import_as_name(tmp_path: Path):
    txt = tmp_path / "x.txt"
    txt.write_text("https://example.com/a\n", encoding="utf-8")
    ctrl = _ctrl(
        [SuiteImport.model_validate({"path": "x.txt", "kind": "data_file", "as": "urls"})],
        tmp_path=tmp_path,
    )
    stream = DataStream()
    ctrl._export_suite_imports(stream)
    assert stream.get("urls") == ["https://example.com/a"]


def test_export_missing_file(tmp_path: Path):
    ctrl = _ctrl(
        [SuiteImport(path="nope.txt", kind="data_file")],
        tmp_path=tmp_path,
    )
    with pytest.raises(WiredError, match="не найден"):
        ctrl._export_suite_imports(DataStream())


def test_export_missing_file_includes_as(tmp_path: Path):
    ctrl = _ctrl(
        [
            SuiteImport.model_validate(
                {"path": "missing.txt", "kind": "data_file", "as": "urls"}
            )
        ],
        tmp_path=tmp_path,
    )
    with pytest.raises(WiredError, match=r"не найден.*as=urls"):
        ctrl._export_suite_imports(DataStream())


def test_export_rejects_scenario_json(tmp_path: Path):
    (tmp_path / "s.json").write_text("{}", encoding="utf-8")
    ctrl = _ctrl(
        [SuiteImport(path="s.json", kind="scenario_json")],
        tmp_path=tmp_path,
    )
    with pytest.raises(WiredError, match="G-10"):
        ctrl._export_suite_imports(DataStream())


def test_export_rejects_non_txt(tmp_path: Path):
    (tmp_path / "d.csv").write_text("a,b\n", encoding="utf-8")
    ctrl = _ctrl(
        [SuiteImport(path="d.csv", kind="data_file")],
        tmp_path=tmp_path,
    )
    with pytest.raises(WiredError, match="G-11"):
        ctrl._export_suite_imports(DataStream())


def test_manifest_loads_string_imports(tmp_path: Path):
    data = {
        "meta": {"assessment_purpose": "scheduled"},
        "infrastructure": {
            "zap_mode": "demon",
            "browser_type": "chrome-headless",
            "zap_work_timeout_min": 60,
            "idle_timeout_min": 10,
        },
        "security_configuration": {
            "base_url_override": "http://juice-shop:3000",
            "allowed_extra_domains": "",
            "scan_policy": "custom_policy",
            "auth_type": "Без авторизации",
        },
        "test_suites": {
            "imports": ["extra.txt"],
            "pages": {},
            "scenarios": [],
            "test_data_constructor": [],
        },
    }
    m = Wired.model_validate(data)
    assert m.test_suites.imports[0].path == "extra.txt"
