"""
COS-L8: Jenkins ExecutionAdapter.

XML-генератор pipeline job, API trigger, status, logs.
"""
from __future__ import annotations

import logging
from typing import Any
from xml.etree import ElementTree as ET

import requests

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 30


class JenkinsAdapter:
    """Адаптер Jenkins API."""

    def __init__(self, base_url: str, user: str, token: str):
        self._base = base_url.rstrip("/")
        self._session = requests.Session()
        self._session.auth = (user, token)
        self._session.timeout = DEFAULT_TIMEOUT

    def _get(self, path: str, **kwargs: Any) -> requests.Response:
        return self._session.get(f"{self._base}{path}", **kwargs)

    def _post(self, path: str, **kwargs: Any) -> requests.Response:
        return self._session.post(f"{self._base}{path}", **kwargs)

    def generate_pipeline_xml(self, batch: dict) -> str:
        """Генерирует Jenkins pipeline XML из Batch."""
        bricks = batch.get("bricks", [])

        root = ET.Element("flow-definition", plugin="workflow-job")
        definition = ET.SubElement(root, "definition", {
            "class": "org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition",
            "plugin": "workflow-cps",
        })

        script_lines = ["pipeline {", "  agent any", "  stages {"]
        for brick in bricks:
            name = brick.get("name", "step")
            script_lines.append(f"    stage('{name}') {{")
            script_lines.append("      steps {")
            script_lines.append(f"        sh 'echo Running {name}'")
            script_lines.append("      }")
            script_lines.append("    }")
        script_lines.append("  }")
        script_lines.append("}")

        script = ET.SubElement(definition, "script")
        script.text = "\n".join(script_lines)
        ET.SubElement(definition, "sandbox").text = "true"

        return ET.tostring(root, encoding="unicode")

    def trigger_build(self, job_name: str, params: dict | None = None) -> dict:
        """Запускает сборку Jenkins."""
        endpoint = f"/job/{job_name}/build"
        if params:
            endpoint += "WithParameters"
        r = self._post(endpoint, json=params or {})
        if r.status_code in (200, 201):
            return {"job_name": job_name, "result": "triggered"}
        r.raise_for_status()
        return {}

    def get_build_status(self, job_name: str, build_number: int) -> str:
        """Получает статус сборки."""
        r = self._get(f"/job/{job_name}/{build_number}/api/json")
        r.raise_for_status()
        data = r.json()
        return data.get("result", "RUNNING") or "RUNNING"

    def get_build_log(self, job_name: str, build_number: int) -> str:
        """Получает консольный лог сборки."""
        r = self._get(f"/job/{job_name}/{build_number}/consoleText")
        r.raise_for_status()
        return r.text

    def close(self) -> None:
        self._session.close()

    def __enter__(self) -> "JenkinsAdapter":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()