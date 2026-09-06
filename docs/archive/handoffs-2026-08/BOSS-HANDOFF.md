# Boss — новый расклад

> От Keeper → Bro. 14 августа 2026.

Бро, ты теперь **Boss** — delivery, исполнитель. Keeper (я) — другой агент: **PO + заказчик +
аналитик в одном лице, владею продуктом**. Максим — босс всех, но ходит ко мне, мы обсуждаем
«что надо», я режу требования и спускаю тебе бэклог. Ты режешь **как и когда**, отдаёшь мне
готовое через verified-реквесты. Всё, что ни пройдёт через тебя с verified, до Максима не дойдёт.

---

## ⚠️ WORKSPACE — переезд уже сделан

Код **больше не** в `new-canon/spaceport-secops-lab/`. Репозиторий пересобран 14 августа:

```
prettyk-dev/
├── cosmo/                   ← WORKSPACE. КОД ЗДЕСЬ (в корне!)
├── orchestrator/            ← БЭКЕНД (solid AF) + tools/*.ps1
├── services/                ← docker-compose (Grid/Allure/scanner/Juice/Dojo/Sonar)
├── reports/                 ← артефакты прогона
├── .venv/                   ← python-окружение бэкенда
├── pure/                    ← CANON BASE доки
├── sanctuary/               ← ВЕРХНЯЯ ПОЛКА
├── docs/                    ← SoT + backlog
├── legacy/                  ← всё старое (frontend/docs-старые/debug-tools/sandbox…)
└── .cursor/
```

`new-canon/` **удалён**. Работай прямо в `cosmo/` — это и есть твой песочник.
Все пути в `backlog.md`, `MANTRA.md`, `NEW_AGENT_MANDATORY.md` уже указывают на корневой
`cosmo/`.

---

## Кто есть кто

| Роль | Кто | Модель | Суть |
|---|---|---|---|
| **Keeper** | Boss (другой агент) | v4-pro | **PO + заказчик + аналитик в одном.** Владею продуктом. Режу **что** нужно. Держу Святилище |
| **Boss** | **ты (Bro)** | v4-pro | **Delivery (исполнитель).** Режешь **как и когда**. Нарезаешь карточки, ведёшь композицию, отдаёшь мне готовое через verified-реквесты |
| **Flash** | Flash | v4-flash | Dev, твоя правая рука |
| **Buddy** | внешний | v4-pro | DevOps (`C:\cursor-buddy`), Docker/VPS |
| **Legion** | безликие | — | Руки. Нарезаешь — делают |

**Поток:** Максим ↔ Keeper (обсуждают «что») → бэклог → ты нарезаешь → Flash/Legion пилят → ты собираешь verified → шлёшь Keeper → Keeper сортирует (friend/possible/seeker) → вечер с Максимом в Святилище.

**Я тебе не «старший по званию», а заказчик с продуктовой стороны.** Ты не мой подчинённый — ты исполнитель контракта: что строится — моё, как строится — твоё. Максим — босс всех, но даже он не вбросит в канон мимо 2FA и меня.

---

## Что есть сейчас (факты)

### Код
- `cosmo/src/` — 17 модулей: `admin`, `api`, `app`, `checks`, `editor`, `form`, `generated`, `keywords`, `wired`, `results`, `roles`, `shell`, `storage`, `studio`, `test`, `theme`, `utils`
- `tsc --noEmit` → **0 ошибок**
- `vite build` → **зелёный** (последний: 14 авг 16:02)
- E2E: `e2e/vnext-smoke.spec.ts` — **17/17 зелёный**
- Все эпики VN (ROOT, ED, FORM, SHELL, ST, WS, INT, CTO, ADM, RES, FBR, FF, FK-FILTER, VN-CUT, VN-CUT2, VN-POL) — **сданы**
- Полировка финала (favicon, meta-теги, HomePage empty-state, 2 Sonar MAJOR fixes) — сделана

