"""Extract the ЦБРФ access matrix into stable row/role JSONL records."""

from __future__ import annotations

import glob
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
MAIN_NS = NS["m"]
ROLE_COLUMNS = {
    "C": "ИТ-лидер",
    "D": "Руководитель разработки",
    "E": "Разработчик",
    "F": "Тестировщик",
    "G": "Администратор",
    "H": "Администратор НШР",
    "I": "Администратор КИТС",
    "J": "Администратор ИБ",
    "K": "Контролер эксплуатации",
    "L": "Оператор",
    "M": "Релиз-менеджер",
    "N": "Эксперт ИБ",
}
STATUS = {
    "есть доступ": "full",
    "только просмотр": "read_only",
    "нет доступа": "denied",
    "не применимо": "not_applicable",
}


def cell_value(cell: ET.Element, strings: list[str]) -> str:
    value = cell.find(f"{{{MAIN_NS}}}v")
    if value is None:
        return ""
    return strings[int(value.text)] if cell.attrib.get("t") == "s" else value.text or ""


def read_rows(path: Path) -> list[dict[str, str]]:
    with zipfile.ZipFile(path) as workbook:
        strings: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            strings = [
                "".join(text.text or "" for text in item.iter(f"{{{MAIN_NS}}}t"))
                for item in root
            ]
        sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
        result = []
        for row in sheet.findall(".//m:sheetData/m:row", NS):
            values: dict[str, str] = {}
            for cell in row.findall("m:c", NS):
                column = re.match(r"[A-Z]+", cell.attrib["r"])
                if column:
                    values[column.group()] = cell_value(cell, strings)
            result.append({"source_row_number": int(row.attrib["r"]), **values})
        return result


def element_id(label: str) -> str:
    match = re.match(r"\s*([0-9]+(?:\.[0-9]+)*)", label)
    return match.group(1) if match else ""


def marker_and_status(raw: str) -> tuple[str, str]:
    text = " ".join(raw.replace("\xa0", " ").split()).lower()
    marker = "none"
    if "**" in text:
        marker = "**"
    elif "*" in text:
        marker = "*"
    for label, normalized in STATUS.items():
        if label in text:
            return normalized, marker
    return "unknown", marker


def mapping(identifier: str) -> tuple[str, str, str, str, str, str]:
    """Return inferred resource, capability, scope, route, UI and audit."""
    if identifier.startswith("1"):
        return "domain/application", "domain:read|app:read", "visible domain/team", "GET /api/v1/domains|GET /api/v1/applications", "Control Station navigation", "none"
    if identifier == "2.5":
        return "application", "app:write", "allowed parent/domain + zone", "POST /api/v1/applications", "Control Station create dialog", "application.created"
    if identifier.startswith("2"):
        return "application", "app:read", "domain + team/visibility", "GET /api/v1/applications", "Control Station application list/card", "none"
    if identifier.startswith("3"):
        return "integration/catalog", "integration:read|integration:manage", "domain + service availability", "GET|POST /api/v1/catalog", "Control Station catalog", "catalog.mutated"
    if identifier.startswith("4.5"):
        return "runtime", "integration:read|integration:manage", "zone + environment + ops scope", "GET|PATCH /api/v1/runtimes/{id}", "Control Station runtimes", "runtime.mutated"
    if identifier.startswith("4.6"):
        return "pipeline", "pipeline:read|pipeline:write", "domain/application + team", "GET|PATCH /api/v1/pipelines/{id}", "Control Station pipeline catalog", "pipeline.mutated"
    if identifier.startswith("4.9"):
        return "evidence", "evidence:read|evidence:write", "application + environment + ownership", "GET|POST /api/v1/evidence/artifacts", "Control Station artifacts", "evidence.mutated"
    if identifier.startswith("4"):
        return "pipeline/integration/evidence", "pipeline:read|integration:read|evidence:read", "domain + zone/environment", "GET /api/v1/catalog", "Control Station services", "none"
    if identifier.startswith("9") or identifier.startswith("10"):
        return "audit", "audit:read", "assigned audit scope", "GET /api/v1/audit", "Control Station audit/history", "audit.read"
    if identifier.startswith("11.1"):
        return "application", "app:read|app:write", "application ownership/manager scope", "GET|PATCH /api/v1/applications/{id}", "Control Station application card", "application.mutated"
    if identifier.startswith("11.2") or identifier.startswith("11.3"):
        return "run", "run:read|run:write|run:start|run:stop|run:delete", "application + zone + environment + execution policy", "GET|POST|PATCH|DELETE /api/v1/runs/{id}", "Control Station builds/deployments", "run.mutated"
    if identifier.startswith("11.4"):
        return "release", "release:read|release:manage|gate:decide", "release scope + zone/environment + SoD", "GET|POST|PATCH /api/v1/releases", "Control Station releases", "release.mutated"
    if identifier.startswith("11.5"):
        return "application/settings", "app:read|app:write|app:delete", "application owner/manager scope", "GET|POST|PATCH|DELETE /api/v1/config", "Control Station configurations", "settings.mutated"
    if identifier.startswith("11.6"):
        return "membership", "rbac:read|rbac:manage", "domain/application admin scope", "GET|PATCH|DELETE /api/v1/members", "Control Station team", "membership.mutated"
    if identifier.startswith("11.7"):
        return "domain/runtime", "domain:read|integration:manage", "domain + environment", "GET|PATCH /api/v1/domains/{id}/quotas", "Control Station quotas", "quota.mutated"
    if identifier == "11.8.3":
        return "settings/policy", "policies:manage", "security policy scope", "GET|PATCH /api/v1/applications/{id}/abac", "Control Station ABAC settings", "policy.mutated"
    if identifier == "11.8.31":
        return "settings/OpenBao", "secret:use|secret:manage", "actor may use reference, never read value", "PATCH /api/v1/secret-references", "Control Station environment variables", "secret.metadata_changed"
    if identifier.startswith("11.8"):
        return "application/settings", "app:read|app:write|policies:manage", "application + policy scope", "GET|PATCH /api/v1/applications/{id}/settings", "Control Station settings", "settings.mutated"
    return "unmapped", "", "", "", "", ""


def main() -> None:
    source = Path(glob.glob(r"C:\Users\mails\Downloads\*62.0.39780*.xlsx")[0])
    output = Path(__file__).with_name("2026-08-29-cosmoport-rbac-matrix.jsonl")
    rows = read_rows(source)
    records = []
    for row in rows[1:]:
        label = row.get("A", "")
        identifier = element_id(label)
        status_comment = " | ".join(value for value in (row.get("P", ""), row.get("Q", ""), row.get("R", "")) if value)
        resource, capability, scope, route, ui, audit = mapping(identifier)
        for column, role in ROLE_COLUMNS.items():
            raw = row.get(column, "")
            normalized, marker = marker_and_status(raw)
            records.append(
                {
                    "source_row_number": row["source_row_number"],
                    "element_id": identifier,
                    "element_label": label,
                    "zone": row.get("B", ""),
                    "source_role": role,
                    "raw_status": raw,
                    "status": normalized,
                    "marker": marker,
                    "comment": status_comment,
                    "canonical_resource": resource,
                    "capability": capability,
                    "scope_predicate": scope,
                    "api_route": route,
                    "ui_surface": ui,
                    "audit_event": audit,
                    "mapping_status": "inferred" if resource != "unmapped" else "open",
                }
            )
    with output.open("w", encoding="utf-8", newline="\n") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"source_rows": len(rows) - 1, "records": len(records), "output": str(output)}, ensure_ascii=True))


if __name__ == "__main__":
    main()