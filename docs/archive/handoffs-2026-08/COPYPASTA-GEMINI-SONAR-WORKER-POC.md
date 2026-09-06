# ⚡ Gemini Architecture & PoC: SonarQube Community Worker Pool → Standalone Ingest & Scale Buffer

> **Статус:** 🟢 RESEARCH / SCALE-HARDENED SPECIFICATION (Gemini 3.7 Flash Target).  
> **Контекст:** Cosmoport 2.0 Sovereign Run Control Plane · Horizon Capability Broker.  
> **Боевой факт:** Схема с запуском 50 параллельных воркеров доказала жизнеспособность на стороне вычислений, но вскрыла критическое бутылочное горлышко на этапе сбора: центральный Standalone-сервер и его БД захлёбываются (DB lock contention, переполнение очереди CE, падение импорта).  
> **Цель:** Спроектировать и доказать на PoC архитектуру буферизации, дедупликации и управляемого скормления (rate-limited / merged ingest) 50 параллельных SARIF-отчетов в единый Standalone и Evidence Ledger без падения инфраструктуры.

---

## 1. Анатомия проблемы масштабирования (Почему падает Космо-1)

В Cosmoport 1.0 параллелизм воркеров реализовали, но не протестировали на реальной нагрузке. При 50 одновременных прогонах возникают 3 системных сбоя:

