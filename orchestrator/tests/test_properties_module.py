# -*- coding: utf-8 -*-
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.errors import WiredError
from core.properties_module import (
    looks_like_properties_module,
    parse_properties_module,
)


def test_parse_hash_is_secret_not_comment():
    pairs = parse_properties_module(
        "username=admin\n#password_value=kdt_password\n"
    )
    assert pairs == [
        ("username", "admin", False),
        ("password_value", "kdt_password", True),
    ]


def test_looks_like_vs_url_and_pretty():
    assert looks_like_properties_module("username=admin\n#password_value=x\n")
    assert not looks_like_properties_module("/#/login\n/#/basket\n")
    assert not looks_like_properties_module('Пусть $x = "1"\n')


def test_dup_key():
    with pytest.raises(WiredError, match="дубль"):
        parse_properties_module("a=1\na=2\n")
