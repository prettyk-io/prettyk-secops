"""
COS-L7: Woodpecker ExecutionAdapter.

Генерация .woodpecker.yml из Batch, запуск через API, мониторинг.
"""
from __future__ import annotations

import logging
from enum import Enum
from typing import Any

import requests
import yaml

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 30


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILURE = "failure"
    KILLED = "killed"
    ERROR = "error"


class WoodpeckerAdapter:
    """Адаптер Woodpecker CI API."""

    def __init__(self, base_url: str, token: str):
        self._base = base_url.rstrip("/")
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        })

    def _get(self, path: str, **kwargs: Any) -> requests.Response:
        return self._session.get(f"{self._base}{path}", timeout=DEFAULT_TIMEOUT, **kwargs)

    def _post(self, path: str, **kwargs: Any) -> requests.Response:
        return self._session.post(f"{self._base}{path}", timeout=DEFAULT_TIMEOUT, **kwargs)

    def generate_pipeline_yaml(self, batch: dict) -> str:
        """Генерирует .woodpecker.yml из Batch."""
        bricks = batch.get("bricks", [])
        pipeline: dict[str, Any] = {"pipeline": {}, "steps": {}}

        for i, brick in enumerate(bricks):
            step_name = brick.get("name", f"step-{i}")
            definition = brick.get("definition", {})
            image = definition.get("image", "alpine:latest")
            step_config: dict[str, Any] = {
                "image": image,
                "commands": definition.get("commands", ["echo 'no commands'"]),
            }
            deps = brick.get("depends_on", [])
            if deps:
                step_config["depends_on"] = deps
            env = definition.get("inputs", {})
            if env:
                step_config["environment"] = env
            pipeline["steps"][step_name] = step_config

        return yaml.dump(pipeline, default_flow_style=False, allow_unicode=True)

    def trigger_pipeline(self, repo_owner: str, repo_name: str, branch: str = "main") -> dict:
        """Запускает пайплайн через Woodpecker API."""
        r = self._post(
            f"/api/repos/{repo_owner}/{repo_name}/pipelines",
            params={"branch": branch},
        )
        r.raise_for_status()
        return r.json()

    def get_job_status(self, repo_owner: str, repo_name: str, pipeline_number: int) -> str:
        """Получает статус джоба."""
        r = self._get(
            f"/api/repos/{repo_owner}/{repo_name}/pipelines/{pipeline_number}",
        )
        r.raise_for_status()
        data = r.json()
        return data.get("status", "pending")

    def stream_logs(self, repo_owner: str, repo_name: str, pipeline_number: int, step: int = 0) -> list[str]:
        """Получает логи джоба."""
        r = self._get(
            f"/api/repos/{repo_owner}/{repo_name}/logs/{pipeline_number}/{step}",
        )
        r.raise_for_status()
        data = r.json()
        logs = data if isinstance(data, list) else data.get("logs", [])
        return logs if isinstance(logs, list) else []

    def close(self) -> None:
        self._session.close()

    def __enter__(self) -> "WoodpeckerAdapter":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()