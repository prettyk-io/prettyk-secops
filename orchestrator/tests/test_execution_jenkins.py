"""COS-L8: Тесты Jenkins ExecutionAdapter."""
import pytest
from xml.etree import ElementTree as ET
from orchestrator.adapters.execution_jenkins import JenkinsAdapter


class TestPipelineXml:
    def test_empty_batch_generates_xml(self):
        adapter = JenkinsAdapter("http://jenkins:8080", "admin", "token")
        batch = {"bricks": []}
        xml_str = adapter.generate_pipeline_xml(batch)
        assert "<flow-definition" in xml_str
        root = ET.fromstring(xml_str)
        assert root.tag == "flow-definition"

    def test_single_brick(self):
        adapter = JenkinsAdapter("http://jenkins:8080", "admin", "token")
        batch = {
            "bricks": [
                {
                    "name": "SAST Scan",
                    "definition": {"image": "sonarsource/sonar-scanner-cli:latest"},
                },
            ],
        }
        xml_str = adapter.generate_pipeline_xml(batch)
        assert "SAST Scan" in xml_str
        assert "pipeline" in xml_str

    def test_valid_xml_parseable(self):
        adapter = JenkinsAdapter("http://jenkins:8080", "admin", "token")
        batch = {
            "bricks": [
                {"name": "Step1", "definition": {"image": "alpine:latest"}},
                {"name": "Step2", "definition": {"image": "node:20"}},
            ],
        }
        xml_str = adapter.generate_pipeline_xml(batch)
        root = ET.fromstring(xml_str)
        definition = root.find("definition")
        assert definition is not None
        script = definition.find("script")
        assert script is not None
        assert "Step1" in (script.text or "")
        assert "Step2" in (script.text or "")

    def test_script_contains_pipeline(self):
        adapter = JenkinsAdapter("http://jenkins:8080", "admin", "token")
        batch = {"bricks": [{"name": "Test", "definition": {"image": "alpine:latest"}}]}
        xml_str = adapter.generate_pipeline_xml(batch)
        root = ET.fromstring(xml_str)
        script_text = root.find(".//script")
        assert script_text is not None
        assert "pipeline {" in (script_text.text or "")
        assert "stage('Test')" in (script_text.text or "")