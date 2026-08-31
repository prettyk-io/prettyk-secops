# 🏛️ Cosmoport 2.0: Dual-Surface UI Architecture
# (Operator Control Station & Sovereign Web IDE)

> **Статус:** Architectural Vision & Design Synthesis (Gemini Magic Touch).  
> **Дата:** 28 августа 2026.  
> **Контекст:** Discovery старого Cosmoport (`D:\cosmo\`), анализ 80+ таблиц, 14 документов ТЗ, опыт работы PrettyK Editor (`frontend/`) и канонические принципы Обители.  
> **Главный тезис:** *«Операторскому Control Plane — плотный реляционный контроль (MUI); Инженерному редактору — эргономичный и быстрый Web IDE (Tailwind + Monaco + xterm)»*.

---

## 1. Концепция двух поверхностей (The Dual-Surface Paradigm)

Попытка натянуть единый UI-фреймворк на принципиально разные задачи — частая ошибка корпоративных платформ. Старый Cosmoport 1.0 страдал именно от этого: Ant Design пытались использовать и как таблицу аудита, и как редактор шагов ЖЦ, и как просмотрщик логов, получая медленный и неудобный комбайн.

В **Cosmoport 2.0** интерфейс разделен на **две суверенные, но бесшовно связанные рабочие поверхности**:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               PrettyK Cosmoport 2.0                                    │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│   SURFACE A: OPERATOR CONTROL STATION    │          SURFACE B: SOVEREIGN WEB IDE       │
│                                          │                                             │
│   • Назначение: Run & Security Control   │   • Назначение: Pipeline & DSL Authoring    │
│   • Кто работает: Оператор ИБ, Релизник  │   • Кто работает: Инженер безопасности, Dev │
│   • Парадигма: Workflows, Gates, Audits  │   • Парадигма: Code, Tree, Diff, Terminal   │
│   • Стек: MUI Core + Data Grid + xyflow  │   • Стек: Tailwind v4 + Radix + Monaco      │
│   • Характер: Белый, плотный, табличный  │   • Характер: Темный, стеклянный, IDE-grade │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
                                  │                       ▲
                                  │   Context Jump        │
                                  └─── (Deep-Linking) ────┘
```

---

## 2. Архитектура Поверхности А: Operator Control Station

### 2.1. Назначение и визуальный характер
Control Station — это пункт управления полетами (Mission Control Deck) для безопасной разработки и релизных контуров. Здесь оператор контролирует жизненный цикл десятков приложений, оценивает результаты сканирования, подписывает гейты допуска и запускает межзонные трансферы.

- **Основной стек:** `React 18 + TypeScript + Vite + MUI Material + MUI X Data Grid + @xyflow/react + Zustand + SSE`.
- **Тема:** `Meta Light` / белая тема — **default для Cosmoport**. `Meta Dark` остаётся доступным переключаемым режимом, но не является лицом продукта.
- **Визуальный стиль:** Информационная плотность уровня Bloomberg Terminal / Grafana Enterprise. Белые поверхности, холодные серые границы, строгая типографика, контрастные status-плашки, мгновенная фильтрация тысяч записей через виртуализированный Data Grid.

### 2.2. Канонический Layout Control Station

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [🏛️ COSMOPORT]  Domain: [КИТС Платежи ▼]  Env: [ЗР (Dev) ▼]   Active Runs: (3)   👤 sec_expert   │
├──────────────┬───────────────────────────────────────────────────────────────────────────────────┤
│ 📂 Домены    │ 📊 APPLICATION: Core Banking Gateway (Level 1 / ppod)           [ ▶ Запустить Run ]│
│ 📱 Приложения│ ┌───────────────────────────────────────────────────────────────────────────────┐ │
│ ⚡ Пайплайны │ │ Status: 🟢 ACTIVE | Grade: 🛡️ GOST-56939 | Last Run: #1042 (Gate Blocked)     │ │
│ 🚀 Прогоны   │ └───────────────────────────────────────────────────────────────────────────────┘ │
│ 🛑 Гейты (2) │ [ Обзор ] [ Сборки ] [ Деплои ] [ Релизы ] [ LC Шаги ] [ Интеграции ] [ Журнал ] │
│ 📦 Каталог   ├───────────────────────────────────────────────────────────────────────────────────┤
│ 🛡️ Аудит     │ 📋 RUNS HISTORY (MUI X Data Grid Virtualized)                                     │
│ ⚙️ Настройки │ ┌───────┬────────────┬──────────────┬───────────────┬─────────────┬────────────┐ │
│              │ │ Run ID│ Commit     │ Pipeline     │ Security Gate │ Findings    │ Actions    │ │
│              │ ├───────┼────────────┼──────────────┼───────────────┼─────────────┼────────────┤ │
│              │ │ #1042 │ a9f4c1 (dev│ DAST+SAST+Fuz│ 🔴 BLOCKED    │ 2 Crit, 5 H │ [🔎 Обзор] │ │
│              │ │ #1041 │ 8e12b0 (dev│ Quick-Smoke  │ 🟢 PASSED     │ 0 Crit, 1 L │ [🔎 Обзор] │ │
│              │ │ #1040 │ 3c77a9 (rel│ Full-Release │ 🟡 MANUAL_REQ │ 1 High      │ [✍️ Sign]  │ │
│              │ └───────┴────────────┴──────────────┴───────────────┴─────────────┴────────────┘ │
│              │                                                                                   │
│              │ 🛑 GATE INSPECTOR: Run #1042                                                      │
│              │ ┌───────────────────────────────────────────────────────────────────────────────┐ │
│              │ │ Violation: SQLi in /api/v1/auth (CVSS 9.8) -> Evidence: screenshot_01.png     │ │
│              │ │ Trigger: CorpusFuzzer (Rule: SEC-SQLI-04)   Artifact: S3::pk/ev/har_1042.json │ │
│              │ │ [ 📝 Перейти к коду в Web IDE ]   [ 🛡️ Override (Требуется 2FA) ]              │ │
│              │ └───────────────────────────────────────────────────────────────────────────────┘ │
└──────────────┴───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Архитектура Поверхности B: Sovereign Web IDE

### 3.1. Назначение и перенос Editor
Web IDE — это среда прямого действия для инженера безопасности и пайплайн-разработчика. Мы портируем наше зрелое ядро `prettyk-editor`:
- Редактирование сценариев **PrettyK DSL** (с live-компилятором и sugar-подсветкой);
- Редактирование манифестов пайплайнов (`.cosmo/pipelines/*.yaml`);
- Редактирование шагов ЖЦ (LC Steps) и правил гейтов;
- Встроенный терминал с прямым доступом к воркер-контейнерам и рантайму;
- Интеграция с Git-форджами (Gitea / GitLab) через **ForgeAdapter**.

- **Основной стек:** `React 18 + Tailwind CSS v4 + Radix UI (shadcn) + Monaco Editor + @xterm/xterm + Lucide Icons`.
- **Визуальный стиль:** Глубокий темный холст (`#090d16` / `#131b2e`), акцентный кибер-неон (Amber/Cyan), ультратонкие границы (`border-slate-800`), кастомные сплит-панели с памятью геометрии, статус-бар IDE.

### 3.2. Канонический Layout Web IDE

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [⬅️ В Control Station]   repo: banking-core / branch: feat/secops-fuzz   [ 💾 Commit & Push ]     │
├────┬───────────────┬───────────────────────────────────────────────────────────────┬─────────────┤
│ 📄 │ EXPLORER      │ 📝 secops_pipeline.wire  ✖  📄 lc_config.json                 │ ⚡ ACTIONS  │
│ 🌿 │ ▾ .cosmo/     ├───────────────────────────────────────────────────────────────┤ [▶ Compile] │
│ 🔍 │   pipeline.yml│ 1  # PrettyK SecOps Wire Definition                           │ [🚀 Run Lab]│
│ ⚙️ │ ▾ scenarios/  │ 2  Сценарий: Проверка авторизации и инъекций                  │ [🔍 Fuzz]   │
│ 🖥️ │   auth.wire   │ 3  Контур: "https://auth.bank.local"                          │             │
│    │ ▶ payment.wire│ 4                                                             │ 📊 AST/IR   │
│    │   api.wire    │ 5  [▶] ОткрытьСтраницу "/login"                               │ • 4 steps   │
│    │ ▾ reports/    │ 6  [▶] ЗаполнитьПоле "#user", "admin"                         │ • 2 gates   │
│    │   findings.sar│ 7  [▶] ЗаполнитьПоле "#pass", "{{fuzz.sqli.payload}}"        │ • 0 errors  │
│    │               │ 8  [▶] НажатьКнопку "#submit"                                 │             │
│    │               │ 9  [▶] ПроверитьОтсутствие "Internal Server Error 500"        │ 📦 BRICKS   │
│    │               │                                                               │ + DAST-ZAP  │
│    │               │                                                               │ + Playwright│
├────┴───────────────┴───────────────────────────────────────────────────────────────┴─────────────┤
│ 🖥️ TERMINAL (xterm.js / node-pty session)                                           [ ▲ Collapse ]│
│ prettyk-worker@lab-01:~$ py.test orchestrator/tests/test_wire_runctl.py -q                     │
│ .................. [100%] -- 18 passed in 0.42s (Playwright CDP Connected :9222)               │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🟢 Ready | LF | UTF-8 | PrettyK DSL v2 | SHA: a9f4c1 | 🛡️ Gate Policy: Strict GOST             │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Изоляция стилей: MUI Core и Tailwind v4 без конфликтов

Чтобы обе поверхности мирно и надежно жили в едином React SPA, соблюдаются строгие правила разделения стилей:

```text
                               ┌─────────────────────────────┐
                               │     Cosmoport App Root      │
                               └──────────────┬──────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
     ┌─────────────────────────────┐                     ┌─────────────────────────────┐
     │   ControlStationBoundary    │                     │       WebIDEBoundary        │
     │   (Scoped MUI Theme)        │                     │   (Scoped Tailwind Canvas)  │
     ├─────────────────────────────┤                     ├─────────────────────────────┤
     │ • CssBaseline: Scoped       │                     │ • Tailwind: Utility Scoped  │
     │ • Components: @mui/material │                     │ • Components: Radix/shadcn  │
     │ • Data: MUI X Data Grid     │                     │ • Editor: Monaco Editor     │
     │ • DAG: @xyflow/react        │                     │ • Shell: @xterm/xterm       │
     │ • Typography: IBM Plex Sans │                     │ • Typography: JetBrains Mono│
     └─────────────────────────────┘                     └─────────────────────────────┘
```

### 4.1. Железные правила изоляции:
1. **Preflight Guard:** Глобальный CSS reset (Preflight) от Tailwind **отключается** или изолируется под селектором `.cosmo-ide-root`. Он не должен ломать нативные отступы, инпуты и таблицы MUI.
2. **Scoped CssBaseline:** `CssBaseline` от MUI оборачивает исключительно контейнер `.cosmo-control-station`.
3. **Единая шина Design Tokens (CSS Variables):**
   Обе системы используют единые CSS-переменные для статусных цветов и фонов:
   - `--pk-status-passed: #10b981;`
   - `--pk-status-failed: #ef4444;`
   - `--pk-status-blocked: #f59e0b;`
   - `--pk-status-running: #06b6d4;`
   - `--pk-bg-canvas-light: #f8fafc;`
   - `--pk-bg-surface-light: #ffffff;`
   - `--pk-border-subtle-light: #cbd5e1;`
   - `--pk-bg-canvas-dark: #090d16;`
   - `--pk-bg-surface-dark: #111827;`
   - `--pk-border-subtle-dark: #1f2937;`

---

## 5. Интерактивные мосты: Deep-Linking между поверхностями

Главная сила разделения — в мгновенной навигации между анализом и исправлением:

### Сценарий 1: От упавшего Security Gate в код
```text
[Control Station: Finding #42 (SQLi)] 
       │ 
       ▼ Клик: "Исправить в Web IDE"
[Web IDE] открывает repo -> scenarios/auth.wire -> строка 7 (подсвечена курсором)
```

### Сценарий 2: От коммита в пайплайн к мониторингу
```text
[Web IDE] Инженер правит pipeline.yml -> жмет [Commit & Run]
       │ 
       ▼ Всплывает HUD-нотификация: "Run #1043 запущен"
[Control Station] Live SSE переключается на визуализатор DAG прогона #1043
```

### Сценарий 3: Настройка LC-шагов ЖЦ
```text
[Control Station: LC Steps Config] 
       │ 
       ▼ Клик: "Редактировать как JSON/DSL"
[Web IDE] открывает редактор конфигурации с JSON-Schema валидацией и Monaco автокомплитом
```

---

## 6. План портирования существующего Editor

Наш существующий `prettyk-editor` переносится в качестве модуля `frontend/src/cosmo/ide/`:

| Компонент из текущего `frontend/` | Куда переходит в Cosmoport Web IDE | Требуемые доработки |
|---|---|---|
| `Monaco` конфигурация + Sugar | `cosmo/ide/editor/MonacoWireEditor.tsx` | Подключение схем для `.cosmo/pipeline.yaml` |
| `DiscoveryOverlay.tsx` | `cosmo/ide/overlays/DiscoveryOverlay.tsx` | Привязка к API сессий Discovery |
| `terminal-gateway.ts` + `xterm` | `cosmo/ide/terminal/CosmoTerminal.tsx` | Поддержка мульти-сессий для воркеров |
| `export_keywords.py` / `method_ids` | `orchestrator/cosmo/dsl/` | Экспорт грамматики в Web IDE build-step |
| `local.ps1` CDP Bridge | `cosmo/ide/browser/LiveBrowserViewport.tsx`| Отображение CDP-стрима внутри сплит-панели |

---

## 7. Этапы реализации (DoD Milestones)

### Этап 1: Layout & Style Boundaries (Flash)
- [ ] Настроить CSS-изоляцию: MUI Scope для Control Station, Tailwind Scope для Web IDE.
- [ ] Реализовать верхний Header с переключателем поверхностей и сохранением контекста (`domain_id`, `app_id`, `run_id`).

### Этап 2: Web IDE Core Port (Flash + Luna)
- [ ] Перенести Monaco Editor и xterm в модуль `cosmo/ide/`.
- [ ] Подключить моковый ForgeAdapter (файловое дерево + просмотр + сохранение).
- [ ] Реализовать панель быстрых действий (Compile DSL, Trigger Run).

### Этап 3: Control Station Core Views (Flash)
- [ ] Реализовать экраны Applications (MUI X Data Grid) и Runs History.
- [ ] Реализовать Pipeline DAG Viewer на `@xyflow/react`.
- [ ] Реализовать Gate Decision Inspector и Evidence Viewer.

### Этап 4: Deep-Linking & Live Telemetry (Boss + Flash)
- [ ] Сквозная навигация: Finding / Gate -> строка в Monaco Web IDE.
- [ ] SSE-интеграция: статус прогона и логи в статус-баре Web IDE и дашборде Control Station.

---

*Документ утвержден в архиве проектных решений Обители. Фундамент заложен.*
