# ADM-1: Legacy Admin Salvage List

> **Keeper · 23 августа 2026 · ADM-1**
> Источник: аудит `cosmo/src/admin/` (antd-монолит, 13 секций)
> Статус: готово. Передаётся Boss'у для выноса логики и удаления antd UI.

---

## Методология

- **Salvage** — файл содержит чистую доменную логику/API/утилиты, которые должны быть перенесены в новую архитектуру (React Admin + MUI).
- **Discard** — файл является UI-компонентом на antd (ProLayout, ProTable, ProForm, ProCard, etc.) или его тестом. Полная утилизация.
- **Review** — файл требует дополнительного анализа (смешанный UI/логика или неочевидное назначение).

---

## Логика — SALVAGE (выдираем)

Эти файлы содержат бизнес-правила, API-прослойки, вычисления и утилиты. Переносятся в новую админку как есть или с минимальной адаптацией под React Admin data provider.

### Ядро

| Файл | Назначение | Куда в новой админке |
|---|---|---|
| `deployStore.ts` | Управление реестром деплоев: CRUD, статусы, метаданные | SecOps Control — Deploy Registry |
| `adminApi.ts` | API-прослойка к Live (`:8767`): fetch, mutate, error handling | Общий data provider для React Admin |
| `buildWiredFromDeploy.ts` | Генерация Wired-контракта (болванки) из записи деплоя | SecOps Control — Blank provisioning |
| `collectAdminRuns.ts` | Сбор и агрегация прогонов по программе/деплою | Dashboard / SecOps Control — Run history |
| `deriveProgramKpi.ts` | Вычисление KPI: severity, coverage, pass/fail, тренды | Dashboard — KPI-карточки |
| `applyDojoProgram.ts` | Маппинг DefectDojo-программы на деплои | SecOps Control — Dojo Sync |
| `syncEvidenceFromLive.ts` | Синхронизация evidence (скриншоты, логи, scanner-отчёты) из Live | Control Panel — Evidence sync |
| `notifyRules.ts` | Правила оповещений: conditions, channels, throttling | SecOps Control — Notifications |

### Гейты

| Файл | Назначение | Куда в новой админке |
|---|---|---|
| `gatePolicyFingerprint.ts` | Детерминированный отпечаток политики гейта | SecOps Control — Policies |
| `gatePolicySerialize.ts` | Сериализация/десериализация политик | SecOps Control — Policies |
| `adminGateUi.ts` | Логика отображения гейтов (severity→color, статусы) | SecOps Control — Policies UI |
| `deployGateFromVerdict.ts` | Вычисление результата гейта из вердикта проверки | SecOps Control — Gate engine |

### Evidence

| Файл | Назначение | Куда в новой админке |
|---|---|---|
| `evidenceRegistry.ts` | Центральный реестр evidence-пакетов | Контрол Panel / SecOps — Evidence |
| `evidenceTypes.ts` | Типы evidence (scanner, Allure, Dojo, screenshot, log) | Общие типы |
| `pickPrimaryEvidencePack.ts` | Выбор основного evidence-пакета для показа | Dashboard — карточки результатов |
| `evidence/evidenceTypes.ts` | Типы evidence (дубликат? проверить) | Возможно, заменить на основной |

### Dojo

| Файл | Назначение | Куда в новой админке |
|---|---|---|
| `fetchDojoFindings.ts` | Получение находок из DefectDojo API | SecOps Control — Findings table |
| `fetchDojoProgram.ts` | Получение программы/engagement из Dojo | SecOps Control — Dojo Sync |
| `syncAdminDojo.ts` | Синхронизация Admin ↔ Dojo | Control Panel — Dojo status |

### Метрики и утилиты

