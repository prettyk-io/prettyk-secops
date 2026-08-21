# -*- coding: utf-8 -*-
"""W5 acceptance: Discovery Engine models + extractor + builder + compiler."""
import pytest
from models.discovery import (
    DiscoverySession, PageFamily, StateVariant, StateRevision,
    DiscoveryElement, Candidate, Transition, PersonaContext, Evidence,
)
from utils.discovery_element_extractor import extract_elements
from utils.discovery_candidate_builder import build_candidates
from utils.discovery_compiler import compile_wired, merge_elements, merge_wired, element_fingerprint


class TestDiscoveryModels:
    def test_session_defaults(self):
        s = DiscoverySession(session_id="test")
        assert s.session_id == "test"
        assert s.status == "active"
        assert s.page_families == []
        assert s.transitions == []

    def test_persona_context_defaults(self):
        p = PersonaContext()
        assert p.auth_subject_kind == "anonymous"
        assert p.locale == "ru-RU"
        assert p.viewport_profile == "desktop"

    def test_candidate_tiers(self):
        c = Candidate(kind="test_id", value="css [data-testid=x]", score=1.0, tier="T0")
        assert c.tier == "T0"
        assert c.unique is True

    def test_revision_parent_chain(self):
        r1 = StateRevision(revision_id="rev_001")
        r2 = StateRevision(revision_id="rev_002", parent_revision_id="rev_001")
        assert r1.parent_revision_id is None
        assert r2.parent_revision_id == "rev_001"

    def test_element_with_candidates(self):
        el = DiscoveryElement(
            semantic_name="email",
            value_class="email",
            candidates=[
                Candidate(kind="test_id", value="css [data-testid=email]", score=1.0, tier="T0"),
                Candidate(kind="label", value="css *[aria-label=Email]", score=0.82, tier="T1"),
            ],
        )
        assert len(el.candidates) == 2
        assert el.value_class == "email"


class TestElementExtractor:
    def test_extracts_textbox_with_label(self):
        nodes = [
            {"role": "textbox", "name": "Email Address", "tagName": "input",
             "properties": {"type": "email", "id": "email", "name": "email"}}
        ]
        result = extract_elements(nodes)
        assert len(result) == 1
        assert result[0]["value_class"] == "email"
        assert result[0]["role"] == "textbox"

    def test_password_field_classified_as_secret(self):
        nodes = [
            {"role": "textbox", "name": "Password", "tagName": "input",
             "properties": {"type": "password", "id": "pass", "name": "password"}}
        ]
        result = extract_elements(nodes)
        assert len(result) == 1
        assert result[0]["value_class"] == "secret"

    def test_generated_id_filtered(self):
        nodes = [
            {"role": "textbox", "name": "Username", "tagName": "input",
             "properties": {"type": "text", "id": ":r1:", "name": "user"}}
        ]
        result = extract_elements(nodes)
        assert len(result) == 1
        assert result[0]["clean_id"] == ""

    def test_non_interactive_skipped(self):
        nodes = [
            {"role": "heading", "name": "Welcome", "tagName": "h1", "properties": {}},
            {"role": "textbox", "name": "Name", "tagName": "input", "properties": {"type": "text"}},
        ]
        result = extract_elements(nodes)
        assert len(result) == 1
        assert result[0]["role"] == "textbox"


class TestCandidateBuilder:
    def test_builds_t0_candidate_test_id(self):
        elements = [{
            "tag": "button",
            "role": "button",
            "accessible_name": "Submit",
            "test_id": "submit",
            "clean_id": "",
            "label": "",
            "label_for": "",
            "placeholder": "",
            "name_attr": "",
            "type_attr": "",
            "value_class": "unknown",
            "node_id": "1",
        }]
        result = build_candidates(elements)
        assert len(result) == 1
        assert len(result[0]["candidates"]) >= 1
        assert result[0]["candidates"][0]["tier"] == "T0"

    def test_t3_fallback_when_no_evidence(self):
        elements = [{
            "tag": "input",
            "role": "textbox",
            "accessible_name": "",
            "test_id": "",
            "clean_id": "",
            "label": "",
            "label_for": "",
            "placeholder": "",
            "name_attr": "",
            "type_attr": "text",
            "value_class": "unknown",
            "node_id": "1",
        }]
        result = build_candidates(elements)
        assert len(result) == 1
        if result[0]["candidates"]:
            assert result[0]["candidates"][0]["tier"] == "T3"


