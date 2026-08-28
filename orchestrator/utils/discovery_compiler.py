from __future__ import annotations

from typing import Any

_SEMANTIC_MAP: list[dict[str, str]] = [
    {"semantic": "role=button + name", "exec": '[role="button"][aria-label="<name>"]'},
    {"semantic": "role=textbox + name", "exec": '[role="textbox"][aria-label="<name>"]'},
    {"semantic": "label", "exec": 'input[id="<for_attr>"]'},
    {"semantic": "test_id", "exec": '[data-testid="<test_id>"]'},
    {"semantic": "placeholder", "exec": '[placeholder="<placeholder>"]'},
    {"semantic": "clean_id", "exec": "#<clean_id>"},
    {"semantic": "name", "exec": '[name="<name_attr>"]'},
]

_VALUE_CLASS_BINDING: dict[str, str] = {
    "email": "$user_email = СлучайныйEmail",
    "secret": "Secret $password_ref",
    "phone": "$user_phone = СлучайныйТелефон",
}

_TIER_PREFERRED_ORDER = ("T0", "T1", "T2", "T3")

_TRUST_MAP: dict[str, str] = {
    "T0": "auto",
    "T1": "verified-evidence",
    "T2": "review-needed",
    "T3": "manual-required",
}

_MANUAL_TRUST = "manual-edited"
_KEPT_TRUST = "manual-kept"

_VCLASS_BINDS: dict[str, tuple[str, str]] = {
    "email": ("dynamic", "$user_email = СлучайныйEmail"),
    "secret": ("auth", "Secret $password_ref"),
    "phone": ("dynamic", "$user_phone = СлучайныйТелефон"),
}


def _tier_to_trust(tier: str) -> str:
    return _TRUST_MAP.get(tier, "manual-required")


def _bind_value_class(el_id: str, vclass: str, dm: dict[str, Any]) -> None:
    if vclass in _VCLASS_BINDS:
        section, val = _VCLASS_BINDS[vclass]
        dm.setdefault(section, {})[el_id] = val


def _compile_one_element(el: dict[str, Any], page_id: str, el_i: int) -> dict[str, Any] | None:
    candidate = _best_candidate(el)
    if candidate is None:
        return None
    tier = candidate.get("tier", "T3")
    label = el.get("label") or el.get("accessible_name") or ""
    el_id = el.get("id") or f"el_{page_id}_{el_i}"
    return {
        "id": el_id, "label": label,
        "constructor": _build_constructor(el, candidate),
        "slot": page_id, "_trust": _tier_to_trust(tier),
        "_vclass": el.get("value_class", "unknown"),
    }


def element_fingerprint(el: dict[str, Any]) -> str:
    tag = str(el.get("tag", "")).lower()
    role = str(el.get("role", "")).lower()
    label = str(el.get("label") or el.get("accessible_name") or "")
    return f"{tag}|{role}|{label}"


def _best_candidate(element: dict[str, Any]) -> dict[str, Any] | None:
    candidates = element.get("candidates") or []
    if not candidates:
        return None
    for tier in _TIER_PREFERRED_ORDER:
        for c in candidates:
            if c.get("tier") == tier:
                return c
    return candidates[0]


def _candidate_to_selector(candidate: dict[str, Any]) -> str:
    value = candidate.get("value", "")
    if value.startswith("css "):
        return value[4:]
    if value.startswith("xpath "):
        return value
    return value


def _build_constructor(
    element: dict[str, Any],
    candidate: dict[str, Any],
) -> list[str]:
    tier = candidate.get("tier", "T3")
    selector = _candidate_to_selector(candidate)
    value_class = element.get("value_class", "unknown")

    lines: list[str] = []
    lines.append(f"locator {selector}")

    if tier == "T1":
        lines.append("# evidence: auto-discovered, verify before production")
    elif tier == "T2":
        lines.append("# review required: auto-discovered, verify before production")
    elif tier == "T3":
        lines.append("# manual locator required: auto-discovery could not resolve")

    if value_class != "unknown":
        lines.append(f"bind {_VALUE_CLASS_BINDING.get(value_class, value_class)}")

    return lines


