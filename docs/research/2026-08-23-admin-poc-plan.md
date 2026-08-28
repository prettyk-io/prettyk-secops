# Исследование: Новая админка PrettyK — PoC Plan

> **Plan Mode · 23 августа 2026 · Сессия: Максим (Keeper), Boss (Luna), Flash (Gemini), Keeper (DeepSeek)**
> Статус: research + PoC planning. Не канон. Ждёт обсуждения и 2FA.

---

## 0. Сдвиг парадигмы: PrettyK = Двухуровневая продуктовая линейка (Wedge Strategy)

Ключевое стратегическое решение: **разделение на два самостоятельных продукта с общей технологической базой.**

### 0.1 Продуктовая матрица и ценовое позиционирование

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ЕДИНОЕ ЯДРО (PLAYWRIGHT CORE + DSL)                   │
├──────────────────────────────────────┬──────────────────────────────────────┤
│  ⚡ PRETTYK AUTOMATION LAB           │  🛡️ PRETTYK SECOPS LAB               │
│  (Входной продукт / «Wedge»)         │  (Enterprise / High-Ticket)          │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • Для кого: QA, SDET, DevOps         │ • Для кого: ИБ, AppSec, CISO, Финтех │
│ • Задачи: E2E, smoke, регрессия,     │ • Задачи: DAST, фаззинг, scanner, Dojo,  │
│   скрапинг, синтетический мониторинг │   политики гейтов, аудит уязвимостей │
│ • Состав: Runner + Canvas + DSL +    │ • Состав: Всё из Automation +        │
│   Discovery + Dashboard результатов  │   scanner demon + Dojo + Allure + Vault  │
│ • Вес: Минимальный (<100 MB),        │ • Вес: Полный compose-стек           │
│   без Java/scanner/Dojo тяжестей         │   с ИБ-сервисами                     │
│ • Цена: Бросовая / сверхдоступная    │ • Цена: Премиальный Enterprise       │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### 0.2 Троянский конь (GTM / Land & Expand): «Write once in QA, scan in SecOps»

1. **Вход (Land):** QA-отдел покупает Automation Lab по бросовой цене, потому что им нужен быстрый, удобный Canvas-автотестер на Playwright с локальным Discovery Engine без драконовских подписок SaaS.
2. **Синергия:** QA пишут сотни сценариев на нашем DSL (`wired.json`).
3. **Экспансия (Expand):** Безопасники компании видят, что все пользовательские пути уже оцифрованы в PrettyK, и апгрейдятся до **SecOps Lab**, чтобы навешивать DAST-сканирование прямо на готовые тесты QA без дублирования работы.

---

## 1. Тезисы Максима (verbatim)

1. Старая админка — хлам. Бекапим, выдираем полезное, остальное утилизируем без жалости.
2. Новая админка — минимум 2-уровневая.
3. **Уровень 1 (Admin ИБ):** нарезать болванки и assign на юзеров. Концепт нарезания надо обдумать — нужен ли он нам?
4. **Уровень 2 (Control Panel / admin_service):** инфра-админка, настройка всей коробки.
5. Уровни не обязаны быть вместе. Проще — 2 разные админки.
6. Возможно, на разных движках. Коробка ~300 МБ — похуй, влезет.
7. **Уровень 3 (Dashboard / test results):** именно test results, не админка.
8. **Automation Lab:** расширение на автотесты (не только SecOps). Конкуренты: aqua-cloud.io. Чем мы лучше? Не греем ли космос?

---

## 2. Что нашли в кодовой базе и доках

### 2.1 Текущая админка (antd, 13 секций)

Файл: `cosmo/src/admin/AdminLayout.tsx`
Секции: Overview, Integrations, Runs, Apps, Registry, Evidence, Findings, Policies, Retention, Dojo-Sync, Auth-Vault, Delta, Notify.

