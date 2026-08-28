# Архитектура Session Orchestration и Multi-Substrate Delivery (PrettyK Pure & Cosmoport2 Boundary)

> **Дата:** 28 августа 2026  
> **Статус:** Architectural Blueprint / Research Foundation (готово к будущей 2FA-канонизации)  
> **Область:** Session Runtime, Multi-Tenant Isolation, Multi-Substrate Packaging, Kubernetes/GitOps Delivery, Cosmoport2 Integration  

---

## 1. Executive Summary & Ключевые Принципы

PrettyK эволюционирует из одиночного лабораторного скриптового контура (`lab_up.ps1` / единый `docker compose`) в **промышленный multi-substrate продукт**, способный функционировать как:
1. **Standalone Appliance (Compose Provider)** — автономная airgap-коробка на одной машине (Windows/Linux Docker Engine) без внешних зависимостей и без необходимости администрировать Kubernetes.
2. **Cluster Deployment (Kubernetes Provider)** — корпоративная масштабируемая установка в Kubernetes с декларативным управлением ресурсами, динамическими Pod/Namespace per-session и поддержкой GitOps.

При этом архитектура строго разграничивает внутренний контур **PrettyK Pure** и соседний продукт **Cosmoport2**:
- **PrettyK Pure** — независимое ядро DAST-сканирования, управления браузерами, студии и отчётности. Не содержит жестких зависимостей от Cosmoport и не требует его наличия.
- **Cosmoport2** — внешний/соседний портал управления доставкой и инфраструктурой. Взаимодействие с PrettyK строится исключительно через **версионируемый API и событийный контракт (Event Bus / REST / Webhooks)**, без общей базы данных и без внутренних Python-импортов.

```
+-----------------------------------------------------------------------------+
|                            PrettyK Control Plane                            |
|                                (pk-control)                                 |
|                                                                             |
|  +--------------------+  +----------------------+  +---------------------+  |
|  |  Session Manager   |  |     Run Scheduler    |  | Resource Reconciler |  |
|  +--------------------+  +----------------------+  +---------------------+  |
|  +--------------------+  +----------------------+  +---------------------+  |
|  |  Lease & Fencing   |  |   Artifact Manager   |  | Health & Diagnostics|  |
|  +--------------------+  +----------------------+  +---------------------+  |
|                                                                             |
|                       Runtime Provider Abstraction Layer                     |
|                               (RuntimeProvider)                             |
+-----------------------------------------------------------------------------+
               |                                              |
               v                                              v
+-----------------------------+                +------------------------------+
|       ComposeProvider       |                |      KubernetesProvider      |
|    (Standalone Appliance)   |                |     (Cluster Deployment)     |
|                             |                |                              |
| +-------------------------+ |                | +--------------------------+ |
| | Base Project (System)   | |                | | System Namespace         | |
| | (API, Valkey, Live, UI) | |                | | (pk-control, DB, Live)   | |
| +-------------------------+ |                | +--------------------------+ |
| +-------------------------+ |                | +--------------------------+ |
| | Dynamic Session Projects| |                | | Dynamic Session Workloads| |
| | pk-session-<id>         | |                | | (Namespaces/Pods per-ses)| |
| | (Scanner, Browser, Rel) | |                | | (Scanner, Browser, Rel)  | |
| +-------------------------+ |                | +--------------------------+ |
+-----------------------------+                +------------------------------+
                                                              ^
                                                              | (OpenGitOps / API)
                                               +------------------------------+
                                               |     Cosmoport2 (Neighbor)    |
                                               |  (Portal, Deployments, K8s)  |
                                               +------------------------------+
```

---

## 2. Опора на Индустриальные Стандарты и Паттерны

Мы не изобретаем собственные планировщики (ad-hoc schedulers) и самодельные механизмы сетевой изоляции. Архитектура базируется на проверенных отраслевых решениях:

