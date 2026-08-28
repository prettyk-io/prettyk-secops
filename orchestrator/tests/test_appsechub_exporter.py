"""COS-L15: Тесты AppSecHub Exporter."""
import json
import pytest
from orchestrator.reports import (
    GOSTAct, GOSTActHeader, GOSTActObject, GOSTFinding,
)
from orchestrator.reports.appsechub_exporter import export_appsechub_json, _map_cwe


class TestCWEMapping:
    def test_sqli(self):
        f = GOSTFinding(severity="Critical", title="SQLi в login")
        assert _map_cwe(f) == "CWE-89"

    def test_xss(self):
        f = GOSTFinding(severity="Medium", title="XSS в search")
        assert _map_cwe(f) == "CWE-79"

    def test_explicit_cwe(self):
        f = GOSTFinding(severity="High", title="Vuln", cwe="CWE-352")
        assert _map_cwe(f) == "CWE-352"

    def test_unknown(self):
        f = GOSTFinding(severity="Info", title="Strange")
        assert _map_cwe(f) == "CWE-200"


class TestExportAppSecHub:
    def test_export_is_valid_json(self):
        act = GOSTAct(
            header=GOSTActHeader(project_name="Test"),
            object=GOSTActObject(name="App", url="https://example.com"),
            findings_table=[
                GOSTFinding(severity="Critical", title="SQLi", cwe="CWE-89"),
                GOSTFinding(severity="Medium", title="XSS", cwe="CWE-79"),
            ],
        )
        result = export_appsechub_json(act)
        parsed = json.loads(result)
        assert parsed["version"] == "2.1.0"
        assert parsed["$schema"].startswith("https://")
        assert len(parsed["runs"][0]["results"]) == 2

    def test_empty_findings(self):
        act = GOSTAct(
            header=GOSTActHeader(project_name="Test"),
            object=GOSTActObject(name="App"),
        )
        result = export_appsechub_json(act)
        parsed = json.loads(result)
        assert len(parsed["runs"][0]["results"]) == 0

    def test_contains_project_properties(self):
        act = GOSTAct(
            header=GOSTActHeader(project_name="MyProject"),
            object=GOSTActObject(name="App"),
        )
        result = export_appsechub_json(act)
        parsed = json.loads(result)
        props = parsed["runs"][0]["properties"]
        assert props["project_name"] == "MyProject"