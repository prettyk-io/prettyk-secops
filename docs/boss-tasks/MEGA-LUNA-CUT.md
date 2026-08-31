# Luna — MEGA-нарезка: типs, адаптеры, тесты, документация

> **Ты подчиняешься Boss. Он ревьюит твой код.**
> **Правила:** тесты точечные. Коммиты/пуши — только по приказу. Не трогать чужой WIP.

---

## Блок 1: PK-DSL — Типы и тесты

### DSL-L1 — TypeScript-типы для Sugar DSL (1h)
Новые типы в `frontend/src/core/interfaces/`:
- `SugarVerb`: `'Клик' | 'Вставить' | 'Ждать' | 'Скрин' | 'Текст' | 'Значение' | 'Атрибут' | 'Дописать' | 'Очистить' | 'Выбрать'`
- `SugarLocator`: `{strategy: LocatorStrategy, value: string}`
- `SugarModifier`: `'>?' | '-> $var' | '>#hint'`
- `ParsedSugarLine`: `{verb, locator, args[], modifiers[]}`
Обновить: `MethodId`, `WireStep` интерфейсы.
Приёмка: `tsc --noEmit` зелёный. 3+ теста на валидность типов.

### DSL-L2 — Sugar парсер на TypeScript (1.5h)
Файл: `frontend/src/editor/sugarParser.ts`
Функция `parseSugarLine(line: string): ParsedSugarLine`.
Разбор: глагол → локатор → аргументы → модификаторы.
Round-trip: `parseSugarLine → formatSugarLine`.
Приёмка: `test_sugarParser.test.ts` → 10+ тестов (каждый глагол, каждый модификатор).

### DSL-L3 — Тесты для PlaywrightAdapter парности (1.5h)
Файл: `orchestrator/tests/test_playwright_adapter_contract.py`
Для каждого P0 метода: проверка что сигнатура совпадает с `WebDriverAdapter`.
Мок: `PlaywrightBrowserRuntime.launch`.
Проверка: правильный Playwright API вызван (locator, page, context).
Приёмка: 20+ тестов зелёных.

### DSL-L4 — Тесты для Smart Locator (1h)
Файл: `orchestrator/tests/test_playwright_smart_locator.py`
Для каждой стратегии: проверка что правильный Playwright API вызван.
Каскад: `Клик Войти` → `get_by_role('button', name='Войти')`.
Edge cases: `.NET Core` → fallback на text.
Приёмка: 15+ тестов зелёных.

---

## Блок 2: COSMO-MODELS — Доменные модели

### COS-L1 — Pydantic модель Domain (1h)
Файл: `orchestrator/models/domain_model.py`
`Domain`: все поля из концепта (id, label, forge_binding, rbac_config, quota).
`ForgeBinding`: forge_type (gitea/jenkins), url, token_ref.
`DomainQuota`: max_runs, max_storage_gb, max_cpu.
Валидаторы: label не пустой, quota > 0.
Приёмка: `test_domain_model.py` → 5+ тестов.

### COS-L2 — Pydantic модель App Graph (1.5h)
Файл: `orchestrator/models/app_graph.py`
`Application`: id, domain_id, level, group_id, repo_binding, pipeline_plan_id.
`Group`: id, domain_id, parent_group_id, level, name.
`RepositoryBinding`: forge_id, repo_path, default_branch, webhook_id.
`AppGraph`: `{domain, groups[], apps[], libraries[]}`.
Валидация: level 0..3, нет циклов в иерархии.
Приёмка: `test_app_graph.py` → 8+ тестов.

### COS-L3 — Pydantic модель Pipeline Brick (1h)
Файл: `orchestrator/models/pipeline_brick.py`
`PipelineBrick`: все поля (id, name, type, source, definition, depends_on, gates).
`BrickType`: Literal["sast", "sca", "build", "deploy", "dast", "autotest", "gate"].
`BrickDefinition`: executor, image, timeout_s, inputs, outputs.
`BrickOverride`: brick_id, domain_id, overrides_json.
Приёмка: `test_brick_model.py` → 5+ тестов.

