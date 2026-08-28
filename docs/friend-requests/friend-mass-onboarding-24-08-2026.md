# Friend-Request: Mass Onboarding — Enterprise SecOps Foundation

> `lane: evolve` · 24 августа 2026 г. · Профиль: `secops-lab-pure` + `cosmo-custom`
>
> **Важно:** это inbox-заявка на будущий FRIEND, не CANON. Пункты 1–5 приняты как направление. Пункты 6–15 — предложения Keeper, прошедшие здравый фильтр, но не обещание немедленной реализации.

## 0. Вердикт Keeper

Пять пунктов Gemini — разумное ядро enterprise-платформы. Я утверждаю их с одной важной поправкой:

- **MinIO** — референсная локальная реализация S3-контракта, а не обязательная привязка каждого заказчика к одному вендору. Внешний корпоративный S3/Ceph должен подключаться тем же контрактом.
- **OpenBao** — слой управления секретами и ключевым материалом, а не база данных прогонов и не публичный KMS endpoint для браузера.
- **PostgreSQL** остаётся durable Source of Truth.
- **Valkey** остаётся cache/pub/sub и временным dispatch-слоем; потеря Valkey не должна означать потерю прогона.
- Worker, outbox, audit и artifact storage — не отдельные игрушечные сервисы, а единая операционная модель массового запуска.

Идея не дикая. Это уже не «добавим ещё пять контейнеров», а нормальная граница между control plane, execution plane, данными, секретами и доказательствами.

---

## 1. Ч — что сказал заказчик (verbatim)

> «SQLite обдумаем уже потом думаю, если/когда отдельно будем выделять Automation Lab separtely from SecOps. И то наврядли что-то сменим. Канон есть канон. OpenBao - канон. MiniO тоже предлагаю канон (пригодится я думаю 100%) что еще можем насуетить и желательно? По нашему направлению в индустрии. Какие еще ништяк слои есть что мы еще не обдумывали? Gemini подумай ты»

> «Луна смотри пункты 1-5 от Gemini и утверждай это. Ты мой инжинер. Пиши в friend-mass-onboarding-24-08-2026.md все наши хотелки. И если кроме 1-5 есть еще добавить задумки от себя - давай»

## 2. И — продуктовый интент

PrettyK — enterprise SecOps-платформа, в которой оператор безопасно формирует проверку, запускает один или много изолированных прогонов, получает живой статус, доказательства и находки, а организация может доказать:

- кто и зачем запускал проверку;
- какой scope был разрешён;
- какая политика действовала;
- какой worker и какой контейнер выполняли работу;
- какие артефакты были созданы;
- что произошло после рестарта, ошибки или повторной доставки;
- какие находки новые, какие уже известны и кто отвечал за их закрытие.

Пользователь видит не набор демонов, а воспроизводимый и проверяемый жизненный цикл проверки.

---

## 3. Утверждённые направления Gemini — 1–5

### 1. Артефакты и доказательства — MinIO / S3

Большие результаты не должны жить единственной копией на локальном диске и не должны раздувать PostgreSQL. В PostgreSQL живёт индекс и метаданные; бинарные доказательства живут через S3-контракт.

**Что получает заказчик:** HAR, видео, скриншоты, scanner-отчёты, Allure, логи и экспортируемые evidence-пакеты доступны после завершения worker и не зависят от конкретного pod/хоста.

**GWT:**

- **Given:** worker завершил run и создал evidence.
- **When:** оператор открывает результат после перезапуска worker или UI.
- **Then:** артефакт находится по метаданным прогона, проходит проверку целостности и скачивается через защищённый доступ.

**Обязательные свойства:** checksum, versioning, retention, legal hold для удерживаемых evidence, отсутствие публичных bucket-объектов, короткоживущие ссылки только через backend.

**Не обещаем:** MinIO как единственный storage для всех инсталляций. Обещаем S3-совместимый контракт; MinIO — reference implementation для Compose и локального enterprise-стенда.

### 2. Распределённое исполнение — Control Plane / Worker Pool

Сервер управления не должен падать из-за Chromium, scanner, фаззера или утечки памяти в одном runner. Тяжёлый run выполняется изолированным worker с ограничениями ресурсов и жизненным циклом.

**Что получает заказчик:** несколько проверок выполняются параллельно; остановка одного worker не ломает control plane и не превращает run в бесконечный «running».

**GWT:**

- **Given:** разрешено несколько параллельных runs.
- **When:** worker завершился аварийно, завис или был остановлен оператором.
- **Then:** run получает проверяемый статус, выполняется retry либо честно завершается ошибкой; дубликаты результата не создаются.