def compile_wired(ir_session: dict[str, Any]) -> dict[str, Any]:
    pages: dict[str, Any] = {}
    data_module: dict[str, Any] = {"seed": {}, "dynamic": {}, "auth": {}}

    ir_pages = (ir_session.get("pages") or []) if isinstance(ir_session, dict) else []
    if isinstance(ir_pages, dict):
        ir_pages = [ir_pages]

    for page in ir_pages:
        if not isinstance(page, dict):
            continue
        page_name = page.get("name") or page.get("url") or "discovered_page"
        page_url = page.get("url") or ""
        page_id = f"pf_{page_name}"

        wired_elements: list[dict[str, Any]] = [
            {"id": f"el_{page_name}_navigate", "label": page_url,
             "constructor": [f"navigate {page_url}"], "slot": page_id, "_trust": "auto"},
        ]
        for i, el in enumerate(page.get("elements") or []):
            compiled = _compile_one_element(el, page_id, i)
            if compiled is None:
                continue
            wired_elements.append(compiled)
            _bind_value_class(compiled["id"], compiled.pop("_vclass", "unknown"), data_module)

        pages[page_id] = {"url": page_url, "elements": wired_elements, "actions": []}

    suite: dict[str, Any] = {
        "imports": [], "pages": pages, "scenarios": [],
        "data_module": data_module if data_module.get("dynamic") or data_module.get("auth") else {},
        "fuzzers": [],
        "editor_folders": {"page_models": list(pages.keys()), "data_models": [], "scenarios": [], "fuzzers": []},
    }

    return {
        "meta": {
            "assessment_purpose": "assessment",
            "project_id": ir_session.get("project_id") or "discovery",
            "initiator_name": ir_session.get("initiator") or "Discovery Engine",
        },
        "infrastructure": {
            "base_url_override": ir_session.get("target_url") or "",
            "prod_base_url": ir_session.get("target_url") or "",
            "scanner_mode": "demon",
            "browser_type": "chromium",
            "debug_mode": False,
        },
        "security_configuration": {
            "scan_policy": "default",
            "base_url_override": ir_session.get("target_url") or "",
        },
        "test_suites": suite,
        "scanning_and_fuzzing_targets": {"api": [], "gui": []},
        "openapi_swagger_scanning": {"enabled": False, "imports": []},
    }


def _element_fingerprint(el: dict[str, Any]) -> str:
    tag = str(el.get("tag", "")).lower()
    role = str(el.get("role", "")).lower()
    label = str(el.get("label") or el.get("accessible_name") or el.get("id", ""))
    return f"{tag}|{role}|{label}"


