# -*- coding: utf-8 -*-
from utils.allowed_urls import (
    ALLOWED_URL_DENY_MSG,
    parse_allowed_url_tokens,
    url_allowed,
)


def test_parse_pipe_and_comma():
    assert parse_allowed_url_tokens(
        "https://a.test|*.lab.local,auth.x"
    ) == ["https://a.test", "*.lab.local", "auth.x"]


def test_url_prefix():
    assert url_allowed("https://rkn.gov.ru/path", "https://rkn.gov.ru")
    assert not url_allowed("https://evil.test/", "https://rkn.gov.ru")


def test_bare_host_and_port():
    assert url_allowed("http://juice-shop:3000/#/x", "juice-shop:3000")
    assert url_allowed("https://auth.dev.spaceport.ru/login", "auth.dev.spaceport.ru")
    assert not url_allowed("https://other.test/", "auth.dev.spaceport.ru")


def test_wildcard_subdomain():
    assert url_allowed("https://a.internal.bank/x", "*.internal.bank")
    assert url_allowed("https://internal.bank/x", "*.internal.bank")
    assert not url_allowed("https://internal.bank.evil/x", "*.internal.bank")


def test_deny_message_constant():
    assert "разрешенных" in ALLOWED_URL_DENY_MSG
