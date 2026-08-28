# MONITOR-MAINPAGE-AND-SPACE: хаб монитора — HomePage, кнопки, instance-группировка, space, дропдаун

`lane: ready` → **принят 15 авг 2026 (2FA одобрен).** Зачислен в hub как часть `CANON` `monitor-hub.md` (раздел I. Space).

## Статус (as-built, 15 авг)

Все 8 карточек эпика закрыты, живьём на `:8767`:

- **MH-1/MH-2** (Flash) — Allure/WireK убраны, кнопка «Результаты →» со стрелкой справа.
- **MH-3** (Bro) — HomePage `GET /` → `/api/runs/apps` (группировка/сортировка/pagination 10) + SPA-рендер в `index.html`.
- **MH-4/MH-5** (Bro) — `instance_id`/`app_code`/`deploy_url`/`first_run_ts`/`last_run_ts` в `runs_index.ndjson`; `upsert_run_index` не затирает space-поля.
- **MH-6** (Flash) — дропдаун «Все запуски» фильтрует по `instance_id` (fallback `check_id`).
- **MH-7** (Bro) — ACL-черновик `filter_runs_for_caller` + `_filter_apps_by_caller`.
- **MH-8** (Bro) — E2E smoke `cosmo/e2e/monitor-hub-smoke.spec.ts` (4 теста, все зелёные).

## Тезис

Monitor должен вырасти из «одна страница на один прогон» в полноценный хаб: **HomePage** с динамической таблицей apps, **instance-группировка** (коллапсы), **дропдаун переключения run_id**, внятные **кнопки в хедере** (без Allure/WireK), и **space** (пространство) монитора, создаваемое синхронно с `start_run`.

## Пункты (по запросу Максима, 15 авг)

### 6. Убрать кнопки Allure и WireK из хедера
Не нужны в мониторе. Allure — внешний сервис, его URL и так в results hooks. WireK — конструктор, это не сюда.

### 7. Кнопка «Результаты» — стрелка справа
Кнопка «Результаты →» (стрелка справа, не слева) в хедере Monitor. `→` / svg иконка. Максим просил справа.

### 8. Ведёт на instance проверки
URL: `/#/check/<check_id>`. `check_id` уже есть в `meta.check_id` (бэк его туда кладёт через `start_run` → `diary_bus.set_meta(check_id=…)`).

### 9. HomePage монитора (уточнено)
По `http://127.0.0.1:8767/` (без `run_id`) — **единственная** страница (AppInstancesPage — отложено). Таблица apps:
- **Источник:** `runs_index.ndjson` (meta-ledger, ведётся бессрочно).
- **Динамическая:** рефрешится при новом `run_id` для любого `instance_id`/app (SSE или polling).
- **Коллапсы:** app-code → внутри N коллапсов deployments (deploy_URLs) → внутри deployment-коллапса лейбл `instance_id` со ссылкой на вкладку **«Регламент»** релевантного instanceId.
- **Сортировка:** по дате последнего запуска (`last_run_ts`, свежие выше); вторично — по дате первого запуска (`first_run_ts`).
- **`first_run_ts`** = первый запуск пайпа для этого app-code (не создание app-code как сущности). Т.е. инициализация app-code считается по первому запуску проверки.
- **Pagination:** 10 строк (app-коллапсов) на страницу.
- **Ссылка на app в портале АС Космопорт** — в коллапсе app-code; **заглушка** (без URL) до появления hook-интеграции.

### 10. Доступ к чужим запускам (черновик политики)
Пока все видят всё (без разграничения). Проект на будущее:
- `admin_appsec` / `admin_abnormal` — видят любой запуск любого instance.
- Оператор — видит только свои запуски.
- Гость по bind-токену — видит только привязанный run_id.

**Почему пока без ACL:** HomePage читает `runs_index.ndjson` который уже есть без фильтра. Разграничение — отдельная задача, не блокирующая MH-3/MH-6.

### 11. Кнопка «Результаты» → таба «Результаты»
URL должен вести на `/#/check/<check_id>?tab=results` — именно таба результатов того инстанса проверки, где создан данный monitor instance.

### 12. Space монитора: создавать при start_run
При старте прогона (`start_run`) — записывать запись в `runs_index.ndjson` с полями:
```json
{
  "instance_id": "<id instance>",
  "run_id": "<uuid>",
  "app_code": "<app-code из wired>",
  "deploy_url": "<deploy_url из wired>",
  "check_id": "<check_id>",
  "created_at": 1712345678.0,
  "owner": "appsec-expert",
  "first_run_ts": 1712345678.0,
  "last_run_ts": 1712345678.0
}
```

`first_run_ts` ставится только если app-code ещё не встречался (первый запуск пайпа = инициализация). `last_run_ts` обновляется на каждый новый run.

Новый Run того же instance → **новый** monitor instance (новый `run_id`, новое видео, новые логи). Старые не перезаписывать.

### 13. Дропдаун «Все запуски» в хедере
В хедере live monitor — `<select>` / кастомный дропдаун «Все запуски» со списком run_id того же `instance_id`. Переключение → `window.location` с новым `run_id`. При группировке (п.9) — естественная связка: HomePage группирует по instance, в мониторе — дропдаун переключает run_id того же instance.

## As-built якорь

### Что уже есть
- `runs_index.ndjson` — meta-ledger, пишется бессрочно (MON-14).
- `meta.check_id` — бэк кладёт в `diary_bus.set_meta(check_id=…)` при `start_run`.
- `MON-10` — кнопка «Перейти к результатам» в Monitor (evolve, Flash).
- `MON-12` — instance-id в хедере (evolve, Flash).
- `MON-13` — ACL + bind-токен (done, Bro).
- `MON-14` — retention (done, Bro).

### Что нужно сделать
| ID | Что | Где |
|---|---|---|
| MH-1 | Убрать Allure/WireK из хедера | `index.html` |
| MH-2 | Кнопка «Результаты →» | `index.html` — `check_id` из meta |
| MH-3 | HomePage `/` — динамическая таблица apps (коллапсы, pagination 10, сортировка) | `live_server.py` + `index.html` (SPA-роутинг) |
| MH-4 | Space: запись в runs_index при start_run (`first_run_ts`) | `lab_run.py` |
| MH-5 | Новый run → новый monitor instance + `last_run_ts` | `lab_run.py` |
| MH-6 | Дропдаун «Все запуски» | `index.html` — дропдаун по instance_id |
| MH-7 | ACL-проект (черновик) | `live_pers_acl.py` — фильтр по owner в runs_index |
| MH-8 | E2E smoke | Playwright |

## DoD эпика
- Хедер без Allure/WireK, кнопка «Результаты →» ведёт на `/#/check/<check_id>?tab=results`.
- `:8767/` — HomePage: динамическая таблица apps, коллапсы app → deployments → instance_id (ссылка на «Регламент»), pagination 10, сортировка по дате последнего/первого запуска.
- app-code ссылка на портал — заглушка (без URL).
- Новый run → новый monitor instance с отдельным URL, обновление `last_run_ts`.
- Дропдаун «Все запуски» в хедере монитора переключает run_id.
- AC — черновик, не блокирует.
- AppInstancesPage — отложено.

## Связанные FR
- [`MONITOR-INSTANCE-BINDING.md`](MONITOR-INSTANCE-BINDING.md) — биндинг инстанса.
- [`MONITOR-AUTH-BINDING.md`](MONITOR-AUTH-BINDING.md) — ACL + bind-токен.
- [`MONITOR-RETENTION.md`](MONITOR-RETENTION.md) — retention и meta-ledger.