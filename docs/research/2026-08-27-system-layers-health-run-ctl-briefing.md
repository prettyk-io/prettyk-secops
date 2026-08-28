# Брифинг: Системные слои и жизнеобеспечение — что задумали и почему

> **Для:** Максим, Keeper, Boss, Flash.
> **Статус:** discovery завершён, концепт закристаллизован, нарезка готова.
> **Дата:** 27 августа 2026.

---

## Откуда взялось

Максим спросил:

> «Luna, внеочередной discovery, рассматриваем снова мой вопрос про слои. Но теперь я специфицирую запрос больше. я имел ввиду слои приложения, что в нем есть за фичи. Вот например мне видится нам нужно эффективное решение для контроля жизнеобеспечения систем, а так же балансировщики нагрузки там где надо. Думаем что из этого надо, в каком виде индустрия предлагает лучшее решение и какие еще возможно нужны нам апгрейды по этому принципу. Вот просто банально из чего состоят системы? база там раннеры бек фронт вот все слои... где видится что у нас нет чего то что было бы вообще то добавить разумно»

И следом:

> «Брат давай перед gemini сам чуть кристаллизуй все и поищи как это решают чтобы свое не городили там где не надо. Библиотеки или еще что. Или типовые решения»

---

## Что сделали

### Фаза 1: Luna Discovery (аудит текущей платформы)

Luna провела инвентаризацию того, что реально есть в коде и каноне. Не по памяти, а по файлам:

- `sanctuary/pure/` — каноны infra-stack, modules-skeleton, runtime-shell, lab-up, monitor-hub, auth-module, admin-integrations
- `services/docker-compose*.yml` — текущий Compose-стек
- `orchestrator/` — код раннера
- `frontend/` — auth-server, terminal-gateway, пакеты

**Вывод:** у нас хорошо развиты authoring, execution, evidence и state. Но нет полноценного **Run Control Plane** — слоя, который управляет жизнью запусков, знает кто какой worker, восстанавливается после падений и не позволяет запустить один и тот же тест дважды.

### Фаза 2: Исследование типовых решений (чтобы не изобретать)

Luna прошерстила индустриальные стандарты:

- **Healthchecks:** Kubernetes probes, Docker Compose healthcheck/depends_on. Не нужен фреймворк, нужен контракт.
- **Очереди и worker'ы:** RQ (Python, Valkey 7.2+, но `fork()` — только Linux), arq (лёгкий asyncio для Python), Celery (тяжёлый), BullMQ (Node — не наш runtime), Dramatiq (RabbitMQ — лишний брокер).
- **Valkey Streams:** Consumer Groups дают XREADGROUP, XACK, XPENDING, XCLAIM, XAUTOCLAIM — всё для worker lease/recovery. Valkey Streams = транспорт и координация; PostgreSQL = durable truth.
- **Temporal:** Durable execution с replay. Пока overkill для наших 5-минутных security runs. Оставить на будущее для многодневных workflow.
- **Reverse proxy:** Caddy/Nginx/Traefik — готовые, не самописные.
- **PgBouncer:** connection pooler, не load balancer. Нужен только при реальной нехватке соединений к PG.
- **OpenTelemetry:** стандарт инструментации. Не backend, не дашборд.

### Фаза 3: Gemini Flash — 3-раундовый протокол

Gemini провёл discovery по стандартному протоколу:

1. **Раунд 1 (Анатомия и аудит):** разобрал платформу на 5 функциональных плоскостей, диагностировал три главных пробела.
2. **Раунд 2 (Индустриальный срез):** сравнил очереди (RQ/arq/Celery/Valkey Streams/Temporal), reverse proxy (Caddy/Nginx/Traefik), балансировку (для веба — HTTP LB, для раннеров — capability scheduler).
3. **Раунд 3 (Архитектурный синтез):** предложил золотое правило «что берём готовым, что пишем сами», два профиля (Pure Box / Enterprise), дорожную карту приоритетов.

### Фаза 4: Keeper — refine + нарезка

Keeper взял выводы Luna и Gemini, провёл refine по протоколу ЧИСТО и нарезал карточки для Boss/Flash:

- 4 эпика: HEALTH, EDGE, RUN-CTL, TELEMETRY
- 13 карточек с GWT, DoD и out-of-scope
- Ноль имён файлов, строк и полей — только поведение глазами пользователя

---

## Что мы поняли (ключевые инсайты)

### 1. Главный пробел — не балансировщик, а Run Control Plane

Максим интуитивно чувствовал, что чего-то не хватает. Мы подтвердили: не хватает слоя, который управляет жизнью запусков. Сейчас запуск — это синхронный CLI-процесс. Упал процесс — run потерян. Нет очереди, нет гарантии «ровно один раз», нет восстановления.

