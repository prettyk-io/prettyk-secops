# I18N-LANGUAGE-PACK: Двуязычный интерфейс (RU / EN) и Language Pack

> **Feature Request / Epic.** Profile: `secops-lab-pure`. Lane: `ready`.  
> Добавление полноценной локализации (Русский + English) для всей платформы PrettyK SecOps Suite.  
> Цель: подготовить платформу к показу дизайнеру (Вера), международным аудиторам и демо на VPS (`prettyk.io`).

---

## 1. Контекст и Интент (Зачем)

Сейчас весь интерфейс платформы (Shell, Home, Studio, Form, Results, Admin, Lab) захардкожен на русском языке, а `ThemeProvider` жёстко фиксирует `antd/locale/ru_RU`.

Для демонстрации продукта дизайнеру (Вера / Vaera), внешним заказчикам, деплоя на VPS (`prettyk.io`) и выхода на глобальный рынок нам необходим полноценный **English Language Pack** с моментальным переключением на лету без перезагрузки страницы.

Принцип: **не усложнять, но сделать системно.** Никаких тяжёлых 100-мегабайтных i18n-комбайнов — лёгкий, типизированный словарь ключей с автодополнением TypeScript, React Context и переключателем в шапке.

---

## 2. Архитектура Language Pack

### 2.1. Структура файлов

```
cosmo/src/
├── locales/
│   ├── index.ts              ← LocaleContext, useLocale(), useT(), t(key)
│   ├── types.ts              ← Интерфейс полного словаря TranslationDictionary
│   ├── ru.ts                 ← Русские переводы (Master Baseline)
│   └── en.ts                 ← Английские переводы (English Pack)
├── theme/
│   └── ThemeProvider.tsx     ← ConfigProvider locale={currentLocale === 'en' ? enUS : ruRU}
└── shell/
    └── LanguageSwitcher.tsx  ← Лаконичный переключатель RU / EN в шапке
```

### 2.2. Хранение состояния

- Ключ в `localStorage`: `'kdt-locale'` (`'ru'` | `'en'`).
- По умолчанию: `'ru'` (для русскоязычных стендов) или fallback на `'en'`, если в браузере системный английский.
- При смене языка: меняется состояние в `LocaleContext` + обновляется `ConfigProvider` Ant Design (`enUS` / `ruRU`) + сохраняется в `localStorage`.

---

## 3. Сценарии поведения (Given / When / Then)

### 3.1. Переключение языка в шапке
**Given:** пользователь находится на любом экране платформы (Home, Studio, Lab, Admin, Results).  
**When:** кликает по переключателю `RU | EN` в верхнем правом углу шапки.  
**Then:**
- Все текстовые метки, кнопки, подсказки, заголовки и таблицы мгновенно перерисовываются на выбранном языке без перезагрузки страницы и без сброса рабочего состояния.
- Компоненты Ant Design (пагинация, календари, плейсхолдеры таблиц) переключают локаль (`ru_RU` ↔ `en_US`).
- Выбор сохраняется в `localStorage` и восстанавливается при следующем визите.

### 3.2. Локализация Студии и Графа
**Given:** включён язык `EN` и открыта `Студия`.  
**When:** оператор смотрит на граф, оверлей создания и правую панель.  
**Then:**
- Заголовки категорий графа отображают: `Page Models`, `Scenarios`, `Fuzzers`, `Data Modules`, `Connectors & Integrations`, `Auth Profiles`.
- Оверлей `+`: карточки с английскими подписями.
- Правая панель: пустой стейт `Select an entity on the graph to inspect` / `Click any card to view and edit parameters, or press + on canvas to create`.
- Редактор: названия вкладок, тулбары, кнопки действий на английском.

### 3.3. Локализация Станции атак (Lab / Burp Killer)
**Given:** включён язык `EN` и открыт `/lab`.  
**When:** оператор настраивает или запускает атаку.  
**Then:**
- Степпер: `1. Target`, `2. Positions`, `3. Attack Mode`, `4. Payloads`, `5. Execute`.
- Описания карточек режимов (Sniper, Battering Ram, Pitchfork, Cluster Bomb) на чистом понятном английском.
- Таблица результатов: `#`, `Payload`, `Status`, `Length`, `Time`, `Grep Match`, кнопки `Stop Attack`, `Save Results`, `Add to Suite`.

### 3.4. Локализация Админки и Результатов
**Given:** включён язык `EN` и открыта `Админка` или `Результаты`.  
**When:** оператор просматривает Overview, находит алерты или скачивает отчёт.  
**Then:**
- Метрики: `Total Runs`, `Quality Gate Pass Rate`, `Critical / High Issues`, `Active Policies`.
- Вкладки результатов: `Summary`, `Execution Journal`, `Security Act Preview`, `Findings`.

