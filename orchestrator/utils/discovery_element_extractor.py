from __future__ import annotations

import re
import uuid
from typing import Any

_GENERATED_ID_PATTERNS = (
    re.compile(r"^:r\d+:$"),
    re.compile(r"^mat-input-\d+$"),
    re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    ),
)

_INTERACTIVE_ROLES: set[str] = {
    "button",
    "link",
    "textbox",
    "searchbox",
    "combobox",
    "listbox",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "checkbox",
    "switch",
    "tab",
    "slider",
    "spinbutton",
}

_INTERACTIVE_TAGS: set[str] = {
    "input",
    "select",
    "textarea",
    "button",
    "a",
}

_SECRET_NAME_PATTERNS = re.compile(
    r"(cardnumber|cc|creditcard|card_number|ccnumber)", re.IGNORECASE
)
_SECRET_LABEL_PATTERN = re.compile(
    r"(пароль|password|secret|секрет|passcode|pin)", re.IGNORECASE
)


def _is_generated_id(value: str) -> bool:
    if not value:
        return False
    return any(p.search(value) for p in _GENERATED_ID_PATTERNS)


def _classify_value(
    element: dict[str, Any],
) -> str:
    tag = str(element.get("tag") or "").lower()
    name_attr = str(element.get("name_attr") or "").lower()
    aria_label = str(element.get("accessible_name") or "").lower()

    if tag == "input":
        type_attr = str(element.get("type_attr") or "").lower()
        if type_attr == "password":
            return "secret"
        if type_attr == "email":
            return "email"
        if type_attr == "tel":
            return "phone"

    if _SECRET_NAME_PATTERNS.search(name_attr):
        return "secret"

    if _SECRET_LABEL_PATTERN.search(aria_label):
        return "secret"

    return "unknown"


def _extract_role(node: dict[str, Any]) -> str:
    role = node.get("role") or ""
    if isinstance(role, dict):
        role = role.get("value") or ""
    return str(role).strip().lower()


def _extract_name(node: dict[str, Any]) -> str:
    name = node.get("name") or ""
    if isinstance(name, dict):
        name = name.get("value") or ""
    return str(name).strip()


def _extract_properties(node: dict[str, Any]) -> dict[str, str]:
    props: dict[str, str] = {}
    p = node.get("properties") or {}
    if isinstance(p, dict):
        for k, v in p.items():
            val = v
            if isinstance(val, dict):
                val = val.get("value", v)
            props[str(k)] = str(val or "").strip()
    return props


def _resolve_label(
    node: dict[str, Any],
    all_nodes: list[dict[str, Any]],
) -> tuple[str, str]:
    label_text = ""
    label_for = ""
    props = _extract_properties(node)

    for label_node in all_nodes:
        if _extract_role(label_node) != "label":
            continue
        if label_node is node:
            continue
        label_name = _extract_name(label_node)
        label_props = _extract_properties(label_node)
        label_for_id = label_props.get("for", "")
        node_id = (
            props.get("id", "")
            or node.get("domNodeId", "")
        )
        if label_for_id and node_id and str(label_for_id) == str(node_id):
            label_text = label_name
            label_for = label_for_id
            break

    if not label_text:
        label_text = props.get("labelledby", "") or ""

    return label_text, label_for


def extract_elements(
    ax_nodes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    elements: list[dict[str, Any]] = []

    for node in ax_nodes:
        role = _extract_role(node)
        tag = str(node.get("tagName") or "").lower().strip()
        if not tag and not node.get("ignored"):
            continue

        is_interactive = (
            tag in _INTERACTIVE_TAGS
            or role in _INTERACTIVE_ROLES
            or node.get("focusable") is True
        )
        if not is_interactive:
            continue

        name = _extract_name(node)
        props = _extract_properties(node)
        raw_id = str(props.get("id", "") or node.get("domNodeId", "") or "")
        clean = raw_id if raw_id and not _is_generated_id(raw_id) else ""

        label_text, label_for = _resolve_label(node, ax_nodes)

        placeholder = str(props.get("placeholder", "") or "")

        el: dict[str, Any] = {
            "tag": tag or role or "unknown",
            "role": role,
            "accessible_name": name,
            "label": label_text,
            "label_for": label_for,
            "placeholder": placeholder,
            "test_id": props.get("data-testid", ""),
            "clean_id": clean,
            "name_attr": props.get("name", ""),
            "type_attr": props.get("type", ""),
            "value_class": "unknown",
            "node_id": str(node.get("nodeId") or node.get("backendDOMNodeId") or ""),
        }

        el["value_class"] = _classify_value(el)
        elements.append(el)

    return elements