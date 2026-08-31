# 🔵 Задание для Cosmo: SONAR-POOL — SonarQube Community Worker Pool + Scale-Hardened Ingest

> **Эпик:** `SONAR-POOL` — Горизонтально масштабируемый пул эфемерных CE-воркеров + Standalone буферизация  
> **Источник:** Боевой опыт Cosmoport 1.0 (50 параллельных run — воркеры отработали, захлебнулся центральный сервер)  
> **Роль:** Cosmo (Gemini 3.7 Flash) — Discovery, архитектура, нарезка PoC  
> **Куда:** положить в `sanctuary/cosmoport2/backlog.md` как новую фазу или расширение Фазы 2  
> **Вложения:** 3 боевых файла Cosmoport 1.0 приложены ниже — изучай, но НЕ копируй слепо.

---

## 📎 Вложение 1: `D:\pipeline.yml` — GitLab CI пайплайн Cosmoport 1.0

```yaml
# Исходный файл: D:\pipeline.yml
# Статус: БОЕВОЙ, работает на 50 потоков, но с оговорками (см. ниже)
REPORT_FILE: "${CI_PROJECT_NAME}_${CI_COMMIT_REF_NAME}_sonarqube-report.json"
stages:
  - sonar_qube

      sonar-scan:
        stage: sonar_qube
        image: 
          name: update.dev.spaceport.cbr.ru/cosmo-registry-trusted/sonarqube/cosmo-conar-custom:v1.7.3
          entrypoint: [""]
        script:
          - source vault.env
          - mkdir -p reports_sonar
          - test -n "$SONAR_SSH_KEY_FILE"
          - chmod 600 "$SONAR_SSH_KEY_FILE"
          - cd /opt/app && python main.py
              --sonar-host "$SONAR_HOST"
              --sonar-user "$SONAR_USER"
              --sonar-key "$SONAR_SSH_KEY_FILE"
              --gitlab-url "$GITLAB_URL"
              --gitlab-token "$GIT_TOKEN"
              --project-id "$CI_PROJECT_ID"
              --sonar-cli-image "update.dev.spaceport.cbr.ru/cosmo-registry-trusted/sonarqube/sonar-scanner-cli:12.0"
              --sonar-image "update.dev.spaceport.cbr.ru/cosmo-registry-trusted/sonarqube/sonarqube:lts-community"
              --git-ssl-no-verify
          - cp /opt/app/*.json "$CI_PROJECT_DIR/reports_sonar/" || true
          - cp /opt/app/*.sarif "$CI_PROJECT_DIR/reports_sonar/" || true
          - mv "$CI_PROJECT_DIR"/reports_sonar/*.json "$CI_PROJECT_DIR/reports_sonar/appsec_report_sonar.json" || true
          - mv "$CI_PROJECT_DIR"/reports_sonar/*.sarif "$CI_PROJECT_DIR/reports_sonar/report_sonar.sarif"
        allow_failure: $ALLOW_FAIL_SONAR_QUBE
        rules:
          - when: $WHEN_SONAR_QUBE
        artifacts:
          paths:
            - reports_sonar/
          expire_in: 1 hour

      import_to_sonarqube:
        stage: sonar_qube
        image: update.dev.spaceport.cbr.ru/cosmo-registry-trusted/sonarqube/sonar-scanner-cli:12.0
        needs:
          - job: sonar-scan
            artifacts: true
          - job: load_vault_env
            artifacts: true
        script:
          - source vault.env
          - |
            set -eu
            test -f "$CI_PROJECT_DIR/reports_sonar/report_sonar.sarif" || {
              echo "SARIF report not found: ..."
              exit 1
            }
            openssl s_client -connect sonar.dev.spaceport.cbr.ru:443 ... | openssl x509 > "$CI_PROJECT_DIR/sonar.crt"
            keytool -importcert -noprompt -alias sonar-dev-spaceport -file "$CI_PROJECT_DIR/sonar.crt" -keystore "$CI_PROJECT_DIR/truststore.p12" -storetype PKCS12 -storepass changeit
            sonar-scanner \
              -Dsonar.host.url="${SONAR_HOST_URL}" \
              -Dsonar.token="${SONAR_TOKEN}" \
              -Dsonar.projectKey="${CI_PROJECT_PATH_SLUG}" \
              -Dsonar.sarifReportPaths="$CI_PROJECT_DIR/reports_sonar/report_sonar.sarif" \
              -Dsonar.qualitygate.wait=false
        allow_failure: $ALLOW_FAIL_SONAR_QUBE
        rules:
          - when: $WHEN_SONAR_QUBE
```

