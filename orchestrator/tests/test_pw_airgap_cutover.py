# -*- coding: utf-8 -*-
"""PW-C2/PW-C3: airgap bundle + registry cutover tests."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_orch_root = Path(__file__).resolve().parents[1]
_repo_root = _orch_root.parent
if str(_orch_root) not in sys.path:
    sys.path.insert(0, str(_orch_root))


SERVICES_DIR = _repo_root / "services"
SCRIPTS_DIR = SERVICES_DIR / "scripts"


# ── PW-C2: airgap bundle ────────────────────────────────────────────────────


def test_airgap_bundle_script_exists():
    assert (SCRIPTS_DIR / "airgap-bundle.sh").is_file(), "airgap-bundle.sh missing"
    assert (SCRIPTS_DIR / "airgap-bundle.ps1").is_file(), "airgap-bundle.ps1 missing"


def test_airgap_bundle_uses_docker_save():
    sh = (SCRIPTS_DIR / "airgap-bundle.sh").read_text(encoding="utf-8")
    assert "docker save" in sh
    assert "pk-playwright-authoring:local" in sh


def test_airgap_bundle_no_playwright_install():
    """PW-C2: bundle НЕ выполняет playwright install (браузеры уже в образе)."""
    sh = (SCRIPTS_DIR / "airgap-bundle.sh").read_text(encoding="utf-8")
    ps1 = (SCRIPTS_DIR / "airgap-bundle.ps1").read_text(encoding="utf-8")
    for txt in (sh, ps1):
        # Команды (не комментарии) — строки без '#' не должны звать install
        for line in txt.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            assert "playwright install" not in stripped
            assert "npx playwright" not in stripped


def test_airgap_dockerfile_no_runtime_install():
    """PW-C2: Dockerfile/entrypoint не тянут pip/npx на рантайме."""
    dockerfile = (SERVICES_DIR / "playwright-authoring" / "Dockerfile").read_text(encoding="utf-8")
    entrypoint = (SERVICES_DIR / "playwright-authoring" / "entrypoint.sh").read_text(encoding="utf-8")
    # pip install playwright — на build-этапе (Dockerfile), НЕ на рантайме (entrypoint)
    assert "playwright install" not in entrypoint
    assert "npx playwright" not in entrypoint
    assert "pip install" not in entrypoint
    # Dockerfile обязан ставить либы на build-этапе
    assert "pip install playwright" in dockerfile


# ── PW-C3: registry cutover ────────────────────────────────────────────────


def test_export_keywords_webdriver_is_playwright():
    """PW-C3: registry webdriver → PlaywrightAdapter (не WebDriverAdapter)."""
    import tools.export_keywords as ek

    webdriver_src = ek.COMPONENT_SOURCES["webdriver"]
    assert "playwright_adapter" in webdriver_src[0], (
        f"webdriver registry должен указывать на PlaywrightAdapter, а не {webdriver_src}"
    )
    assert webdriver_src[1] == "PlaywrightAdapter"


def test_export_keywords_browser_is_playwright():
    """PW-C3: browser компонент → PlaywrightAdapter (один мир, не BrowserAdapter)."""
    import tools.export_keywords as ek

    browser_src = ek.COMPONENT_SOURCES["browser"]
    assert "playwright_adapter" in browser_src[0], (
        f"browser registry должен указывать на PlaywrightAdapter, а не {browser_src}"
    )


def test_wired_validate_webdriver_uses_playwright():
    """PW-C3: build_dry_action_factory webdriver → PlaywrightAdapter."""
    import inspect
    import core.wired_validate as wv

    src = inspect.getsource(wv.build_dry_action_factory)
    # PlaywrightAdapter импортируется для webdriver
    assert "PlaywrightAdapter" in src
    # WebDriverAdapter больше НЕ используется как источник webdriver-методов
    assert "WebDriverAdapter.__new__" not in src


def test_p0_allowlist_all_actions_on_playwright():
    """PW-C3: все 25 P0-методов реализованы в PlaywrightAdapter (parity gap закрыт)."""
    from adapters.playwright_adapter import PlaywrightAdapter
    from core.pretty_method_spec import P0_ALLOWLIST

    missing = [
        spec.action for spec in P0_ALLOWLIST
        if spec.component == "webdriver" and not hasattr(PlaywrightAdapter, spec.action)
    ]
    assert not missing, f"PlaywrightAdapter missing P0 actions: {missing}"
