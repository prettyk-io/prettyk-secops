# -*- coding: utf-8 -*-
"""G-09: inspector не в AC-surface keywords; validate MethodId/legacy wire ок."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.constructor_validate import catalog_components, validate_constructor
from core.method_id import resolve_call
from tools.export_keywords import LEGACY_WIRE_COMPONENTS, build_catalog


def test_inspector_not_in_ac_surface_components():
    catalog = build_catalog()
    assert "inspector" not in (catalog.get("components") or {})
    assert "inspector" in LEGACY_WIRE_COMPONENTS
    legacy = catalog.get("legacy_components") or {}
    assert "inspector" in legacy
    assert legacy["inspector"].get("legacy_wire") is True
    assert "assert_in" in legacy["inspector"]["actions"]


def test_validate_still_accepts_inspector_wire():
    catalog = build_catalog()
    diags = validate_constructor(
        "inspector|assert_equals|a|a", catalog=catalog
    )
    assert not [d for d in diags if d.get("severity") == "error"]


def test_proverit_method_id_still_resolves_and_validates():
    catalog = build_catalog()
    wire = resolve_call("ПроверитьВСписке ${x} ${list}")
    assert wire is not None and wire.startswith("inspector|assert_in")
    diags = validate_constructor(wire, catalog=catalog)
    assert not [d for d in diags if d.get("severity") == "error"]


def test_catalog_components_merge_for_validate():
    catalog = build_catalog()
    merged = catalog_components(catalog)
    assert "webdriver" in merged
    assert "inspector" in merged
