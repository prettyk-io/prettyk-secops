# -*- coding: utf-8 -*-
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from models.wired import TestSuites as ManifestTestSuites


def test_editor_folders_are_authoring_metadata_on_flat_suites():
    suites = ManifestTestSuites.model_validate(
        {
            "pages": {"login": {"title": "login", "path": "", "constructor": ""}},
            "scenarios": [{"scenario_name": "Вход", "description": "Smoke", "steps": []}],
            "test_data_constructor": [],
            "editor_folders": {
                "pages": [{"id": "folder_1", "title": "Авторизация", "members": ["login"]}],
                "scenarios": [{"id": "folder_2", "title": "Smoke", "members": ["Вход"]}],
                "modules": [],
            },
        }
    )

    assert suites.pages["login"].title == "login"
    assert suites.scenarios[0].description == "Smoke"
    assert suites.editor_folders.scenarios[0].members == ["Вход"]