### Что здесь ценного для Cosmoport 2.0

| Элемент | Статус | Что делать |
|---|---|---|
| **Ephemeral CE worker pattern** | ✅ Брать как архитектурный фундамент | Один run = один изолированный `sonarqube:lts-community` |
| **SARIF export** | ✅ Брать 1:1 | `main.py` генерит normalized findings JSON + SARIF 2.1.0 |
| **Два job (scan + import)** | ⚠️ Брать с доработкой | Разделение compute и publish — правильно, но косвенный импорт через артефакты GitLab CI не нужен |
| **`allow_failure: true`** | ❌ НЕ брать | Маскирует реальные сбои. Заменить на `INFRA_FAILED` / `SCAN_FAILED` / `GATE_REJECTED` |
| **`sonar.qualitygate.wait=false`** | ⚠️ Допустимо только если проверка гейта вынесена в наш orchestrator |
| **`expire_in: 1 hour`** | ❌ Слишком мало | Evidence должен храниться постоянно в MinIO/PostgreSQL |
| **50 параллельных job → один Standalone** | 🔴 ГЛАВНАЯ ПРОБЛЕМА | 50 одновременных `sonar-scanner` импортов убивают CE очередь и PostgreSQL Standalone |

---

## 📎 Вложение 2: `D:\vault.env` — переменные окружения

```bash
# Исходный файл: D:\vault.env
# Статус: ТЕСТОВЫЙ ЭНВ (все credentials — небоевые, использовать только для понимания контракта)
export 'SONAR_HOST'='10.1.89.38'
export 'SONAR_HOST_URL'='http://sonar.dev.spaceport.cbr.ru/'
export 'SONAR_PROJECT_KEY'='cosmo-demo-scan-portal'
export 'SONAR_PROJECT_KEY2'='cosmo-demo-scan-portal'
export 'SONAR_TOKEN'='sqa_c08a77d76fcb11b9769e2784ec2a50154e56a5du'
export 'SONAR_USER'='svcspaceportadm'
export 'SONAR_USER_HOME'='/tmp/.sonar'
```

### Что здесь ценного

- Контракт переменных: `SONAR_HOST`, `SONAR_HOST_URL`, `SONAR_TOKEN`, `SONAR_USER` — минимальный набор для подключения к SonarQube.
- Никаких секретов в открытом виде в Cosmoport 2.0. Всё через OpenBao/Better Auth secrets.

---

## 📎 Вложение 3: `D:\main.py` — оркестратор SonarQube (3504 строки)

Файл слишком велик для вставки. Лежит в `D:\main.py`. Ключевая структура:

| Класс / Функция | Строки | Что делает | Ценность для Cosmo 2.0 |
|---|---|---|---|
| `BaseArgs` | ~100–200 | CLI-аргументы, YAML policy, severity limits | Средняя — контракт параметров |
| `SSHClientWrapper` | ~200–400 | SSH + SFTP + port forwarding tunnel | ❌ Не брать. Cosmo 2.0 использует Docker напрямую через `docker-py` |
| `SonarQubeManager` | ~400–2800 | **ЯДРО**: запуск CE, создание проекта, токен, ожидание статуса, сбор issues/hotspots/rules, нормализация severity, статусов, CWE, SARIF, normalized findings JSON | ✅ **Брать с адаптацией.** Особенно ценны: |
| `_fetch_project_issues()` | ~700 | Постраничная выгрузка issues с метаданными правил | ✅ Прямой reuse |
| `_fetch_security_hotspots()` | ~800 | Выгрузка hotspots с деталями | ✅ Прямой reuse |
| `_normalize_issue()` | ~950 | SARIF-подобная нормализация issue | ✅ Алгоритм, но нужен Pydantic |
| `_normalize_hotspot()` | ~1050 | Нормализация hotspot с review-данными | ✅ Алгоритм |
| `_build_findings_report()` | ~1900+ | Сборка normalized findings JSON | ✅ Схема и нормализация |
| `_build_sarif_like_report()` | ~2400+ | Сборка SARIF 2.1.0 | ✅ Прямой reuse |
| `_severity_to_finding()` | ~1708 | Маппинг BLOCKER→Critical etc | ✅ Утилитарный |
| `_extract_cwe_from_values()` | ~1783 | Извлечение CWE из текста и тегов | ✅ Утилитарный |
| `check_analysis_status()` | ~1200 | Опрос `/api/ce/component` | ❌ **Заменить.** Опрашивать `/api/ce/task?id=<ceTaskId>` |
| `get_available_random_port()` | ~600 | `random.randint` + `ss -tuln` | ❌ **Заменить.** Гонка данных. Нужен `PortLeaseTracker` в PostgreSQL |
| `cleanup_remote()` | ~3100 | Удаление по вычисляемым именам | ❌ **Заменить.** Удаление по Docker labels `prettyk.run_id` |
| `GitManager` | ~2900+ | GitLab API, клонирование, sonar-scanner | Средняя. ForgeAdapter Cosmo 2.0 заменяет GitLab-специфику |
| `main()` | ~3300+ | Точка входа, CLI парсинг, основной flow | Архитектурный reference, не код |

