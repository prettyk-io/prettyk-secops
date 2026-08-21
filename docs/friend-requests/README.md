# Friend-requests — inbox заявок на FRIEND

> **Путь:** `docs/friend-requests/`
> **Назначение:** заявка на *будущий* FRIEND или секцию канона — **ready или evolve**.
> **Не цитировать как CANON.** Это inbox перед 2FA.

## Lane

В шапке каждой карточки: `lane: ready` | `lane: evolve`.

| Lane | Смысл | Hub? |
|---|---|---|
| **ready** | Тезис ясный, as-built якорь есть, можно паковать в 2FA | после 2FA |
| **evolve** | Точно про продукт / почти наверняка FRIEND, сыро или секция большего тезиса | нет |

## Бар «не дичь?»

### Ready (все пункты)
1. Один ясный тезис продукта.
2. As-built якорь (код / acceptance / MethodId).
3. Не дубль INDEX / FRIEND; не пересказ QUEUE.
4. Честная «не обещаем».

### Evolve (мягче)
1. Один ясный *будущий* тезис (не wishlist из десяти).
2. Понятно, к какому FRIEND/эпику дозреет (или «новый тонкий FRIEND»).
3. Честная «не обещаем / сыро».
4. Не ломает honest-contract и стены.

## Путь в Святилище

1. Boss присылает verified → Keeper сортирует friend/possible/seeker.
2. Карточка `ready` попадает сюда → ждёт ближайшего 2FA.
3. Keeper с Максимом: беседа → 2FA → зачисление в `sanctuary/canon/`.

## Текущий реестр заявок (19 авг 2026)

### LANDED — код сдан, на 2FA-промоцию в хаб

| Файл | Тезис | Lane |
|---|---|---|
| [`STUDIO-CORE-REDESIGN.md`](STUDIO-CORE-REDESIGN.md) | Реорганизация Студии (Launchpad/Action Hub) | `ready` → LANDED |
| [`STUDIO-EDITOR-SPLIT-ARCHITECTURE.md`](STUDIO-EDITOR-SPLIT-ARCHITECTURE.md) | Сплит Студия↔Редактор, выпил WireK | `ready` → LANDED |
| [`STUDIO-GRAPH-EXPLORER.md`](STUDIO-GRAPH-EXPLORER.md) | Граф-эксплорер сущностей (Node Graph) | `ready` → LANDED |
| [`STUDIO-GRAPH-EXPLORER-P2.md`](STUDIO-GRAPH-EXPLORER-P2.md) | Полировка графа: иконки в хедерах, приклейка углов, ровный канвас | `ready` |
| [`RK-RJSF-KILL-SPLIT.md`](RK-RJSF-KILL-SPLIT.md) | Выпил RJSF + прямой React-маппер | `ready` → LANDED |
| [`SALVAGE-USABLE-CODE.md`](SALVAGE-USABLE-CODE.md) | Добор годноты из to-sanitize | `ready` → LANDED |
| [`IMPX-CONFIG-IMPORT.md`](IMPX-CONFIG-IMPORT.md) | Импорт конфигурации между проверками | `ready` → LANDED |
| [`EDITOR-PREMIUM-STUDIO.md`](EDITOR-PREMIUM-STUDIO.md) | Премиализация Studio/Editor | `ready` |
| [`VN-POL-STUDIO-LADDER.md`](VN-POL-STUDIO-LADDER.md) | Полировка лесенки Студии | `ready` |
| [`VN-IMPORT-EXPORT-AND-POLISH.md`](VN-IMPORT-EXPORT-AND-POLISH.md) | Импорт/экспорт + полиш | `ready` |
| [`LAB-INTRUDER-PRO.md`](LAB-INTRUDER-PRO.md) | Станция атак /lab (Burp Killer) | `ready` → LANDED |
| [`INTRUDER-PRO-ADVANCED-ATTACKS.md`](INTRUDER-PRO-ADVANCED-ATTACKS.md) | 4 режима атак, Grep Match/Extract | `ready` → LANDED |
| [`LAB-ATTACK-SCENARIO-ENGINE.md`](LAB-ATTACK-SCENARIO-ENGINE.md) | Движок сценариев атак /lab | `ready` → LANDED |
| [`LAB-STATION-UX.md`](LAB-STATION-UX.md) | Пересборка UI станции атак (полная архитектура) | `ready` |
| [`AUTH-CHAIN-VAULT.md`](AUTH-CHAIN-VAULT.md) | Pre-flight auth, vault токенов, ZAP Replacer | `ready` → LANDED |
| [`AUTH-VAULT-CHAIN-INJECTOR.md`](AUTH-VAULT-CHAIN-INJECTOR.md) | Инжектор токенов (Auth Vault & Chain) | `ready` → LANDED |
| [`AUTH_ROLES.md`](AUTH_ROLES.md) | Ролевая модель | `ready` |
| [`DEFECTDOJO-AUTO-SYNC.md`](DEFECTDOJO-AUTO-SYNC.md) | Автосинхронизация Dojo | `ready` → LANDED |
| [`DEFECTDOJO-BIDIRECTIONAL-SYNC.md`](DEFECTDOJO-BIDIRECTIONAL-SYNC.md) | Двусторонняя синхронизация Dojo | `ready` → LANDED |
| [`RETENTION-AND-CLEANUP.md`](RETENTION-AND-CLEANUP.md) | Управление диском и очистка | `ready` → LANDED |
| [`BLANK-INLINE-PREVIEW.md`](BLANK-INLINE-PREVIEW.md) | Inline-просмотр акта/бланка | `ready` → LANDED |
| [`ALLURE3-SECOPS-BRAND-AND-INSTANCE.md`](ALLURE3-SECOPS-BRAND-AND-INSTANCE.md) | Allure3 бренд + инстанс | `ready` |
| [`CORPUS-DISCOVERY-ZERO-TOUCH.md`](CORPUS-DISCOVERY-ZERO-TOUCH.md) | Zero-touch корпус discovery | `ready` → LANDED |
| [`DISCOVERY-ENGINE-AX-COMPILER.md`](DISCOVERY-ENGINE-AX-COMPILER.md) | Автореверс форм через CDP AX-Tree в PrettyK wired.json (E1–E3) | `ready` → LANDED |
| [`I18N-LANGUAGE-PACK.md`](I18N-LANGUAGE-PACK.md) | Двуязычный интерфейс (RU / EN) и Language Pack | `ready` |
| [`QWEN3-ALERT-ASSISTANT.md`](QWEN3-ALERT-ASSISTANT.md) | Локальная AI-модель Qwen3-1.7B для анализа алертов | `ready` |
| [`MONACO-DAST-INTELLIGENCE.md`](MONACO-DAST-INTELLIGENCE.md) | Умный Monaco-редактор для DAST (4 фазы) | `ready` |

