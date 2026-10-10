# -*- coding: utf-8 -*-
"""Общие фикстуры тестов orchestrator.

MONITOR-RETENTION-TEST-LEAK: страховка изоляции — retention-каталоги
(видео/экспорты/каталоги прогонов) по умолчанию указывают на session-tmp, а НЕ
на реальные reports/. Тесты, которым нужны свои пути, переопределяют их через
monkeypatch (их патч приоритетнее и восстанавливается после теста).
"""
from __future__ import annotations

import importlib

import pytest


@pytest.fixture(scope="session", autouse=True)
def _retention_dirs_safety(tmp_path_factory):
    safe = tmp_path_factory.mktemp("retention_safety")
    layout = {
        "VIDEO_DIR": safe / "video",
        "LIVE_EXPORTS_DIR": safe / "exports",
        "RUNS_DIR": safe / "runs",
        "LIVE_DIR": safe / "live",
        "ALLURE_RESULTS_DIR": safe / "allure",
    }
    for path in layout.values():
        path.mkdir(parents=True, exist_ok=True)
    for mod_name in ("utils.retention_manager", "utils.monitor_retention"):
        try:
            mod = importlib.import_module(mod_name)
        except Exception:
            continue
        for attr, path in layout.items():
            if hasattr(mod, attr):
                setattr(mod, attr, path)
    yield