---

## 🎯 Нарезка в бэклог Cosmoport 2.0

Ниже — готовые карточки. Положи их в `sanctuary/cosmoport2/backlog.md` как новую фазу или расширение Фазы 2.

### COS-020: SonarQube Community Worker Lease & Lifecycle

**Est:** 6–8h · **Тип:** Capability / Worker Pool · **Кому:** Luna

#### Контекст
Каждый SonarQube Community Edition — эфемерный изолированный воркер. Жизненный цикл:
```text
requested → provisioning → ready → running → collecting → publishing → teardown → released
```
Ошибочные переходы → `failed` с причиной + идемпотентный teardown.

Минимальная модель worker в PostgreSQL:
```text
worker_id, run_id, provider=docker, host_id, container_id, scanner_container_id,
sonar_project_key, sonar_task_id, allocated_port, resource_labels, lease_expires_at, state
```

Имена ресурсов детерминированы от `run_id`:
```text
pk-sonar-{run_id}-server
pk-sonar-{run_id}-scanner
pk-sonar-{run_id}-data
pk-sonar-{run_id}-extensions
pk-sonar-{run_id}-network
```

#### Ключевые требования (из боевого опыта)
- Port allocation через `PortLeaseTracker` в PostgreSQL, не `random.randint` + `ss -tuln`
- Статус CE опрашивать строго по `ceTaskId` из `report-task.txt`, не по `/api/ce/component`
- Удаление worker по Docker labels `prettyk.run_id=<uuid>`, не по вычисляемым именам
- Resource limits CPU/RAM на каждый worker
- Timeout и cancellation с явным `TIMED_OUT`
- Idempotent teardown: worker должен выдерживать повторный вызов cleanup

#### DoD
- [ ] Pydantic-модель `WorkerLease` в `orchestrator/cosmo/domain/`
- [ ] SQLAlchemy модель + Alembic миграция
- [ ] State machine: все разрешённые и запрещённые переходы
- [ ] Lease recovery: при перезапуске orchestrator находит orphan workers по Docker labels
- [ ] Интеграционный тест: 3 параллельных worker, один падает — два завершаются
- [ ] Teardown: 0 оставшихся containers/volumes/networks в `docker ps -a`
- [ ] Не использовать `allow_failure`, различать `INFRA_FAILED`, `SCAN_FAILED`, `GATE_REJECTED`

---

### COS-021: SARIF Normalizer — порт из Cosmoport 1.0

**Est:** 4–6h · **Тип:** Capability / Report Normalizer · **Кому:** Boss

#### Контекст
Перенести логику нормализации из `main.py` (SonarQubeManager) в Python-модуль `orchestrator/cosmo/adapters/sonar_normalizer.py`. Источник: `D:\main.py`.

Что переносим из Cosmoport 1.0:
- `_fetch_project_issues()` — постраничная выгрузка issues
- `_fetch_security_hotspots()` — выгрузка hotspots с деталями
- `_normalize_issue()` — нормализация severity/status/location/CWE
- `_normalize_hotspot()` — нормализация с review-данными
- `_build_sarif_like_report()` — сборка SARIF 2.1.0
- `_build_findings_report()` — сборка normalized findings JSON

Что НЕ переносим (заменяем на Cosmo 2.0 решения):
- SSH/SFTP транспорт → Docker SDK / direct container API
- Формирование имён контейнеров → детерминировано от `run_id`
- GitLab-specific клонирование → ForgeAdapter
- `cleanup_remote` по вычисляемым именам → Docker labels
- `random.randint` выбор порта → PortLeaseTracker

