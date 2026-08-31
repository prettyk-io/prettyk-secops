# Boss — MEGA-нарезка: PK-DSL + PK-COSMO + PW-AIRGAP (Heavy Execution)

> **Контекст:** все концепты вчерашнего дня утверждены. Делаем полный заход.
> **Спецификации:**
>   - Browser Contract: `docs/research/2026-08-27-pretty-browser-contract-methodid-gates.md`
>   - Domain Model: `docs/research/2026-08-27-cosmoport-domain-model.md`
>   - IB PoC: `docs/research/2026-08-27-cosmoport-ib-poc.md`
>   - Airgap: `docs/research/2026-08-27-browser-runtime-airgap.md`
> **Правила:** тесты точечные. Коммиты/пуши — только по приказу. Не трогать чужой WIP.

---

## Блок 1: PK-DSL — Browser Runtime Contract (высший приоритет)

### DSL-B1 — P0 Engine Parity (4h)
Файл: `orchestrator/adapters/playwright_adapter.py`
25 методов с полным паритетом сигнатур `WebDriverAdapter`:
- Навигация: `open`, `open_by_url`, `refresh`, `back`
- Действия: `click`, `send_keys`, `append_text`, `clear`, `hover`
- Чтение: `get_text`, `get_value`, `get_attribute`
- Ожидания: `wait_for_element`, `wait_for_element_not`, `wait_for_text`, `wait_for_url`, `wait_for_title`, `wait_for_page_load`, `wait_for_network_idle`
- Assertions: `assert_title`, `assert_url`, `assert_element_present/visible/not_visible`, `assert_text_present`, `assert_equals`, `assert_contains`
- Формы: `select_by_text`, `select_by_value`, `take_screenshot`
- Сессия: `clear_cookies`, `set_cookie`, `get_cookie`
Приёмка: `py -3 -m pytest orchestrator/tests/test_pw_airgap_phase2.py -v` → 40+ зелёных.

### DSL-B2 — Smart Locator Engine (3h)
Файл: `orchestrator/adapters/playwright_adapter.py`
Метод `_locator(strategy, value)` с 11 стратегиями:
`css | xpath | id | name | class | text | exact | label | placeholder | test_id/qa | role`
Каскадный auto-detect: `//`→xpath, `#`→id, `.`→css, `[attr=`→css, иначе `role→label→test_id→name→placeholder→text`.
Приёмка: `test_playwright_smart_locator.py` → 15+ тестов.

### DSL-B3 — Sugar Parser (2h)
Файлы: `orchestrator/core/method_id.py`, `orchestrator/core/language_parse.py`
Короткие алиасы: `Клик→Нажать`, `Вставить→ВставитьЗначение`, `Ждать→ЖдатьЭлемент`, `Скрин→Скриншот`, `Текст→ПолучитьТекст`, `Значение→ПолучитьЗначение`, `Атрибут→ПолучитьАтрибут`, `Дописать→ДописатьТекст`, `Очистить→ОчиститьЗначение`, `Выбрать→ВыбратьПоТексту`.
Pipe `-> $var`: маркер `>save|varname` в wire.
Failsafe `>?`: маркер `>failsafe` в wire.
Приёмка: `test_method_id_sugar.py` → 12+ тестов.

### DSL-B4 — Allowlist Registry (2h)
Файлы: новый `orchestrator/core/pretty_method_spec.py`, `wired_validate.py`, `action_factory.py`.
Класс `PrettyMethodSpec(method_id, component, action, gate, tier, runtime_support, aliases, params)`.
P0_ALLOWLIST из 25 spec-объектов.
`build_dry_action_factory()` → по allowlist, не `dir()`.
Приёмка: `test_allowlist_registry.py` → 8+ тестов.

### DSL-B5 — Parity Integration Suite (2h)
Файл: `orchestrator/tests/test_browser_runtime_parity.py`
Один wired → `PK_BROWSER_RUNTIME=playwright` vs `selenium`.
Сравнение: статусы, скриншоты, аттачи, scanner-прокси.
Приёмка: 5 parity-тестов зелёных.

### DSL-B6 — CDP Cleanup (1h)
Файл: `orchestrator/adapters/browser_adapter.py`
Удалить 20+ `cdp_*` методов с Playwright-native эквивалентом.
Оставить `cdp_command` как escape hatch.
Цель: ≤200 строк (сейчас 750).
Приёмка: `test_cdp_cleanup.py` → старые wired не падают.