### Уже в хабе (2FA принят)

BRAND-VIDEO, MONITOR-MAINPAGE-AND-SPACE, MONITOR-HEADER, MONITOR-AUTH-BINDING, MONITOR-RETENTION

### Evolve — Монитор Фаза 2 (дозревают)

5 заявок объединены: SPLIT-VIEW, MULTI-REPLAY, INSTANCE-BINDING, PLAYHEAD, INSTANCE-LINK. Бэкенд готов. Фронтенд дозревает после стабилизации основного контура.

| Файл | Тезис | Lane |
|---|---|---|
| [`MONITOR-SPLIT-VIEW.md`](MONITOR-SPLIT-VIEW.md) | Split view 50/50 в мониторе | `evolve` |
| [`MONITOR-MULTI-REPLAY.md`](MONITOR-MULTI-REPLAY.md) | Мульти-монитор + replay | `evolve` |
| [`MONITOR-INSTANCE-BINDING.md`](MONITOR-INSTANCE-BINDING.md) | Instance-id binding | `evolve` |
| [`MONITOR-PLAYHEAD.md`](MONITOR-PLAYHEAD.md) | Единый playhead | `evolve` |
| [`MONITOR-INSTANCE-LINK.md`](MONITOR-INSTANCE-LINK.md) | Кнопка «Результаты» в Monitor | `evolve` |
| [`RESULT-BLANK-INLINE.md`](RESULT-BLANK-INLINE.md) | Бланки в результатах | `evolve` |

### Evolve — Canon-requests

| [`LAB-INTRUDER-STATION.md`](LAB-INTRUDER-STATION.md) | Станция Intruder /lab (canon-request) | `evolve` |