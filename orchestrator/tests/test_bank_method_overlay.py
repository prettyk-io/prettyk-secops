# -*- coding: utf-8 -*-
"""Bank MethodId overlay: aliases / extra без форка method_id.py."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_overlay_aliases_and_extra(tmp_path):
    overlay = {
        "aliases": {"БанкНажать": "Нажать"},
        "extra": {"БанкОткрыть": ["webdriver", "open"]},
        "ui_extra": ["БанкОткрыть"],
        "ui_hide": ["Сканер"],
    }
    path = tmp_path / "overlay.json"
    path.write_text(json.dumps(overlay, ensure_ascii=False), encoding="utf-8")

    # Изолированный процесс — не портим method_id в остальном pytest.
    script = f"""
import os, sys
os.environ["PK_METHOD_OVERLAY"] = {str(path)!r}
sys.path.insert(0, {str(ROOT)!r})
from core.method_id import lookup_method_id, method_tier, resolve_call
assert lookup_method_id("БанкНажать") == ("webdriver", "click")
assert lookup_method_id("БанкОткрыть") == ("webdriver", "open")
assert method_tier("БанкОткрыть") == "ui"
assert method_tier("Сканер") == "util"
assert resolve_call("БанкНажать css .ok") == "webdriver|click|css|.ok"
assert resolve_call("БанкОткрыть https://x") == "webdriver|open|https://x"
print("ok")
"""
    proc = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "ok" in proc.stdout
