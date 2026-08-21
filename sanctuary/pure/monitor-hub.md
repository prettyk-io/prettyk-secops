# MONITOR-HUB: Monitor как полноценный хаб

> **CANON** — hub topic. Slice: **15 августа 2026** (2FA: зачисление из трёх friend-requests: MONITOR-MAINPAGE-AND-SPACE + MONITOR-AUTH-BINDING + MONITOR-RETENTION).
> As-built: `orchestrator/static/live/index.html` + `live_server.py` + `live_pers_acl.py` + `monitor_retention.py` + `lab_run.py` + `diary_bus.py`.
> Реестр: [`INDEX.md`](INDEX.md).
> Эпик: MH-1…MH-8 closed, MON-13/MON-14 closed. Тесты: `test_live_pers_acl.py` + `test_monitor_retention.py` — 18 passed. E2E smoke: `e2e/monitor-hub-smoke.spec.ts` (4 теста, зелёные).

Три столпа одного целого: **Space** (HomePage и пространство экземпляров), **ACL** (контроль доступа и bind-токен), **Retention** (время жизни артефактов).

---

## I. Space — HomePage и пространство экземпляров

### Тезис

Monitor вырастает из «одна страница на один прогон» в полноценный хаб. По `:8767/` (без `run_id`) — HomePage с динамической таблицей apps. Каждый прогон порождает свой monitor instance с собственным пространством.

### As-built

| ID | Что | Где |
|---|---|---|
| MH-1 | Убраны Allure/WireK из хедера | `index.html` |
| MH-2 | Кнопка «Результаты →» (стрелка справа) → `/#/check/<check_id>?tab=results` | `index.html` |
| MH-3 | HomePage `/` — динамическая таблица apps: коллапсы app→deployments→instance_id, pagination 10, сортировка по `last_run_ts` | `live_server.py` `GET /api/runs/apps` + `index.html` |
| MH-4 | Space: запись в `runs_index.ndjson` при `start_run` (поля: `instance_id`, `run_id`, `app_code`, `deploy_url`, `check_id`, `owner`, `first_run_ts`, `last_run_ts`) | `lab_run.py` |
| MH-5 | Новый run → обновление `last_run_ts`; `first_run_ts` только при первом запуске app-code | `lab_run.py` + `diary_bus.py` `upsert_run_index` |
| MH-6 | Дропдаун «Все запуски» в хедере — фильтр по `instance_id` (fallback `check_id`) | `index.html` |
| MH-7 | ACL-черновик: `filter_runs_for_caller` + `_filter_apps_by_caller` | `live_pers_acl.py` |
| MH-8 | E2E smoke | `cosmo/e2e/monitor-hub-smoke.spec.ts` |

### Контракт

- `runs_index.ndjson` — append-only meta-ledger, ведётся бессрочно.
- Ссылка на портал АС — заглушка (без URL) до hook-интеграции.
- AppInstancesPage — отложено.

---

## II. ACL — ролевой доступ и bind-токен

### Тезис

Ссылка на конкретный instance Monitor открывается снаружи без авторизации, если она забиндена к проверке (свой инстанс). Чужой инстанс: оператор не может открыть, admin_appsec и admin_abnormal — могут любой.

### Ролевая модель

| Роль | Свой инстанс | Чужой инстанс |
|---|---|---|
| `operator` (appsec-expert) | ✅ по bind-ссылке без логина | ❌ запрещено |
| `admin_appsec` (appsec-admin) | ✅ | ✅ любой |
| `admin_abnormal` (admin-abnormal) | ✅ | ✅ любой |

### As-built

| Компонент | Что |
|---|---|
| Split admin | `live_pers_acl.ADMIN_USERS = frozenset({"admin", "admin_appsec", "admin_abnormal"})` |
| Bind-токен | HMAC-SHA256: `issue_monitor_token(run_id, owner, ttl=…)` → `<payload_b64>.<signature_b64>`, payload `{run_id, owner, exp}`, TTL 7 дней (`KDT_MONITOR_TOKEN_TTL`) |
| Проверка | `verify_monitor_token(token, run_id)` + `may_view_run(caller, run_id, token)` (приоритет token → ACL) |
| Mint | `POST /api/monitor/token` (playground) + авто-mint в `lab_run.start_run()` |
| Live server | Читает `?token=` из query → приоритет bind-токен → `X-KDT-User`/cookie |
| Тесты | `test_live_pers_acl.py` — issue/verify/may_view_run + ACL (18 passed, вместе с retention) |

---

## III. Retention — время жизни артефактов

### Тезис

Инстансы Monitor (лог/NDJSON/видео) хранятся и удаляются по общему принципу: meta-история бессрочна, артефакты — 7 дней TTL + on demand purge.

### Разделение слоёв

| Слой | Политика |
|---|---|
| **Meta-ledger** (`runs_index.ndjson`, `meta.json`, `retention_policy.json`) | Хранить всегда — история чартов админки строится отсюда |
| **Артефакты** (NDJSON журнала, MP4 видео, sidecar) | TTL 7 дней + manual purge |

### As-built

| Компонент | Что |
|---|---|
| `monitor_retention.py` | `purge_by_run_id(run_id, dry_run=False)` — удаляет NDJSON+sidecar+MP4, не трогая meta; `lazy_sweep_monitor_artifacts()` — TTL-свип раз в час |
| `live_server.py` | `GET /api/artifacts/orphans`, `POST /api/artifacts/purge`, `POST /api/monitor/purge`, `POST /api/artifacts/hold` |
| Env | `KDT_MONITOR_RETENTION_DAYS` (default 7) |
| Тесты | `test_monitor_retention.py` — 18 passed (вместе с ACL) |

---

## Честная «не обещаем»

- ACL — черновик, не блокирует HomePage. Пока все видят всё.
- Bind-токен — HMAC-SHA256; компромисс удобства и безопасности. Формат токена может измениться.
- Lazy TTL (раз в час) — нет планировщика в Live-процессе; при старте возможно отдельный шаг `lab_clean`.
- Множественный Monitor, replay видео, playhead, split-view — отдельные evolve-реквесты, не в этом каноне.