```text
               50 параллельных воркеров завершают скан одновременно
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           ▼ (50x POST)               ▼ (50x scanner CLI)        ▼ (50x DB writes)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ БУТЫЛОЧНОЕ ГОРЛЫШКО STANDALONE SONARQUBE (Community Edition)                           │
│                                                                                        │
│ 1. CE Single-Thread Queue:                                                             │
│    В CE worker ровно 1 (`sonar.ce.workerCount=1`). 50 задач встают в очередь.           │
│    Время разбора: 50 * 30с = 25–35 минут глухого затора.                               │
│                                                                                        │
│ 2. PostgreSQL DB Lock Contention:                                                      │
│    50 одновременных `sonar-scanner` бьют в таблицы `projects`, `snapshots`,            │
│    `project_measures`, `ce_activity`. Возникают Deadlocks и Lock Timeouts (504).       │
│                                                                                        │
│ 3. Race Condition & Snapshot Corruption:                                               │
│    Если 50 воркеров сканировали шарды одного монорепозитория под одним projectKey,     │
│    каждый следующий импорт перетирает предыдущий анализ. Итог: в UI виден только 1 из 50│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Архитектура решения Cosmoport 2.0: Трёхуровневая развязка

Мы **никогда не пускаем воркеры напрямую в Standalone SonarQube**. Поток данных разделяется на три изолированных контура:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. COMPUTE LAYER: 50 Ephemeral SonarQube CE Workers                                    │
│    • Каждый воркер изолирован (контейнер, порт, volumes).                              │
│    • Результат: формирует локальный SARIF 2.1.0 + normalized findings JSON.                      │
│    • Завершение: делает PUT в S3 и СРАЗУ уничтожается (освобождает RAM/CPU).           │
└───────────────────────────────────┬────────────────────────────────────────────────────┘
                                    │ (50 параллельных PUT за 200ms)
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. BUFFER & SOT LAYER: MinIO S3 + PostgreSQL 16 (Zero-Pressure Shock Absorber)         │
│                                                                                        │
│    [MinIO S3 Evidence Bucket] ─── (Event Stream) ───> [Valkey Stream: `sonar.ingest`] │
│               │                                                   │                    │
│               ▼                                                   ▼                    │
│    [PostgreSQL 16: `cosmo_findings`]                 [Ingest Orchestration Queue]      │
│    • Batch COPY: 50 отчётов парсятся за 2-3 сек      • Управляет очередью на витрину   │
│    • Cosmoport UI получает вердикт СРАЗУ             • Защищает Standalone от перегруза│
│    • Security Gate срабатывает БЕЗ ожидания Sonar    • Применяет Token/Leaky Bucket    │
└───────────────────────────────────┬────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Controlled Rate-Limited Feed)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. PRESENTATION SINK: Standalone SonarQube (Managed Ingestion)                         │
│                                                                                        │
│    Сценарий А (50 независимых микросервисов):                                          │
│    • Token Bucket Controller скармливает репорты строго по 1-2 штуки параллельно.      │
│    • Нагрузка на CE стабильна (20% CPU), 0 lock contention в базе.                     │
│                                                                                        │
│    Сценарий Б (50 шардов одного монорепозитория / мультимодуля):                       │
│    • Streaming SARIF Merger склеивает 50 SARIF в 1 консолидированный файл.             │
│    • Выполняется ровно ОДИН импорт в Standalone под единым ключом проекта.             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Ключевые компоненты для PoC

### 3.1. Streaming SARIF Merger (для шардированных прогонов)
Компонент, объединяющий N SARIF-отчетов от параллельных воркеров в один валидный SARIF 2.1.0:
- **Дедупликация правил (`driver.rules[]`):** Схлопывает одинаковые правила из разных воркеров, сохраняя высший severity.
- **Мерж находок (`results[]`):** Конкатенирует результаты с сохранением относительных путей файлов (`artifactLocation.uri`).
- **Слияние метрик (`invocations[]`, `properties`):** Суммирует счётчики уязвимостей, bugs, code smells.
- **Потоковая обработка:** Не грузит 50 JSON целиком в память (использует streaming parser / ijson).

### 3.2. Ingest Token Bucket Rate Limiter
Контроллер взаимодействия со Standalone SonarQube:
- **Concurrency Limit:** Максимум `N = 2` одновременных задач `sonar-scanner` на импорт.
- **DB Health Check:** Мониторит лаг очереди CE (`/api/ce/activity?status=PENDING,IN_PROGRESS`). Если в очереди > 3 задач — приостанавливает отправку новых.
- **Non-blocking for Pipeline:** Задержка импорта в Standalone **не блокирует** жизненный цикл релиза, так как вердикт ИБ уже вынесен нашим Evidence Ledger.

---

## 4. Матрица нагрузочного тестирования и Chaos-сценариев (Масштаб 50)

PoC обязан содержать автоматизированный бенчмарк-раннер со следующими проверками:

| # | Тестовый сценарий | Нагрузка / Условия | Ожидаемое поведение системы | Критерий успешности (DoD) |
|---|---|---|---|---|
| **S-01** | **50-Worker Burst Scan** | Одновременный старт 50 воркеров с проектом ~50k строк кода | Все 50 воркеров успешно завершают сканирование, выгружают SARIF в MinIO и делают clean teardown | В MinIO 50 валидных отчётов, 0 зависших Docker контейнеров |
| **S-02** | **DB Lock Contention Resilience** | Имитация одновременного сброса 50 репортов в Standalone | Ingest Token Bucket перехватывает пачку и подаёт по 2 задачи; в PostgreSQL Standalone нет deadlocks | 0 ошибок `504 Gateway Timeout`, 0 `DeadlockDetectedException` в логах SonarQube |
| **S-03** | **SARIF Shard Merger** | 50 шардов одного проекта мерджатся в один мастер-SARIF | Merger формирует единый SARIF 2.1.0, валидирует схему и загружает в 1 проект Standalone | Standalone отображает суммарное дерево файлов и общее количество findings без потерь |
| **S-04** | **Sub-second Evidence Ingest** | Замер времени от окончания 50 сканов до появления данных в `cosmo_findings` | Внутренний парсер PostgreSQL вычитывает MinIO параллельно | Все 50 результатов доступны в нашей БД менее чем за 5 секунд (независимо от очереди Sonar) |
| **S-05** | **Standalone Slow Consumer / Outage** | Искусственное замедление Standalone (rate limit = 0.1 req/s) или выключение | Очередь Valkey накапливает задачи; воркеры не ждут; релизный пайплайн не заблокирован | Статус публикаций → `QUEUED_FOR_INGEST`, при восстановлении витрины очередь плавно разбирается |

---

## 5. Контракт Ingestion Envelope (Pydantic / TypeScript Ready)

```json
{
  "$schema": "https://prettyk.io/schemas/v1/sonar-ingest-batch.json",
  "batch_id": "batch-9b1deb4d-50w",
  "application_id": "cosmo-monorepo-core",
  "project_key": "cosmo-monorepo-core",
  "branch": "master",
  "commit_sha": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "total_shards": 50,
  "completed_shards": 50,
  "shards": [
    {
      "shard_index": 1,
      "worker_id": "sq-worker-shard-01",
      "sarif_uri": "s3://cosmo-evidence/batches/batch-9b1deb4d/shard_01.sarif",
      "sha256": "a1b2...c3d4",
      "findings_count": 14
    }
  ],
  "merged_artifact": {
    "sarif_uri": "s3://cosmo-evidence/batches/batch-9b1deb4d/consolidated_master.sarif",
    "sha256": "f5e4...d3c2",
    "total_unique_findings": 420
  },
  "standalone_ingest_policy": {
    "mode": "consolidated_single_import",
    "rate_limit_concurrency": 2,
    "max_queue_wait_seconds": 1800
  }
}
```

---

## 6. Deliverables для Gemini

При исполнении архитектурного PoC Gemini должна предоставить:

1. **Scale Architecture Blueprint (`blueprint.md`):**
   - Полное описание буферного слоя (MinIO + Valkey Stream).
   - Алгоритм работы Streaming SARIF Merger (дедупликация правил и объединение графа файлов).
   - Модель защиты Standalone БД от блокировок (Token Bucket Controller).
2. **Runnable Scale Harness (`sonar_scale_poc/`):**
   - Скрипт генерации 50 синтетических SARIF-отчётов (имитация 50 воркеров).
   - Реализация `StreamingSarifMerger` на Python (stream parse & merge).
   - Ingestion Controller с настраиваемым concurrency limit и проверкой очередей SonarQube API.
3. **Benchmark & Lock Report (`scale_evidence.md`):**
   - График/лог прогона 50 параллельных отчетов: время буферизации в MinIO vs время импорта в Standalone.
   - Сравнение нагрузки на PostgreSQL Standalone (с буферизацией и без).
   - Подтверждение схемы 0-deadlock и 0-loss.

---

## 7. Definition of Done (Scale Hardened)

- [ ] **50-Stream Proof:** Проверена одновременная обработка 50 SARIF-отчётов без дедлоков и 504 Gateway Timeout.
- [ ] **Zero-Pressure Decoupling:** Окончание работы воркеров не зависит от скорости Standalone SonarQube.
- [ ] **Data Integrity:** Консолидированный SARIF после слияния 50 шардов валиден по схеме OASIS SARIF 2.1.0 и содержит 100% находок без дубликатов правил.
- [ ] **Fast Evidence Path:** Данные в `cosmo_findings` (PostgreSQL) появляются менее чем за 5 секунд для 50 отчётов.
- [ ] **DB Lock Protection:** В Standalone SonarQube подача строго лимитирована (1-2 одновременных импорта), исключены блокировки таблиц `snapshots` и `ce_activity`.
- [ ] **Изоляция:** Решение не нарушает канонов `sanctuary/cosmoport2/` и не требует Enterprise-лицензий.