**Что реально работает (бэкенд):**
- `OverviewPage` — KPI-карточки, severity-статистика
- `DeployRegistry` — реестр деплоев
- `EvidencePanel` — evidence-карточки с Dojo/Allure/scanner
- `DojoFindingsTable` — таблица находок Dojo
- `PoliciesPanel` — политики gate (read-only)
- `RunsPage` — прогоны
- `DojoSyncManager` — ручной sync Dojo
- `RetentionPanel` — очистка (UI на antd, **ждёт ADM-V2**)
- `AuthVaultPanel` — vault токенов

**Что надо выдрать (логика, не UI):**
- `deployStore.ts` — управление деплоями
- `buildWiredFromDeploy.ts` — генерация болванки из деплоя
- `collectAdminRuns.ts` — сбор прогонов
- `adminApi.ts` — прослойка API к Live
- `deriveProgramKpi.ts` — KPI-метрики
- `applyDojoProgram.ts` — маппинг Dojo → деплои
- `syncEvidenceFromLive.ts` — синк evidence
- `notifyRules.ts` — правила оповещений

**Что НЕ выдирать (чистый antd, утилизировать):**
- Весь ProLayout, AdminLayout, PageContainer
- Все UI-компоненты на antd (Table, Card, Descriptions, ProCard, etc.)

### 2.2 Концепты в доках, найденные по поиску

| Термин | Найден? | Где |
|---|---|---|
| **Control Panel** | ❌ НЕТ | Ни в одном файле |
| **Automation Lab** | ❌ НЕТ | Ни в одном файле |
| **Dashboard** | ⚠️ Только иконка | `DashboardOutlined` в меню админки |
| **admin_service** | ✅ ЕСТЬ | `auth-roles.md` — заглушка, инфра-админ |
| **2-уровневая админка** | ❌ НЕТ | Только split на 4 shells |
| **Болванка / blank** | ✅ ЕСТЬ | `buildWiredFromDeploy.ts`, ADM-BLANK-1 |

**Ролевая модель (5 ролей, канон):**
- `admin_sec` — нарезает болванки, полный доступ
- `admin_abnormal` — админ портала, emergency scan
- `admin_service` — **заглушка**, инфра-админ без бизнес-логики
- `sec_expert` — исполнитель проверок
- `user` — read-only наблюдатель

### 2.3 ADM-V2 и Retention

В `docs/friend-requests/README.md` зафиксировано:
> `RETENTION-AND-CLEANUP` — бэкенд готов, старый antd-UI убит → ждёт ADM-V2

---

## 3. Research индустрии: конкуренты в AI-based test automation

### 3.1 aqua cloud (aqua-cloud.io)
- **Тип:** ALM (Application Lifecycle Management) с AI
- **AI-фичи:** Генерация тест-кейсов из требований (NLP), 40% не требуют правок человека
- **Стек:** SaaS, коммерческий
- **DSL:** По публичным материалам не подтверждён открытый consumer-agnostic DSL. Видны ALM/NLP и тест-кейсный слой; конкретный внутренний формат исполнения нельзя приравнивать к отсутствию DSL.
- **Клиенты:** Google, немецкое правительство
- **Оценка:** 4.5/5 на G2/Capterra

### 3.2 Другие игроки
| Инструмент | Специализация | DSL | Ключевая фича |
|---|---|---|---|
| aqua cloud | ALM с AI | Публичный DSL не подтверждён; NLP/тест-кейсы | Генерация тест-кейсов из требований |
| Perfecto Scriptless | No-code automation | Scriptless/model-based, публичный контракт уточнить | Самоисцеляющиеся тесты |
| Testim (Tricentis) | AI-assisted web/mobile | Visual model + custom code; открытый DSL не подтверждён | Smart Locators, self-healing |
| ACCELQ | No-code web/mobile/API | Codeless/natural-language model; не переносимый DSL уровня PrettyK | Широкий охват |
| Applitools | Visual UI testing | Visual checkpoints, не сценарный DSL | AI-сравнение скриншотов |
| Mabl | Low-code automation | Low-code model, открытый DSL не подтверждён | Оптимизация test suite |
| Katalon | Full platform | Сценарии/скрипты и platform-specific model; не тот же контракт | AI-генерация, self-healing |

