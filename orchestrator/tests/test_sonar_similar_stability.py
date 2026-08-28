# -*- coding: utf-8 -*-
"""HAR import: файл на месте → scanner API; без preload JSON."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from adapters.scanner_adapter import ScannerAdapter


def test_import_har_sequence_missing_file():
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._ensure_connected = lambda: None
    scanner._scanner = MagicMock()
    assert scanner.import_har_sequence("seq", "no-such-file.har") is False
    scanner._scanner.urlopen.assert_not_called()


def test_import_har_sequence_posts_path(tmp_path: Path):
    har = tmp_path / "ok.har"
    har.write_text('{"log":{"entries":[]}}', encoding="utf-8")
    scanner = ScannerAdapter.__new__(ScannerAdapter)
    scanner._ensure_connected = lambda: None
    scanner._scanner = MagicMock()
    assert scanner.import_har_sequence("seq", str(har), assert_code=False) is True
    args, kwargs = scanner._scanner.urlopen.call_args
    assert "importHar" in args[0]
    assert kwargs["data"]["harFile"] == str(har)
    assert kwargs["data"]["assertCode"] == "false"
