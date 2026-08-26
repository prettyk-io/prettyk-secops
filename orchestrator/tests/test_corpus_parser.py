# -*- coding: utf-8 -*-
"""CD-2: corpus_parser — extract параметры/инпуты из DiscoveryCorpus."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from corpus.corpus_parser import (
    FormField,
    RequestTemplate,
    entry_to_template,
    extract_form_fields,
    parse_corpus,
)
from corpus.discovery_capture import DiscoveryCorpus, DiscoveryPage, NetworkEntry

SAMPLE_DOM = """
<html>
  <body>
    <form id="login" action="/api/login">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" value="a@b.c" />
      <input name="password" type="password" />
      <input name="csrf" type="hidden" value="token" />
      <select name="role">
        <option value="user">User</option>
      </select>
      <textarea name="notes"></textarea>
      <input type="submit" name="go" />
    </form>
  </body>
</html>
"""


# ── extract_form_fields ──


def test_extract_form_fields_basic():
    fields = extract_form_fields("http://x/#/login", SAMPLE_DOM)
    names = {f.name for f in fields}
    assert "email" in names
    assert "password" in names
    assert "role" in names
    assert "notes" in names
    # hidden + submit пропущены
    assert "csrf" not in names
    assert "go" not in names


def test_extract_form_fields_email_type_and_label():
    fields = extract_form_fields("http://x/#/login", SAMPLE_DOM)
    email = next(f for f in fields if f.name == "email")
    assert email.field_type == "email"
    assert email.tag == "input"
    assert email.label == "Email"
    assert email.selector == "#email"
    assert email.form_id == "login"
    assert email.form_action == "/api/login"


def test_extract_form_fields_empty_dom():
    assert extract_form_fields("http://x/", "") == []


def test_extract_form_fields_no_name_skipped():
    dom = "<input type='text' /><input name='a' type='text' />"
    fields = extract_form_fields("http://x/", dom)
    assert [f.name for f in fields] == ["a"]


# ── entry_to_template ──


def test_entry_to_template_query_params():
    entry = NetworkEntry(
        method="GET",
        url="http://x/search?q=hello&utm_source=fb",
        status=200,
    )
    tpl = entry_to_template(entry)
    assert tpl is not None
    assert [p["name"] for p in tpl.query_params] == ["q"]  # utm_source пропущен
    assert tpl.query_params[0]["value"] == "hello"
    assert tpl.body_fields == []


def test_entry_to_template_json_body():
    entry = NetworkEntry(
        method="POST",
        url="http://x/api/login",
        status=200,
        request_body='{"email":"a","password":"b","nested":{"x":1}}',
    )
    tpl = entry_to_template(entry)
    assert [f["name"] for f in tpl.body_fields] == ["email"]  # password + nested пропущены


def test_entry_to_template_form_encoded_body():
    entry = NetworkEntry(
        method="POST",
        url="http://x/api/login",
        status=200,
        request_body="email=a@b.c&password=b",
    )
    tpl = entry_to_template(entry)
    assert [f["name"] for f in tpl.body_fields] == ["email"]


def test_entry_to_template_none_url():
    assert entry_to_template(NetworkEntry(method="GET", url="", status=200)) is None


# ── parse_corpus ──


def test_parse_corpus_dedupes_and_splits():
    corpus = DiscoveryCorpus(
        pages=[
            DiscoveryPage(url="http://x/#/login", title="", dom=SAMPLE_DOM),
            DiscoveryPage(url="http://x/#/login", title="", dom=SAMPLE_DOM),  # дубль
        ],
        network=[
            NetworkEntry(
                method="GET",
                url="http://x/search?q=1",
                status=200,
            ),
            NetworkEntry(
                method="GET",
                url="http://x/search?q=1",
                status=200,
            ),  # дубль по method+path
        ],
    )
    result = parse_corpus(corpus)
    # email/password/role/notes — по одному разу (страницы дедупированы)
    names = [f.name for f in result["form_fields"]]
    assert names.count("email") == 1
    assert len(result["form_fields"]) == 4
    assert len(result["request_templates"]) == 1


def test_parse_corpus_empty():
    result = parse_corpus(DiscoveryCorpus())
    assert result["form_fields"] == []
    assert result["request_templates"] == []