**Инженерная оговорка:** нельзя честно утверждать, что у конкурентов вообще нет внутренних DSL или промежуточных моделей. По публичному позиционированию у aqua, Testim и ACCELQ видны соответственно ALM/NLP, visual/codeless и natural-language/model-based подходы, но не открыт consumer-agnostic язык уровня PrettyK. Это более точное и проверяемое отличие.

PrettyK имеет **явный consumer-agnostic DSL** (`Type label "Email" $email`, `Click role "button" "Submit"`), который исполняется поверх Playwright и не содержит security-смысла. Для маркетингового заявления потребуется отдельная проверка официальной документации каждого конкурента.

### 3.3 Где PrettyK среди них?

| Ось | aqua / Testim / ACCELQ | PrettyK |
|---|---|---|
| **Публичный DSL/контракт** | NLP, visual/codeless или platform-specific model | ✅ Явный consumer-agnostic DSL |
| **Домен** | Functional test management | DAST + Automation |
| **Модель** | SaaS cloud | **Airgap-коробка** |
| **AI** | Генерация тест-кейсов из требований | QWEN (severity, FP, классификация) |
| **Автоматизация** | Visual/codeless или platform-specific execution | **Playwright Browser Core** + CDP |
| **Отчёты** | Встроенные дашборды | Allure3 + DefectDojo + Live Monitor |
| **Интеграции** | Jira, Jenkins | scanner demon, Dojo, Allure, свой CI |
| **Discovery** | В просмотренных материалах не подтверждено | ✅ Автореверс форм без ручных локаторов |

**Проверяемое отличие PrettyK:**
1. **Airgap.** PrettyK может работать внутри закрытого контура; большинство рассмотренных конкурентов позиционируются как SaaS или hybrid. Это нужно подтверждать по конкретному deployment profile, а не обобщать на весь рынок.
2. **Security + Functional в одном.** aqua не умеет DAST. scanner не умеет test management. Мы умеем оба.
3. **Собственный DSL.** У PrettyK есть открытый consumer-agnostic язык описания сценариев; у проверенных публичных материалов конкурентов такой же уровень переносимого контракта не обнаружен.
4. **QWEN внутри коробки.** Локальная AI-модель, без внешних API.
5. **Discovery Engine.** Автореверс форм без ручных локаторов — ни у кого из конкурентов нет.
6. **Запуск по расписанию / триггеру.** Это целевая capability Automation Lab; у конкурентов обычно используются встроенные scheduler/CI-интеграции, поэтому сравнение нужно делать по конкретному сценарию.
7. **Коробка и airgap.** PrettyK может поставляться внутри закрытого контура; размеры, состав и сравнение с инфраструктурой SaaS нужно подтвердить отдельным release-аудитом.

### 3.4 Automation Lab — не греем космос

**80% фундамента уже есть:**
| Компонент | Уже есть | Что добавить |
|---|---|---|
| Playwright Browser Core | ✅ launch / connectOverCDP / multi-context | Шаблоны функциональных тестов |
| Actions/Probes | ✅ 12 actions + 10 probes, consumer-agnostic | — |
| DSL | ✅ Type, Click, Open, Wait | Расширение на non-security verbs |
| Canvas | ✅ @xyflow/react, Pill-Based | Шаблоны Automation Project |
| Discovery Engine | ✅ автореверс форм, candidate builder | Шаблоны для non-security pages |
| QWEN Assistant | ⚠️ Security-oriented scope | Подключать к functional results только при доказанной пользе |
| Allure3 | ✅ Security reports/trends | Для Automation — опциональный adapter, не обязательная зависимость |
| Live Monitor | ✅ real-time stream | Опциональный Dashboard adapter для automation runs |
| CI/CD | ⚠️ Отдельная интеграционная зона | Не включать в первый vertical slice |

---

## 4. PoC Plan: Новая админка (ADM-V2)

