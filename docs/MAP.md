# PrettyK SecOps — Архитектурная карта системы (MAP)

> Архитектурный каркас PrettyK SecOps Studio / Lab.  
> Внутренние компоненты, рантайм-порты и внешние интерфейсы сопряжения.  
> Навигация по файлам: [`docs/INDEX.md`](INDEX.md). Операторский роутер: [`AGENTS.md`](../AGENTS.md).

---

## 1. Топология подсистем и внешних сопряжений

```mermaid
flowchart TB
    subgraph EXTERNAL["🌐 ВНЕШНИЕ СВЯЗИ ЛИНЕЙКИ (Cross-Product Contracts)"]
        AIRLOCK["🚀 PrettyK Airlock (Cosmo)\n:8100\nSovereign Admission & Release Transfer"]
        HUB["⚖️ PrettyK Hub (Arbiter / Tribunal)\n:8200\nFindings, Triage, QG-вердикты"]
        BOARD["📢 PK Line Board\nD:\\prettyk.io\\docs\\board\nДирективы & Announcements"]
    end

    subgraph PRETTYK["🏰 PRETTYK SECOPS LAB & STUDIO (D:\\prettyk-secops)"]
        subgraph FE["ФРОНТЕНД-КОНТУР"]
            UI["Studio / Editor UI\n:5173 (Vite + React)\nCanvas, Monaco, 32-строчный конструктор"]
            LIVE_UI["Live Monitor UI\n:8767 (KDT Live / Stream Viewport)"]
        end

        subgraph ORCH["ОРКЕСТРАТОР & ДВИЖКИ"]
            API["Orchestrator API\n:8765 (FastAPI / Python)\nPydantic Wired Contract"]
            PW["Playwright Browser Core\n:9222 (CDP Attach / Headless)\nBrowserContext Isolation"]
            FUZZ["Fuzzer Engine & War Zone\nDAST Scenarios, Parameter Injection"]
            BROKER["Capability Broker & Run Control\nIdempotency, Queue, Retries"]
        end

        subgraph ENGINES["СКАНИРУЮЩИЙ КОНТУР & СТЕНД"]
            DEMON["Scanner Demon API\n:8080 (DAST Demon / Replacer)"]
            JUICE["Juice Shop (Целевой стенд)\n:3000 (Target App)"]
            GRID["Selenium / Browser Grid\n:4444 (Grid Console)"]
        end

        subgraph STORAGE["ХРАНЕНИЕ & ТЕЛЕМЕТРИЯ"]
            ALLURE["Allure3 SecOps\n:5050 (Evidence & Report Hub)"]
            DOJO["DefectDojo\n:8081 (Findings Mirror)"]
            VALKEY["Valkey 8\n:6379 (Run State / Queue)"]
            PG["PostgreSQL 16\n:5432 (SecOps Persistence)"]
        end
    end

    %% Внутренние связи
    UI -->|HTTP / REST| API
    UI -->|SSE / Status| LIVE_UI
    API --> PW
    API --> FUZZ
    API --> BROKER
    BROKER --> VALKEY
    API --> PG
    FUZZ --> DEMON
    DEMON --> JUICE
    PW --> JUICE
    API --> ALLURE
    API --> DOJO

    %% Внешние контрактные границы и сквозной handoff
    API -.->|Contract A: StudioRunOutput / Act / Evidence| HUB
    HUB -.->|Triage & QG Clearance| AIRLOCK
    AIRLOCK -.->|Contract B: Run Triggers & Admission Intake| API
    BOARD -.->|PK-DIR Directives| PRETTYK

    classDef external fill:#2d3748,stroke:#cbd5e0,stroke-width:2px,color:#fff;
    classDef fe fill:#1a365d,stroke:#63b3ed,stroke-width:1px,color:#fff;
    classDef orch fill:#22543d,stroke:#68d391,stroke-width:1px,color:#fff;
    classDef engines fill:#744210,stroke:#f6ad55,stroke-width:1px,color:#fff;
    classDef storage fill:#44337a,stroke:#b794f4,stroke-width:1px,color:#fff;

    class AIRLOCK,HUB,BOARD external;
    class UI,LIVE_UI fe;
    class API,PW,FUZZ,BROKER orch;
    class DEMON,JUICE,GRID engines;
    class ALLURE,DOJO,VALKEY,PG storage;
```

---

## 2. Канонические сетевые порты

Проверка портов выполняется строго через `netstat -ano | findstr :PORT` (не `Get-NetTCPConnection`).  
Канонический первоисточник: [`sanctuary/pure/stand-port-meta.md`](../sanctuary/pure/stand-port-meta.md).

| Порт | Сервис / Назначение | Протокол / Роль |
|---|---|---|
| `:5173` | Editor & Studio UI (Vite dev) | HTTP / React фронтенд |
| `:8765` | Orchestrator Engine / Playground API | HTTP / FastAPI бэкенд |
| `:8767` | Live Streaming Server (KDT Live) | HTTP + SSE стриминг выполнения |
| `:8080` | Scanner Demon API | HTTP REST DAST-движок |
| `:9222` | Chrome DevTools Protocol (CDP) | WebSocket / CDP attach к системному Chrome |
| `:5050` | Allure3 SecOps | HTTP / UI отчетов и свидетельств |
| `:8081` | DefectDojo | HTTP / Triage уязвимостей |
| `:6379` | Valkey 8 | Кеш очередей, idempotency keys, стейт |
| `:5432` | PostgreSQL 16 | Персистентная база прогонов и истории |

---

## 3. Межпродуктовые границы и сквозной handoff

Связь между продуктами линейки PrettyK осуществляется **исключительно через внешние контракты** (JSON / REST / SSE / SARIF / Webhook). Прямые импорты кода и общие базы данных между репозиториями **запрещены**.

### Сквозной Handoff линейки: Коробка → Hub → Airlock

1. **Коробка (PrettyK SecOps, PO Keeper):**
   - Проводит DAST, Fuzzing и Playwright сценарии атак.
   - Формирует факты исполнения: вердикт прогона, ГОСТ/Exception Act, ссылки на Evidence (логи, скриншоты, HAR), comparability-кортеж.
   - Передаёт структурированный `StudioRunOutput` в Hub по **Contract A** (`PK-C-009`).
   - *Инвариант:* Исполнитель не судья; коробка фиксирует наблюдаемые факты исполнения, но не выносит межпроектный допуск.

2. **Hub (PrettyK Hub, PO Arbiter):**
   - Принимает findings и evidence из коробки (Contract A Intake).
   - Выполняет дедупликацию, триаж, сопоставление с baseline и historical trends.
   - Является единственным судом (Tribunal) и источником истины (SoT) по статусу уязвимостей, override-согласованиям и вынесению вердикта Quality Gate (clearance).

3. **Airlock (PrettyK Airlock, PO Cosmo — бывший Control Plane / Cosmoport):**
   - Суверенная система допуска и межзонной передачи релизов.
   - Инициирует задачи проверок в коробке по **Contract B** (Run Triggers & Parameters).
   - Потребляет финальный security clearance из PrettyK Hub.
   - Управляет суверенным шлюзом допуска: без зелёного вердикта из Hub межзонная передача релиза заблокирована.

4. **Line Governance (Nexus → SecOps):**
   - Доска директив и объявлений линейки: `D:\prettyk.io\docs\board\ANNOUNCEMENTS.md`.
