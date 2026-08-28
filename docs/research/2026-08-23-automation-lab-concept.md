# Automation Lab — Концепт продукта и GTM Wedge

> **Keeper · 23 августа 2026 · ADM-7**
> Соседние документы: [`2026-08-23-admin-poc-plan.md`](2026-08-23-admin-poc-plan.md) · [`2026-08-23-additional-architecture-round.md`](2026-08-23-additional-architecture-round.md)
> Статус: первый черновик. Ждёт обсуждения с Максимом.

---

## 1. Что такое Automation Lab

**Automation Lab — облегчённый продукт PrettyK для функциональной автоматизации без ИБ-инфраструктуры.** Тот же DSL, тот же Canvas, тот же Playwright Browser Core — но без scanner, без DefectDojo, без Allure, без фаззера, без политик гейтов.

Это намеренно урезанная, сверхдоступная версия платформы. Её задача — зайти в QA-отделы, DevOps-команды и к SDET-инженерам, которые никогда не купят полноценный DAST-сканер, но каждый день пишут автотесты.

**Ключевая идея:** QA пишет сотни DSL-сценариев на Automation Lab. Через полгода безопасники видят, что все пользовательские пути уже оцифрованы, и покупают SecOps Lab — навешивают DAST на готовые тесты без единой новой строчки.

---

## 2. Состав продукта

### Что входит (Common Core, минимальный профиль)

| Компонент | Описание |
|---|---|
| **Playwright Browser Core** | Launch, connectOverCDP, multi-context — единый с SecOps Lab |
| **Actions / Probes** | 12 actions + 10 probes, consumer-agnostic |
| **Common DSL / Wired** | Единый язык сценариев: `Type`, `Click`, `Open`, `Wait`, `Assert` |
| **Canvas (@xyflow/react)** | Визуальный редактор сценариев с pill-based конструктором |
| **Discovery Engine** | Автореверс форм, candidate builder — без ручных локаторов |
| **Runner** | Запуск сценариев, результат: success/failure + screenshots + logs + video |
| **Dashboard результатов** | Фид прогонов: статус, время, скриншот падения, пошаговый лог |
| **Schedules / Triggers** | Запуск по расписанию или webhook |
| **CLI / CI-интеграция** | Запуск из Jenkins, GitLab CI, GitHub Actions |

### Что НЕ входит (только в SecOps Lab)

| Компонент | Почему не здесь |
|---|---|
| scanner demon | Только security-контур |
| Fuzzer (Sniper/Pitchfork/Cluster Bomb) | Только security-контур |
| DefectDojo | Только security-контур |
| Allure3 Threat Reports | В Automation заменяется на screenshots + logs + видео |
| Auth Vault | В Automation — базовый env/secrets, без цепочек токенов |
| Blank Templates + Assignments | Automation — user-driven, без admin provisioning |
| Security Policies / Gates | Не нужны без security findings |
| RBAC + Audit Log | Заглушки до enterprise-продаж |

---

## 3. Целевые сегменты

| Сегмент | Кто | Боль | Что даёт Automation Lab |
|---|---|---|---|
| **QA-отделы** | Manual QA, Automation QA, QA Lead | Selenium тормозит, SaaS дорого, CI-интеграция — боль | Playwright-раннер в airgap-коробке, Canvas без кода, Discovery Engine для локаторов |
| **DevOps / SRE** | DevOps-инженеры, Platform Engineers | Синтетический мониторинг сложен, health checks на bash | Schedules/Triggers для регулярных health-проверок, CLI для CI |
| **SDET** | Разработчики в тестировании | Нужен программируемый DSL, а не codeless-магия | Common DSL на Playwright, CI-native, без вендорского лока |
| **Малый бизнес / Стартапы** | CTO, Tech Lead | Нет бюджета на SaaS типа aqua ($500–2000/мес) | Бросовая цена, airgap, свой железный ящик |

---

## 4. Ценовое позиционирование

```
⚡ PRETTYK AUTOMATION LAB          🛡️ PRETTYK SECOPS LAB
─────────────────────────────────  ─────────────────────────────────
Цена: бросовая / сверхдоступная    Цена: Enterprise, взрослый чек
Вес: <100 MB (без Java, scanner, Dojo) Вес: полный compose-стек
Покупатель: QA Lead, DevOps        Покупатель: CISO, AppSec, Финтех
Ценность: скорость + airgap        Ценность: compliance + security
```

**Стратегия:**

1. **Automation Lab:** цена на грани себестоимости. Цель — не прибыль здесь, а захват рынка. Выдавить SaaS-конкурентов (aqua, Testim) ценой и airgap.
2. **SecOps Lab:** взрослый Enterprise-чек. Цель — прибыль. Апгрейд с Automation Lab должен быть бесшовным: тот же DSL, те же сценарии, просто включили scanner/Dojo/Allure.

