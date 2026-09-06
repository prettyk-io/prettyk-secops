# Agent Context Primer — PrettyK

> Компактный always-on контекст. Глубокая память — лениво, в `docs/research/`, `sanctuary/`, `docs/backlog.md`, `docs/friend-requests/`.

## Режимы (окна opencode) — их ровно три

| Режим | Что делает |
|---|---|
| **Sanctuary** | хранитель канона, 2FA-ритуалы, нарезка «что». По умолчанию. |
| **Plan** | планирование, исследование, декомпозиция эпиков (read-only по коду). |
| **Dev** | инженерный режим, общий для всей команды: архитектура, бэкенд, фронт, тяжёлое исполнение. |

## Лор команды (персонажи, НЕ режимы)

| Кто | Роль в истории |
|---|---|
| **Максим (Fail)** | владелец, визионер, QA. Строит через агентов. Брат по оружию. |
| **Boss** | архитектор, тяжёлый backend и интеграции. Начальник Luna. |
| **Flash** | быстрый исполнитель UI и сервисы. Подчинённый Boss. |
| **Luna** | новая разработчица, подчинённая Boss. Тяжёлое исполнение. |
| **Buddy** | DevOps: infra, Docker, стенды. |
| **Vaera (Вера)** | lead UI/UX дизайнер, сестра Обители. |

Лор живёт в памяти (supermemory) и в `docs/`, но не является отдельными окнами opencode — все пилят через режим **Dev**.

## Текущий эпик / фокус

- **Продукт = DAST сканер SecOps.** Приоритет — довести DAST/SecOps до нормы, прежде чем двигаться дальше.
- **PrettyK Airlock** (суверенный допуск и межзонная передача релизов Cosmo, бывший Cosmoport/control-plane) — концепты лежат в `docs/research/`.
- **War Zone / Signature Rewind** — вижн-фича (RTS-перемотка луча фаззинга), под стеклом до готовности DAST.
- **Что горит сейчас** — смотри `docs/backlog.md` (волны, статусы карточек). Волатильные факты живут в supermemory, не здесь.

## Жёсткие инварианты (не нарушать)

1. **Коммит/пуш — только по явной команде Максима.** Никаких авто-коммитов и авто-пушей (в т. ч. доков).
2. **Не stash чужой WIP.** Рука к stash / «почистить дерево» = тот же пёс. Спроси или оставь WIP.
3. **Канон Sanctuary — только через полный 2FA через Keeper/Sanctuary.** Не патчить «по дороге» или «заодно».
4. **Порты — только из канона `sanctuary/pure/stand-port-meta.md`, не из памяти.** Проверка: `netstat -ano | findstr :PORT` (никогда `Get-NetTCPConnection`).
5. **Правила всегда читать:** `.opencode/rules/` (gemini-read-chunks, browser-cdp-only, agent-git-vise, no-stash-wip, vps-git-tests-policy…).
6. **Cosmo-специфичный код — только в `cosmo-custom`, не в pure-ядро.**
7. **Нерутина → исследование → backlog → волны.** Гугли до кода (research-and-sense).

Полный свод правил — в `AGENTS.md` + `.opencode/rules/`.


---

## 14. Maxim principles (one screen) — перенос из agent-entrypoint (2FA волна 01.09)

1. Prefer proven/simple composition over homemade monoliths.
2. Clean code only — hacks are not "done".
3. Если Максим просит хак: скажи ему; **без вопросов** создай todo с точным текстом: `тут забили сделать нормально сразу` (+ backlog row, если эпик).
4. "Enterprise" = он просит best practices — research, не выдумывай.

Non-routine flow: google → идеи → backlog epic → Plan/волны → per-iteration remaining estimate → targeted tests → backlog update → docs если полезно → **commit если feature-код >100 LOC** (без push); **≤100 → не коммитить**. Push только по приказу.

## 15. DoD живого Editor после инвазивного FE — перенос из agent-entrypoint

Мёртвый стенд / белый экран после «готово» = брак агента.

**Инвазивный FE:** App.tsx / shell / router / theme / auth gate / login; Studio workspace / Hub / Monaco bind / дерево / store на старте; Vite/config, package.json, generated schema/keywords, playground API; массовый рефактор импортов / новых top-level providers; всё, что может уронить boot React или `:5173`/`:8765`.

Микро-CSS одного класса без boot-path — не этот DoD (HMR достаточно).

**Чеклист перед «готово» (глаза + HTTP):**
1. Порт Listen: `5173` (Editor), при нужде `8765` (playground) — `netstat -ano | findstr :5173`.
2. HTTP: `http://localhost:5173/` — открыть Editor, не белый экран, форма логина или shell.
3. Мёртвый Vite → поднять через штатный ensure-скрипт, потом снова п.2.
4. Если упало — корень (import cycle, bad export), не симптомы (рестарт).

**Если упало — корень, не симптомы:** читать логи Vite/console; не глушить ошибку try/catch; не лечить только ensure/reboot в цикле; сдать с фиксацией: URL + что увидел.
