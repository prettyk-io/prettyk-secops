# Cosmo Brick Catalog Reference

> **Версия:** 1.0 — 27 августа 2026  
> **Контекст:** `orchestrator/models/pipeline_brick.py` (COS-L3)

Стандартные Pipeline Bricks из коробки PrettyK Cosmo.

---

## SAST (Static Application Security Testing)

| Параметр | Значение |
|---|---|
| **id** | `sast-default` |
| **type** | `sast` |
| **executor** | `woodpecker` |
| **image** | `sonarsource/sonar-scanner-cli:latest` |
| **timeout_s** | `3600` (1 час) |
| **inputs** | `SONAR_HOST_URL`, `SONAR_TOKEN`, `SONAR_PROJECT_KEY` |
| **outputs** | `report.json`, `coverage.xml` |
| **depends_on** | `[]` (первый в пайплайне) |

### Пример переопределения для cosmo-custom

```python
BrickOverride(
    brick_id="sast-default",
    domain_id="d-cbr",
    overrides_json={
        "image": "registry.cbr.ru/sonar-scanner:custom-4.5",
        "timeout_s": 7200,
        "inputs": {
            "SONAR_HOST_URL": "https://sonar.cbr.local",
            "SONAR_TOKEN": "VAULT/CBR_SONAR_TOKEN",
        },
    },
)
```

---

## SCA (Software Composition Analysis)

| Параметр | Значение |
|---|---|
| **id** | `sca-default` |
| **type** | `sca` |
| **executor** | `woodpecker` |
| **image** | `dependencytrack/bundled:latest` |
| **timeout_s** | `1800` |
| **depends_on** | `["sast-default"]` |

---

## Build

| Параметр | Значение |
|---|---|
| **id** | `build-default` |
| **type** | `build` |
| **executor** | `woodpecker` |
| **image** | `docker:latest` |
| **timeout_s** | `1800` |
| **depends_on** | `["sast-default"]` |

### Пример для Node.js

```python
BrickOverride(
    brick_id="build-default",
    domain_id="d-frontend",
    overrides_json={
        "image": "node:20-alpine",
        "inputs": {"NPM_REGISTRY": "https://registry.npmjs.org"},
    },
)
```

---

## Deploy

| Параметр | Значение |
|---|---|
| **id** | `deploy-default` |
| **type** | `deploy` |
| **executor** | `woodpecker` |
| **image** | `alpine/k8s:1.28` |
| **timeout_s** | `1200` |
| **depends_on** | `["build-default"]` |

---

## DAST (Dynamic Application Security Testing)

| Параметр | Значение |
|---|---|
| **id** | `dast-default` |
| **type** | `dast` |
| **executor** | `woodpecker` |
| **image** | `owasp/scanner2docker-stable:latest` |
| **timeout_s** | `5400` (1.5 часа) |
| **depends_on** | `["deploy-default"]` |
| **capability** | `scannerCapabilityBroker` |

Адаптер: `orchestrator/adapters/capability_scanner.py` (COS-L9).

---

## Autotest

| Параметр | Значение |
|---|---|
| **id** | `autotest-default` |
| **type** | `autotest` |
| **executor** | `woodpecker` |
| **image** | `mcr.microsoft.com/playwright:latest` |
| **timeout_s** | `3600` |
| **depends_on** | `["deploy-default"]` |
| **capability** | Playwright (встроенный) |

Fuzzer-словари: `orchestrator/adapters/capability_fuzzer.py` (COS-L10).

---

## Gate (Security Gate)

| Параметр | Значение |
|---|---|
| **id** | `gate-default` |
| **type** | `gate` |
| **executor** | `woodpecker` |
| **image** | `internal/gate-checker:latest` |
| **timeout_s** | `600` |
| **depends_on** | `["sast-default", "sca-default", "dast-default", "autotest-default"]` |

Модель политики: `orchestrator/models/gate_model.py` (COS-L5).

```python
# Политика по умолчанию: block на Critical, warn на High (max 5)
GatePolicy(rules=[
    GatePolicyRule(finding_type="Critical", action="block"),
    GatePolicyRule(finding_type="High", action="warn", max_count=5),
    GatePolicyRule(finding_type="Medium", action="pass"),
    GatePolicyRule(finding_type="Low", action="pass"),
    GatePolicyRule(finding_type="Info", action="pass"),
])
```

---

## Pipeline flow (canonical DAG)

```
SAST ──┬── SCA
       │
       ├── Build ── Deploy ──┬── DAST
       │                     │
       │                     └── Autotest
       │
       └── [все] ── Gate
```

---

## Связи с кодом

| Модель | Файл | Строки |
|---|---|---|
| Domain | `orchestrator/models/domain_model.py` | COS-L1 |
| AppGraph | `orchestrator/models/app_graph.py` | COS-L2 |
| PipelineBrick | `orchestrator/models/pipeline_brick.py` | COS-L3 |
| Run + Batch | `orchestrator/models/run_model.py` | COS-L4 |
| Gate | `orchestrator/models/gate_model.py` | COS-L5 |
| Woodpecker | `orchestrator/adapters/execution_woodpecker.py` | COS-L7 |
| Jenkins | `orchestrator/adapters/execution_jenkins.py` | COS-L8 |
| scanner | `orchestrator/adapters/capability_scanner.py` | COS-L9 |
| Fuzzer | `orchestrator/adapters/capability_fuzzer.py` | COS-L10 |