class TestCompiler:
    def test_empty_session_returns_valid_wired(self):
        session = {
            "pages": [],
            "target_url": "https://example.com",
        }
        wired = compile_wired(session)
        assert wired["meta"]["project_id"] == "discovery"
        assert wired["test_suites"]["pages"] == {}

    def test_single_page_with_elements(self):
        session = {
            "pages": [{
                "name": "Login page",
                "url": "/login",
                "elements": [{
                    "id": "email",
                    "label": "Email Address",
                    "accessible_name": "Email",
                    "value_class": "email",
                    "candidates": [
                        {"kind": "test_id", "value": "data-testid=email", "score": 1.0, "unique": True, "tier": "T0"},
                    ],
                }],
            }],
            "target_url": "https://example.com",
        }
        wired = compile_wired(session)
        assert len(wired["test_suites"]["pages"]) == 1
        page = list(wired["test_suites"]["pages"].values())[0]
        assert page["url"] == "/login"
        assert len(page["elements"]) >= 1

    def test_t3_element_skipped_or_manual(self):
        session = {
            "pages": [{
                "name": "Form",
                "url": "/form",
                "elements": [{
                    "id": "bad_el",
                    "label": "Bad",
                    "accessible_name": "bad",
                    "value_class": "unknown",
                    "candidates": [
                        {"kind": "xpath", "value": "xpath=//div", "score": 0.1, "unique": True, "tier": "T3"},
                    ],
                }],
            }],
            "target_url": "https://example.com",
        }
        wired = compile_wired(session)
        page = list(wired["test_suites"]["pages"].values())[0]
        has_manual = any("manual" in el.get("_trust", "") for el in page["elements"])
        assert has_manual or len(page["elements"]) == 1  # T3 with _trust=manual-required

    def test_value_class_secret_goes_to_data_module(self):
        session = {
            "pages": [{
                "name": "Login",
                "url": "/login",
                "elements": [{
                    "id": "password",
                    "label": "Password",
                    "accessible_name": "Password",
                    "value_class": "secret",
                    "candidates": [
                        {"kind": "name", "value": "name=password", "score": 0.65, "unique": True, "tier": "T1"},
                    ],
                }],
            }],
            "target_url": "https://example.com",
        }
        wired = compile_wired(session)
        data = wired["test_suites"].get("data_module", {})
        auth = data.get("auth", {})
        assert "password" in auth or any("password" in str(v) for v in auth.values())


