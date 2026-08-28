# 🏛️ Research: Cosmoport 2 ↔ PrettyK Box Ephemeral Developer Visit & Capability Brokering

> **Дата:** 28 августа 2026  
> **Статус:** 💡 Architectural Discovery & Specification · **Зона:** `to evolve`  
> **Контекст:** Предоставление роли `Developer` в Cosmoport 2 возможности запуска ограниченного интерактивного DAST-тестирования («Визит в Studio») без размазывания единого RBAC, без прямого доступа к ядру сканера и без пложения лишних UI-фреймворков.  
> **Основа:** Исследование Gemini Discovery Rounds (1 & 2) · Вход для нарезки бэклога моделью DeepSeek V4 Pro.

---

## 1. Архитектурный манифест и границы (Iron Boundaries)

### 1.1. Проблема классического подхода
1. **Прямой доступ в DAST-бокс** → разработчик видит чужие сканы, получает терминал к контейнерам, может сканировать внутренние секреты (SSRF / Cloud Metadata) и случайно запустить деструктивный фаззинг (SQLi DROP TABLE, DoS).
2. **Единый сквозной монолитный RBAC** → сцепляет Cosmoport и PrettyK Box в хрупкую систему с общей базой пользователей и запутанными глобальными правами.
3. **UI-зоопарк и воскрешение легаси** → попытка натянуть третий UI-фреймворк (React Admin) поверх уже существующих админок или воскресить старую legacy-админку.

### 1.2. Канонические принципы решения
- **Суверенитет UI (No 3rd Admin):** Старая админка удалена/заархивирована и не воскрешается. Мы не внедряем React Admin как основу. В экосистеме ровно две управляющие поверхности: **Cosmoport 2.0 Control Plane** (управление релизами и политиками) и **PrettyK Box Admin** (наш Ant Design ProLayout для SecOps-инженеров). Для визита разработчика используется облегчённый режим **PrettyK Studio / BrowserStage**.
- **Brokered Ephemeral Capability:** Cosmoport знает *Кто* (Identity), *Что за проект* (Context) и *Разрешено ли* (Policy). PrettyK Box ничего не знает о пользователях Cosmoport, получая лишь обезличенный подписанный запрос на изолированную сессию.
- **Fail-Closed & Zero Token Leak:** Никаких JWT-токенов в URL `#hash`. Одноразовый auth-код обменивается на scoped-сессию. Сетевая изоляция блокирует SSRF на уровне ядра контейнера.

---

## 2. Архитектурная панорама взаимодействия

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                       COSMOPORT 2                                       │
│                                                                                         │
│   [ 👤 Developer: Иван ] ──► [ Страница релиза: payments-service v2.4.1 ]               │
│                                           │                                             │
│                                           ▼                                             │
│                     [ Cosmoport Entitlement & Policy Decision ]                         │
│               Проверка: Роль(Developer) ⨉ Группа(Core-Apps) ⨉ Среда(Staging)             │
│                                           │                                             │
│                                           ▼                                             │
│                          POST /api/v1/sessions/ephemeral-visit                          │
│                          (Signed mTLS/HMAC Request + Constraints)                       │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                       PRETTYK BOX                                       │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │ Ephemeral Session Runtime (Namespace / Docker Project: pk-session-<uuid>)       │   │
│   │                                                                                 │   │
│   │   [ Browser Viewport :9224 ] ◄── WS Relay (Scoped Session Cookie / Auth Frame)  │   │
│   │   [ Scanner Engine :8080 ]   ◄── Profile: developer-safe-v1                     │   │
│   │   [ Network Egress Filter ]  ◄── SSRF Guard: Target Host Lock + Metadata Block  │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                           │                                             │
│                                           ▼ (Inactivity TTL 5m / Hard TTL 20m / Finish) │
│                        [ Immutable Evidence & SARIF Bundle (SHA256) ]                   │
│                                           │                                             │
└───────────────────────────────────────────┼─────────────────────────────────────────────┘
                                            │
                                            ▼ Webhook + State Reconciliation Endpoint
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                      COSMOPORT 2: Release Ledger & Audit Trail                          │
│          «Динамический аудит релиза #318: 0 Crit, 0 High, 2 Low. Quality Gate: PASS»    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Модель разграничения допуска (Entitlement Triad)

Допуск к запуску интерактивного тестирования вычисляется в Cosmoport пересечением трёх осей:

```text
       ( 👤 Identity & Role в Cosmoport )
                       ⨉
       ( 🏷️ Application Group / Security Tier )
                       ⨉
       ( 🚦 Release Stage & Target Environment )
```

### 3.1. Матрица политик допуска (Entitlement Matrix)