**Обязательные свойства:** concurrency quotas, leases, timeout, retry policy, cancellation, idempotency, resource limits, изоляция браузера и сетевой egress.

### 3. Audit Log и SIEM Outbox

Каждое существенное действие должно оставлять проверяемый след: запуск, остановка, изменение scope, изменение политики, доступ к секретной ссылке, экспорт evidence, ручной override и административные действия.

**Что получает заказчик:** на вопрос «кто, когда, что и с каким результатом сделал?» есть ответ, который не зависит от живого UI или локального лога worker.

**GWT:**

- **Given:** пользователь запускает active scan или меняет gate policy.
- **When:** действие принято или отклонено.
- **Then:** создаётся append-only audit event с actor, объектом действия, результатом, временем и correlation id; событие доступно для корпоративного SOC.

**Обязательные свойства:** неизменяемость для обычного пользователя, retention, экспорт в Syslog/CEF/JSON/Webhook, повторная отправка без потери и без неконтролируемых дублей, redaction секретов.

### 4. Уведомления и интеграционный Outbox

Результат должен доходить до CI/CD, Jira/YouTrack, Mattermost/Slack/Telegram и корпоративных webhook-приёмников, не блокируя сам security run.

**Что получает заказчик:** High/Critical finding или нарушение quality gate автоматически становится событием в нужном рабочем контуре.

**GWT:**

- **Given:** run завершился и policy определила уведомляемое событие.
- **When:** внешний endpoint временно недоступен.
- **Then:** событие не теряется, повторяется с backoff, а оператор видит failed delivery и может безопасно повторить её.

**Обязательные свойства:** transactional outbox, at-least-once delivery, idempotency key, подписанные webhook-запросы, dead-letter состояние, replay из Admin.

### 5. Таксономия уязвимостей и жизненный цикл finding

PrettyK должен говорить на языке безопасности, а не выдавать разрозненные строки от scanner и фаззера. Находка получает нормализованный тип, severity, доказательство, fingerprint и историю.

**Что получает заказчик:** повторный nightly run обновляет существующую finding, а не создаёт поток дублей; новый риск отличается от уже известного.

**GWT:**

- **Given:** одинаковая уязвимость найдена на следующем run.
- **When:** система сравнивает результат с историей.
- **Then:** сохраняются first seen/last seen, меняются статус и evidence, а дубликат не создаёт новую независимую карточку.

**Ориентиры:** CWE, OWASP Top 10/ASVS, CVSS v4, fingerprint, lifecycle `open → accepted/risk → fixed → verified`, suppression с причиной и сроком действия, ссылки на evidence.

**Граница:** полноценные внешние Threat Intelligence feeds — отдельный этап. Сначала локальная нормализация и честная история собственных находок.

---

## 4. Дополнительные слои от Keeper — 6–15

### 6. Наблюдаемость — OpenTelemetry + Prometheus/OpenMetrics

Live SSE — пользовательский канал, но не полноценная observability-платформа. Нужны коррелируемые traces, metrics и structured logs для control plane, worker, browser, scanner и интеграций.

**DoD:** по `run_id`/correlation id можно восстановить путь команды от запуска до evidence; видны queue lag, worker utilisation, run duration, retry rate, artifact upload failures и delivery failures.

**Не тащим сейчас:** обязательный Elasticsearch/OpenSearch и сложный log lake. PostgreSQL + structured logs + Prometheus закрывают первый промышленный контур.

### 7. Asset Inventory и Safety Scope

До active scan и fuzzing система должна понимать, какой объект проверяется, кому он принадлежит, какая среда используется и какие адреса разрешены.

**Что получает заказчик:** невозможно случайно запустить агрессивный run на адресе вне разрешённого scope без явного административного решения.

**DoD:** target имеет owner, environment, authorization state, allowed scope, rate/concurrency limits и kill switch; отсутствие авторизации даёт fail-closed, а не «ну попробуем».

### 8. Policy Governance и approvals

Gate policy должна быть версионированной и объяснимой: кто разрешил active scan, почему выбран такой RPS, какие severity блокируют pipeline и кто сделал override.

**DoD:** результат ссылается на точную версию policy; изменение политики не переписывает историю старых runs; опасная операция может требовать второго подтверждения.

**Здравый фильтр:** отдельный OPA/Rego-сервис пока не нужен. Нужен прозрачный versioned policy contract; внешний policy engine — только при реальном требовании клиента или сложном ABAC/ReBAC.

### 9. Provenance и Evidence Chain

Отчёт должен доказывать не только «нашли», но и «чем, когда и на каком входе нашли».