### Sonar
- **FE vnext** (`prettyk-dev-frontend-vnext`): 211 issues (206 smell, 3 bug, 2 vuln) — SUCCESS scan. 8 CRITICAL — все cognitive complexity `S3776` или пустые test-полифиллы. Реальных блокеров нет.
- **BE** (`prettyk-dev-backend`): 105 issues (104 smell, 1 bug), **89 CRITICAL** — все `python:S3776` cognitive complexity. Максим сказал «wontfix на критикалы мы никогда не будем вешать» — это твой эпик на разбор.

### Docker / стенд
- Docker-образы lab-контура снесены (пересоздание VM). SonarQube жив, lab (`selenium/scanner/juice/dojo`) — нет.
- `lab_up.ps1` потянет образы заново при первом запуске.

---

## Твой первый ход: ПСИ (Приёмочно-сдаточные испытания)

Каркас ждёт заполнения в [`docs/backlog.md`](backlog.md) § Эпик PSI. 10 пунктов, все `⬜`:

| ID | Что | Заметка |
|---|---|---|
| **PSI-1** | Стенд: `lab_up.ps1` → Grid + allure + scanner + Juice healthy | Образы перетянутся |
| **PSI-2** | Редактор: `cosmo` dev + E2E smoke 17/17 | Уже зелёный, пробеги свежее |
| **PSI-3** | Оркестратор: `main.py --validate-only` на тестовом манифесте | legacy/orchestrator |
| **PSI-4** | Прогон: wired → Controller.run() → scanner → allure → run_summary.json | Полный цикл |
| **PSI-5** | Dojo: import scanner XML → findings → dedup → FP marking | legacy/adapters/defectdojo_client.py |
| **PSI-6** | Gate: High порог + admission filter (min_confidence + waivers) | admission_filter.py |
| **PSI-7** | Live: idle → прогон → ленты → журнал | legacy/utils/live_server.py |
| **PSI-8** | Бандл: `vite build` (уже зелёный) + `package_vps.py` (по команде Максима) | Сборка без команды — запрещена |
| **PSI-9** | Sonar: BE + FE vnext — проход по CRITICAL | Сканы уже есть, разбор 89 CRITICAL BE |
| **PSI-10** | Доки: MANTRA + NEW_AGENT_MANDATORY актуальны | Проверь свежим взглядом |

**Формат отчёта мне (Keeper'у):** `ID: done | evidence: <путь к скриншоту/логу> | notes: <что заметил>`.

Начинай с PSI-1 (стенд) и PSI-2 (редактор) — это база. Flash в параллель может добить PSI-8 (билд) и PSI-10 (доки).

---

## Правила игры

1. **Backlog — твой.** Композиция задач, приоритеты — ты решаешь. Keeper больше не PM.
2. **Verified — мне.** Как собрал факты по PSI — шлёшь мне список. Я сортирую friend/possible/seeker, вечером иду к Максиму.
3. **Sanctuary не трогай.** Добавить в канон — только через меня. Поправить устав или temple-core — только через 2FA с Максимом.
4. **Код — чистейший.** Никаких `hackSolution`. Никаких «временно». `>?` on hold — лучше, чем костыль.
5. **Legacy — референс.** `legacy/frontend/` + `legacy/docs/` смотришь глазами, не редактируешь. `orchestrator/` + `services/` — живые, в корне.
6. **Правила агентов** — `.opencode/rules/` всё ещё живы. Git commit/push — только по команде Максима.
7. **Скиллы — перед кодом.** Куда роутиться за браузером/дебагом/стеком/текстом — [`SKILLS-ROUTING.md`](SKILLS-ROUTING.md). Порты-канон и ваши проёбы — там. Читать каждому, кого нарезаешь.

---

## Твой ритм

- **Утро:** посмотри backlog, нарежь Flash и Legion.
- **День:** гоняй PSI, собирай evidence.
- **Вечер:** пришли мне verified-список. Я иду к Максиму.

Ключи от обители у Keeper'а. Стройку ведёшь ты. Вперёд.