| Роль в Cosmoport | Группа приложения | Целевая среда | Разрешённый DAST-профиль | Интерактивный визит в Studio |
|---|---|---|---|---|
| **Developer** | `internal-dev` / `core-apps` | `dev` / `preview-branch` | `passive + dev-safe-crawl` | ✅ **Да** (облегчённый UI, safe-actions) |
| **Developer** | `pci-dss` / `critical-infra` | `staging` / `preprod` | `smoke-crawl-only` | ❌ **Нет** (только фоновый автопрогон) |
| **Developer** | Любая группа | `production` | ⛔ Запрещено | ⛔ Запрещено |
| **SecOps / Security Champion** | Любая группа | `dev` / `staging` / `preprod` | `full-active + intrusive-fuzz` | ✅ **Да** (полный Studio + DSL + Raw Proxy) |
| **Release Manager** | Любая группа | `staging` → `prod-gate` | `compliance-audit-baseline` | ❌ **Нет** (только вердикт гейта в релизе) |

---

## 4. Жизненный цикл визита и безопасность аутентификации

### 4.1. Протокол безопасного входа (Zero-Leak Code Exchange)
**Антипаттерн:** Передавать JWT в URL `#token=...` (утечка в историю браузера, Referer-заголовки, логи reverse-proxy).  
**Канонический протокол:**
1. Cosmoport запрашивает сессию у PrettyK Box и получает `single_use_auth_code` (TTL: 60 сек).
2. Браузер разработчика переходит по ссылке `/visit/exchange?code=...`.
3. PrettyK Box валидирует и сжигает одноразовый код, устанавливая `HttpOnly; Secure; SameSite=Strict` сессионную cookie с capability-скоупом `visit:developer-safe`.
4. WebSocket-соединение (`:9224/api/browser/canvas`) валидирует эту cookie при handshake.

### 4.2. Двойной таймер сессии (Dual TTL Lifecycle)
1. **Inactivity TTL (5 минут):** Если от разработчика не поступает WS-событий (нет движения курсора, кликов, отправки форм) в течение 5 минут — сессия переходит в режим draining и завершается.
2. **Hard Session Cap (20 минут):** Независимо от активности, через 20 минут сессия принудительно гасится LeaseController'ом (`docker compose down --volumes`), предотвращая зависание контейнеров и исчерпание пула портов/памяти.

---

## 5. Защитные барьеры и изоляция (Defense-in-Depth)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        МНОГОСЛОЙНЫЙ SSRF-БАРЬЕР                        │
├────────────────────────────────────────────────────────────────────────┤
│ 1. UI Layer:        Заблокирована смена URL, адрес зафиксирован релиза │
│ 2. Proxy Allowlist: Proxy пропускает трафик ТОЛЬКО к target domain     │
│ 3. DNS Pinning:     Запрет DNS Rebinding атак                          │
│ 4. IP Filter:       Блокировка Loopback (127.0.0.0/8, ::1)             │
│ 5. Cloud Metadata:  Дроп запросов к 169.254.169.254 и метаданным       │
│ 6. Private IP:      Блокировка RFC1918 (кроме целевого staging хоста)  │
│ 7. NetworkPolicy:   Изолированная Compose-сеть `pk-session-<uuid>`     │
└────────────────────────────────────────────────────────────────────────┘
```

### Модель нейтрализации угроз

| Угроза | Механизм защиты |
|---|---|
| **SSRF к Cloud Metadata / Vault** | Proxy Allowlist + iptables / NetworkPolicy дропают любые запросы к `169.254.169.254`, `localhost` и неавторизованным IP. |
| **Утечка боевых паролей в evidence** | **Evidence Redaction Engine:** авто-маскирование полей `Authorization`, `Cookie`, `Set-Cookie`, `*password*`, `*token*`, `*secret*` перед сохранением HAR и видео. |
| **Деструктивные SQLi/DoS атаки** | Профиль `developer-safe-v1` исключает time-based SQLi sleep, `DROP/DELETE/UPDATE` payload'ы и многопоточный стресс-фаззинг. |
| **Подмена session_id в WS** | WS Relay проверяет Session Cookie. Доступ разрешён строго в пределах выделенного `pk-session-<uuid>`. |
| **Сетевой сбой при доставке отчёта** | Идемпотентный Webhook (`event_id`, `idempotency_key`, retry with backoff) + Reconciliation API (`GET /api/v1/sessions/{id}/status`). |

---

## 6. Спецификация API-контрактов

### 6.1. Заказ визита (Cosmoport → PrettyK Box)
`POST /api/v1/sessions/ephemeral-visit`

```json
{
  "request_id": "req-991a-44",
  "project_id": "payments-billing",
  "release_ref": "v2.4.1-rc3",
  "correlation_id": "corr-rel-20260828-9941a",
  "actor": {
    "sub": "user-8812",
    "display_name": "Ilya Developer",
    "role": "developer"
  },
  "target_spec": {
    "base_url": "https://payments-stage.bank.internal",
    "allowed_hosts": ["payments-stage.bank.internal"]
  },
  "policy": {
    "profile": "developer-safe-v1",
    "hard_ttl_minutes": 20,
    "inactivity_ttl_minutes": 5,
    "max_crawl_depth": 3,
    "allow_destructive": false
  },
  "callback": {
    "webhook_url": "https://cosmoport.internal/api/v1/integrations/prettyk/events",
    "auth_token": "bearer-cosmo-callback-xyz"
  }
}
```

### 6.2. Ответ с одноразовым кодом (PrettyK Box → Cosmoport)
`HTTP/1.1 201 Created`

```json
{
  "session_id": "pk-ses-7f8a9b",
  "status": "provisioning",
  "single_use_auth_code": "code_auth_88fa12c9b4e1",
  "exchange_url": "https://prettyk-box.internal/visit/exchange?code=code_auth_88fa12c9b4e1",
  "expires_at": "2026-08-28T18:45:00Z",
  "hard_ttl_seconds": 1200
}
```

### 6.3. Завершение сессии и результат (PrettyK Box → Cosmoport Webhook)
`POST https://cosmoport.internal/api/v1/integrations/prettyk/events`