**DoD:** каждый run связывается с check, policy, target, worker/runtime version, временем, входным wired и artifact checksums; экспорт содержит provenance wired и не позволяет подменить файл незаметно.

Для обмена с внешними security-инструментами желательны стандартные форматы, включая SARIF для findings, без отказа от родного PrettyK evidence-пакета.

### 10. Backup, Disaster Recovery и Restore Drill

Enterprise-готовность — это не только `restart: unless-stopped`. Должно быть понятно, как восстановить users, runs, audit, policies и evidence после потери узла или тома.

**DoD:** определены RPO/RTO, backup policy, PostgreSQL point-in-time recovery, object versioning, OpenBao recovery procedure и регулярная проверка restore на чистом стенде.

### 11. Multi-tenancy, Spaces и Quotas

Пользователи, приложения, проверки, runs, findings и evidence должны быть разделены по организации/пространству так, чтобы соседний департамент не увидел чужие данные.

**DoD:** доступ проверяется на backend boundary; space scope действует одинаково в UI, API, worker и экспорте; квоты ограничивают concurrency, storage и retention; удаление пространства не уничтожает evidence без предусмотренной политики.

### 12. Supply Chain Security платформы

Банк будет проверять не только результаты скана, но и саму PrettyK-поставку.

**Желательные свойства:** SBOM в CycloneDX или SPDX, подписанные OCI-образы, provenance сборки, pinned dependencies/images, проверка CVE до доставки, поддержка offline registry/mirror и запрет запуска неподтверждённого worker image.

**DoD:** оператор видит версию и digest runtime-компонентов, которыми выполнен run; поставка имеет проверяемый SBOM и подпись.

### 13. Единый API Contract и операционные статусы

Frontend, CLI, CI и worker не должны договариваться через случайные JSON-файлы и неявные строки.

**DoD:** публичные операции имеют версионированный контракт, единый формат ошибок, correlation id, idempotency semantics, health/readiness и честную state machine для run: pending, queued, running, cancelling, succeeded, failed, cancelled, expired.

### 14. Scheduler и Run Governance

Массовая платформа должна уметь не только ручной старт, но и расписания, окна обслуживания и ограничение нагрузки на target.

**DoD:** scheduled run имеет владельца, policy, scope, окно, лимит concurrency и понятную причину пропуска; повторный запуск не создаёт неконтролируемую лавину.

### 15. Data Protection и секретная гигиена

Секреты, cookies, Authorization, passwords и PAT не должны попадать в Live, audit, telemetry, evidence index или уведомления в открытом виде.

**DoD:** backend выдаёт только минимально необходимое; секреты ротируются; логирование redacted; transport защищён; доступ к secret reference и export auditируется; браузер не получает OpenBao credentials.

---

## 5. Целевая карта слоёв

```text
Surfaces: Studio / Admin / CLI / CI
                 │
                 ▼
         Control Plane / API
      ┌──────────┼───────────┐
      │          │           │
   Auth/RBAC   Policy      Audit + Outbox
      │          │           │
      ├──────────┼───────────┤
      │          │           │
 PostgreSQL   Valkey      OpenBao
 Source of   cache/      secrets/keys
 Truth       dispatch
      │          │           │
      └──────┬───┴──────┬────┘
             │          │
       Worker Pool    MinIO / S3
       isolated run  evidence blobs
             │
       Playwright / scanner / Fuzzer

  Observability: OpenTelemetry → Prometheus/OpenMetrics → dashboards/SIEM
  Governance: asset scope, quotas, retention, backup/restore, provenance
```

---

## 6. Очерёдность здравого внедрения

Это не приказ «сделать всё сразу». Правильный порядок — сначала durable contracts, потом масштабирование:

1. **Foundation:** PostgreSQL schema/migrations, OpenBao boundary, S3-compatible artifact contract, credentials и backup policy.
2. **Run truth:** durable run state, events, idempotency, leases, retry/cancel и recovery после рестарта.
3. **Execution:** isolated worker pool, quotas, target safety, scheduler.
4. **Trust:** audit, outbox, notifications, provenance, finding lifecycle.
5. **Visibility:** OpenTelemetry, Prometheus/OpenMetrics, operator dashboards и SIEM export.
6. **Enterprise hardening:** multi-tenancy, supply-chain attestations, DR drills, external SSO/LDAP/SAML по запросу заказчика.

---

## 7. Анти-оверинжиниринг — что не добавляем автоматически