| Файл | Назначение | Куда в новой админке |
|---|---|---|
| `metricPacks.ts` | Пакеты метрик для разных типов проверок | Dashboard — метрики |
| `loadLiveProgramKpi.ts` | Загрузка KPI программы из Live API | Dashboard |
| `mergeLiveAdminRuns.ts` | Слияние прогонов из Live и Admin | Dashboard / Run history |
| `bulkLinkChecks.ts` | Массовая проверка валидности ссылок на evidence | Control Panel — Health checks |
| `connectorProbe.ts` | Проба доступности коннекторов (scanner, Dojo, Allure) | Control Panel — Health checks |
| `liveFetchHeaders.ts` | Заголовки для Live API-запросов | Общий API-слой |
| `retentionPolicySerialize.ts` | Сериализация retention-политик | Control Panel — Retention |
| `waiverExpiry.ts` | Логика истечения waiver/исключений | SecOps Control — Policies |
| `appCode.ts` | Коды приложений, маппинг имён | SecOps Control — Deploy Registry |
| `defaults.ts` | Дефолтные значения для админских сущностей | Общие константы |
| `types.ts` | TypeScript-типы для всей админки | Общие типы (перенести или адаптировать) |

### Моки и тесты логики

| Файл | Назначение | Решение |
|---|---|---|
| `mockDeploys.ts` | Моковые деплои для разработки/тестов | Salvage — пригодится для PoC |
| `mockEvidencePack.ts` | Моковые evidence-пакеты | Salvage — пригодится для PoC |
| `deployStore.test.ts` | Тесты deployStore | Salvage — с логикой |
| `buildWiredFromDeploy.test.ts` | Тесты buildWiredFromDeploy | Salvage |
| `collectAdminRuns.test.ts` | Тесты collectAdminRuns | Salvage |
| `deriveProgramKpi.test.ts` | Тесты deriveProgramKpi | Salvage |
| `applyDojoProgram.test.ts` | Тесты applyDojoProgram | Salvage |
| `syncEvidenceFromLive.test.ts` | Тесты syncEvidenceFromLive | Salvage |
| `notifyRules.test.ts` | Тесты notifyRules | Salvage |
| `deployGateFromVerdict.test.ts` | Тесты deployGateFromVerdict | Salvage |
| `gatePolicyFingerprint.test.ts` | Тесты gatePolicyFingerprint | Salvage |
| `gatePolicySerialize.test.ts` | Тесты gatePolicySerialize | Salvage |
| `adminGateUi.test.ts` | Тесты adminGateUi | Salvage |
| `connectorProbe.test.ts` | Тесты connectorProbe | Salvage |
| `evidenceRegistry.test.ts` | Тесты evidenceRegistry | Salvage |
| `pickPrimaryEvidencePack.test.ts` | Тесты pickPrimaryEvidencePack | Salvage |
| `waiverExpiry.test.ts` | Тесты waiverExpiry | Salvage |
| `fetchDojoFindings.test.ts` | Тесты fetchDojoFindings | Salvage |
| `syncAdminDojo.test.ts` | Тесты syncAdminDojo | Salvage |
| `mergeLiveAdminRuns.test.ts` | Тесты mergeLiveAdminRuns | Salvage |
| `mockEvidencePack.test.ts` | Тесты mockEvidencePack | Salvage |
| `bulkLinkChecks.test.ts` | Тесты bulkLinkChecks | Salvage |
| `retentionPolicySerialize.test.ts` | Тесты retentionPolicySerialize | Salvage |

### Файлы на REVIEW

| Файл | Почему review | Рекомендация |
|---|---|---|
| `hooks.ts` | Может содержать UI-хуки (antd-специфичные) или чистые data-хуки | Открыть, проверить. Чистые data-хуки → salvage. UI-хуки (useProTable, etc.) → discard. |
| `evidence/evidenceTypes.ts` | Возможный дубликат `evidenceTypes.ts` в корне | Проверить. Если дубликат — discard. Если дополняет — salvage. |

---

## UI — DISCARD (утилизируем)

Эти файлы — чистый antd UI, который полностью заменяется на React Admin (MUI). Никакой код не переносится — только функциональное поведение как reference.

### Главные страницы и оболочки

| Файл | Что это | Замена в ADM-V2 |
|---|---|---|
| `AdminLayout.tsx` | ProLayout: сайдбар, хедер, меню, хлебные крошки | React Admin `<Admin layout={...}>` |
| `AdminProProvider.tsx` | Провайдер antd Pro-компонентов | Не нужен — React Admin сам провайдер |
| `OverviewPage.tsx` | KPI-дашборд: карточки, severity, графики | Dashboard (ADM-6) |
| `RunsPage.tsx` | Таблица прогонов с фильтрацией | Dashboard / SecOps Control |
| `BaselineDelta.tsx` | Таблица сравнения baseline/текущий прогон | Dashboard — диффы прогонов (опционально) |