#### DoD
- [ ] Модуль `orchestrator/cosmo/adapters/sonar_normalizer.py`
- [ ] `normalize_issues(sonar_api_response) → list[Finding]`
- [ ] `normalize_hotspots(sonar_api_response) → list[Finding]`
- [ ] `build_sarif(findings, rules, metrics) → dict` (валидный SARIF 2.1.0)
- [ ] `build_findings_report(findings, rules, project_meta) → dict`
- [ ] CWE extraction, severity mapping, status mapping — все утилиты
- [ ] Юнит-тесты: severity mapping, SARIF validation, findings roundtrip
- [ ] Исходный `main.py` НЕ редактируется (боевой reference)

---

### COS-022: MinIO Buffer Layer — Zero-Pressure Ingestion Sink

**Est:** 4–5h · **Тип:** Infra / Buffer · **Кому:** Boss

#### Контекст
50 воркеров НЕ импортируют SARIF напрямую в Standalone. Вместо этого — PUT в MinIO S3:
```text
s3://cosmo-evidence/runs/<run_id>/report.sarif
s3://cosmo-evidence/runs/<run_id>/sonar_raw.json
```
Событие в Valkey Stream: `event: report_uploaded {run_id, s3_uri, sha256}`.

Затем Ingest Controller читает очередь и управляемо скармливает Standalone.

#### DoD
- [ ] MinIO bucket `cosmo-evidence` с retention policy
- [ ] PUT endpoint или прямая запись из worker в S3
- [ ] Valkey Stream `sonar.ingest` — продюсер (worker) + консьюмер (controller)
- [ ] SHA-256 хэш артефакта при загрузке
- [ ] Интеграционный тест: 50 SARIF в MinIO, запись в Valkey без потерь

---

### COS-023: Ingest Token Bucket — Rate-Limited Standalone Feed

**Est:** 4–6h · **Тип:** Infra / Rate Limiter · **Кому:** Luna

#### Контекст
Standalone SonarQube Community имеет `sonar.ce.workerCount=1`. 50 одновременных импортов создают затор на 25–35 минут и DB lock contention.

Ingest Controller должен:
- Читать Valkey Stream `sonar.ingest`
- Подавать в Standalone строго N=1..2 проекта одновременно
- Мониторить очередь CE: `/api/ce/activity?status=PENDING,IN_PROGRESS` → если > 3 — пауза
- При 504/DB deadlock — retry с exponential backoff
- Не блокировать pipeline: вердикт уже в `cosmo_findings` (COS-024)

#### DoD
- [ ] Token Bucket: configurable `max_concurrency`, `tokens_per_second`
- [ ] Health gate: мониторинг CE очереди Standalone
- [ ] Retry с backoff при 504/DB ошибках
- [ ] Интеграционный тест: 50 SARIF → подача по 2 → Standalone обрабатывает без deadlock
- [ ] Тест: Standalone недоступен → артефакты сохраняются, статус публикации → `QUEUED_FOR_INGEST`
- [ ] При восстановлении Standalone очередь плавно разбирается

---

### COS-024: Fast Evidence Path — Sub-second Findings в PostgreSQL

**Est:** 3–4h · **Тип:** Core / Evidence · **Кому:** Flash

#### Контекст
Cosmoport UI и Security Gate НЕ ждут, пока Standalone пережуёт SARIF. Findings загружаются в `cosmo_findings` напрямую из MinIO batch-parser.

Конвейер:
```text
SARIF в MinIO → Valkey event → Batch Parser → PostgreSQL `cosmo_findings` → UI
```
Целевое время: < 5 секунд для 50 отчётов.

#### DoD
- [ ] Batch SARIF parser: читает `results[]`, раскладывает в `cosmo_findings`
- [ ] Дедупликация по `(run_id, source_tool, report_sha256)`
- [ ] Batch COPY в PostgreSQL (не построчный INSERT)
- [ ] Интеграционный тест: 50 SARIF → < 5 сек до появления в `cosmo_findings`
- [ ] Security Gate срабатывает БЕЗ ожидания Standalone

---

### COS-025: Streaming SARIF Merger — для шардированных монорепозиториев

**Est:** 3–5h · **Тип:** Capability / Merger · **Кому:** Luna

#### Контекст
Если 50 воркеров — шарды одного монорепозитория, нельзя импортировать их как 50 разных проектов. Нужен Streaming SARIF Merger, который:
- Схлопывает дубликаты `driver.rules[]` (сохраняет высший severity)
- Конкатенирует `results[]` с сохранением относительных путей
- Суммирует метрики (`invocations[]`, `properties`)
- Потоковая обработка (не грузит 50 JSON в память целиком)

Результат: 1 консолидированный SARIF → 1 импорт в Standalone.