---

## Блок 2: PK-COSMO-DOMAIN — Domain Model & DB Schema

### COS-B1 — PostgreSQL schema for Domain, App Graph, Level 0–3 (3h)
Новые модели в `orchestrator/models/`:
- `Domain (id, label, forge_binding, rbac_config, quota)` — Level −1
- `Application (id, domain_id, level, group_id, repo_binding, pipeline_plan_id)`
- `Group (id, domain_id, parent_group_id, level)` — Level 2–3
- `RepositoryBinding (id, forge_id, repo_path, default_branch, webhook_id)`
- `PipelineBrick (id, name, type, source, definition_json, depends_on[])`
- `PipelinePlan (id, application_id, level, scope_id, bricks[], batches[], compiled_hash)`
- `Batch (id, plan_id, type, status, bricks[], artifacts[], evidence[])`
- `SecurityGate (id, plan_id, position, policy_json, decision, decided_by, signature)`
- `Run (id, plan_id, trigger, initiator, domain_id, status, batches[], gates[], findings[])`
- `EvidenceLedger (run_id, entries[])`
Миграции Alembic. Схема в `orchestrator/db/`.

### COS-B2 — Pydantic models + validators для всех сущностей (2h)
`orchestrator/models/domain_model.py` — Pydantic v2 модели.
Валидация: `DomainRBAC`, `BrickOverride`, `GatePolicy`.
Проверка консистентности графа (нет циклов в Level-иерархии).

### COS-B3 — Domain CRUD API (2h)
Контроллеры:
- `POST /api/domains` — создать КИТС
- `GET /api/domains/{id}/graph` — отдать App Graph
- `POST /api/applications` — создать приложение Level 1
- `POST /api/groups` — создать группу Level 2
- `PUT /api/applications/{id}/repo-binding` — привязать Git-репо

### COS-B4 — RBAC engine: 5 ролей × Domain scope (2h)
5 канонических ролей: `admin_sec`, `admin_abnormal`, `admin_service`, `sec_expert`, `user`.
Scope: роль + teams[] внутри Domain.
Pundit-like policy engine: `DomainPolicy.can?(user, action, resource)`.

### COS-B5 — CosmoLadder API: app → build → deploy → URL (1h)
Endpoint: `GET /api/cosmo/ladder?project_id=X`.
Возвращает: `{app, builds[], deploys[], urls[]}`.
Стык с заглушкой (mock → live API портала потом).

---

## Блок 3: PK-COSMO-PIPELINE — Pipeline Compiler & Bricks

### COS-B6 — PipelineBrick catalog engine (2h)
Загрузка каталога из YAML/JSON: `prettyk-pure/bricks/` + `cosmo-custom/bricks/{domain}/`.
Разрешение: domain-override → core.
Валидация: `depends_on` не цикличен, `executor` в CapabilityBroker.

### COS-B7 — Plan Compiler: Application → PipelinePlan (3h)
Алгоритм:
1. Собрать Bricks из политик (domain → group → app).
2. Разрешить depends_on → DAG.
3. Сгруппировать в Batches по типу: build → static_scan → deploy → dynamic_test.
4. Вставить SecurityGates между Batches.
5. Вычислить `compiled_hash`.
Приёмка: `test_plan_compiler.py` → 10+ тестов (один app, группа, группа-групп, override, cycle-detection).

### COS-B8 — ForgeAdapter interface + Gitea implementation (3h)
Интерфейс: `ForgeAdapter(ABC)` — `register_domain`, `on_push`, `on_pr`, `set_commit_status`, `get_repo_info`, `list_repos`, `resolve_user`.
Gitea implementation: REST API calls, webhook registration, commit status via API.
Multi-instance: один ForgeAdapter на Domain.

### COS-B9 — ExecutionAdapter interface + Woodpecker implementation (3h)
Интерфейс: `ExecutionAdapter(ABC)` — `sublmit_job`, `get_job_stattus`, `stream_logs`, `cancel_job`, `list_cappabilities`.
Woodpecker implementation: `.woodpecker.yml` генератор, API trigger, webhook callback.
Capability mapping: Brick.executtor → Woodpecker labels.

### COS-B10 — SecurityCapabilityBroker (2h)
Рантайм для scanner/Playwright/Fuzzer: `start_scanner_demon`, `start_playwright_cdpp`, `start_fuzzer`, `isolate`, `teardown`.
Привязка к `run_id`, изоляция (сетевая/файловая), гарантированный teardown.

