# Infra Stack — ядро данных PrettyK

> **CANON** — hub topic. Slice: **24 августа 2026** (PostgreSQL 16 + Valkey 8 зачислены на Алтарь).  
> Реестр: [`INDEX.md`](INDEX.md). Связанные: [`stand-port-meta.md`](stand-port-meta.md) · [`lab-up.md`](lab-up.md) · [`runtime-shell.md`](runtime-shell.md).  
> Алтарь: [`../ALTAR.md`](../ALTAR.md) §11–12.

## 1. Принцип

```text
PostgreSQL — источник истины (Source of Truth). Всё структурное.
Valkey — только кэш, очереди и pub/sub. Никогда не источник истины.
Диск — артефакты прогонов. Большие бинарные данные.
```

**Правило восстановления:** Valkey можно стереть в ноль в любой момент. Всё восстанавливается из PostgreSQL + артефактов. Если для работы нужно состояние в Valkey, которое нельзя восстановить — это баг архитектуры, не Valkey.

## 2. Карта баз

| Компонент | База | Назначение | Режим |
|---|---|---|---|
| **PostgreSQL 16** | `prettyk-db` | users, sessions, profiles, capabilities, api_keys, audit_log, checks, runs, findings, policies, targets | Primary |
| **Valkey 8** | `prettyk-cache` | сессии (Better Auth secondary storage), rate limiting, pub/sub telemetry, job queue | Cache only |
| **Диск / S3** | `reports/` | Allure-результаты, scanner-отчёты, видео, скриншоты, логи | Artifacts |

### Порты (добавить в stand-port-meta при развёртывании)

| Сервис | Порт | Назначение |
|---|---|---|
| PostgreSQL | 5432 | основная база |
| Valkey | 6379 | кэш / pub-sub / очереди |

## 3. Два профиля развёртывания

### Pure Box — один Docker Compose стек

```text
PostgreSQL 16 (Docker Compose)
├─ Все таблицы: users, sessions, profiles, capabilities, runs, findings
├─ Better Auth: PG adapter (Drizzle)
└─ DefectDojo, SonarQube на том же PostgreSQL
```

**Когда:** QA-отдел, airgap. Один compose up — и весь стек жив.  
**Ограничение:** не для многопользовательского enterprise (нужен кластер).

### Enterprise — Docker Compose / Kubernetes

```text
PostgreSQL 16
├─ Основная база
└─ Миграции, foreign keys, транзакции

Valkey 8
├─ Better Auth secondary storage
├─ Rate limiting
├─ Pub/sub telemetry
└─ Job queue
```

**Когда:** ИБ-отдел, ЦБ, enterprise. SSO, аудит, LDAP, многопользовательский режим.

## 4. Почему Valkey, не Redis

| Критерий | Redis 7.4+ | Valkey 8 |
|---|---|---|
| Лицензия | RSALv2 + SSPL (не open-source) | BSD |
| Протокол | RESP | RESP (100% совместим) |
| Клиенты | ioredis, redis-py, go-redis | те же (100% совместимы) |
| SaaS ограничения | Нельзя без лицензии Redis Ltd | Можно всё |
| Контрибьюторы | Redis Ltd | AWS, Google, Oracle, Ericsson, Snap |
| DefectDojo | Мигрировал на Valkey | ✅ в нашем стеке |

**Решение:** Valkey 8. BSD-лицензия. DefectDojo уже там. Better Auth поддерживает оба. Менять код не надо — клиенты те же.

## 5. Почему PostgreSQL, не другие

| База | Вердикт |
|---|---|
| **PostgreSQL 16** | ✅ JSONB для semi-structured (wired DSL). ✅ Бесплатно. ✅ DefectDojo + SonarQube уже на нём. ✅ Better Auth рекомендует. ✅ 30 лет истории. |
| **MySQL** | ⚠️ Почти как PG, но JSON слабее. DefectDojo не на MySQL — зоопарк. |
| **MongoDB** | ❌ Документная без схемы. Auth и runs с foreign keys — не её зона. |

## 6. Что Valkey НЕ делает (урок Космопорта)

```text
❌ НЕ хранит состояние джобов как primary store
❌ НЕ является единственным местом, откуда ИМ читает статусы
❌ НЕ используется для данных, которые должны пережить рестарт стенда

✅ Хранит кэш, который ВСЕГДА можно перестроить из PostgreSQL
✅ Pub/sub для real-time уведомлений (потеря сообщения = не критично)
✅ Очереди фоновых задач (ретрай при падении)
```

**Паттерн восстановления:**
```text
Стенд мигнул → Valkey пуст
→ читаем статусы джобов из PostgreSQL
→ кладём в Valkey
→ ИМ снова знает кого опрашивать
→ время восстановления: миллисекунды
```

## 7. NDJSON / JSON-файлы — статус

`runs_index.ndjson`, `checks_registry.json`, `current.json`, `diary_*.ndjson` — **заменяются на PostgreSQL.**

| Файл | Замена |
|---|---|
| `runs_index.ndjson` | `runs` table (PostgreSQL) |
| `checks_registry.json` | `checks` table (PostgreSQL) |
| `current.json` | `run_state` field / table (PostgreSQL) |
| `diary_*.ndjson` | `events` table (PostgreSQL) + Valkey pub/sub (real-time) |
| `artifact_index.json` | `artifacts` table (PostgreSQL) |

## 8. История принятия

1. **24 августа 2026, утро.** Keeper: аудит текущего persistence-слоя. NDJSON/JSON-файлы без схемы. Вывод: нужна база.
2. **24 августа 2026, обед.** Обсуждение с Максимом. Рассмотрены: PostgreSQL, MySQL, MongoDB. Redis vs Valkey. Урок Космопорта.
3. **24 августа 2026, вечер.** Решение: PostgreSQL 16 + Valkey 8. Зачислены на Алтарь. Канон оформлен.

---

*«Динозавры пусть хоть говно жрут свое, у нас все эталонно свежее.» — Максим, 24 августа 2026*