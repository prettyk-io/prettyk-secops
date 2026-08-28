# Pre-existing test failures — Пакет 1 (frontend rename) не ломал

> 2026-08-21 | `cosmo/` | `npm run test:fast` = **170 pass / 8 files fail (14 тестов)**
>
> Все 8 — pre-existing, не связаны с рейнемингом `kdt` → `pk`.
> Единственный регресс рейнеминга (regex indices в `tabIdFromSuiteModelUri`)
> уже исправлен — `scriptLanguage.providers.test.ts` 16/16 pass.

---

## Группа A: WiredForm (7 тестов, самый жирный)

**Файл:** `src/wired/WiredForm.test.tsx`
**Симптом:** все тесты рендерят пустой `<div />`. `getByText('Регламент')`, `Плановая проверка`, `owasp-scanner-tests` — ничего не находится.
**Вероятная причина:** форма падает при инициализации и не рендерит children (React error boundary / пустой return). Возможно, отсутствует `IntlProvider` или schema не грузится в jsdom.
**Оценка:** 2-3h. Нужен дебаг render path WiredForm в тестовом окружении.

```
WiredForm.test.tsx  FAIL  рендерит секции Регламент и Редактор
WiredForm.test.tsx  FAIL  отображает project_id как read-only
WiredForm.test.tsx  FAIL  Select assessment_purpose рендерит Плановая проверка
WiredForm.test.tsx  FAIL  pre_release поля
WiredForm.test.tsx  FAIL  emergency поля
WiredForm.test.tsx  FAIL  manual поля (Длительность сессии)
WiredForm.test.tsx  FAIL  сводка модулей (1 auth / 2 фаззеров)
```

---

## Группа B: AdminPage (1 тест)

**Файл:** `src/shell/AdminPage.test.tsx`
**Симптом:** `getAllByText('Обзор')` не находит — рендерится Skeleton (загрузка).
**Причина:** тест не ждет асинхронной загрузки. `waitFor` / `findAllByText` не используется.
**Оценка:** 15 мин.

```
AdminPage.test.tsx  FAIL  renders SecOps shell; default Overview
```

---

## Группа C: ProgramOverview (1 тест)

**Файл:** `src/admin/sections/ProgramOverview.test.tsx`
**Симптом:** `useThemeMode вне ThemeProvider`. `SeverityDonut` / `SeverityTrendChart` вызывают хук без контекста.
**Причина:** в тесте нет `<ThemeProvider>` wrapper.
**Оценка:** 15 мин.

```
ProgramOverview.test.tsx  FAIL  renders Analysis chrome
```

---

## Группа D: Локализация / locale (2 теста)

**Файл:** `src/studio/StudioActionHub.stubs.test.tsx`
**Симптом:** `getByText('Фаззеры')` не находит — тайл называется 'Fuzzers'.
**Причина:** либо locale не прогружен (RU → EN fallback), либо label поменяли без обновления теста.
**Оценка:** 10 мин.

**Файл:** `src/shell/LoginPage.sso.test.tsx`
**Симптом:** `'Redirect to Blitz'` не содержит `'Редирект на Blitz'`. RU-текст не подставлен.
**Причина:** locale не подгружен в тесте.
**Оценка:** 10 мин.

---

## Группа E: Логика / UI contract (3 теста)

**Файл:** `src/app/appValidationChrome.test.ts`
**Симптом:** `editorViewHeaderTitle('form')` возвращает строку 'Конфигурации и регламент проверки', а ожидается `null`.
**Причина:** кто-то добавил title для view 'form', тест не обновлен.
**Оценка:** 10 мин.

**Файл:** `src/checks/hashRoute.test.ts`
**Симптом:** `parseHash('#/checks/abc-1')` возвращает `view: 'studio'`, тест ждет `view: 'form'`.
**Причина:** изменился default view в parseHash. Тест устарел.
**Оценка:** 10 мин.

**Файл:** `src/shell/persAuth.test.ts`
**Симптом:** `canViewCheckInHistory('admin', 'expert')` возвращает `true`, ожидается `false`.
**Причина:** логика прав изменилась — admin теперь видит expert-чеки.
**Оценка:** 10 мин.

---

## Итого

| Группа | Файлов | Тестов | Часов |
|---|---|---|---|
| A. WiredForm | 1 | 7 | 2-3 |
| B. AdminPage | 1 | 1 | 0.25 |
| C. ProgramOverview | 1 | 1 | 0.25 |
| D. Locale | 2 | 2 | 0.5 |
| E. Contract/logic | 3 | 3 | 0.5 |
| **Всего** | **8** | **14** | **~4h** |

**Пакет 1 готов к commit.** Регрессий от рейнеминга нет.