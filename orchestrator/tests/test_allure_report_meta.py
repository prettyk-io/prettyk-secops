# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path

from utils.allure_report_meta import (
    DEFAULT_REPORT_NAME,
    resolve_allure_service_base,
    write_allure_report_meta,
)


def test_write_meta_files(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("PK_CHECK_ID", "chk_demo")
    monkeypatch.setenv("PK_QUALITY_GATE", "0")
    monkeypatch.delenv("PK_ALLURE_REPORT_NAME", raising=False)
    info = write_allure_report_meta(tmp_path)
    assert info["report_name"] == DEFAULT_REPORT_NAME
    executor = json.loads((tmp_path / "executor.json").read_text(encoding="utf-8"))
    assert executor["reportName"] == DEFAULT_REPORT_NAME
    assert executor["buildName"] == "chk_demo"
    env = (tmp_path / "environment.properties").read_text(encoding="utf-8")
    assert "check_id=chk_demo" in env
    assert "quality_gate=0" in env
    cats = json.loads((tmp_path / "categories.json").read_text(encoding="utf-8"))
    assert any(c.get("name", "").startswith("Инфраструктура") for c in cats)


def test_write_meta_files_dynamic_name(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("PK_SCENARIO_NAME", "Авторизация и сканирование профиля")
    info = write_allure_report_meta(tmp_path)
    assert info["report_name"] == "Авторизация и сканирование профиля"
    executor = json.loads((tmp_path / "executor.json").read_text(encoding="utf-8"))
    assert executor["reportName"] == "Авторизация и сканирование профиля"


def test_resolve_allure_service_base_engine(monkeypatch) -> None:
    monkeypatch.delenv("PK_ALLURE_URL", raising=False)
    monkeypatch.setenv("PK_ALLURE_ENGINE", "2")
    assert resolve_allure_service_base() == "http://127.0.0.1:5051"
    monkeypatch.setenv("PK_ALLURE_ENGINE", "3")
    assert resolve_allure_service_base() == "http://127.0.0.1:5050"
    monkeypatch.delenv("PK_ALLURE_ENGINE", raising=False)
    # дефолт engine теперь 3 → канон :5050
    assert resolve_allure_service_base() == "http://127.0.0.1:5050"
    monkeypatch.setenv("PK_ALLURE_URL", "http://custom:9/")
    assert resolve_allure_service_base() == "http://custom:9"