### 4.1 Архитектура: 3 панели вместо 1

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRETTYK BOX (~300 MB, airgap)                         │
├───────────────────┬───────────────────────┬──────────────────────────────────┤
│ SECOPS CONTROL    │ INFRA CONTROL PANEL   │ DASHBOARD (Results)              │
│ (Admin ИБ)        │ (admin_service)       │                                  │
│                   │                       │                                  │
│ • Нарезать        │ • scanner demon status    │ • Test results overview          │
│   болванки        │ • Dojo health         │ • Allure reports                 │
│ • Assign на       │ • Allure service      │ • Run history                    │
│   экспертов       │ • Storage/Retention   │ • Severity trends                │
│ • Gate policies   │ • Auth Vault          │ • Pipeline status                │
│ • Evidence review │ • Integrations        │ • Export/reports                  │
│ • Deploy registry │ • Logs & diagnostics  │                                  │
│                   │                       │                                  │
│ Engine: React Admin │ Engine: React Admin   │ Engine: React Admin              │
│ (MUI core, MIT)    │ (MUI core, MIT)       │ (MUI core, MIT)                  │
│                   │                       │                                  │
│ Route: #/admin    │ Route: #/control      │ Route: #/dashboard               │
│ Role: admin_sec   │ Role: admin_service   │ Role: all (role-filtered)        │
│ + admin_abnormal  │                       │                                  │
└───────────────────┴───────────────────────┴──────────────────────────────────┘
```

### 4.2 Этапы PoC

| Этап | Содержание | Оценка | Кто |
|---|---|---|---|
| **PoC-1** | Бекап и аудит старой админки: сохранить `cosmo/src/admin/` как `legacy/admin-old/`, задокументировать что выдираем | 2h | Boss |
| **PoC-2** | Создать скелет `Control Panel` (Control): shadcn/ui shell, routing `#/control`, доступ только `admin_service` | 3h | Boss |
| **PoC-3** | Перенести Retention в Control: UI на shadcn/ui, API уже готов | 2h | Flash |
| **PoC-4** | Создать скелет `SecOps Control` (`#/admin` новый): shadcn/ui shell, routing, доступ `admin_sec` + `admin_abnormal` | 3h | Boss |
| **PoC-5** | Перенести Deploy Registry + Blank provisioning в SecOps Control | 3h | Flash |
| **PoC-6** | Создать скелет `Dashboard` (`#/dashboard`): shadcn/ui shell, routing, test results overview | 3h | Boss |
| **PoC-7** | Создать `automation-lab.md` — концепт расширения на автотесты (не код, документ) | 2h | Keeper + Boss |
| **PoC-8** | Research: какие ещё AI-testing фичи можем добавить в Automation Lab (сравнение с aqua, Testim, Katalon) | 2h | Keeper |
| **PoC-9** | Интеграционное тестирование: 3 панели живут рядом, не конфликтуют, ролевая модель работает | 2h | Flash |
| | **ИТОГО базового варианта** | **22h** | |

### 4.3 Что НЕ делаем в PoC (out of scope)

- Не пилим полноценную замену всем 13 секциям старой админки
- Не трогаем ResultsWorkspace / Live Monitor / History — они отдельные панели
- Не внедряем Automation Lab в код — только концепт-документ
- Не делаем миграцию данных
- Не подключаем CI/CD интеграции

### 4.4 Стек: бетон (решено 23 авг 2026)