### COS-L4 — Pydantic модель Run & Batch (1.5h)
Файл: `orchestrator/models/run_model.py`
`Run`: id, plan_id, trigger, initiator, domain_id, status, batches[], gates[], findings[].
`Batch`: id, plan_id, type, status, bricks[], artifacts[], evidence[].
`BatchStatus`: Literal["pending", "running", "passed", "failed", "blocked"].
`RunTrigger`: Literal["scheduled", "pre_release", "emergency", "manual"].
Приёмка: `test_run_model.py` → 6+ тестов.

### COS-L5 — Pydantic модель Security Gate (1h)
Файл: `orchestrator/models/gate_model.py`
`Gate`: id, type (automatic/manual), position, policy, decision, decided_by, signature.
`GatePolicy`: rules[] → `{finding_type, action, max_count?}`.
`GateDecision`: pass | block | manual_required.
`GateAction`: Literal["block", "warn", "pass"].
Приёмка: `test_gate_model.py` → 5+ тестов.

---

## Блок 3: COSMO-ADAPTERS — Реализация адаптеров

### COS-L6 — Gitea ForgeAdapter (2h)
Файл: `orchestrator/adapters/forge_gitea.py`
Реализация `ForgeAdapter` для Gitea API.
Методы: `register_domain`, `get_repo_info`, `list_repos`, `set_commit_status`.
Webhook handler: `on_push` → Plan Compiler trigger.
Мок для тестов.
Приёмка: `test_forge_gitea.py` → 10+ тестов.

### COS-L7 — Woodpecker ExecutionAdapter (2h)
Файл: `orchestrator/adapters/execution_woodpecker.py`
Реализация `ExecutionAdapter` для Woodpecker CI.
Генерация `.woodpecker.yml` из Batch.
Запуск: API trigger → JobHandle.
Мониторинг: `get_job_status`, `stream_logs`.
Приёмка: `test_execution_woodpecker.py` → 8+ тестов.

### COS-L8 — Jenkins ExecutionAdapter (1.5h)
Файл: `orchestrator/adapters/execution_jenkins.py`
Реализация `ExecutionAdapter` для Jenkins.
XML-генератор pipeline job.
API: build trigger, status, logs.
Приёмка: `test_execution_jenkins.py` → 6+ тестов.

### COS-L9 — CapabilityBroker для scanner (1h)
Файл: `orchestrator/adapters/capability_scanner.py`
`start_scanner_demon(run_id)` → scannerSession.
Прокси: настроить MITM на host.docker.innternal:port.
Teardown: остановить, очистить контексты.
Приёмка: `test_capability_scanner.py` → 5+ тестов.

### COS-L10 — CapabilityBroker для Fuzzer (1h)
Файл: `orchestrator/adapters/capability_fuzzer.py`
`start_fuzzer(run_id, dictionaries)` → FuzzerSession.
Словари: SQLi, XSS, CMDi, path traversal.
Приёмка: `test_capability_fuzzer.py` → 5+ тестов.

---

## Блок 4: COSMO-EVIDENCE — Evidence Chain

### COS-L11 — EvidenceChain реализация (1.5h)
Файл: `orchestrator/evidence/evidence_chain.py`
`EvidenceLedger`: иммутабельный лог.
`add_entry(type, content, provenance)` → EvidenceEntry.
`hash_entry(entry)` → SHA-256.
`verify_chain()` → проверка целостности.
Приёмка: `test_evidence_chain.py` → 8+ тестов.

### COS-L12 — Evidence Artifact Store (1h)
Файл: `orchestrator/evidence/artifact_store.py`
Сохранение: скриншоты, RAW request/response, логи.
Структура: `{run_id}/{batch_id}/{job_id}/{step_id}/{type}_{timestamp}.{ext}`.
API: `store(content, provenance)`, `retrieve(ref)`.
Приёмка: `test_artifact_store.py` → 5+ тестов.

---

## Блок 5: COSMO-REPORT — Генератор ГОСТ-Акта

### COS-L13 — ГОСТ-Акт data model (1h)
Файл: `orchestrator/reports/gost_act_model.py`
`GOSTAct`: `{header, object, methodology, norms, findings_table, conclusion, signatures}`.
`GOSTFinding`: `{severity, title, description, cwe, recommendation, evidence_refs}`.
`GOSTSignature`: `{role, name, date, status}`.
Приёмка: `test_gost_model.py` → 5+ тестов.

