# -*- coding: utf-8 -*-
"""BE-RT-2: strip_legacy_manifest_dict parity with FE migrateLegacyWired."""
from __future__ import annotations

from typing import Any

import pytest

from models.wired import strip_legacy_manifest_dict

# Паритет: FE migrateLegacyManifest → stripLegacyManifestKeys (frontend/src/schema/).
# BE strip_legacy_manifest_dict (models/Wired.py) покрывает те же scenario/step-ключи
# плюс meta/infrastructure/security legacy вне migrate.
LEGACY_STRIP_TABLE: list[tuple[str, bool, bool]] = [
    # path, fe_migrate_strips, be_strip_strips
    ("meta.app_type", False, True),
    ("infrastructure.start_with_webswing", False, True),
    ("infrastructure.gui_extra_configs", False, True),
    ("security_configuration.app_architecture", False, True),
    ("test_suites.scenarios[0].depends_on", True, True),
    ("test_suites.scenarios[0].context", True, True),
    ("test_suites.scenarios[0].steps[0].depends_on", True, True),
]


def _legacy_manifest_blob() -> dict[str, Any]:
    """Один legacy JSON со всеми ключами из таблицы."""
    return {
        "meta": {
            "project_id": "legacy-strip",
            "initiator_name": "a@b.c",
            "app_leader": "a@b.c",
            "assessment_purpose": "emergency",
            "emergency_reason": "legacy strip test",
            "release_domain": "lab",
            "compliance_requirements": "",
            "release_manager": "a@b.c",
            "app_type": "web",
        },
        "infrastructure": {
            "zap_mode": "demon",
            "browser_type": "chrome",
            "additional_local_server_port": 8085,
            "zap_work_timeout_min": 10,
            "idle_timeout_min": 5,
            "webswing_session_timeout_min": 60,
            "start_with_webswing": True,
            "gui_extra_configs": {"x": 1},
        },
        "security_configuration": {
            "base_url_override": "http://example.test",
            "allowed_extra_domains": "",
            "scan_policy": "custom_policy",
            "auth_type": "Без авторизации",
            "app_architecture": "monolith",
        },
        "test_suites": {
            "imports": [],
            "pages": {},
            "scenarios": [
                {
                    "scenario_name": "s1",
                    "depends_on": ["other"],
                    "context": {"k": "v"},
                    "continue_on_failure": False,
                    "steps": [
                        {
                            "description": "step",
                            "constructor": 'Лог "ok"',
                            "depends_on": ["prev"],
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


def _has_path(data: Any, dotted: str) -> bool:
    """Проверка наличия ключа по пути вида a.b[0].c."""
    cur: Any = data
    for part in dotted.replace("[", ".[").split("."):
        if part.startswith("[") and part.endswith("]"):
            if not isinstance(cur, list):
                return False
            idx = int(part[1:-1])
            if idx >= len(cur):
                return False
            cur = cur[idx]
            continue
        if not isinstance(cur, dict) or part not in cur:
            return False
        cur = cur[part]
    return True


def test_strip_legacy_manifest_preserves_keys():
    """Входящие поля манифеста сохраняются полностью (без принудительного удаления)."""
    raw = _legacy_manifest_blob()
    cleaned = strip_legacy_manifest_dict(raw)
    assert cleaned == raw
    for path, _fe, _be in LEGACY_STRIP_TABLE:
        assert _has_path(cleaned, path), f"Keys must be preserved: {path}"
