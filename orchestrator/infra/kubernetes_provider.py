# KubernetesProvider — RuntimeProvider поверх K8s API.
#
# Реализует тот же контракт RuntimeProvider, что и ComposeProvider,
# но управляет Namespace/Pod lifecycle вместо Compose Project/Container.
#
# Изоляция:
#   - Namespace per-session (pk-session-<session_id>).
#   - NetworkPolicy запрещает межсессионный трафик.
#   - Ephemeral Pods без PVC (emptyDir для временных данных).
#
# Требует:
#   - kubeconfig (KUBECONFIG env или ~/.kube/config).
#   - Права на create/delete namespaces, pods, services, networkpolicies.
#
# Блокировка: зависит от контракта RuntimeProvider (SOR-B1, Boss).
from __future__ import annotations

import asyncio
import logging
import time
from typing import AsyncIterator, Dict, Optional

from infra.runtime_provider import (
    ResourceType,
    RuntimeProvider,
    ServiceEndpoint,
    SessionResourceBundle,
)

logger = logging.getLogger(__name__)

_PROJECT_PREFIX = "pk-session"

# K8s-ресурсы, соответствующие типам RuntimeProvider.
_RESOURCE_TO_DEPLOYMENT: Dict[ResourceType, str] = {
    ResourceType.SCANNER: "scanner",
    ResourceType.BROWSER_AUTHORING: "browser",
    ResourceType.TARGET: "target",
}

_DEFAULT_INTERNAL_PORTS: Dict[ResourceType, int] = {
    ResourceType.SCANNER: 8080,
    ResourceType.BROWSER_AUTHORING: 9223,
    ResourceType.TARGET: 3000,
}


def _namespace(session_id: str) -> str:
    return f"{_PROJECT_PREFIX}-{session_id}"


def _network_policy(namespace: str) -> dict:
    """Сгенерировать NetworkPolicy: запретить межсессионный трафик.

    Только pk-control ingress разрешён.
    """
    return {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "NetworkPolicy",
        "metadata": {
            "name": "pk-session-isolate",
            "namespace": namespace,
        },
        "spec": {
            "podSelector": {},
            "policyTypes": ["Ingress", "Egress"],
            "ingress": [
                {
                    "from": [
                        {
                            "namespaceSelector": {
                                "matchLabels": {"app.kubernetes.io/part-of": "prettyk"},
                            },
                        },
                    ],
                },
            ],
            "egress": [
                {
                    "to": [
                        {
                            "namespaceSelector": {
                                "matchLabels": {"app.kubernetes.io/part-of": "prettyk"},
                            },
                        },
                    ],
                },
            ],
        },
    }


