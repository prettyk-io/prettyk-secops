# RuntimeProvider — абстракция нижележащего substrate (Compose, Kubernetes).
#
# pk-control не знает, как именно запускаются контейнеры/поды.
# ComposeProvider и KubernetesProvider реализуют один и тот же контракт.
#
# Контракт фиксирован research-спекой:
#   docs/research/2026-08-28-session-orchestration-and-multi-substrate-architecture.md §4.2
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator, Dict, Optional


class ResourceType(str, Enum):
    SCANNER = "scanner"
    BROWSER_AUTHORING = "browser_authoring"
    CDP_RELAY = "cdp_relay"
    TARGET = "target"


@dataclass(frozen=True)
class ServiceEndpoint:
    """Адрес сервиса внутри изолированной сессионной сети.

    internal_url — DNS-имя внутри Docker/K8s-сети (http://scanner:8080).
    public_url — опциональный адрес для оператора/хоста.
    """
    name: str
    internal_url: str
    public_url: Optional[str] = None
    port: int = 0


@dataclass
class SessionResourceBundle:
    """Набор ресурсов одной сессии — результат provision_session_bundle."""
    session_id: str
    generation: int
    endpoints: Dict[ResourceType, ServiceEndpoint] = field(default_factory=dict)
    status: str = "provisioning"
    created_at: float = 0.0
    lease_expires_at: float = 0.0


class RuntimeProvider(ABC):
    """Абстракция нижележащего substrate.

    Реализации:
      - ComposeProvider — Docker Compose (standalone appliance).
      - KubernetesProvider — K8s API (cluster deployment).
    """

    @abstractmethod
    async def provision_session_bundle(
        self, session_id: str, config: Optional[dict] = None,
    ) -> SessionResourceBundle:
        """Создать изолированный набор ресурсов сессии (сеть + контейнеры/поды)."""
        ...

    @abstractmethod
    async def release_session_bundle(
        self, session_id: str, force: bool = False,
    ) -> None:
        """Корректно остановить и удалить ресурсы сессии."""
        ...

    @abstractmethod
    async def check_bundle_health(
        self, session_id: str,
    ) -> Dict[ResourceType, bool]:
        """Проверить фактическую готовность компонентов сессии."""
        ...

    @abstractmethod
    async def stream_resource_logs(
        self, session_id: str, resource_type: ResourceType,
    ) -> AsyncIterator[str]:
        """Стриминг логов компонента сессии."""
        ...