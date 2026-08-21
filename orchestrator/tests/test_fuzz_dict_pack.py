# -*- coding: utf-8 -*-
"""Wave A: KDT fuzz pack.json + corpora files."""
from __future__ import annotations

from pathlib import Path

from utils.fuzz_dict_pack import (
    INTENT_DIR,
    PACK_PATH,
    corpus_max_lines,
    list_pack_corpus_names,
    load_fuzz_pack,
    validate_fuzz_pack,
)


def test_pack_json_valid_and_files_exist() -> None:
    assert PACK_PATH.is_file()
    errors = validate_fuzz_pack()
    assert errors == [], errors
    pack = load_fuzz_pack()
    assert pack.get("id") == "kdt-intent-pack"
    names = list_pack_corpus_names()
    for required in (
        "intent_boundary",
        "intent_sqli_smoke",
        "intent_xss_smoke",
        "intent_path_smoke",
        "intent_ssti_smoke",
    ):
        assert required in names
        assert (INTENT_DIR / f"{required}.txt").is_file()
    assert corpus_max_lines("intent_boundary") <= 200
    assert corpus_max_lines("missing_nope") <= 200


def test_pack_corpora_paths_match_disk() -> None:
    pack = load_fuzz_pack()
    root = Path(INTENT_DIR)
    for row in pack["corpora"]:
        fp = root / str(row["path"])
        text = fp.read_text(encoding="utf-8")
        lines = [
            ln
            for ln in text.splitlines()
            if ln.strip() and not ln.strip().startswith("#")
        ]
        assert lines, row["name"]