| Область | Индустриальный Паттерн | Применение в PrettyK | Обоснование / Первоисточник |
|---|---|---|---|
| **Browser Routing & Slots** | **Selenium Grid 4**: Router → Session Map → New Session Queue → Distributor → Node/Slot | `pk-control` управляет пулом слотов браузеров; запросы на интерактивную сессию маппятся на выделенный Browser Slot с жизненным циклом и heartbeat. | [Selenium Grid Architecture](https://www.selenium.dev/documentation/grid/architecture/) |
| **Browser Isolation** | **Playwright BrowserContexts** vs Dedicated Instance | Для быстрых execution-run'ов внутри одного воркера используется дешёвый `BrowserContext` (изолированные куки, storage, кеш). Для **интерактивного авторского режима (Authoring Stage)** выделяется выделенный контейнерный процесс с CDP-стримингом. | [Playwright Isolation Guide](https://playwright.dev/docs/browser-contexts) |
| **Stateful Scanner Isolation** | **OWASP scanner / Automation Framework**: Ephemeral & Scoped Execution | scanner хранит глобальную историю (Sites Tree, Alerts, Active Scan state). Для предотвращения утечек между параллельными арендаторами/сессиями каждый интерактивный воркспейс получает отдельный контейнерный инстанс scanner. Shared scanner допустим только в доверенном single-user dev-режиме. | [scanner Docker Guide](https://www.zaproxy.org/docs/docker/about/) · [scanner Automation Framework](https://www.zaproxy.org/docs/automate/automation-framework/) |
| **Workload Reconciliation & Leases** | **Kubernetes Controller / Operator & Lease API** | `pk-control` работает как непрерывный Reconciler (`desired state` vs `observed state`). Блокировки и владение воркерами защищены Lease с `fencing_token` (generation counter), предотвращая split-brain и зомби-процессы. | [Kubernetes Leases](https://kubernetes.io/docs/concepts/architecture/leases/) · [K8s Operator Pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/) |
| **Local Project & Network Isolation** | **Docker Compose v2**: Dynamic Project Name & Profiles | В standalone-режиме каждая сессия поднимается как отдельный Compose Project (`-p pk-session-<id>`) с изолированной bridge-сетью. Сервисы общаются по внутренним DNS-именам (`scanner:8080`, `browser:9222`), не засоряя host-порты. | [Docker Compose Networking](https://docs.docker.com/compose/how-tos/networking/) · [Compose Profiles](https://docs.docker.com/compose/how-tos/profiles/) |
| **Declarative Deployment & Multi-Cluster** | **OpenGitOps & Argo CD / Flux Concepts** | Управление поставками базируется на декларативных манифестах, OCI-артефактах и pull/reconcile паттерне. Внешние кластеры подключаются по модели `Cluster Inventory` с хранением секретов по ссылкам (Secrets by Reference). | [OpenGitOps Principles](https://opengitops.dev/) · [Argo CD Architecture](https://argo-cd.readthedocs.io/en/stable/operator-manual/architecture/) |

---

## 3. Трехуровневая Иерархия Сущностей: Box, Session, Run

Архитектурная ошибка прошлого — смешивание жизненного цикла **запуска сценария (Run)** и **рабочего пространства (Session)** в один общий Compose. В целевой модели вводится четкая иерархия:

```
+-------------------------------------------------------------------+
|                            BOX (System)                           |
|  - Постоянная инсталляция PrettyK (Standalone host или K8s cluster)|
|  - Долгоживущие сервисы: Control Plane, Persistence, Allure, Live |
+-------------------------------------------------------------------+
                                  |
                                  | 1 : N (параллельные воркспейсы)
                                  v
+-------------------------------------------------------------------+
|                       SESSION (Workspace)                         |
|  - Интерактивное рабочее пространство оператора (Studio / Author) |
|  - Владелец выделенных ресурсов:                                  |
|      * Scanner Daemon (scanner инстанс с собственной БД/сессией)      |
|      * Authoring Browser (Chromium в Xvfb с CDP)                  |
|      * CDP Viewport Relay (WebSocket стриминг кадров :9224)       |
|      * Target Sandbox (опциональный Juice Shop / тестовый стенд)  |
|  - Жизненный цикл: Lease + Heartbeat + Idle Timeout               |
+-------------------------------------------------------------------+
                                  |
                                  | 1 : M (последовательные или пакетные)
                                  v
+-------------------------------------------------------------------+
|                          RUN (Execution)                          |
|  - Единичное выполнение сценария / волны фаззинга / чека          |
|  - Не владеет инфраструктурными контейнерами                      |
|  - Использует ресурсы родительской Session                        |
|  - Генерирует артефакты (Allure raw results, logs, video, HAR)    |
+-------------------------------------------------------------------+
```

---

## 4. Архитектура `pk-control` и Provider Abstraction

### 4.1. Структура `pk-control`

`pk-control` — долгоживущий сервис управления (на Python 3.13 / FastAPI + AsyncIO background workers), функционирующий как единая точка входа для UI и CLI:

1. **State Store** — хранение метаданных сессий, запусков и ресурсов (PostgreSQL в production / Valkey или embedded SQLite в минимальном appliance).
2. **Reconciler Engine** — фоновый цикл (loop), приводящий фактическое состояние контейнеров/подов к желаемому:
   - Обнаружение упавших контейнеров.
   - Проверка readiness probes (`healthcheck`).
   - Истечение lease и корректный teardown (Garbage Collection).
3. **Session Controller** — аллокация изолированных сетевых пространств, генерация конфигов для scanner/Browser, запуск CDP relay.
4. **Run Controller** (на базе чистого ядра `RunControlPlane`) — FIFO очередь запусков, сопоставление capabilities, lease воркеров, классификация ошибок (`infra` vs `validation` vs `target`).

### 4.2. Контракт `RuntimeProvider`

`pk-control` полностью абстрагирован от конкретного механизма запуска контейнеров через интерфейс:

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import AsyncIterator, Dict, List, Optional

class ResourceType(str, Enum):
    SCANNER = "scanner"
    BROWSER_AUTHORING = "browser_authoring"
    CDP_RELAY = "cdp_relay"
    TARGET = "target"

@dataclass(frozen=True)
class ServiceEndpoint:
    name: str
    internal_url: str        # URL внутри Docker-сети / K8s DNS (напр. http://scanner:8080)
    public_url: Optional[str] # URL для оператора / хоста (если опубликован)
    port: int

@dataclass
class SessionResourceBundle:
    session_id: str
    generation: int
    endpoints: Dict[ResourceType, ServiceEndpoint]
    status: str
    created_at: float
    lease_expires_at: float

class RuntimeProvider(ABC):
    """Абстракция нижележащего рантайма (Compose, Kubernetes)."""

    @abstractmethod
    async def provision_session_bundle(self, session_id: str, config: dict) -> SessionResourceBundle:
        """Создать изолированный набор ресурсов для сессии (сеть + контейнеры/поды)."""
        pass

    @abstractmethod
    async def release_session_bundle(self, session_id: str, force: bool = False) -> None:
        """Корректно остановить и удалить ресурсы сессии."""
        pass

    @abstractmethod
    async def check_bundle_health(self, session_id: str) -> Dict[ResourceType, bool]:
        """Проверить фактическую готовность компонентов сессии."""
        pass

    @abstractmethod
    async def stream_resource_logs(self, session_id: str, resource_type: ResourceType) -> AsyncIterator[str]:
        """Стриминг логов компонента сессии."""
        pass
```

---

## 5. Детализация Провайдеров: Compose vs Kubernetes

### 5.1. `ComposeProvider` (Standalone Appliance)

- **Базовый проект:** Запускается через `docker compose -p pk-system -f services/docker-compose.base.yml up -d`. Включает `pk-control`, PostgreSQL/Valkey, Allure Service, Live Server.
- **Динамические проекты сессий:** На каждую сессию `pk-control` генерирует compose-определение и выполняет:
  ```bash
  docker compose -p pk-session-<session_id> -f generated/session_<id>.yml up -d
  ```
- **Сетевая топология:**
  - Создается изолированная bridge-сеть `pk-net-<session_id>`.
  - `pk-control` подключается к сети сессии (или использует bridge-прокси), направляя HTTP/WS запросы от UI внутрь сети.
  - На хосте оператора **не публикуются случайные host-порты**. Доступ к CDP Viewport и scanner API происходит исключительно через проксирование/маршрутизацию `pk-control`.
- **Изоляция имен:** Отсутствие фиксированных `container_name`. Имена генерируются Docker Compose автоматически (`pk-session-<id>-scanner-1`).

### 5.2. `KubernetesProvider` (Cluster Deployment)

- **Системный контур:** Деплоится через Helm-чарт в namespace `prettyk-system`.
- **Сессии:** Каждая интерактивная сессия деплоится как Custom Resource (`PrettyKSession`) или набор Pod/Service в выделенный ephemeral namespace `pk-session-<session_id>` (либо с namespace-level NetworkPolicy в общем session-пуле).
- **Сетевая изоляция:** `NetworkPolicy` запрещает межсессионный трафик. Разрешен только трафик от `pk-control` ingress/relay.
- **Storage:** Ephemeral Volumes (`emptyDir` / fast local NVMe StorageClass) для временного профиля браузера и базы scanner; Persistent Volume Claims только для экспортируемых отчетов.

---

## 6. Жизненный Цикл, Рестарт-Политики и Восстановление (Fault Tolerance)

### 6.1. Матрица Реакции на Сбои

| Инцидент | Уровень Docker/K8s | Реакция `pk-control` Reconciler | Поведение UI / Оператора |
|---|---|---|---|
| **Падение процесса внутри scanner/Browser** | `restart: unless-stopped` (Docker) или `restartPolicy: Always` (K8s) перезапускает контейнер. | Обнаруживает смещение generation/uptime. Проверяет сохранность состояния. | В UI отображается кратковременный статус `RECONNECTING` (до 5 сек). |
| **Зависание/Unhealthy статус сервиса** | Docker healthcheck переходит в `unhealthy` (контейнер не убивается сам). | Reconciler видит `unhealthy > deadline`, посылает `recreate_container` для конкретного сервиса. | В UI появляется баннер `Service Degraded: Restarting Scanner...`. Сессия не сбрасывается целиком. |
| **Падение `pk-control` (Control Plane)** | Хостовый supervisor / K8s ReplicaSet перезапускает `pk-control`. | При старте загружает активные Lease из БД, проверяет наличие живых контейнеров по labels (`com.prettyk.session-id`), восстанавливает `Session Map`. | Оператор обновляет вкладку — сессия и запущенные тесты продолжают работу без прерывания (no session loss). |
| **Истечение Lease (зависший клиент / закрытый браузер)** | Нет действий на уровне ОС. | Lease TTL истек (`now > lease_expires_at + grace_period`). Reconciler инициирует `release_session_bundle`. Контейнеры уничтожаются, память освобождается. | Ворксpace освобождается автоматически; ресурсы не утекают в виде «зомби». |

### 6.2. Модель Lease и Fencing Tokens

Для исключения ситуаций, когда отключившийся оператор или подвисший воркер внезапно «отвисает» и начинает слать команды в переназначенный слот, используется **Fencing Token**:
- При создании сессии и каждом продлении аренды инкрементируется `generation_id` (monotonically increasing integer).
- Любой вызов к API браузера или сканера сопровождается заголовком `X-PK-Session-Generation: <id>`.
- Если на стороне рантайма зарегистрирован токен старше пришедшего — запрос отклоняется с кодом `409 Conflict (Stale Lease Owner)`.

---

## 7. Граница Cosmoport2 и Управление Внешними Кластерами

### 7.1. Модель Разделения Продуктов

```
+------------------------------------+        +------------------------------------+
|            Cosmoport2              |        |            PrettyK Pure            |
|                                    |        |                                    |
| - Управление поставками ПО         |        | - DAST / Сканирование Безопасности |
| - Инвентарь клиентских K8s-кластеров|       | - Студия авторства сценариев       |
| - Release Orchestration & GitOps   |        | - Browser Studio & Interactive CDP |
| - Портал для команд разработки     |        | - Allure-SecOps отчетность         |
+------------------------------------+        +------------------------------------+
                   \                                    /
                    \                                  /
                     v                                v
    +------------------------------------------------------------------+
    |                   Neutral API & Event Contract                   |
    |                                                                  |
    |  * REST API: /api/v1/scans, /api/v1/reports, /api/v1/gates       |
    |  * Event Bus: Webhooks / Kafka / CloudEvents                     |
    |  * Artifacts: OCI Image Bundles, SPDX/CycloneDX SBOM, SARIF      |
    +------------------------------------------------------------------+
```

### 7.2. Внешний Multi-Cluster Management (для сценариев Cosmoport)

Когда PrettyK интегрируется в ландшафт Cosmoport2 для проведения проверок в airgap-кластерах, используется паттерн **External Cluster Connector**:
1. **Cluster Inventory** — регистрация целевых кластеров с указанием их сетевого профиля, ограничений политик (NetworkPolicies, PodSecurityStandards) и доступных хранилищ.
2. **Secrets by Reference** — учетные данные (`kubeconfig`, токены ServiceAccount, TLS-сертификаты) не сохраняются в манифестах или коде PrettyK; они резолвятся на лету через защищенный Vault/K8s Secret store по ссылке (`credential_ref: "vault://clusters/airgap-01/creds"`).
3. **Pluggable Transports**:
   - `Direct API`: Прямое взаимодействие с K8s API (если есть сетевой маршрут).
   - `Adjacent Runner`: Выполнение через агента в смежном сетевом сегменте (DMZ / jump host).
   - `Pull GitOps / OCI`: Доставка декларативного манифеста через OCI-реестр или Git, где локальный агент кластера (Flux/Argo) вытягивает задачу.

---

## 8. Архитектура UI и Слои Возможностей (Capability Layers)

Пользовательский интерфейс PrettyK строится по модульному принципу. Базовый пользователь DAST-сканера не должен перегружаться кластерной сложностью:

```
+-----------------------------------------------------------------------------+
|                           PrettyK Unified Studio                            |
+-----------------------------------------------------------------------------+
| [Layer 1: Core DAST] (Обязательный, Pure Box)                               |
|   - Monaco Editor / DSL сценариев                                           |
|   - BrowserStage (интерактивный CDP холст + click/type dispatch)            |
|   - Live Execution Feed (лента шагов в реальном времени)                    |
|   - Allure3-SecOps Reports & Quality Gates                                  |
+-----------------------------------------------------------------------------+
| [Layer 2: Runtime & Workspace Ops] (Обязательный, Pure Box)                 |
|   - Статус локальной коробки (Docker Engine / Memory / Active Sessions)     |
|   - Управление активным воркспейсом (Restart Scanner, Clear State, Reset)   |
|   - Offline Bundle Version & Health Indicator                               |
+-----------------------------------------------------------------------------+
| [Layer 3: Deployment & Cluster Management] (Опциональный / Cosmoport Link)  |
|   - Вкладка "Инфраструктура и Поставки" (включается профилем/лицензией)     |
|   - Управление подключенными K8s кластерами                                 |
|   - Статус синхронизации релизов (Desired vs Observed state)                |
|   - Экспорт / Импорт offline airgap OCI-пакетов                             |
+-----------------------------------------------------------------------------+
```

---

## 9. Пакет Поставки и Offline Airgap Contract

Для поставки в изолированные среды (Airgap / Банковский контур) формируется самодостаточный бандл:

```
prettyk-pure-vX.Y.Z-airgap.tar.gz
├── wired.json                 # Версии, контрольные суммы sha256, совместимость
├── images/                       # Запеченные OCI-образы (tar / OCI layout)
│   ├── pk-control.tar
│   ├── pk-playwright-authoring.tar
│   ├── pk-scanner-daemon.tar
│   ├── pk-allure3-secops.tar
│   └── pk-live-server.tar
├── compose/                      # Compose-шаблоны для Standalone Appliance
│   ├── docker-compose.base.yml
│   └── session-template.yml
├── helm/                         # Helm-чарт для Kubernetes Deployment
│   └── prettyk-cluster-vX.Y.Z.tgz
├── scripts/                      # Скрипты развертывания
│   ├── install.ps1 (Windows)
│   ├── install.sh (Linux)
│   └── verify-bundle.sh (Проверка sha256 и целостности)
└── migrations/                   # SQL-миграции схемы БД
```

**Инвариант поставки:** В процессе установки и работы коробки **категорически запрещены любые внешние сетевые запросы** (`pip install`, `npm install`, `playwright install`, скачивание браузерных бинарников или scanner-плагинов). Все бинарники, шрифты, иконки и плагины впекаются на этапе сборки release bundle.

---

## 10. Дорожная Карта Реализации (Engineering Waves)

1. **Wave 1 — Interface & State Isolation (Внутренний рефакторинг):**
   - Формализация интерфейса `RuntimeProvider` в `orchestrator/infra/`.
   - Вынос управления сессиями из in-memory `CapabilityBroker` в `pk-control` Session Manager.
   - Разделение Compose-файлов на `base` (долгоживущий) и `session-template` (динамический).
2. **Wave 2 — Standalone Compose Provider (Pure Box Appliance):**
   - Реализация `ComposeProvider` с запуском `pk-session-<id>` проектов через Docker SDK / CLI.
   - Реализация Lease Controller с автоматической чисткой zombie-сессий.
   - Тестирование параллельных сессий: 2 независимых автора с разными scanner и браузерами.
3. **Wave 3 — Unified UI / Studio Integration:**
   - Подключение `BrowserStage` к динамическому endpoint'у `pk-control` relay.
   - Реализация индикатора здоровья сессии и кнопки «Recreate Workspace».
4. **Wave 4 — Kubernetes Provider & Helm Packaging:**
   - Реализация `KubernetesProvider` (Namespace/Pod lifecycle).
   - Подготовка и валидация Helm-чарта в тестовом кластере.
5. **Wave 5 — Cosmoport2 Integration Adapter:**
   - Стабилизация REST/Webhook контракта для вызова DAST-проверок из внешнего CI/CD и Cosmoport.
