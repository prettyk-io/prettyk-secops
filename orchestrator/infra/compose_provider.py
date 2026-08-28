# ComposeProvider — RuntimeProvider поверх Docker Compose (standalone appliance).
#
# Каждая сессия поднимается как отдельный Compose Project:
#   docker compose -f session-template.yml -p pk-session-<id> up -d
#
# Изоляция:
#   - отдельный Compose Project (имена контейнеров с префиксом проекта);
#   - изолированная bridge-сеть (<project>_default — Compose создаёт автоматически);
#   - нет фиксированных host-портов (сервисы доступны только внутри сети);
#   - labels com.prettyk.* для идентификации после рестарта.
#
# Блокировка: зависит от контракта RuntimeProvider (SOR-B1, Boss).
# До подключения pk-control использует эту реализацию напрямую.
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import AsyncIterator, Dict, Optional

from infra.runtime_provider import (
    ResourceType,
    RuntimeProvider,
    ServiceEndpoint,
    SessionResourceBundle,
)

logger = logging.getLogger(__name__)

# Имена compose-сервисов → ResourceType (для маппинга health/logs).
_SERVICE_TO_RESOURCE: Dict[str, ResourceType] = {
    "scanner": ResourceType.SCANNER,
    "playwright-authoring": ResourceType.BROWSER_AUTHORING,
    "juice-shop": ResourceType.TARGET,
}

# Порты по умолчанию внутри сессионной сети.
_DEFAULT_INTERNAL_PORTS: Dict[ResourceType, int] = {
    ResourceType.SCANNER: 8080,
    ResourceType.BROWSER_AUTHORING: 9223,
    ResourceType.TARGET: 3000,
}

_PROJECT_PREFIX = "pk-session"
_SESSION_TEMPLATE = "services/session-template.yml"


def _repo_root() -> Path:
    """Корень репозитория относительно этого файла."""
    return Path(__file__).resolve().parents[2]


def _project_name(session_id: str) -> str:
    return f"{_PROJECT_PREFIX}-{session_id}"