#### DoD
- [ ] `StreamingSarifMerger` на Python (ijson / streaming parser)
- [ ] Вход: список `s3://.../shard_N.sarif`, выход: `s3://.../consolidated_master.sarif`
- [ ] Валидация выходного SARIF по схеме OASIS SARIF 2.1.0
- [ ] Дедупликация правил проверена: 50 шардов → уникальный список `rules[]`
- [ ] Результаты не теряются: `total_findings == sum(shard_findings)`
- [ ] Память: не растёт линейно от количества шардов
- [ ] Интеграционный тест: 50 синтетических шардов → 1 валидный мастер-SARIF

---

### COS-026: Scale-Hardened Integration Smoke Test — 50 Workers Burst

**Est:** 5–8h · **Тип:** Тесты / Scale · **Кому:** Luna + Boss

#### Контекст
Один сквозной тест, доказывающий весь конвейер на масштабе 50:

```text
50 synthetic SARIF → MinIO → Valkey Stream → Batch Parser → cosmo_findings
→ Ingest Token Bucket → Standalone SonarQube (rate-limited)
```

#### DoD
- [ ] 50 SARIF одновременно в MinIO → все доставлены без потерь
- [ ] `cosmo_findings` получает данные за < 5 секунд
- [ ] Standalone обрабатывает без deadlock (0 ошибок в логах PostgreSQL)
- [ ] Повторная отправка идемпотентна (дублей findings нет)
- [ ] После теста: `docker ps -a`, `docker volume ls` — 0 worker остатков
- [ ] Тест воспроизводим (детерминирован от seed)

---

### COS-027: Chaos Matrix — 7 негативных сценариев

**Est:** 4–6h · **Тип:** Тесты / Chaos · **Кому:** Luna

#### Контекст
Автоматизированный chaos-раннер, прогоняющий сценарии с инъекцией сбоев:

| # | Сценарий | Инъекция | Ожидаемое поведение |
|---|---|---|---|
| F-01 | Port Conflict | Занять порт до worker | PortLeaseTracker выбирает другой, worker стартует |
| F-02 | Worker OOM/Crash | `docker kill -s 9` | Статус → `FAILED_INFRA`, volumes/networks удалены |
| F-03 | Scanner Error | Битый проект | `SCAN_ERROR`, worker освобождается, stderr в MinIO |
| F-04 | Orchestrator Restart | `kill -9` orchestrator | LeaseReconciler находит orphans по labels, чистит |
| F-05 | Standalone Outage | Выключить Standalone | Raw SARIF сохранён, статус → `QUEUED_FOR_INGEST` |
| F-06 | Idempotent Re-delivery | Повторный SARIF | 200 OK (already_processed), findings не удваиваются |
| F-07 | Timeout | Worker завис на 600s | SIGKILL, run → `TIMED_OUT` |

#### DoD
- [ ] Автоматизированный runner для всех 7 сценариев
- [ ] Каждый сценарий: precondition → injection → assertion → cleanup
- [ ] Для каждого assertion: статус `observed | inferred | not tested`
- [ ] Отчёт: пройдено/провалено, время, логи

---

## ❌ Что НЕ делаем в этом эпике

- ❌ Не покупаем Enterprise-лицензии SonarQube/Solar/PTAI
- ❌ Не патчим внутренности SonarQube CE (Compute Engine parallelism)
- ❌ Не копируем `main.py` как монолит — разбираем на модули по ответственности
- ❌ Не используем SSH/SFTP транспорт (Docker SDK в Cosmo 2.0)
- ❌ Не добавляем RabbitMQ/Kafka/Celery/Kubernetes
- ❌ Не делаем VM-воркеры в этом PoC (отдельный provider позже)
- ❌ Не меняем `sanctuary/pure/`, `AGENTS.md` или чужой WIP
- ❌ Не пишем production-grade код (PoC с observability)

## 📋 Общая DoD эпика SONAR-POOL

- [ ] 3+ воркеров SonarQube CE работают одновременно без взаимных блокировок
- [ ] 50 SARIF пакетов обрабатываются через MinIO buffer без дедлоков
- [ ] Standalone получает данные rate-limited (≤ 2 параллельных импорта)
- [ ] `cosmo_findings` наполняется за < 5 секунд независимо от очереди Sonar
- [ ] 7 chaos-сценариев пройдены с подтверждённым cleanup
- [ ] Карточки COS-020 – COS-027 добавлены в `sanctuary/cosmoport2/backlog.md`
- [ ] Исходные боевые файлы Cosmoport 1.0 сохранены как reference (`D:\pipeline.yml`, `D:\main.py`, `D:\vault.env`)