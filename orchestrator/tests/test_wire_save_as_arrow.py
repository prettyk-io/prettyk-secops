# -*- coding: utf-8 -*-
"""FE flatten embeds ` → save_as` in wire; BE must strip for validate/runtime."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.constructor_validate import validate_constructor
from core.language_engine import LanguageEngine
from core.language_parse import parse_script
from core.lang_ast import ActionNode
from core.pretty_data import pretty_line_to_wire
from core.wire_split import split_save_as_arrow


def test_split_save_as_arrow_unicode_and_ascii():
    assert split_save_as_arrow("core|generate_random_email → username") == (
        "core|generate_random_email",
        "username",
    )
    assert split_save_as_arrow("core|generate_uuid -> run_id") == (
        "core|generate_uuid",
        "run_id",
    )
    assert split_save_as_arrow('core|current_datetime|%d.%m %H:%M → stamp') == (
        "core|current_datetime|%d.%m %H:%M",
        "stamp",
    )
    assert split_save_as_arrow("webdriver|click|css|.x") == (
        "webdriver|click|css|.x",
        None,
    )


def test_parse_leaf_strips_arrow():
    leaf = LanguageEngine.parse_leaf("browser|get_cookies_count → c")
    assert leaf.constructor == "browser|get_cookies_count"
    assert leaf.save_as == "c"


def test_pretty_line_to_wire_accepts_fe_flatten():
    assert pretty_line_to_wire("core|generate_random_email → username") == (
        "core|generate_random_email",
        "username",
    )


def test_validate_constructor_accepts_fe_flatten_wire():
    assert [
        d
        for d in validate_constructor("core|generate_random_email → username")
        if d["severity"] == "error"
    ] == []


def test_validate_language_script_with_fe_flatten_lines():
    script = (
        "core|generate_random_email → username\n"
        "core|generate_uuid → run_id\n"
        "browser|get_cookies_count → c\n"
        'Лог "ok"'
    )
    assert [d for d in validate_constructor(script) if d["severity"] == "error"] == []
    nodes = parse_script(script)
    actions = [n for n in nodes if isinstance(n, ActionNode)]
    by_ctor = {n.constructor: n.save_as for n in actions}
    assert by_ctor["core|generate_random_email"] == "username"
    assert by_ctor["core|generate_uuid"] == "run_id"
    assert by_ctor["browser|get_cookies_count"] == "c"