### Секции (13 секций старой админки)

| Файл | Что это | Замена в ADM-V2 |
|---|---|---|
| `DeployRegistry.tsx` | Реестр приложений | SecOps Control — Deploy Registry (ADM-5) |
| `DojoFindingsTable.tsx` | Таблица находок Dojo | SecOps Control — Findings (ADM-5+) |
| `EvidencePanel.tsx` | Карточки evidence | Dashboard — Evidence section |
| `LogAnomalyStrip.tsx` | Стрип аномалий в логах | Control Panel — Logs (ADM-2+) |
| `LocatorHealthPanel.tsx` | Здоровье локаторов | Control Panel — Health (ADM-2+) |
| `NotifyPanel.tsx` | Панель оповещений | SecOps Control — Notifications |
| `PoliciesPanel.tsx` | Политики гейтов | SecOps Control — Policies |
| `PreflightAdvisoryStrip.tsx` | Preflight-проверки перед запуском | Control Panel — Health checks |
| `sections/RunsPanel.tsx` | Секция прогонов | Dashboard |
| `sections/RetentionPanel.tsx` | Секция очистки (уже замена в ADM-3) | Control Panel — Retention (ADM-3) |
| `sections/ProgramOverview.tsx` | Обзор программы проверок | Dashboard / SecOps Control |
| `sections/PoliciesPanel.tsx` | Секция политик | SecOps Control — Policies |
| `sections/NotifyPanel.tsx` | Секция оповещений | SecOps Control — Notifications |
| `sections/IntegrationsPanel.tsx` | Интеграции (scanner, Dojo, Allure) | Control Panel — Integrations |
| `sections/IntegrationEvidence.tsx` | Evidence интеграций | Control Panel |
| `sections/EvidencePanel.tsx` | Секция evidence | Dashboard |
| `sections/EvidenceCharts.tsx` | Графики evidence | Dashboard |
| `sections/DojoSyncManager.tsx` | Ручной sync Dojo | Control Panel — Dojo status |
| `sections/DojoFindingsTable.tsx` | Таблица находок | SecOps Control |
| `sections/DeployRegistry.tsx` | Реестр деплоев (дубликат) | SecOps Control |
| `sections/DeployCard.tsx` | Карточка деплоя | SecOps Control |
| `sections/AuthVaultPanel.tsx` | Vault токенов | Control Panel — Vault |
| `sections/AppsLedgerPanel.tsx` | Журнал приложений | SecOps Control — Registry |
| `evidence/EvidenceCharts.tsx` | Графики evidence (дубликат) | Dashboard |

### UI-тесты (утилизация)

| Файл |
|---|
| `sections/RunsPanel.test.tsx` |
| `sections/RetentionPanel.test.tsx` |
| `sections/ProgramOverview.test.tsx` |
| `sections/NotifyPanel.test.tsx` |
| `sections/DojoSyncManager.test.tsx` |
| `sections/AppsLedgerPanel.test.tsx` |

---

## Сводка

| Категория | Количество файлов | Действие |
|---|---|---|
| **Логика (Salvage)** | ~45 файлов (.ts + .test.ts) | Перенести в `cosmo/src/admin-v2/logic/` |
| **UI (Discard)** | ~30 файлов (.tsx + .test.tsx) | Удалить после backup'а |
| **Review** | 2 файла | Проверить `hooks.ts` и `evidence/evidenceTypes.ts` |

---

## Порядок действий для Boss'а

1. Создать `legacy/admin-old/` — полный слепок `cosmo/src/admin/`.
2. Вынести salvage-логику в `cosmo/src/admin-v2/logic/` (новая директория).
3. Удалить antd UI из `cosmo/src/admin/`, заменив `AdminLayout.tsx` на заглушку/редирект.
4. Не удалять salvage-логику из оригинальной директории до полной миграции — чтобы не сломать работающие импорты в других частях кодовой базы.
5. После миграции — удалить `cosmo/src/admin/` полностью.