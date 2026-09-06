# PrettyK SecOps — Onboarding & Operational Guide

> Полное руководство разработчика и воркера. Подключается по потребности из `AGENTS.md`.  
> Краткий контекст и принципы Максима: [`docs/internal/agent-primer.md`](internal/agent-primer.md).  
> Операционная карта системы: [`docs/MAP.md`](MAP.md). Навигатор: [`docs/INDEX.md`](INDEX.md).

---

## 1. Стенд: запуск, очистка и пульты

Канон стенда: глобальный skill `prettyk-lab` · правило `.opencode/rules/stand-lab-ops.mdc` · [`docs/stand.md`](stand.md).

### Команды
- **«Стартуй всё»** → обязательный docker compose (Grid / allure3-secops / scanner demon / Juice Shop) + ensure UI + Live idle.
- **«Почисти и стартуй»** → allure3-secops + Live (+ Dojo hint) → старт.
- **После правок FE:** playground restart (если затронут Python API); фронтенд — ensure с телом формы.

### Адреса пультов (выдавать автоматом при старте)
```text
allure3-secops (канон)    http://127.0.0.1:5050/
DefectDojo                http://127.0.0.1:8081/  admin/admin
KDT Live                  http://127.0.0.1:8767/
Editor / Studio UI        http://localhost:5173/
scanner demon API         http://127.0.0.1:8080/
```

### Проверка портов (Железобетон)
- **Никогда** не вызывать `Get-NetTCPConnection -LocalPort 5173` (не видит IPv6 `[::]:5173` в Windows 11).
- **Всегда:** `netstat -ano | findstr :5173` (или любой целевой порт).
- Канон портов: [`sanctuary/pure/stand-port-meta.md`](../sanctuary/pure/stand-port-meta.md).

---

## 2. Гит, ветки и безопасность

### Политика коммитов и пушей (Железобетон)
1. `git commit` и `git push` выполняются **ТОЛЬКО** по явной просьбе Максима. Никаких авто-коммитов для доков или кода.
2. Разовые фиксы CSS, верстки и микробаги делаются локально в рабочей ветке (`dev`).
3. Мультиветочное слияние и пуш — исключительно по прямому приказу («запушь», «раскидай»).
4. **Не stash чужой WIP.** Рука к stash / «почистить дерево» = нарушение (`.opencode/rules/no-stash-wip.mdc`).

### Чеклист перед сменой ветки
```powershell
git status -sb
git diff --stat
```
Чужой/параллельный WIP → не трогать. Своё забрал → перешёл куда указано.

---

## 3. Политика тестирования

1. **Большая фича:** широкое покрытие (позитивные сценарии, edge cases, negative cases).
2. **Маленькая правка:** точечные тесты для смоука.
3. **При отладке:** запускать тесты строго точечно (конкретный изменяемый test file). **ЗАПРЕЩЕНО гонять весь тестовый suite целиком** при дебаге.

---

## 4. Разделение труда и матрица моделей

### Модели
- **Gemini 3.7 Flash:** Discovery, креатив, vision (скриншоты/UI), архитектурный ресерч, декомпозиция задач.
- **DeepSeek V4 Pro:** Heavy Execution — плотная кодовая реализация, сквозной рефакторинг по модулям, архитектурные узлы. Без vision.
- **DeepSeek V4 Flash:** в разработке **не используется**.

### Ролевая матрица
| Роль | Пропорция (Gemini : DeepSeek) | Назначение |
|---|---|---|
| **Boss (Архитектор / Heavy Executor)** | 10% : 90% | Сложный бэкенд, ядро, интеграционные узлы |
| **Flash (Быстрый исполнитель / Code)** | 20% : 80% | UI, верстка, сервисы, реализация нарезанных карточек |
| **Luna (Разработчица)** | 10% : 90% | Тяжёлый бэкенд, Playwright-контейнеры, live-стримы |
| **Keeper (PO / Discovery / Backlog)** | 70% : 30% | Discovery, бэклог, декомпозиция, 2FA, приёмка |

### Две Луны — не путать
- **GPT Luna:** модель первого эшелона планирования (внутри сессии Keeper).
- **Luna (разработчица):** инженер команды в режиме Dev, пишет прод-код.

### Планирование и пропорции нарезки
1. GPT Luna → 2. Gemini Flash → 3. DeepSeek Pro (финальная нарезка).
- На троих (Boss + Flash + Luna): Boss 20%, Flash 40%, Luna 40%.
- На двоих (Boss + Luna): Boss 40%, Luna 60%.
- На двоих (Boss + Flash): Boss 40%, Flash 60%.

---

## 5. Операционный порядок делегирования (OpenCode)

Подробный регламент: `.opencode/skills/worker-delegation-ops/SKILL.md`.

- Сначала определить change surface: `SERIAL`, `REFACTOR-SERIAL` или `PARALLEL`.
- Рефакторинг существующего модуля — строго один worker-поток на модуль.
- Одна задача = один named owner и одна copy-paste коробка. Записи `Boss + Luna` запрещены.
- Диспетч по канону PK-DIR-006: одна строка `Worker, CARD-ID, D:\prettyk-secops\docs\backlog.md`.
- Каждый отчёт сначала закрывает done/follow-up в бэклоге, затем выдаётся следующий пакет на 20–30 часов.

---

## 6. Интерфейс и стандарты редактора

- **prettyK Visible Lines:** 32 строки дефолта (`CONSTRUCTOR_VISIBLE_LINES = 32`). Pad при load/flush.
- **Иконки проводника:** dark + light канон (`.opencode/rules/explorer-theme-icons.mdc`). Пакеты не шарить.
- **DoD живого Editor:** порт :5173 слушает, HTTP 200, нет белого экрана, рендерится shell/форма.