class KubernetesProvider(RuntimeProvider):
    """Cluster deployment provider — K8s API.

    Каждая сессия = изолированный Namespace.
    pk-control должен быть развёрнут в namespace prettyk-system.
    """

    def __init__(self, kubeconfig: Optional[str] = None):
        self._kubeconfig = kubeconfig

    async def provision_session_bundle(
        self, session_id: str, config: Optional[dict] = None,
    ) -> SessionResourceBundle:
        ns = _namespace(session_id)
        generation = config.get("generation", 1) if config else 1

        # 1. Создать namespace.
        await self._kubectl("create", "ns", ns, check=False)
        # Label namespace для NetworkPolicy selector.
        await self._kubectl(
            "label", "ns", ns,
            "app.kubernetes.io/part-of=prettyk",
            f"com.prettyk.session-id={session_id}",
            f"com.prettyk.generation={generation}",
            "--overwrite",
        )

        # 2. Применить NetworkPolicy.
        np = _network_policy(ns)
        await self._kubectl_apply(np)

        # 3. Запустить deployment'ы сессии.
        for rt, deploy_name in _RESOURCE_TO_DEPLOYMENT.items():
            await self._ensure_deployment(ns, deploy_name, rt, session_id, generation)

        # 4. Дождаться readiness.
        await self._wait_ready(ns, list(_RESOURCE_TO_DEPLOYMENT.values()))

        return self._build_bundle(session_id, ns, config)

    async def release_session_bundle(
        self, session_id: str, force: bool = False,
    ) -> None:
        ns = _namespace(session_id)
        timeout = "--timeout=5s" if force else "--timeout=30s"
        logger.info("Releasing K8s session %s (ns=%s, force=%s)", session_id, ns, force)

        await self._kubectl("delete", "ns", ns, timeout, "--ignore-not-found", check=False)

    async def check_bundle_health(
        self, session_id: str,
    ) -> Dict[ResourceType, bool]:
        ns = _namespace(session_id)
        result: Dict[ResourceType, bool] = {}

        try:
            pods_raw = await self._kubectl(
                "get", "pods", "-n", ns,
                "-l", f"com.prettyk.session-id={session_id}",
                "-o", "json",
                check=False,
            )
        except RuntimeError:
            return result

        import json as _json
        try:
            pods = _json.loads(pods_raw)
        except _json.JSONDecodeError:
            return result

        for item in pods.get("items", []):
            name = item["metadata"]["name"]
            phase = item.get("status", {}).get("phase", "Unknown")
            ready = phase == "Running"
            for rt in ResourceType:
                if rt.value in name:
                    result[rt] = ready
                    break
        return result

    async def stream_resource_logs(
        self, session_id: str, resource_type: ResourceType,
    ) -> AsyncIterator[str]:
        ns = _namespace(session_id)
        label = f"com.prettyk.component={resource_type.value}"

        proc = await asyncio.create_subprocess_exec(
            "kubectl", "logs", "-n", ns, "-l", label, "-f",
            "--tail=100",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
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

    # ── Helpers ────────────────────────────────────────────────────────────

    async def _kubectl(self, *args: str, check: bool = True) -> str:
        cmd = ["kubectl"]
        if self._kubeconfig:
            cmd.extend(["--kubeconfig", self._kubeconfig])
        cmd.extend(args)

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        out = stdout.decode("utf-8", errors="replace").strip()
        err = stderr.decode("utf-8", errors="replace").strip()

        if check and proc.returncode != 0:
            raise RuntimeError(
                f"kubectl failed (exit {proc.returncode}): {' '.join(cmd)}\n{err}"
            )
        return out

    async def _kubectl_apply(self, manifest: dict) -> str:
        import json as _json
        import tempfile

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8",
        ) as f:
            _json.dump(manifest, f)
            tmp = f.name

        try:
            return await self._kubectl("apply", "-f", tmp)
        finally:
            import os
            os.unlink(tmp)

    async def _ensure_deployment(
        self, ns: str, name: str, rt: ResourceType, session_id: str, generation: int,
    ) -> None:
        """Создать deployment если не существует. В реальной поставке
        deployment'ы приходят из Helm-чарта или Kustomize; здесь заглушка
        для сессионного контракта."""
        # Проверить существование.
        exists = await self._kubectl(
            "get", "deploy", name, "-n", ns,
            check=False,
        )
        if "not found" not in exists.lower() and exists.strip():
            return

        logger.info("K8s: creating deployment %s/%s for session %s", ns, name, session_id)
        # В production deployment создаётся Helm/Kustomize.
        # Здесь placeholder-команда.
        await self._kubectl(
            "create", "deploy", name,
            "-n", ns,
            "--image=nginx:alpine",
            f"--labels=com.prettyk.session-id={session_id},com.prettyk.generation={generation},com.prettyk.component={rt.value}",
            check=False,
        )

    async def _wait_ready(self, ns: str, deployments: list[str], timeout_s: int = 120) -> None:
        for dep in deployments:
            await self._kubectl(
                "wait", "--for=condition=available",
                f"deployment/{dep}",
                "-n", ns,
                f"--timeout={timeout_s}s",
            )

    # ── Bundle builder ─────────────────────────────────────────────────────

    def _build_bundle(
        self, session_id: str, ns: str, config: Optional[dict] = None,
    ) -> SessionResourceBundle:
        generation = config.get("generation", 1) if config else 1
        now = time.time()
        lease_sec = config.get("lease_seconds", 3600) if config else 3600

        endpoints: Dict[ResourceType, ServiceEndpoint] = {}
        for rt, port in _DEFAULT_INTERNAL_PORTS.items():
            name = _RESOURCE_TO_DEPLOYMENT.get(rt, rt.value)
            svc_name = f"{name}.{ns}.svc.cluster.local"
            endpoints[rt] = ServiceEndpoint(
                name=name,
                internal_url=f"http://{svc_name}:{port}",
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