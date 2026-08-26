# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import zipfile
from pathlib import Path

from utils.secret_scan import (
    package_secret_block_enabled,
    scan_text_for_secrets,
    scan_zip_for_secrets,
)


def test_scan_high_confidence_patterns():
    text = (
        "key=AKIAIOSFODNN7EXAMPLE\n"
        "-----BEGIN RSA PRIVATE KEY-----\nMIIE\n"
        "tok=ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD\n"
    )
    hits = scan_text_for_secrets(text, location="demo.txt")
    rules = {h["rule"] for h in hits}
    assert "aws_access_key_id" in rules
    assert "private_key_pem" in rules
    assert "github_token" in rules
    assert all("location" in h for h in hits)
    # never echo matched secret material
    blob = json.dumps(hits)
    assert "AKIAIOSFODNN7EXAMPLE" not in blob
    assert "BEGIN RSA" not in blob


def test_clean_text_no_hits():
    assert scan_text_for_secrets("status=ok sample_count=2") == []


def test_package_block_env(monkeypatch):
    monkeypatch.delenv("PK_PACKAGE_ALLOW_SECRETS", raising=False)
    assert package_secret_block_enabled() is True
    monkeypatch.setenv("PK_PACKAGE_ALLOW_SECRETS", "1")
    assert package_secret_block_enabled() is False


def test_scan_zip(tmp_path):
    zpath = tmp_path / "p.zip"
    with zipfile.ZipFile(zpath, "w") as zf:
        zf.writestr("meta/meta.json", '{"ok":true}')
        zf.writestr("run/leak.txt", "AKIA0123456789ABCDEF")
    hits = scan_zip_for_secrets(zpath)
    assert any(h["rule"] == "aws_access_key_id" for h in hits)
    assert any(h["location"] == "run/leak.txt" for h in hits)


def test_scan_run_wired_and_cuts(tmp_path):
    from utils.secret_scan import scan_run_dir_for_secrets

    run = tmp_path / "run1"
    run.mkdir()
    (run / "Wired.json").write_text(
        '{"note":"AKIA0123456789ABCDEF"}', encoding="utf-8"
    )
    cuts = run / "log_cuts"
    cuts.mkdir()
    (cuts / "cut-1.log").write_text(
        "line AKIAABCDEFGHIJKLMNOP rest\n", encoding="utf-8"
    )
    hits = scan_run_dir_for_secrets(run)
    locs = {h["location"].lower() for h in hits}
    assert "run/wired.json" in locs
    assert "logs/cuts/cut-1.log" in locs


def test_no_false_akia_on_short_token():
    # fixtures-safe: короткие/частичные строки не триггерят
    assert scan_text_for_secrets("AKIA short") == []
    assert scan_text_for_secrets("key=AKIAnotlongenough") == []
    assert scan_text_for_secrets('{"aws_access_key_id":"EXAMPLE"}') == []


def test_zip_priority_Wired_and_cuts(tmp_path):
    zpath = tmp_path / "p.zip"
    with zipfile.ZipFile(zpath, "w") as zf:
        zf.writestr("meta/package.json", '{"ok":true}')
        zf.writestr("fuzz/digest.json", '{"ok":true}')
        zf.writestr("logs/cuts/a.log", "AKIA0123456789ABCDEF")
        zf.writestr("run/Wired.json", '{"x":1}')
    hits = scan_zip_for_secrets(zpath)
    assert any(h["location"] == "logs/cuts/a.log" for h in hits)