- Kafka и RabbitMQ — не нужны до доказанной потребности в отдельном durable broker.
- Elasticsearch/OpenSearch — не нужны, пока PostgreSQL JSONB/GIN и Prometheus закрывают поиск и метрики.
- OPA/Rego — не нужен только ради модного слова; сначала versioned PrettyK policy contract.
- Istio/Linkerd — не нужны для первого Compose/Kubernetes-контура.
- Temporal — не нужен, пока lifecycle runs, retries и outbox закрываются ясной моделью.
- Отдельный сервис Threat Intelligence — не нужен до подтверждённых feed/use cases.
- AI не получает права менять scope, policy, finding status или ход прогона без явного действия оператора.
- Не заменяем доменную ценность PrettyK: DSL, discovery, browser runtime, фуззинг, finding identity и honest quality gates.

---

## 8. С — сценарии верхнего уровня

### Массовый запуск

- **Given:** у организации есть разрешённый target, policy и квота.
- **When:** оператор запускает 10 параллельных runs.
- **Then:** каждый run изолирован, имеет durable статус, собственный evidence scope и не может прочитать чужой результат.

### Падение worker

- **Given:** run находится в состоянии `running`.
- **When:** worker исчезает до загрузки evidence.
- **Then:** lease истекает, run становится retryable/failed по policy, partial evidence помечается неполной, UI не показывает ложный success.

### Рестарт Valkey

- **Given:** Valkey потерял все ephemeral keys.
- **When:** control plane возвращается после рестарта.
- **Then:** текущие runs и их статусы восстанавливаются из PostgreSQL, а cache и live-подписки перестраиваются.

### Утечка секрета в событие

- **Given:** лог или telemetry payload содержит Cookie, Bearer, password или PAT.
- **When:** событие записывается или отправляется наружу.
- **Then:** секрет редактируется до persistence/export; raw value отсутствует в audit, Live, evidence index и notification.

### Повторная доставка webhook

- **Given:** внешний endpoint подтвердил событие, но ответ потерялся.
- **When:** outbox делает retry.
- **Then:** consumer может безопасно дедуплицировать событие по idempotency key, а PrettyK сохраняет прозрачный delivery history.

---

## 9. Т — общий DoD направления

- PostgreSQL, Valkey, OpenBao и S3-compatible storage имеют ясные роли, health/readiness и recovery behavior.
- Ни один run, audit event или finding не существует только в памяти или только в Valkey.
- Большие blobs не являются единственной локальной копией worker.
- Состояние run переживает рестарт control plane, worker и Valkey.
- Active scan/fuzzing fail-closed при отсутствии разрешённого scope.
- Audit, notifications и SIEM delivery не блокируют основной run и не теряют события при временном отказе consumer.
- Findings дедуплицируются и имеют историю, evidence и объяснимый lifecycle.
- Артефакты и reports имеют checksum, retention и provenance.
- Secrets не попадают в UI, logs, telemetry, audit и notifications в raw-виде.
- Есть backup/restore drill и измеримые RPO/RTO.
- Runtime images и зависимости имеют проверяемую версию, digest и SBOM.
- Все будущие компоненты проходят критерий: «какое наблюдаемое поведение заказчика это закрывает?»

## 10. О — ограничения и границы

- Этот документ — **friend-request lane `evolve`**, не канон и не разрешение на массовый rewrite.
- SQLite пока не пересматриваем; вопрос возвращается только при отдельном решении о самостоятельном Automation Lab.
- OpenBao и PostgreSQL/Valkey считаются утверждённым направлением; конкретная операционная конфигурация требует отдельного спайка.
- MinIO принимается как reference S3 deployment; корпоративный production storage может быть внешним S3/Ceph.
- Не добавляем контейнеры «для полноты архитектурной картинки» без сценария, DoD и ownership.
- Не переписываем доменные engines ради перехода на модный framework.
- Не превращаем `reports/` в публичное файловое хранилище.
- Не выдаём frontend доступ к базе, Valkey, OpenBao или bucket credentials.
- OIDC/SAML/LDAP, внешние Threat Intelligence feeds и полноценная multi-region HA — отдельные enterprise-пакеты, не скрытая часть первого onboarding.

---

## 11. Следующий честный шаг

Сначала закрыть один узкий foundation-slice: **OpenBao + PostgreSQL migrations + S3-compatible artifact contract + recovery semantics**. После его проверки решать worker pool. Не начинать одновременно auth production, API rewrite, observability, scheduler и все интеграции — это уже не onboarding, а потеря управляемости.

**Статус:** пункты 1–5 — утверждённое направление; пункты 6–15 — предложения Keeper; promotion в CANON — только через отдельный 2FA.