class ComposeProvider(RuntimeProvider):
    """Standalone Docker Compose provider.

    Запускает изолированные сессии как Compose Projects с независимой сетью.
    Не требует Kubernetes — работает на любой машине с Docker Engine.
    """

    def __init__(self, repo_root: Optional[Path] = None):
        self._repo_root = repo_root or _repo_root()
        self._template = self._repo_root / _SESSION_TEMPLATE

    # ── RuntimeProvider impl ───────────────────────────────────────

    async def provision_session_bundle(
        self, session_id: str, config: Optional[dict] = None,
    ) -> SessionResourceBundle:
        project = _project_name(session_id)
        env = os.environ.copy()
        env["PK_SESSION_ID"] = session_id
        env["PK_SESSION_GENERATION"] = str(config.get("generation", 1) if config else 1)

        # Идемпотентность: если проект уже поднят — не пересоздаём.
        existing = await self._compose_ps(project)
        if existing:
            logger.info("Session %s already provisioned (project %s)", session_id, project)
            return self._build_bundle(session_id, config)

        logger.info("Provisioning session %s as project %s", session_id, project)
        await self._compose(project, "up", "-d", "--wait", env=env)

        return self._build_bundle(session_id, config)

    async def release_session_bundle(
        self, session_id: str, force: bool = False,
    ) -> None:
        project = _project_name(session_id)
        logger.info(
            "Releasing session %s (project %s, force=%s)",
            session_id, project, force,
        )

        down_args = ["down", "--volumes", "--remove-orphans"]
        if force:
            down_args.insert(1, "--timeout=5")
        else:
            down_args.insert(1, "--timeout=30")

        try:
            await self._compose(project, *down_args)
        except RuntimeError:
            logger.warning("Compose down failed for %s; forcing removal", project)
            await self._force_cleanup(project)

        # Удалить сеть проекта на случай, если compose down её оставил.
        network = f"{project}_default"
        await self._docker("network", "rm", network, check=False)

    async def check_bundle_health(
        self, session_id: str,
    ) -> Dict[ResourceType, bool]:
        result: Dict[ResourceType, bool] = {}

        try:
            containers_raw = await self._docker(
                "ps", "-a",
                "--filter", f"label=com.prettyk.session-id={session_id}",
                "--format", "{{.Names}} {{.Status}}",
                check=False,
            )
        except RuntimeError:
            return result

        for line in containers_raw.strip().splitlines():
            if not line.strip():
                continue
            parts = line.split(None, 1)
            if len(parts) < 2:
                continue
            name, status = parts[0], parts[1].lower()
            healthy = "up" in status or "healthy" in status
            for svc_name, rt in _SERVICE_TO_RESOURCE.items():
                if svc_name in name:
                    result[rt] = healthy
                    break
        return result

    async def stream_resource_logs(
        self, session_id: str, resource_type: ResourceType,
    ) -> AsyncIterator[str]:
        project = _project_name(session_id)
        svc_name = self._compose_service_name(resource_type)
        if svc_name is None:
            return

        proc = await asyncio.create_subprocess_exec(
            "docker", "compose",
            "-p", project,
            "-f", str(self._template),
            "logs", "-f", svc_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            cwd=self._repo_root,
        )
        if proc.stdout is None:
            return

        try:
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                yield line.decode("utf-8", errors="replace").rstrip("\n")
        finally:
            proc.terminate()
            await proc.wait()

    # ── Compose helpers ────────────────────────────────────────────

    async def _compose(self, project: str, *args: str, env: Optional[Dict[str, str]] = None) -> str:
        return await self._run(
            "docker", "compose",
            "-p", project,
            "-f", str(self._template),
            *args,
            env=env,
            check=True,
        )

    async def _compose_ps(self, project: str) -> str:
        return await self._run(
            "docker", "compose",
            "-p", project,
            "-f", str(self._template),
            "ps", "--format", "json",
            check=False,
        )

    async def _docker(self, *args: str, check: bool = True) -> str:
        return await self._run("docker", *args, check=check)

    async def _run(
        self, *args: str, env: Optional[Dict[str, str]] = None, check: bool = True,
    ) -> str:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._repo_root,
            env=env or os.environ,
        )
        stdout, stderr = await proc.communicate()
        out = stdout.decode("utf-8", errors="replace").strip()
        err = stderr.decode("utf-8", errors="replace").strip()

        if check and proc.returncode != 0:
            raise RuntimeError(
                f"Command failed (exit {proc.returncode}): {' '.join(args)}\n{err}"
            )
        return out

    async def _force_cleanup(self, project: str) -> None:
        """Удалить контейнеры и сеть проекта в обход compose down."""
        containers_raw = await self._docker(
            "ps", "-aq",
            "--filter", f"name={project}",
            check=False,
        )
        if containers_raw.strip():
            await self._docker("rm", "-f", *(containers_raw.strip().splitlines()), check=False)
        await self._docker("network", "rm", f"{project}_default", check=False)

    # ── Bundle builder ─────────────────────────────────────────────

    def _build_bundle(
        self, session_id: str, config: Optional[dict] = None,
    ) -> SessionResourceBundle:
        generation = config.get("generation", 1) if config else 1
        now = time.time()
        lease_sec = config.get("lease_seconds", 3600) if config else 3600

        endpoints: Dict[ResourceType, ServiceEndpoint] = {}
        for rt, port in _DEFAULT_INTERNAL_PORTS.items():
            name = self._resource_dns_name(rt)
            endpoints[rt] = ServiceEndpoint(
                name=name,
                internal_url=f"http://{name}:{port}",
                port=port,
            )

        return SessionResourceBundle(
            session_id=session_id,
            generation=generation,
            endpoints=endpoints,
            status="provisioned",
            created_at=now,
            lease_expires_at=now + lease_sec,
        )

    @staticmethod
    def _resource_dns_name(rt: ResourceType) -> str:
        _DNS_MAP = {
            ResourceType.SCANNER: "scanner",
            ResourceType.BROWSER_AUTHORING: "playwright-authoring",
            ResourceType.TARGET: "juice-shop",
        }
        return _DNS_MAP.get(rt, rt.value)

    @staticmethod
    def _compose_service_name(rt: ResourceType) -> Optional[str]:
        return ComposeProvider._resource_dns_name(rt)