---

## 4. Карта словаря переводов (`TranslationDictionary`)

Словарь делится по логическим модулям с автодополнением TypeScript:

```ts
export interface TranslationDictionary {
  common: {
    save: string;
    cancel: string;
    back: string;
    delete: string;
    rename: string;
    close: string;
    create: string;
    loading: string;
    empty: string;
    error: string;
    success: string;
    logout: string;
    search: string;
    refresh: string;
  };
  header: {
    home: string;
    studio: string;
    editor: string;
    monitoring: string;
    results: string;
    admin: string;
    lab: string;
  };
  home: {
    title: string;
    subtitle: string;
    recentChecks: string;
    newCheck: string;
    importCheck: string;
    noChecks: string;
  };
  studio: {
    emptyPromptTitle: string;
    emptyPromptDesc: string;
    categories: {
      scenarios: string;
      dataModels: string;
      pageModels: string;
      fuzzers: string;
      connectors: string;
      authProfiles: string;
    };
    actionHubTitle: string;
    addEntity: string;
    renamePrompt: string;
    deletePrompt: string;
  };
  lab: {
    title: string;
    subtitle: string;
    startAttack: string;
    stopAttack: string;
    steps: {
      target: string;
      positions: string;
      mode: string;
      payloads: string;
      execute: string;
    };
    modes: {
      sniper: { title: string; desc: string };
      batteringRam: { title: string; desc: string };
      pitchfork: { title: string; desc: string };
      clusterBomb: { title: string; desc: string };
    };
    results: string;
    noResults: string;
    saveEvidence: string;
  };
  admin: {
    overview: string;
    programs: string;
    findings: string;
    policies: string;
    runs: string;
    syncDojo: string;
  };
  results: {
    summary: string;
    journal: string;
    actPreview: string;
    downloadAct: string;
    gatePassed: string;
    gateFailed: string;
  };
}
```

---

## 5. Нарезка задач (План реализации)

### Этап 1: Инфраструктура i18n (P0, Boss)
- **`I18N-CORE-01`**: Создать `cosmo/src/locales/types.ts`, `ru.ts`, `en.ts`, `index.ts`. Реализовать `LocaleProvider`, хук `useLocale()`, функцию `t()`.
- **`I18N-CORE-02`**: Подключить `enUS` / `ruRU` в `cosmo/src/theme/ThemeProvider.tsx` через `useLocale()`.
- **`I18N-CORE-03`**: Создать компактный компонент `LanguageSwitcher.tsx` (Segmented `RU | EN` с флагами/иконками) и встроить в шапку (`AppShell.tsx`, `Header`).

### Этап 2: Локализация модулей (P1, Flash)
- **`I18N-MOD-01 (Shell & Home)`**: Перевести `LoginPage`, `HomePage`, `HistoryPage`, меню навигации, шапку.
- **`I18N-MOD-02 (Studio & Graph)`**: Перевести категории графа, подсказку пустой правой панели, `StudioActionHub`, `StudioActionForm`, оверлей создания, контекстное меню.
- **`I18N-MOD-03 (Lab / Burp Killer)`**: Перевести `LabWorkspace`, степпер шагов 1–5, карточки атак, пресеты словарей, таблицу результатов, инспектор.
- **`I18N-MOD-04 (Admin & Results)`**: Перевести `AdminLayout`, `Overview`, `DojoFindingsTable`, `ResultsWorkspace`, `ResultsTabs`.

### Этап 3: Полировка и проверка (P2, Boss + Flash)
- **`I18N-QA-01`**: Проверить отсутствие `undefined` / сломанных ключей, проверить верстку при длинных английских словах, запустить `typecheck` и тесты.

---

## 6. Критерии приёмки (DoD)

- [ ] В шапке платформы присутствует переключатель `RU | EN`.
- [ ] Переключение языка на лету переводит 100% видимого интерфейса (Home, Studio, Lab, Admin, Results).
- [ ] Ant Design локализуется синхронно (`ruRU` ↔ `enUS`).
- [ ] Выбранная локаль сохраняется в `localStorage` и подхватывается при перезагрузке.
- [ ] Вёрстка не ломается и не плывёт при переключении на английский.
- [ ] `tsc --noEmit` — 0 ошибок, существующие тесты зелёные.

---

## 7. Честная «не обещаем» (Out of Scope)

- Автоматический перевод пользовательского текста внутри конструктора PrettyK (пользовательские строки сценариев остаются на том языке, на котором написаны).
- Локализация бэкенд-логов и системных ответов ZAP/Dojo (отдаются как есть от движков).
- Третий язык (испанский/китайский) — архитектурно поддержан через добавление нового файла в `locales/`, но в этой поставке не реализуется.