```json
{
  "event_id": "evt-7712a-99b",
  "event": "session.completed",
  "session_id": "pk-ses-7f8a9b",
  "correlation_id": "corr-rel-20260828-9941a",
  "idempotency_key": "idem-pk-ses-7f8a9b-completed",
  "release_ref": "v2.4.1-rc3",
  "verdict": "PASSED",
  "duration_seconds": 742,
  "summary": {
    "endpoints_discovered": 18,
    "requests_analyzed": 142,
    "findings_count": {
      "critical": 0,
      "high": 0,
      "medium": 1,
      "low": 2,
      "info": 6
    }
  },
  "quality_gate": {
    "status": "PASSED",
    "threshold_violations": []
  },
  "artifacts": {
    "sarif_url": "https://prettyk-box.internal/api/v1/artifacts/pk-ses-7f8a9b/report.sarif",
    "evidence_bundle_url": "https://prettyk-box.internal/api/v1/artifacts/pk-ses-7f8a9b/evidence.zip",
    "checksum_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
}
```

---

## 7. Облегчённый UI: Developer Visit View в Studio

Для разработчика интерфейс Studio рендерится в специальном безопасном режиме:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ PRETTYK STUDIO · DEVELOPER VISIT (payments-service #318)   [⏱️ 14:20] │
├──────────────────────────────────┬─────────────────────────────────────┤
│ 🖥️ LIVE BROWSER VIEWPORT         │ 📋 SAFE ACTIONS & SCENARIOS        │
│                                  │                                     │
│  [ https://payments-stage... ]   │  [▶] Залогиниться тестовым юзером   │
│  ┌────────────────────────────┐  │  [▶] Пройти чекаут корзины          │
│  │                            │  │  [▶] Запустить Fast Crawl (2 мин)   │
│  │      Форма оплаты          │  │                                     │
│  │                            │  ├─────────────────────────────────────┤
│  │                            │  │ 🛡️ REAL-TIME FINDINGS (Safe)        │
│  └────────────────────────────┘  │                                     │
│                                  │  🟡 Missing Content-Security-Policy │
│  [ Interactive Click / Type ]    │  🟢 CORS wildcard allowed (Origin)  │
│                                  │  ⚪ 14 endpoints discovered         │
├──────────────────────────────────┴─────────────────────────────────────┤
│ 🔒 Mode: Developer Safe · Terminal / Raw Proxy / Destructive Disabled   │
│ [ ⏹️ Завершить проверку и прикрепить к релизу ]                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Особенности режима:**
1. **Скрыты:** Терминал, сырой перехватчик запросов, кнопка ручного ввода произвольного URL, destructive-атаки.
2. **Отображаются:** Живой viewport формы, список обнаруженных эндпоинтов, панель находок реального времени, таймер сессии и кнопка «Завершить проверку».

---

## 8. Дорожная карта и пакеты задач для нарезки (DeepSeek V4 Pro)

При переносе в бэклог (эпик `COSMO-VISIT` / расширение `SOR Wave 5`) задачи распределяются по 4 братьям:

| Карточка | Исполнитель | Объём | Суть реализации |
|---|---|---|---|
| **VISIT-API** | **Boss** | 4h | Эндпоинты `/ephemeral-visit` и `/exchange`. Валидация подписанных запросов Cosmoport, выпуск и сжигание single-use auth кодов, генерация Session Cookie. |
| **VISIT-UI** | **Flash** | 4h | Режим `DeveloperVisitView` в Studio: скрытие терминала/прокси, плашка обратного отсчёта Dual TTL, баннер ограничений, кнопка завершения сессии. |
| **VISIT-EGRESS** | **Buddy** | 3h | Egress NetworkPolicy + Proxy SSRF-фильтр в Compose template (`session-template.yml`): запрет loopback/metadata/RFC1918, строгий host lock. |
| **VISIT-EVIDENCE** | **Luna** | 4h | Webhook Dispatcher с retry/idempotency + Evidence Redaction Engine (маскирование паролей/токенов в HAR и видео) + Reconciliation API. |