class TestMerge:
    """Incremental merge: preserve manual edits, auto-upgrade, mark disappeared."""
    def test_manual_edit_survives_merge(self):
        existing = [
            {"id": "el_1", "label": "Email", "constructor": ["locator emailControl"], "_trust": "manual-edited", "slot": "pf_login", "tag": "input", "role": "textbox"},
        ]
        new_ir = [
            {"id": "email", "label": "Email", "accessible_name": "Email", "value_class": "unknown", "tag": "input", "role": "textbox",
             "candidates": [{"kind": "test_id", "value": "css [data-testid=x]", "score": 1.0, "unique": True, "tier": "T0"}]},
        ]
        result = merge_elements(existing, new_ir)
        assert len(result) == 1
        assert result[0]["_merge_action"] == "kept-manual"
        assert result[0]["_trust"] == "manual-edited"
        assert result[0]["constructor"][0] == "locator emailControl"

    def test_auto_trust_upgraded_on_re_discovery(self):
        existing = [
            {"id": "el_1", "label": "Email", "constructor": ["locator old"], "_trust": "auto", "slot": "pf_login", "tag": "input", "role": "textbox"},
        ]
        new_ir = [
            {"id": "email", "label": "Email", "accessible_name": "Email", "value_class": "email", "tag": "input", "role": "textbox",
             "candidates": [{"kind": "test_id", "value": "css [data-testid=email]", "score": 1.0, "unique": True, "tier": "T0"}]},
        ]
        result = merge_elements(existing, new_ir)
        assert len(result) == 1
        assert result[0]["_merge_action"] == "auto-upgraded"
        assert result[0]["constructor"][0] == "locator [data-testid=email]"

    def test_new_element_appended(self):
        existing = [
            {"id": "el_1", "label": "Email", "constructor": ["locator emailControl"], "_trust": "auto", "slot": "pf_login", "tag": "input", "role": "textbox"},
        ]
        new_ir = [
            {"id": "password", "label": "Password", "accessible_name": "Password", "value_class": "secret", "tag": "input", "role": "textbox",
             "candidates": [{"kind": "clean_id", "value": "id passwordControl", "score": 0.95, "unique": True, "tier": "T0"}]},
        ]
        result = merge_elements(existing, new_ir)
        assert len(result) == 2  # Password new + Email not-detected
        new_el = [e for e in result if e.get("_merge_action") == "new"]
        gone_el = [e for e in result if e.get("_merge_action") == "not-detected"]
        assert len(new_el) == 1
        assert len(gone_el) == 1
        assert new_el[0]["label"] == "Password"
        assert gone_el[0]["label"] == "Email"

    def test_disappeared_element_marked_not_removed(self):
        existing = [
            {"id": "el_1", "label": "Email", "constructor": ["locator emailControl"], "_trust": "auto", "slot": "pf_login", "tag": "input", "role": "textbox"},
        ]
        new_ir: list = []
        result = merge_elements(existing, new_ir)
        assert len(result) == 1
        assert result[0]["_merge_action"] == "not-detected"
        assert result[0].get("_removed") is True

    def test_fingerprint_match_when_label_and_tag_differ_nominally(self):
        existing = [
            {"id": "el_1", "label": "Submit", "constructor": ["locator submitBtn"], "_trust": "auto", "slot": "pf_main", "tag": "button", "role": "button"},
        ]
        new_ir = [
            {"id": "submit", "label": "Submit", "accessible_name": "Submit", "value_class": "unknown", "tag": "button", "role": "button",
             "candidates": [{"kind": "test_id", "value": "css [data-testid=go]", "score": 1.0, "unique": True, "tier": "T0"}]},
        ]
        result = merge_elements(existing, new_ir)
        assert len(result) == 1
        assert result[0]["_merge_action"] == "auto-upgraded"

    def test_merge_wired_preserves_manual_page_edits(self):
        existing = {
            "meta": {"assessment_purpose": "manual", "project_id": "juice", "discovery_merge_count": 2},
            "infrastructure": {"base_url_override": "http://example.com"},
            "test_suites": {
                "pages": {
                    "pf_Juice Shop Register": {
                        "url": "/#/register",
                        "elements": [
                            {"id": "el_email", "label": "Email field", "constructor": ["locator emailControl"], "_trust": "manual-edited", "tag": "input", "role": "textbox", "slot": "pf_register"},
                        ],
                        "actions": [],
                    }
                },
                "scenarios": [], "data_module": {}, "fuzzers": [], "imports": [],
                "editor_folders": {"page_models": ["pf_Juice Shop Register"], "data_models": [], "scenarios": [], "fuzzers": []},
            },
            "scanning_and_fuzzing_targets": {"api": [], "gui": []},
            "openapi_swagger_scanning": {"enabled": False, "imports": []},
            "security_configuration": {"scan_policy": "default", "base_url_override": "http://example.com"},
        }
        new_ir = {
            "pages": [{
                "name": "Juice Shop Register",
                "url": "/#/register",
                "elements": [
                    {"id": "email", "label": "Email field", "accessible_name": "Email field", "value_class": "email", "tag": "input", "role": "textbox",
                     "candidates": [{"kind": "test_id", "value": "css [data-testid=email]", "score": 1.0, "unique": True, "tier": "T0"}]},
                ],
            }],
            "target_url": "http://example.com", "project_id": "juice", "initiator": "Discovery Engine",
        }
        result = merge_wired(existing, new_ir)
        page = result["test_suites"]["pages"]["pf_Juice Shop Register"]
        assert page is not None
        email_el = [e for e in page["elements"] if e.get("label") == "Email field"]
        assert len(email_el) == 1
        assert email_el[0]["_merge_action"] == "kept-manual"
        assert email_el[0]["_trust"] == "manual-edited"
        assert email_el[0]["constructor"][0] == "locator emailControl"
        assert result["meta"]["discovery_merge_count"] == 3

    def test_merge_wired_adds_new_page(self):
        existing = {
            "meta": {"assessment_purpose": "manual", "project_id": "juice"},
            "infrastructure": {"base_url_override": "http://example.com"},
            "test_suites": {
                "pages": {
                    "pf_Login": {"url": "/login", "elements": [], "actions": []},
                },
                "scenarios": [], "data_module": {}, "fuzzers": [], "imports": [],
                "editor_folders": {"page_models": ["pf_Login"], "data_models": [], "scenarios": [], "fuzzers": []},
            },
            "scanning_and_fuzzing_targets": {"api": [], "gui": []},
            "openapi_swagger_scanning": {"enabled": False, "imports": []},
            "security_configuration": {"scan_policy": "default", "base_url_override": "http://example.com"},
        }
        new_ir = {
            "pages": [{
                "name": "Register",
                "url": "/#/register",
                "elements": [
                    {"id": "pass", "label": "Password", "accessible_name": "Password", "value_class": "secret", "tag": "input", "role": "textbox",
                     "candidates": [{"kind": "clean_id", "value": "id pass", "score": 0.95, "unique": True, "tier": "T0"}]},
                ],
            }],
            "target_url": "http://example.com", "project_id": "juice", "initiator": "Discovery Engine",
        }
        result = merge_wired(existing, new_ir)
        assert "pf_Login" in result["test_suites"]["pages"]
        assert "pf_Register" in result["test_suites"]["pages"]
        reg_page = result["test_suites"]["pages"]["pf_Register"]
        assert len(reg_page["elements"]) >= 2  # navigate + password

    def test_element_fingerprint_consistent(self):
        el_a = {"tag": "input", "role": "textbox", "label": "Email"}
        el_b = {"tag": "input", "role": "textbox", "label": "Email"}
        assert element_fingerprint(el_a) == element_fingerprint(el_b)
        el_c = {"tag": "button", "role": "button", "label": "Email"}
        assert element_fingerprint(el_a) != element_fingerprint(el_c)