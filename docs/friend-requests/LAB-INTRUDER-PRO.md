# FRIEND-REQUEST: LAB-INTRUDER-PRO — Отдельная станция атак /lab (Burp Killer) & Вынос фаззинга из Studio

> **Статус:** `lane: ready`  
> **Дата:** 17 августа 2026  
> **Инициатор:** Максим (Владелец)  
> **Архитектура:** Keeper (PO / CTO)  
> **Исполнитель:** Одна выделенная обезьяна (End-to-End: от UI до бэка)  
> **Профиль:** `secops-lab-pure` (Default Коробка)  

---

## 1. Проблема и Архитектурный Замысел

### Проблема:
Фаззинг и станция атак (Burp Intruder / Fuzzer) были противоестественно втиснуты внутрь `Studio` (где пишутся DSL-сценарии страниц). Это засоряло Редактор, усложняло верстку и превращало полноценный инструмент пентеста в тесную боковую вкладку.

### Замысел:
1. **Фаззинг выносится из Студии полностью**. Студия остаётся только для DSL-кодинга и базовых форм модулей/коннекторов.
2. **Создаётся отдельная корневая станция `SecOps Lab` / `Атака и Фаззинг` по роуту `#/lab` (`/lab`)**.
3. **На главной странице (`HomePage`)** между кнопками «История проверок» и «Управление политиками и настройки» (Админка) добавляется полноправная карточка входа:
   - **Иконка:** канонический неоновый хакерский терминал (`home-lab-icon.png`, Cyber Violet `#9333EA` + Cyan `#38BDF8`).
   - **Лейбл:** `Лаборатория атак и фаззинга (Burp Killer)` / `Станция активного тестирования`.
4. **Внутри `#/lab` разворачивается полноразмерная рабочая станция Burp Intruder-killer:**
   - **Target / Request Panel:** ввод сырого HTTP-запроса, расстановка маркеров позиций `§payload§` в один клик.
   - **Attack Types:**
     - `Sniper` (1 словарь по очереди во все маркеры),
     - `Battering Ram` (1 словарь одновременно во все маркеры),
     - `Pitchfork` (словарь N для маркера N синхронно),
     - `Cluster Bomb` (декартово произведение словарей).
   - **Payloads & Encoders:** встроенные словари (SQLi, XSS, SSRF, Path Traversal, Auth Bypass) + кастомные файлы + URL/Base64/Hex энкодинг.
   - **Grep Match & Grep Extract:**
     - Подсветка и фильтрация ответов по сигнатурам (`SQL syntax`, `root:`, `stackTrace`, `Access Denied`).
     - Авто-экстракт токенов и заголовков регулярками/JSON-path.
   - **Live Results Grid:** таблица в реальном времени со статусом HTTP, временем ответа (RTT), длиной (Content-Length), флагами совпадений и встроенным инспектором Request/Response (Raw / Headers / Hex / Render).

---

## 2. Архитектурная Схема Навигации и Экрана

```text
┌────────────────────────────────────────────────────────────────────────┐
│  Pretty< SECOPS ||▶ LAB                              [ Тема ] [ Выход ]│
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ГЛАВНОЕ МЕНЮ (HomePage):                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ⚡ Инициация новой проверки                                    → │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ 📜 История проверок                                            → │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ 🕶️ Лаборатория атак и фаззинга (/lab)                          → │  │  <── НОВАЯ КАРТОЧКА С ИКОНКОЙ
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ ⚙️ Управление политиками и настройки (Админка)                  → │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  Pretty< SECOPS ||▶ LAB   [ ← В меню ]   [ Станция атак: INTRUDER PRO ]│
├───────────────────────────────────┬────────────────────────────────────┤
│  1. TARGET & REQUEST (Сырой HTTP) │  3. LIVE ATTACK RESULTS (Таблица)  │
│  POST /api/v1/login HTTP/1.1      │  [ ID | Payload | Status | Length ]│
│  Host: target.local               │  [  1 | admin'--|    200 |   1420 ]│
│  Authorization: Bearer §token§    │  [  2 | ' OR 1=1|    500 |    890 ]│
│  Body: {"user":"§name§"}          │                                    │
├───────────────────────────────────┼────────────────────────────────────┤
│  2. PAYLOADS & ATTACK CONFIG      │  4. RESPONSE INSPECTOR (Сплит)     │
│  • Attack Type: [ Cluster Bomb ▼ ]│  • Raw HTTP Response               │
│  • Marker 1: SQLi Dictionaries    │  • Grep Match: "SQL syntax error"  │
│  • Marker 2: Wordlists / Numbers  │  • Extracted Tokens: csrf_token    │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## 3. Нарезка задач на одну выделенную обезьяну (End-to-End)

Один исполнитель забирает весь цикл от роутинга до бэкенд-раннера атак:

### Шаг 1: Роутинг и Карточка на HomePage (`LAB-NAV-1`)
- Добавить маршрут `#/lab` в `hashRoute.ts` (`kind: 'lab'`).
- В `AppShell.tsx` пробросить обработку роута `route.kind === 'lab'` с открытием `LabWorkspace`.
- В `HomePage.tsx` между «Историей проверок» и «Админкой» добавить плитку с иконкой `home-lab-icon.png` (хакерский монитор фиолетовый/циановый) и переходом на `#/lab`.

