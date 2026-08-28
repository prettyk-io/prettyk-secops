# -*- coding: utf-8 -*-
"""UI Awakening for orphaned forms and fields (CRAWL-5)."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Sequence, Set
from urllib.parse import urlsplit

from corpus.corpus_parser import FormField, RequestTemplate
from corpus.service_map import FieldBinding, ServiceMap
from crawler.models import AwakenedEndpoint, CrawlerState, NetworkDeltaEntry

logger = logging.getLogger("orchestrator")

# Safe test values for awakening
_SAFE_VALUES: Dict[str, str] = {
    "email": "awakened@secops.test",
    "text": "awakened-test-value",
    "search": "awakened-test-value",
    "password": "AwakenedP@ss1",
    "number": "42",
    "tel": "+79991234567",
    "url": "https://secops.test/awakened",
    "textarea": "awakened multiline text",
}


def _get_safe_value(field_name: str, field_type: str = "text") -> str:
    ftype = (field_type or "text").lower().strip()
    name_low = (field_name or "").lower().strip()
    
    if "email" in name_low or ftype == "email":
        return _SAFE_VALUES["email"]
    if "pass" in name_low or ftype == "password":
        return _SAFE_VALUES["password"]
    if "num" in name_low or "count" in name_low or ftype in {"number", "spinbutton"}:
        return _SAFE_VALUES["number"]
    if "search" in name_low or ftype == "search":
        return _SAFE_VALUES["search"]
    return _SAFE_VALUES.get(ftype, _SAFE_VALUES["text"])


def find_orphan_fields(
    form_fields: Sequence[FormField],
    network_entries: Sequence[NetworkDeltaEntry],
) -> List[FormField]:
    """Identify form fields that have not been observed in any network request."""
    # Collect all parameter names captured in network requests
    observed_param_names: Set[str] = set()
    for entry in network_entries:
        # Check query params
        if entry.url and "?" in entry.url:
            from urllib.parse import parse_qsl, urlsplit
            query = urlsplit(entry.url).query
            for k, _ in parse_qsl(query, keep_blank_values=True):
                observed_param_names.add(k.lower())
        # Check request body (JSON or form-urlencoded)
        if entry.request_body:
            body = entry.request_body.strip()
            if body.startswith("{") and body.endswith("}"):
                try:
                    import json
                    parsed = json.loads(body)
                    if isinstance(parsed, dict):
                        for k in parsed.keys():
                            observed_param_names.add(str(k).lower())
                except Exception:
                    pass
            elif "=" in body:
                from urllib.parse import parse_qsl
                for k, _ in parse_qsl(body, keep_blank_values=True):
                    observed_param_names.add(k.lower())

    orphans: List[FormField] = []
    for f in form_fields:
        if not f.name:
            continue
        if f.name.lower() not in observed_param_names:
            orphans.append(f)
    return orphans


def awaken_orphan_field_ui(
    page: Any,
    field: FormField,
    *,
    network_collector: Optional[List[NetworkDeltaEntry]] = None,
    settle_ms: int = 750,
    timeout_ms: int = 5000,
) -> Optional[NetworkDeltaEntry]:
    """
    Perform browser-native UI awakening on an orphan field.

    1. Fill field with safe test value.
    2. Submit via closest submit button or form.press("Enter").
    3. Settle and return newly triggered network request (if any).
    """
    if page is None:
        return None

    safe_val = _get_safe_value(field.name, field.field_type)
    filled = False

    # 1. Fill the field using locator hierarchy
    # By label
    try:
        page.get_by_label(field.name).first.fill(safe_val, timeout=timeout_ms)
        filled = True
    except Exception:
        pass

    if not filled:
        # By placeholder
        try:
            page.get_by_placeholder(field.name).first.fill(safe_val, timeout=timeout_ms)
            filled = True
        except Exception:
            pass

    if not filled and field.selector:
        # By selector
        try:
            page.locator(field.selector).first.fill(safe_val, timeout=timeout_ms)
            filled = True
        except Exception:
            pass

    if not filled:
        # By generic name/id
        try:
            page.locator(f"input[name='{field.name}'], textarea[name='{field.name}']").first.fill(safe_val, timeout=timeout_ms)
            filled = True
        except Exception:
            return None

    # Track network count before submit
    count_before = len(network_collector) if network_collector is not None else 0

    # 2. Trigger Submit
    submitted = False
    # Try finding submit button in parent form or nearby
    try:
        if field.form_id:
            page.locator(f"form#{field.form_id} button[type='submit'], form#{field.form_id} input[type='submit']").first.click(timeout=timeout_ms)
            submitted = True
    except Exception:
        pass

    if not submitted:
        try:
            # Try submit button or button containing search/submit/войти/отправить
            page.get_by_role("button", name=r"(искать|поиск|search|submit|отправить|войти|login)").first.click(timeout=timeout_ms)
            submitted = True
        except Exception:
            pass

    if not submitted:
        try:
            # Press Enter on the input itself
            page.locator(f"input[name='{field.name}']").first.press("Enter", timeout=timeout_ms)
            submitted = True
        except Exception:
            pass

    if not submitted:
        return None

    # 3. Settle
    if hasattr(page, "wait_for_timeout"):
        page.wait_for_timeout(settle_ms)
    elif hasattr(page, "wait_for_load_state"):
        try:
            page.wait_for_load_state("domcontentloaded", timeout=settle_ms)
        except Exception:
            pass

    # Check if a new network request arrived
    if network_collector is not None and len(network_collector) > count_before:
        return network_collector[-1]

    return None


def run_ui_awakening(
    page: Any,
    state: CrawlerState,
    accumulated_network: List[NetworkDeltaEntry],
    service_map: ServiceMap,
    *,
    network_collector: Optional[List[NetworkDeltaEntry]] = None,
    settle_ms: int = 750,
) -> List[AwakenedEndpoint]:
    """
    Run UI Awakening across all orphan fields in the current state.

    - Observed network requests get provenance="observed" and added to ServiceMap.
    - Fields where UI submit failed or was hidden get provenance="synthetic_candidate".
    """
    from corpus.corpus_parser import FormField as RawFormField

    # Convert state forms into FormField objects
    form_fields: List[FormField] = []
    for form_dict in state.forms:
        if isinstance(form_dict, FormField):
            form_fields.append(form_dict)
        elif isinstance(form_dict, dict):
            form_fields.append(
                FormField(
                    page_url=form_dict.get("page_url", state.url),
                    name=form_dict.get("name", ""),
                    field_type=form_dict.get("field_type", "text"),
                    value=form_dict.get("value", ""),
                    tag=form_dict.get("tag", "input"),
                    form_id=form_dict.get("form_id", ""),
                    form_action=form_dict.get("form_action", ""),
                    label=form_dict.get("label", ""),
                    selector=form_dict.get("selector", ""),
                )
            )

    orphans = find_orphan_fields(form_fields, accumulated_network)
    results: List[AwakenedEndpoint] = []

    for orphan in orphans:
        # Try UI awakening
        new_entry = awaken_orphan_field_ui(
            page,
            orphan,
            network_collector=network_collector,
            settle_ms=settle_ms,
        )

        if new_entry:
            # Observed real network event!
            endpoint_url = new_entry.url.split("?", 1)[0]
            service_map.add_endpoint(new_entry.url)
            service_map.add_edge(state.url, new_entry.url)
            service_map.add_binding(
                FieldBinding(
                    endpoint=new_entry.url,
                    param_name=orphan.name,
                    location="query" if "?" in new_entry.url else "body",
                    field=orphan,
                )
            )
            results.append(
                AwakenedEndpoint(
                    field_name=orphan.name,
                    page_url=state.url,
                    provenance="observed",
                    endpoint_url=new_entry.url,
                    method=new_entry.method,
                    request_payload={"value": _get_safe_value(orphan.name, orphan.field_type)},
                    notes=["UI awakening triggered network request successfully"],
                )
            )
        else:
            # Synthetic candidate fallback
            fallback_url = orphan.form_action or state.url
            if fallback_url and not fallback_url.startswith(("http://", "https://")):
                parts = urlsplit(state.url)
                fallback_url = f"{parts.scheme or 'http'}://{parts.netloc}{fallback_url}"

            results.append(
                AwakenedEndpoint(
                    field_name=orphan.name,
                    page_url=state.url,
                    provenance="synthetic_candidate",
                    endpoint_url=fallback_url,
                    method="POST" if orphan.form_action else "GET",
                    request_payload={"value": _get_safe_value(orphan.name, orphan.field_type)},
                    notes=["UI action did not trigger network request or element was hidden"],
                )
            )

    return results