def _build_lookup_maps(
    elements: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_fp: dict[str, dict[str, Any]] = {}
    by_label: dict[str, dict[str, Any]] = {}
    for el in elements:
        fp = _element_fingerprint(el)
        if fp:
            by_fp[fp] = el
        lbl = str(el.get("label", ""))
        if lbl:
            by_label[lbl] = el
    return by_fp, by_label


def _merge_kept_manual(existing: dict[str, Any], fp: str, ir_el: dict[str, Any]) -> dict[str, Any]:
    return {**existing, "_discovery_fingerprint": fp, "_merge_action": "kept-manual",
            "tag": ir_el.get("tag", ""), "role": ir_el.get("role", "")}


def _merge_auto_upgrade(existing: dict[str, Any], fp: str, ir_el: dict[str, Any]) -> dict[str, Any] | None:
    candidate = _best_candidate(ir_el)
    if candidate is None:
        return None
    selector = _candidate_to_selector(candidate)
    ctor = existing.get("constructor", [])
    if isinstance(ctor, list) and len(ctor) > 0:
        ctor = [f"locator {selector}", *[ln for ln in ctor if not ln.startswith("locator ")]]
    else:
        ctor = [f"locator {selector}"]
    return {**existing, "constructor": ctor, "_trust": _tier_to_trust(candidate.get("tier", "T3")),
            "_discovery_fingerprint": fp, "_merge_action": "auto-upgraded",
            "tag": ir_el.get("tag", ""), "role": ir_el.get("role", "")}


def _merge_new(ir_el: dict[str, Any], fp: str, result_len: int, label: str) -> dict[str, Any] | None:
    candidate = _best_candidate(ir_el)
    if candidate is None:
        return None
    selector = _candidate_to_selector(candidate)
    return {
        "id": ir_el.get("id", f"el_{result_len}"),
        "label": label or f"discovered_{result_len}",
        "constructor": [f"locator {selector}"],
        "slot": ir_el.get("slot", ""),
        "_trust": _tier_to_trust(candidate.get("tier", "T3")),
        "_discovery_fingerprint": fp, "_merge_action": "new",
        "tag": ir_el.get("tag", ""), "role": ir_el.get("role", ""),
    }


def _collect_not_detected(
    existing_elements: list[dict[str, Any]],
    matched: set[str],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for el in existing_elements:
        key = _element_fingerprint(el)
        if key not in matched:
            lbl = str(el.get("label", ""))
            if lbl not in ("", "/"):
                result.append({**el, "_removed": True, "_merge_action": "not-detected"})
    return result


def merge_elements(
    existing_wired_elements: list[dict[str, Any]],
    new_ir_elements: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Incremental merge: IR elements → existing wired, preserving manual edits."""
    by_fp, by_label = _build_lookup_maps(existing_wired_elements)
    matched: set[str] = set()
    result: list[dict[str, Any]] = []

    for ir_el in new_ir_elements:
        label = str(ir_el.get("label") or ir_el.get("accessible_name") or ir_el.get("id", ""))
        fp = _element_fingerprint(ir_el)
        existing = by_fp.get(fp) or by_label.get(label)

        if existing:
            matched.add(_element_fingerprint(existing))
            if existing.get("_trust") in (_MANUAL_TRUST, _KEPT_TRUST):
                result.append(_merge_kept_manual(existing, fp, ir_el))
            else:
                upgraded = _merge_auto_upgrade(existing, fp, ir_el)
                result.append(upgraded if upgraded is not None else existing)
        else:
            new_el = _merge_new(ir_el, fp, len(result), label)
            if new_el is not None:
                result.append(new_el)

    result.extend(_collect_not_detected(existing_wired_elements, matched))
    return result


def merge_wired(
    existing_wired: dict[str, Any] | None,
    ir_session: dict[str, Any],
) -> dict[str, Any]:
    """Incremental compile: merge new IR into existing wired.json.

    Never reorders pages. Never deletes elements (marks _removed).
    New pages append. Disappeared pages hang (wait for operator decision).
    """
    fresh = compile_wired(ir_session)
    if existing_wired is None or not isinstance(existing_wired, dict):
        return fresh

    existing_pages = existing_wired.get("test_suites", {}).get("pages", {})
    if not isinstance(existing_pages, dict):
        existing_pages = {}

    fresh_pages = fresh.get("test_suites", {}).get("pages", {})
    if not isinstance(fresh_pages, dict):
        fresh_pages = {}

    merged_pages: dict[str, Any] = {}

    for pid, existing_page in existing_pages.items():
        fresh_page = fresh_pages.get(pid)
        if fresh_page and isinstance(fresh_page, dict):
            existing_els = existing_page.get("elements", []) if isinstance(existing_page, dict) else []
            fresh_els = fresh_page.get("elements", []) if isinstance(fresh_page, dict) else []
            merged_pages[pid] = {
                "url": fresh_page.get("url", existing_page.get("url", "")),
                "elements": merge_elements(existing_els, fresh_els),
                "actions": fresh_page.get("actions", existing_page.get("actions", [])),
            }
        else:
            merged_pages[pid] = dict(existing_page)

    for pid, fresh_page in fresh_pages.items():
        if pid not in merged_pages:
            merged_pages[pid] = dict(fresh_page)

    da = fresh.get("test_suites", {}).get("data_module", {})
    merged_data = _merge_data_module(
        existing_wired.get("test_suites", {}).get("data_module", {}),
        da,
    )

    suite = {
        **fresh.get("test_suites", {}),
        "pages": merged_pages,
        "data_module": merged_data if merged_data.get("auth") or merged_data.get("dynamic") else {},
    }

    return {
        **fresh,
        "test_suites": suite,
        "meta": {
            **fresh.get("meta", {}),
            "discovery_merge_count": int(existing_wired.get("meta", {}).get("discovery_merge_count", 0)) + 1,
        },
    }


def _merge_data_module(
    existing: dict[str, Any],
    fresh: dict[str, Any],
) -> dict[str, Any]:
    """Merge data bindings: keep existing ones, add new value_classes."""
    if not isinstance(existing, dict):
        existing = {}
    auth = dict(existing.get("auth", {}))
    dyn = dict(existing.get("dynamic", {}))
    fa = fresh.get("auth", {}) if isinstance(fresh, dict) else {}
    fd = fresh.get("dynamic", {}) if isinstance(fresh, dict) else {}
    for k, v in fa.items():
        if k not in auth:
            auth[k] = v
    for k, v in fd.items():
        if k not in dyn:
            dyn[k] = v
    return {"auth": auth, "dynamic": dyn, "seed": existing.get("seed", {})}