---

## Блок 4: PK-COSMO-RUN — Run Control Plane

### COS-B11 — Run state machine (2h)
Статусы: `pending → running → passed | failed | blocked`.
Переходы: `pending→running` (старт), `running→passed` (все батчи зелёные), `running→failed` (батч упал), `running→blocked` (Gate блокирнул).
Durable storage: пишем в БД каждый переход.

### COS-B12 — Batch DAG executor (3h)
Запуск Batches по DAG: Build → Gate → Static Scan → Gate → Deploy → Gate → Dynamic Test → Gate → Admission.
Параллельные Batches одного уровня — одновременно.
Gate ждёт ВСЕ upstream Batches.
Идемпотентность: `compiled_hash` → можно переиспользовать артефакты.

### COS-B13 — Evidence Chain ledger (2h)
Иммутабельный лог: `EvidenceEntry(timestamp, type, content_ref, hash, provenance)`.
Типы: screenshot, raw_request, raw_response, log, alert, finding, decision.
Provenance: run_id → batch_id → job_id → step_id → capability.
Хеш SHA-256 связывает evidence с inputs.

### COS-B14 — Admission Gate engine (2h)
Gate policy: `rules[]` — `{finding_type, action: block|warn|pass, max_count?}`.
Automatic: политика решает.
Manual: человек принимает решение.
Decision → durable storage + signature.
Приёмка: `test_admission_gate.py` → critical blocks, high warns, manual overrides.

---

## Блок 5: PK-COSMO-REPORT — ГОСТ-Акт & SARIF Export

### COS-B15 — ГОСТ-Акт генератор (2h)
Шаблон HTML с подстановкой: объект проверки, методика, нормативная база, таблица находок, заключение, подписи.
Данные из Run → findings → evidence.
Бланки из `cbr-specific/` (локально, не в git).

### COS-B16 — SARIF findings exporter (1h)
Формат: `{run_id, project_id, findings[{severity, title, description, cwe, evidence_refs}]}`.
SARIF 2.1.0-совместимый вывод.

### COS-B17 — DeployStore: результаты с привязкой к деплою (1h)
`POST /api/deploys/{id}/findings` — сохранить.
`GET /api/deploys/{id}/findings` — получить.
Admission-статус деплоя: `passed | failed | pending`.

---

## Блок 6: PW-AIRGAP — завершение airgap

### PW-B1 — Execution parity: Playwright full wired run через scanner proxy (2h)
Реальный прогон с `PK_BROWSER_RUNTIME=playwright`.
scanner-прокси: `host.docker.innternal:8099`.
Проверка: трафик в scanner site tree.

### PW-B2 — Playwright video recording + ffmpeg → MP4 (1h)
`record_viddeo_dir` + `run_id` нейминг.
ffmpeg: webm → MP4 для Monitor.
Приёмка: видео играет в Monitor `?run_id=`.

### PW-B3 — CDP surface cleanup в BrowserAdapter (уже в DSL-B6, пропускаем)

### PW-B4 — Airgap Docker image: один образ с chromium+firefox+ffmpeg (2h)
Dockerfile: `playwright install --with-deps chromium firefox`.
`docker save` → airgap-артефакт.
Проверка: `docker load` на чистом хосте, `playwright install` НЕ вызывается.

---

## Итого

| Блок | Задач | Часы |
|---|---|---|
| PK-DSL | B1–B6 | 14h |
| PK-COSMO-DOMAIN | COS-B1–B5 | 10h |
| PK-COSMO-PIPELINE | COS-B6–B10 | 13h |
| PK-COSMO-RUN | COS-B11–B14 | 9h |
| PK-COSMO-REPORT | COS-B15–B17 | 4h |
| PW-AIRGAP | PW-B1–B4 | 5h |
| **ИТОГО** | **30 задач** | **55h** |

Приоритет: DSL-B1 → DSL-B2 → DSL-B3 → COS-B1 → COS-B6 → COS-B7 → COS-B11 → COS-B12 → COS-B8 → COS-B9 → COS-B10 → COS-B14 → COS-B4 → COS-B13 → COS-B15 → COS-B16 → COS-B17 → PW-B1 → PW-B2 → PW-B4 → COS-B2 → COS-B3 → COS-B5 → DSL-B4 → DSL-B5 → DSL-B6.