Балансировщик без этого — красивая дверь в комнату, где не назначен дежурный.

### 2. Не надо писать свой Kubernetes, свою очередь и свой LB

Индустрия даёт готовые примитивы:
- **Edge:** Caddy/Nginx
- **Очередь:** Valkey Streams + Consumer Groups
- **Durable truth:** PostgreSQL
- **Health:** стандартные endpoints + Compose probes

Наше собственное — это доменная логика: что такое PrettyK run, какие у него статусы, какие worker capabilities нужны, как связать run с evidence.

### 3. Valkey Streams — идеальный транспорт для нашего стека

Он уже в каноне. Consumer Groups дают механику worker lease, heartbeat, обнаружения зависаний и перехвата задач (XCLAIM/XAUTOCLAIM). Не нужно тащить RabbitMQ или Celery.

Но Valkey Streams — только транспорт. Истина всегда в PostgreSQL. Valkey не становится новой базой данных со статусами.

### 4. Pure Box нельзя сломать

Все системные улучшения — только для Enterprise-профиля. Pure Box остаётся single-process, SQLite, без очереди и worker pool.

### 5. Балансировка раннеров ≠ HTTP Load Balancer

Нельзя сделать `round-robin` между worker'ами. Запуск требует конкретных capabilities (браузер, scanner, сетевая зона), и worker должен быть не просто свободным, а подходящим. Это задача capability-aware scheduler'а, а не сетевого прокси.

---

## Архитектурное видение (целевая картина)

```text
Пользователи / CI / API clients
          │
     TLS reverse proxy (Caddy)
          │
  Stateless Web + Control API ──── Auth API
          │                         │
          └──── PostgreSQL (SoT) ───┘
          │          │
          │     Artifact storage (S3/MinIO)
          │
       Valkey (queue + pub/sub + rate-limit; не truth)
          │
   Run dispatcher / worker leases
          │
  Изолированные execution workers
  (браузер/Grid, scanner, fuzzer, connector probes)
          │
     Live telemetry + evidence pipeline
          │
   Allure / Dojo / reports / operator UI
```

---

## Что НЕ делаем (явные запреты)

- ❌ Не пишем свой Kubernetes
- ❌ Не пишем свою очередь с нуля
- ❌ Не тащим RabbitMQ, Kafka, NATS как новый брокер
- ❌ Не добавляем Temporal на текущем этапе
- ❌ Не делаем микросервисы из каждого модуля
- ❌ Не ставим PgBouncer без измеренной необходимости
- ❌ Не ломаем Pure Box
- ❌ Не пишем свой HTTP load balancer
- ❌ Не делаем «AI health diagnosis»

---

## Приоритеты (что когда)

| Волна | Что | Почему |
|---|---|---|
| **P0 сейчас** | HEALTH-1, HEALTH-2, HEALTH-3 | Без контракта жизнеспособности всё остальное висит в воздухе |
| **P0 сейчас** | RUN-CTL-1, RUN-CTL-2 | Минимальный control plane: модель состояний + защита от дублей |
| **P1 дальше** | RUN-CTL-3, RUN-CTL-4, RUN-CTL-5 | Очередь, worker dispatch, обнаружение зависаний — production readiness |
| **P1 дальше** | EDGE-1, PROFILES-1 | Сетевая граница + защита Pure Box |
| **P2 потом** | RUN-CTL-6, TELEMETRY-1/2/3, EDGE-2 | Retry с классификацией, сквозная корреляция, CORS/rate-limit |

---

## Файлы

- **Концепты и кристаллы:**
  - `docs/research/2026-08-27-system-layers-health-run-ctl-concept.md` — (будет создан при необходимости, сейчас выводы в этом брифинге)
  - `docs/research/2026-08-27-system-layers-health-run-ctl-crystal.md` — (будет создан при необходимости)
- **Нарезка для Boss/Flash:**
  - `docs/research/2026-08-27-system-layers-health-run-ctl-backlog.md` — 13 карточек, GWT, DoD, out-of-scope
- **Этот брифинг:**
  - `docs/research/2026-08-27-system-layers-health-run-ctl-briefing.md`

---

## Что дальше

1. Максим смотрит брифинг и нарезку.
2. Если accepted — Keeper проводит 2FA на канонизацию (поэпично или покарточно).
3. Boss получает копипасту карточек на реализацию.
4. Flash подхватывает параллельные карточки.

Ни `sanctuary/pure/INDEX.md`, ни `docs/backlog.md` пока не меняли — ждём команды Максима.