**Админ-панели (Control Panel, SecOps Control, Dashboard):**
- **Движок:** [React Admin](https://marmelab.com/react-admin/) (Marmelab)
- **UI-кит:** Material UI (MUI) — дефолтный UI-кит React Admin, дизайн-система Google
- **Лицензия:** MIT core ($0, коммерческое использование без ограничений)
- **Enterprise-фичи (отложено до первых продаж):** RBAC, Audit Log, Scheduler, Soft Delete — €145/мес или допиливаем сами за ~50 часов. На PoC ставим заглушки.
- **Роутинг:** отдельные hash-роуты: `#/admin`, `#/control`, `#/dashboard`

**Studio, Canvas, War Room, Design Playground:**
- **Движок:** shadcn/ui + Tailwind v4 + @xyflow/react (без изменений)
- Стек творческих поверхностей остаётся прежним — лёгкий, кастомный, pixel-perfect

**Ролевая модель:** использовать существующие 5 ролей, `admin_service` вывести из заглушки
**API:** существующий Live API (`:8767`) + новые эндпоинты по необходимости

---

> **Примечание:** таблица 4.2 — исходная раскладка. Инженерно рекомендуемая последовательность с обязательным contract proof находится в 4.7 и supersedes базовый порядок.

### 4.5 Инженерная оценка Luna: сначала контракт, потом три UI

Три поверхности — это продуктовые границы, а не три независимых runtime. Для PoC не следует размножать движки и копировать бизнес-логику старой Admin.

```text
Единый Browser Core
        ↓
Единый Actions / Probes / DSL / Wired contract
        ↓
Единый runner и envelope результата
        ├── Automation consumer
        └── Security consumer (scanner / fuzzer / Dojo)
```

**Главная гипотеза PoC:** один и тот же сценарный контракт должен запускаться в двух режимах, а различия должны появляться только на уровне consumer и результата. Если для Automation Project потребуется отдельный runtime, это должно быть доказано экспериментом, а не предположено заранее.

### 4.6 Вертикальный срез PoC

Перед миграцией админских экранов добавить минимальный contract proof:

| Срез | Given | When | Then |
|---|---|---|---|
| Automation | Создан Automation Project с `Open → Type → Click → Wait` | Пользователь запускает сценарий | Один общий runner возвращает success/failure, screenshot и logs; scanner/Dojo/Allure не требуются |
| Security | Создан Security Check на тех же базовых действиях | Пользователь запускает проверку | Security consumer добавляет scan-specific findings/gate, не меняя базовый DSL |
| Results | Есть успешный и неуспешный запуск обоих типов | Открыт Dashboard | Видны тип проекта, статус, время, screenshot/log links и понятная причина failure |
| Access | Пользователь имеет одну из ролей продукта | Открыта поверхность | Доступны только разрешённые действия; UI не является единственным механизмом ограничения |

**Go/No-Go gates:**

1. **Contract gate:** два consumer-профиля используют один Wired/Actions contract.
2. **Artifact gate:** Automation даёт полезный результат без security-инфраструктуры.
3. **Boundary gate:** SecOps Control, Control Panel и Dashboard не смешивают ответственность.
4. **Reuse gate:** salvage из legacy переносится как доменная логика/API, а не как копия antd-компонентов.
5. **Scope gate:** после среза отдельно принимается решение, является ли Automation Lab режимом коробки или самостоятельным продуктовым контуром.

### 4.7 Пересмотренная последовательность

| Этап | Содержание | Результат |
|---|---|---|
| **PoC-0** | Два запуска через общий runtime: Automation Project и Security Check | Доказано переиспользование контракта |
| **PoC-1** | Backup/audit legacy Admin и список salvage | Зафиксировано, что сохраняем и что утилизируем |
| **PoC-2** | Skeleton Control Panel для `admin_service` | Видна граница infra-администрирования |
| **PoC-3** | Retention как первая перенесённая capability | Проверен новый UI → существующий API |
| **PoC-4** | Skeleton SecOps Control для `admin_sec`/`admin_abnormal` | Видна граница ИБ-администрирования |
| **PoC-5** | Deploy Registry + blank provisioning | Проверен управляемый поток assign/provisioning |
| **PoC-6** | Dashboard общего результата | Automation и Security не требуют двух несовместимых result models |
| **PoC-7** | Automation Lab concept и шаблоны, без расширения платформы | Решение по go/no-go, а не преждевременный продуктовый взрыв |
| **PoC-8** | Industry validation и проверка конкурентных claims | Claims отделены от гипотез |
| **PoC-9** | Интеграционная проверка трёх поверхностей и ролей | Приёмочный отчёт |

Черновая оценка увеличивается с 22h до **26h** за счёт PoC-0. Это не оценка полной фичи: это цена доказательства, что Automation Lab действительно является вторым consumer-профилем существующей платформы.

### 4.8 Что не строим до прохождения gates

- не делаем три независимых backend/runtime;
- не переписываем все 13 legacy-секций;
- не добавляем полноценный AI test-case generator только ради паритета с aqua;
- не обещаем self-healing, scraping и synthetic monitoring как готовые функции без отдельных acceptance-сценариев;
- не объявляем PrettyK «единственным DSL на рынке» без дополнительной проверки официальных материалов конкурентов;
- **RBAC + Audit Log:** заглушки на PoC. До первого enterprise-чека — либо EE за €145/мес, либо сами за ~50h.

---

## 5. Открытые вопросы для обсуждения

1. **Нужен ли нам уровень «нарезания болванок» (Admin ИБ → assign на экспертов)?** Или пока оставить как есть: эксперт сам создаёт проверку из деплоя?
2. **Достаточно ли dashboard на базе Allure3 или нужен кастомный дашборд для test results?**
3. **Делать ли Control Panel и SecOps Control на одном движке или реально разных (например, React для SecOps, HTMX для Control)?**
4. **Automation Lab — делать ли отдельный продукт внутри коробки или просто режим/флаг существующего SecOps?**
5. **Делать ли отдельный AI-слой для генерации тест-кейсов из требований (как у aqua) или оставаться на ручном DSL + Discovery?**
6. **Какой минимальный automation result envelope нужен, чтобы не притянуть Allure/Dojo в Automation Project?**
7. **Нужен ли assign/provisioning уже в первом PoC или достаточно доказать ручной запуск шаблона?**

---

## Комментарии голов (Luna / Gemini)

### Luna — engineering evaluation

- Не размножать runtime до доказательства необходимости.
- Принимать Automation Lab через вертикальный contract slice, а не через красивый отдельный экран.
- Рассматривать три панели как surfaces с общей доменной логикой и ролями.
- Вынести из legacy только проверенную доменную логику/API; antd-UI не является активом.
- Отделять подтверждённые competitive facts от маркетинговых гипотез.

### Gemini — UI/UX и creative research

1. **Ментальная модель: «What are you building today?»**
   - Точка входа в проект должна быть предельно ясной: переключатель или стартовая карточка `[ 🛡️ SecOps Check ]` vs `[ ⚡ Automation Flow ]`.
   - Один и тот же холст (@xyflow/react), но контекстная палитра нод: в Automation доступны чистые веб-действия и ассерты; в SecOps появляются probe-чипы (scanner, Fuzzer boundary, Auth check). Пользователю не нужно переучивать моторику.

2. **Три экрана глазами человека (Zero-Clutter Visual Hierarchy):**
   - **Control Panel (`#/control`) — «Машинное отделение» (admin_service):** строго утилитарный, темный телеметрический UI. Здоровье демонов (scanner, Allure, Live), графики памяти, ползунки Retention, статус Vault. Минимум графического шума — максимум статусной ясности.
   - **SecOps Control (`#/admin`) — «Командный мостик» (admin_sec):** управление реестром приложений, политиками гейтов и выдачей болванок. Чистые shadcn-таблицы, бейджи соответствия, аудит-лог. Никаких вложенных таблиц старого antd.
   - **Dashboard (`#/dashboard`) — «Утренний кофе» (для всех ролей):** агрегированный фид результатов. Полиморфная карточка прогона (Polymorphic Run Card): одинаковая шапка (статус, цель, время, автор), но адаптивное тело — скриншот сбоя для Automation либо breakdown уязвимостей для SecOps.

3. **UX-триаж упавшего автотеста (правило 3 секунд):**
   - Инженер при падении должен за 3 секунды увидеть: (1) на каком шаге упало, (2) скриншот в момент ошибки, (3) текст ошибки/локатора. Без прокликивания 5 вкладок.

4. **Единая дизайн-система (shadcn/ui + Tailwind v4):**
   - Полный отказ от громоздкого antd в пользу легких, кастомизируемых компонентов из Design Workbench (16 цветовых тем, субпиксельные бордеры, четкая типографика, мгновенный темный/светлый режим).