### Шаг 2: Вынос фаззинга из `Studio` (`LAB-CLEAN-STUDIO-1`)
- Убрать кнопку `[Фаззинг]` и всплывающую панель фаззинга из `StudioWorkspace.tsx`.
- Студию оставить в покое — она отвечает за сценарии и Редактор.

### Шаг 3: Полноэкранный воркспейс Станции Атак `LabWorkspace.tsx` (`LAB-UI-CORE-1`)
- Создать полноценный отдельный экран `cosmo/src/lab/LabWorkspace.tsx`.
- Левая колонка:
  - Редактор сырого HTTP-запроса с кнопками «Обернуть в маркер `§`» и «Очистить маркеры».
  - Выбор типа атаки (`Sniper`, `Battering Ram`, `Pitchfork`, `Cluster Bomb`).
  - Вкладка словарей: встроенные пресеты (SQLi, XSS, LFI, SSTI, Auth), загрузка своего `.txt`/`.csv`, генератор чисел/строк.
- Правая колонка:
  - Панель запуска: `[ СТАРТ АТАКИ ]`, пауза, стоп, прогресс-бар, RPS.
  - Таблица результатов в реальном времени с виртуализацией (быстрый рендер 10 000+ строк).
  - Сплит-просмотрщик выбранного запроса и ответа (HTTP Headers, Body, Grep Match highlight).

### Шаг 4: Бэкенд-движок атак `orchestrator/lab/` (`LAB-BE-ENGINE-1`)
- Реализовать REST API / WebSocket эндпоинты в `orchestrator/utils/live_server.py`:
  - `POST /api/lab/intruder/start` — запуск пула воркеров фаззинга.
  - `GET /api/lab/intruder/stream` (или SSE/WebSocket) — стриминг результатов в реальном времени.
  - `POST /api/lab/intruder/stop` — остановка атаки.
- Генераторы полезных нагрузок на базе `itertools` (ClusterBomb, Pitchfork, Sniper).
- Сборщик Grep Match / Grep Extract.

---

## 4. Стены и Ограничения (Железобетон)
1. **Никаких костылей:** полноценный 독립ный SPA-экран со своим хэш-роутом `#/lab`.
2. **Стили:** строго SecOps Lab Dark (`#0B0F17`, скругления 5–6px, акценты `#9333EA` и `#38BDF8`).
3. **SoT `docs/manifest.json` не трогать:** Lab работает независимо как интерактивная утилита пентеста.
4. **Тесты:** точечные юнит-тесты генераторов атак на Python и компонентов UI.

---

## 5. Delivery Log (Flash, 17.08.2026)

### Готово end-to-end
- **Роутинг & Главная:** `#/lab` в `hashRoute.ts` (`kind: 'lab'`), монтирование `LabWorkspace` в `AppShell.tsx`, карточка «Лаборатория атак и фаззинга (/lab)» с `home-lab-icon.png` между Историей и Админкой.
- **Экран станции** `cosmo/src/lab/LabWorkspace.tsx`: сырой HTTP-запрос, расстановка маркеров `§payload§`, 4 режима атаки (Sniper / Battering Ram / Pitchfork / Cluster Bomb), мульти-словари Payload Sets с пресетами (SQLi/XSS/SSRF/Auth/Boundary), Grep Match/Extract, Live Results Grid + Request/Response Inspector (Raw/Headers/Render).
- **API-клиент** `cosmo/src/lab/labApi.ts`: start/stop/results/detail на `:8767`.
- **Бэкенд-движок** `orchestrator/lab/intruder_engine.py`: генераторы атак (все 4 режима), парсинг raw-HTTP, энкодеры (url/base64/hex), Grep Match/Extract, потокобезопасная сессия.
- **Эндпоинты** в `orchestrator/utils/live_server.py`: `POST /api/lab/intruder/start`, `POST /api/lab/intruder/stop`, `GET /api/lab/intruder/{status,results,detail}`.

### Выпил из Studio
- Из `StudioWorkspace.tsx` удалены кнопка «Фаззинг» и `StudioFuzzPanel` (импорт, state `showFuzzPanel`, JSX). Сами файлы `StudioFuzzPanel*`/`studioFuzzEngine*` остались — не вмонтированы в Студию.

### Правки-сопутствующие
- `orchestrator/lab/intruder_engine.py`: добавлен импорт `Sequence` (был NameError при исполнении сигнатур).
- `cosmo/src/App.tsx`: восстановлен случайно удалённый в чужом WIP state `resourceContents`/`setResourceContents` (иначе `tsc` падал; не мой скоуп, но блокировал гейт).
- `cosmo/src/lab/LabWorkspace.test.tsx`: добавлен `afterEach(cleanup)` (накопление DOM между кейсами).

### Гейт
- `npx tsc --noEmit` — 0 ошибок.
- `py -m pytest orchestrator/tests/test_intruder_engine.py` — 7 passed.
- `npx vitest run src/lab/LabWorkspace.test.tsx src/checks/hashRoute.test.ts` — 5 passed.
- `npx vitest run src/studio/studioFuzzEngine.test.ts src/studio/fuzzing/StudioFuzzPanel.test.tsx` — 9 passed.