### COS-L14 — ГОСТ-Акт renderer (1.5h)
Файл: `orchestrator/reports/gost_act_renderer.py`
Jinja2-шаблон HTML.
Подстановка: все поля из `GOSTAct`.
Логотип ЦБ из `cbr-specific/` (локально).
Стилизация под ГОСТ (шрифт, отступы, таблицы).
Приёмка: `test_gost_renderer.py` → рендер из тестовых данных, проверка ключевых полей. 5+ тестов.

### COS-L15 — SARIF Findings Exporter (1h)
Файл: `orchestrator/reports/sarif_exporter.py`
SARIF 2.1.0 JSON.
Маппинг: PrettyK finding → normalized findings формат.
CWE mapping: SQLi → CWE-89, XSS → CWE-79.
Приёмка: `test_sarif_exporter.py` → 5+ тестов.

---

## Блок 6: COSMO-TESTS — Интеграционные тесты

### COS-L16 — Domain CRUD integration tests (1.5h)
Файл: `orchestrator/tests/test_domain_crud.py`
Создание Domain, Application, Group через API.
Проверка валидации (пустой label, невалидный level).
Проверка связей (FK constraints).
Приёмка: 10+ тестов.

### COS-L17 — Pipeline Compiler integration tests (2h)
Файл: `orchestrator/tests/test_pipeline_compiler.py`
Сценарии: один app с default bricks, группа с override, cycle detection, empty bricks.
Проверка DAG: зависимости, порядок Batches.
Проверка compiled_hash: одинаковые inputs → одинаковый hash.
Приёмка: 12+ тестов.

### COS-L18 — Run state machine tests (1.5h)
Файл: `orchestrator/tests/test_run_state_machine.py`
Переходы: pending→running→passed, pending→running→failed, running→blocked.
Недопустимые переходы: passed→running, blocked→passed без override.
Проверка durable storage: после перехода статус в БД.
Приёмка: 10+ тестов.

### COS-L19 — RBAC integration tests (1h)
Файл: `orchestrator/tests/test_rbac.py`
5 ролей: admin_sec, admin_abnormal, admin_service, sec_expert, user.
Domain scope: admin_sec domain A ≠ admin_sec domain B.
Team scope внутри Domain.
Приёмка: 8+ тестов.

### COS-L20 — End-to-end: Domain → Run → Evidence → ГОСТ-Акт (2h)
Файл: `orchestrator/tests/test_e2e_cosmo.py`
Сценарий: создать Domain → создать App → скомпилировать Plan → запустить Run → пройти Gates → собрать Evidence → сгенерировать Акт.
Мок: ForgeAdapter, ExecutionAdapter, scanner, Playwright.
Приёмка: сценарий проходит без ошибок. 5+ тестов.

---

## Блок 7: DOCS — Документация

### COS-L21 — Domain Model документация (1h)
Файл: `docs/cosmo/domain-model.md`
Описание всех сущностей с примерами.
ER-диаграмма (текстовая).
Связи с кодом: модель → файл → строка.

### COS-L22 — API Reference (1h)
Файл: `docs/cosmo/api-reference.md`
Все endpoints с параметрами и примерами ответов.
Аутентификация: OAuth2 + LDAP.
Форматы: JSON, SARIF.

### COS-L23 — Brick Catalog Reference (0.5h)
Файл: `docs/cosmo/brick-catalog.md`
Все стандартные Bricks из коробки.
Примеры переопределения для cosmo-custom.

---

## Итого Luna

| Блок | Задач | Часы |
|---|---|---|
| PK-DSL тесты | L1–L4 | 5h |
| COSMO-MODELS | L1–L5 | 6h |
| COSMO-ADAPTERS | L6–L10 | 7.5h |
| COSMO-EVIDENCE | L11–L12 | 2.5h |
| COSMO-REPORT | L13–L15 | 3.5h |
| COSMO-TESTS | L16–L20 | 8h |
| DOCS | L21–L23 | 2.5h |
| **ИТОГО** | **23 задаачи** | **35h** |

Приоритет: DSL-L1 → DSL-L2 → COS-L1 → COS-L2 → COS-L3 → COS-L4 → COS-L5 → COS-L6 → COS-L11 → COS-L12 → COS-L13 → COS-L14 → COS-L7 → COS-L8 → COS-L9 → COS-L10 → COS-L15 → COS-L16 → COS-L17 → COS-L18 → COS-L19 → COS-L20 → COS-L21 → COS-L22 → COS-L23.