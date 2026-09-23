# PrettyK SecOps — Навигационный реестр (INDEX)

> Jump-table для быстрого поиска: «Какой файл отвечает на мой вопрос?».  
> Архитектурная карта: [`docs/MAP.md`](MAP.md). Операторский роутер: [`AGENTS.md`](../AGENTS.md).

---

## 1. Точки входа и оперативное состояние

| Файл / Путь | На какой вопрос отвечает? |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Кто я, какие правила действуют всегда, границы репозитория и форматы диспетча? |
| [`PROGRESS.md`](../PROGRESS.md) | Что сделано прямо сейчас, сломано ли дерево и что делать следующим шагом? |
| [`opencode.json`](../opencode.json) | Какие модели, провайдеры, правила compaction и references на соседей настроены? |
| [`docs/ONBOARDING.md`](ONBOARDING.md) | Как поднять стенд, проверить порты, распределить модели и не накосячить с гитом? |
| [`docs/MAP.md`](MAP.md) | Как устроена топология компонентов, какие порты слушают и где границы с соседями? |
| [`docs/internal/agent-primer.md`](internal/agent-primer.md) | Каковы базовые принципы Максима, определение DoD живого Editor и лор команды? |

---

## 2. Операционная очередь и бэклог

| Файл / Путь | На какой вопрос отвечает? |
|---|---|
| [`docs/backlog.md`](backlog.md) | Какие задачи сейчас открыты (`QUEUE`), кто исполнитель и каков их статус? |
| [`docs/archive/backlog-archive-2026-08.md`](archive/backlog-archive-2026-08.md) | Какие исторические эпики были успешно завершены в августе 2026? |
| [`docs/feature-routing-backlog.md`](feature-routing-backlog.md) | Как распределяются фичи между коробкой PrettyK и кастомными слоями? |

---

## 3. Продукт, спецификации и стенд

| Файл / Путь | На какой вопрос отвечает? |
|---|---|
| [`docs/prettyk.md`](prettyk.md) | В чём продуктовая суть SecOps Lab, сценариев атак и DAST-автоматизации? |
| [`docs/stand.md`](stand.md) | Какими командами поднимается, проверяется и чистится локальный лабораторный стенд? |
| [`docs/security.md`](security.md) | Какие требования airgap-изоляции и безопасности секретов обязательны? |
| [`docs/development.md`](development.md) | Как вести разработку, запускать тесты и изменять Wired-контракты? |
| [`docs/degenerates.md`](degenerates.md) | Какие эпичные косяки и факапы команда совершала в прошлом и почему так делать нельзя? |

---

## 4. Канон и Святилище (Sanctuary)

| Файл / Путь | На какой вопрос отвечает? |
|---|---|
| [`sanctuary/pure/INDEX.md`](../sanctuary/pure/INDEX.md) | Какой полный список запечатанных истин (FRIEND, SATELLITE, VOID) принят через 2FA? |
| [`sanctuary/ALTAR.md`](../sanctuary/ALTAR.md) | Где записана хроника победы над легаси `scanner-kdt` и вклад братьев оплота? |
| [`sanctuary/pure/stand-port-meta.md`](../sanctuary/pure/stand-port-meta.md) | Каковы точные канонические порты всех служб стенда и правила их проверки? |
| [`sanctuary/pure/rebranding.md`](../sanctuary/pure/rebranding.md) | Как сопоставляются старые термины KDT и новые названия PrettyK? |
| [`sanctuary/pure/ROLE-MATRIX.md`](../sanctuary/pure/ROLE-MATRIX.md) | Какова ролевая модель доступа и прав пользователей внутри коробки? |
| [`sanctuary/pure/pw-browser-core.md`](../sanctuary/pure/pw-browser-core.md) | Как устроен рантайм Playwright Browser Core, сессии и контексты? |

---

## 5. Контракты и машинные интерфейсы

| Файл / Путь | На какой вопрос отвечает? |
|---|---|
| [`orchestrator/models/wired.py`](../orchestrator/models/wired.py) | Какова актуальная Pydantic-схема machine-контракта Wired-сценариев? |
| [`docs/contracts/action-naming.md`](contracts/action-naming.md) | Каков каноничный словарь browser-действий (click/type/wheel/…) и как FE↔BE не разъезжаются? |
| [`docs/wired.json`](wired.json) | Какова устаревшая (legacy) JSON Schema эпохи RJSF (хранится для справки)? |
| [`docs/manifest.md`](manifest.md) | Какова спецификация полей и типов данных манифеста проверок? |

---

## 6. Межпродуктовые мосты и заявки (Friend-requests)

| Файл / Путь | На какой вопрос отвечает? |
|---|---|
| [`docs/friend-requests/README.md`](friend-requests/README.md) | Какие заявки на новые FRIEND-каноны и cross-PO запросы находятся в очереди? |
| [`docs/friend-requests/CP-ADMIN-SEC-DECISION-SURFACE.md`](friend-requests/CP-ADMIN-SEC-DECISION-SURFACE.md) | Где принимается решение go/no-go Администратора ИБ (в QGFCS или коробке)? |
| [`docs/research/2026-09-03-studio-outputs-contract-a-inventory.md`](research/2026-09-03-studio-outputs-contract-a-inventory.md) | Какие реальные форматы данных Studio испускает для Contract A (готовит Aspect)? |