---

## 5. Профили поставки

```yaml
# docker-compose.automation.yml — минимальный профиль
services:
  live:
    image: prettyk-live:latest
    ports: ["8767:8767"]
  frontend:
    image: prettyk-frontend:automation-lab
    ports: ["5173:80"]
    profiles: ["automation"]

# docker-compose.secops.yml — полный профиль
services:
  live:
    image: prettyk-live:latest
  frontend:
    image: prettyk-frontend:prettyk-lab
  scanner-demon:
    image: scanner-demon:latest
    ports: ["8080:8080"]
  dojo:
    image: defectdojo:latest
  allure:
    image: allure3:latest
    profiles: ["secops"]
```

Один монорепозиторий, разные профили запуска. Automation Lab поднимается за секунды и ест 100 MB RAM. SecOps Lab — полный контур.

---

## 6. GTM: Land & Expand (подробный сценарий)

### Фаза 1: Land (вход через QA)

1. QA-отдел компании «Сбертех» ищет инструмент для автотестов.
2. Видит конкурентов: aqua ($500/мес/пользователь, облако), Testim (SaaS, дорого), Selenium (сложно, нет DSL).
3. Находит PrettyK Automation Lab: **$X разово, airgap-коробка, Playwright, Canvas, Discovery Engine.**
4. Покупает 5 лицензий, ставит коробку в своём контуре.
5. За 2 недели QA-инженеры описывают **200+ DSL-сценариев** для всех критичных пользовательских путей: логин, оплата, профиль, корзина, API-шлюз.

### Фаза 2: Expand (апгрейд до SecOps)

1. Через квартал приходит плановая проверка ИБ. CISO спрашивает: «Как тестируете безопасность веб-приложений?»
2. QA Lead отвечает: «У нас все пользовательские пути уже оцифрованы в PrettyK. 200+ сценариев на DSL.»
3. CISO покупает **SecOps Lab** — полную лицензию.
4. Тот же DSL, те же сценарии. Разница: добавился scanner consumer, Dojo, Allure threat reports, политики гейтов.
5. **Ноль дублирования работы. Ноль нового онбординга.** Безопасники получили полный DAST-контур на готовых тестах QA.

### Почему конкуренты не могут это повторить

| Конкурент | Проблема |
|---|---|
| aqua, Testim, ACCELQ | Только functional testing. Не умеют DAST. Мост QA→ИБ невозможен. |
| scanner, Burp, Acunetix | Только security testing. Не умеют functional automation. Нет общего DSL. |
| **PrettyK** | **Один DSL на оба продукта. Airgap. Wedge strategy: дешёвый вход → дорогой апгрейд.** |

---

## 7. Отличия от SecOps Lab (таблица для маркетинга)

| | Automation Lab | SecOps Lab |
|---|---|---|
| **Для кого** | QA, SDET, DevOps | CISO, AppSec, Финтех |
| **Создание сценариев** | User-driven (инженер сам) | Admin-governed (blank → assign) |
| **DSL / Canvas / Discovery** | ✅ | ✅ |
| **Playwright Browser Core** | ✅ | ✅ |
| **Schedules / CI** | ✅ | ✅ |
| **scanner DAST** | ❌ | ✅ |
| **Fuzzer (Sniper/Pitchfork)** | ❌ | ✅ |
| **DefectDojo** | ❌ | ✅ |
| **Allure3 Security Reports** | ❌ | ✅ |
| **Политики гейтов** | ❌ | ✅ |
| **Auth Vault (цепочки)** | ❌ | ✅ |
| **RBAC / Audit Log** | Заглушки | ✅ (Enterprise) |
| **Поставка** | Лёгкий compose | Полный контур |
| **Цена** | Бросовая | Enterprise |

---

## 8. Открытые вопросы (требуют решения Максима)

1. **Конкретная цена Automation Lab?** Бросовая — это $99, $199, $499 разово? Или freemium?
2. **Название продукта?** PrettyK Automation Lab? PrettyK Studio? PrettyK Lite?
3. **Лицензирование:** per-seat (как конкуренты) или per-instance (разовая покупка коробки)?
4. **Нужен ли trial/community edition?** Бесплатная версия на 1 проект/1 пользователя для ознакомления?
5. **Automation Lab — отдельный репозиторий/бандл или один монорепо с профилями?** Luna рекомендует один монорепо с профилями docker-compose.
6. **RBAC/Audit Log для Automation Lab?** Сейчас заглушки. Пригодятся ли вообще для non-security продукта?