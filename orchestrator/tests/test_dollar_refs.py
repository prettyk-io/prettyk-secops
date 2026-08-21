# -*- coding: utf-8 -*-
"""Канон ссылок $name / $path (legacy ${…})."""
from __future__ import annotations

from core.data_stream import DataStream
from core.expr import (
    KindDict,
    format_ref,
    interpolate,
    match_ref_at,
    parse_value,
    strip_ref,
)
from core.method_id import resolve_call, split_pretty_args
from core.page_layout import parse_page_layout


def test_strip_and_format():
    assert strip_ref("$username") == "username"
    assert strip_ref("${username}") == "username"
    assert strip_ref("$user.email") == "user.email"
    assert strip_ref("$names[0]") == "names[0]"
    assert strip_ref("$ENV:FOO") == "ENV:FOO"
    assert format_ref("username") == "$username"


def test_interpolate_dollar_and_brace():
    assert interpolate("hi $u!", lambda p: {"u": "Max"}[p]) == "hi Max!"
    assert interpolate("hi ${u}!", lambda p: {"u": "Max"}[p]) == "hi Max!"
    assert (
        interpolate("q=$payload.q", lambda p: "x" if p == "payload.q" else "?") == "q=x"
    )


def test_match_ref_at_and_split_args():
    tok, end = match_ref_at("a $x/b", 2)
    assert tok == "$x" and end == 4
    assert split_pretty_args("$base_url/#/login") == ["$base_url/#/login"]
    assert split_pretty_args("email $username") == ["email", "$username"]
    assert resolve_call("ВставитьЗначение email $username") == (
        "webdriver|send_keys|email|$username"
    )


def test_element_decl_optional_dollar():
    els, _ = parse_page_layout(
        "Элемент $email = css #email\nЭлемент password = id pwd"
    )
    assert {e["id"] for e in els} == {"email", "password"}


def test_stream_resolve():
    s = DataStream()
    s.set("host", "h")
    assert s.resolve("$host") == "h"
    assert s.resolve_arg("https://$host/x") == "https://h/x"
    assert s.resolve_arg("${host}") == "h"


def test_parse_value_scalars_and_prefixed():
    """Ветки parse_value после extract хелперов (SQ-BE-2f)."""
    resolve = lambda p: {"n": 7, "user": {"role": "a"}}[p]
    assert parse_value("true", resolve) is True
    assert parse_value("null", resolve) is None
    assert parse_value("42", resolve) == 42
    assert parse_value("$n", resolve) == 7
    lst = parse_value('Список ["a", "b"]', resolve)
    assert lst == ["a", "b"]
    obj = parse_value('Объект { role: "x" }', resolve)
    assert isinstance(obj, KindDict) and obj["role"] == "x"
