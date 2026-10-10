# -*- coding: utf-8 -*-
"""RUN-GATE-MARKERS: guard — каталог keywords.json не дрейфует от адаптеров (H3).

Каталог едят `constructorLanguage` / signature-help / penguin-гейт запуска;
дрейф (28.08 vs адаптеры 25.09) — радиоактивная зона ложных маркеров.
Тест гоняет тот же генератор, что и `export_keywords.py`, и сверяет обе копии.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if str(REPO / "orchestrator") not in sys.path:
    sys.path.insert(0, str(REPO / "orchestrator"))

from tools.export_keywords import build_catalog, render_catalog  # noqa: E402

_CATALOGS = (
    REPO / "frontend" / "src" / "generated" / "keywords.json",
    REPO / "cosmo" / "src" / "generated" / "keywords.json",
)


def test_keywords_catalogs_in_sync_with_adapters() -> None:
    content = render_catalog(build_catalog())
    for path in _CATALOGS:
        assert path.is_file(), f"каталог отсутствует: {path}"
        current = path.read_text(encoding="utf-8")
        assert current == content, (
            f"{path} разошёлся с адаптерами — перегенерируйте: "
            f"python orchestrator/tools/export_keywords.py"
        )


def test_scanner_scan_wave_methods_present() -> None:
    """SCAN-волна (`harden_active_scan`, `get_alerts_by_baseurl`) есть в каталоге."""
    catalog = build_catalog()
    actions = catalog["components"]["scanner"]["actions"]
    assert "harden_active_scan" in actions
    assert "get_alerts_by_baseurl" in actions