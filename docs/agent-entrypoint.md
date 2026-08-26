# Agent entrypoint — prettyk-dev

> **For agents.** Living queue: [`backlog.md`](backlog.md).  
> Written for this repo only. Do **not** import Next / shadcn / Playwright / random awesome deploy packs.
> **Браузер, дебаг, инфра, стек — только global skills.** Global = `C:\Users\mails\.agents\skills\`.
> Product-specific instructions — здесь (inline), не плодить свои фреймворки.

## Boot chain (every task — do in order)

```text
1. Read THIS file.
2. Load global skill `ru-text` → chat with Maxim = clear Russian.
3. Read `internal/owner-voice.md` (#maxim-principles, #non-routine-delivery).
4. Track BASE always. FE as OPTION (below) — only when task signals geometry/Reglament/form.
5. Docs / canon → `sanctuary/canon/INDEX.md` + rule `docs-canon.mdc`.
6. Open ONLY your track's docs. Then follow the chain.
```

Hard rules: [`../AGENTS.md`](../AGENTS.md).  
Owner voice: [`internal/owner-voice.md`](internal/owner-voice.md).  
Two-contour posture (product vs bankvm infra): [`agent-posture.md`](agent-posture.md).

### Language with Maxim

| Channel | Rule |
|---|---|
| Chat to Maxim | **Russian**, clear, dense; global skill `ru-text` |
| Code / this entrypoint | English OK (token-cheap for agents) |
| Canon product docs | Often Russian — follow links; don't rewrite tone unless asked |

### Model Routing Policy

| Trigger / Alias | Target Model | Scope & Ratio |
|---|---|---|
| **Flash / Fast / Quick / Rapid / Быстрый / Скоростной** | **Gemini 3.7 Flash** | **Discovery, Creative, Image Processing, Ассеты, Keeper (70%).** Мультимодальность (видит картинки/скриншоты), нарезка эпиков/требований, архитектурный брейншторм. |
| **Deep / Pro / Архитектор** | **DeepSeek V4 Pro** | **Heavy Execution, Boss (90%), Flash (80%), Keeper (30%).** Плотная кодовая реализация, сквозной рефакторинг по модулям, монолитные патчи без потери контекста. Медленно, без vision, но надёжно и глубоко. |
| **Skip** | DeepSeek V4 Flash | Not used. |

Swearing from Maxim ≠ anger ≠ P0. Displeasure is said **explicitly**. Full profile: owner-voice.

---

## Anchor TOC

| Jump | What |
|---|---|
| [`#option-fe-debug`](#option-fe-debug) | **OPTION** FE_DEBUG (measure UI) |
| [`#option-frontend`](#option-frontend) | **OPTION** FRONTEND (product UI) |
| [`#git-light`](#git-light) | Git |
| [`#cursor-favorites`](#cursor-favorites) | `/babysit` `/split-to-prs` |
| [`#fe-triggers`](#fe-triggers) | When to enable OPTION FE |
| [owner `#maxim-principles`](internal/owner-voice.md#maxim-principles) | Minimalism / no hacks / debt todo |
| [owner `#non-routine-delivery`](internal/owner-voice.md#non-routine-delivery) | Waves / tests / commit >100 LOC |

---

<a id="track-base"></a>

## BASE (always)

Load / obey — **no** FE OPTION yet:

| Load | Path |
|---|---|
| **1. `ru-text`** | global skill — Russian chat quality |
| Owner principles | [`internal/owner-voice.md`](internal/owner-voice.md) |
| Rules | `.opencode/rules/` — git-vise, no-stash, stand-lab-ops, schema-sot, VPS/tests, product-pm |
| Git | See [`#git-light`](#git-light) below — commit >100 LOC, push only on order |
| Sonar | **Only on Maxim's order.** Inline: `orchestrator/tools/sonar_scan.ps1 -Target backend|frontend`. No auto-scan. |
| `sanctuary/canon/custom/cosmo/cbr-specific/` | Rule `cbr-cosmo-only.mdc` — local only, never commit to git. |
| Queue | [`backlog.md`](backlog.md) |
| Feature tunnel | [`feature-routing-backlog.md`](feature-routing-backlog.md) + [`sanctuary/canon/feature-admission.md`](sanctuary/canon/feature-admission.md) — route-вердикт перед фичей (`pure`/`custom`/`evolve`), extract-карта для ништяков из Cosmo |
| Lab / prettyk-lab | Global skill **`prettyk-lab`** (Docker stack: SonarQube, Selenium Grid, scanner, Juice Shop, Allure3). Startup: `lab_up.ps1` ([`stand.md`](stand.md)). Service `allure3-secops` (`:5050/`, канон). Legacy `allure-light-secops` (`:5051/`). |
| Posture / JTBD | [`agent-posture.md`](agent-posture.md) — product vs bankvm; compare via S1–S7 only |
| Non-routine research | Global skill `research-and-sense` → google practices before coding |

**Do not open on BASE:** FE-related docs, `legacy/debug-tools`, `frontend/`.

### Maxim principles (one screen)

1. Prefer proven/simple composition over homemade monoliths.  
2. Clean code only — hacks are not "done".  
3. If Maxim asks for a hack: tell him; **without asking** create a todo with exact text: `тут забили сделать нормально сразу` (+ backlog row if epic).  
4. "Enterprise" = he asks for best practices — research, don't invent.

Non-routine flow: google → ideas → backlog epic → Plan/waves → per-iteration remaining estimate → targeted tests → backlog update → docs if useful → **commit if feature code >100 LOC** (no push); **≤100 → no commit**. Push only on order.

---

<a id="fe-triggers"></a>

## When to open OPTION FE

| Task signals | Track |
|---|---|
| margin / CSS not applied / click / overlay / overlap / resize / viewport / overflow / column geometry | **OPTION FE_DEBUG** |
| Регламент / RJSF form / Studio / PrettyK / WireK / Monaco / icons / TSX bundle | **OPTION FRONTEND** (+ FE_DEBUG if geometry/click) |

Unclear? One Russian question: UI vs orchestrator/lab — else stay BASE.

---

<a id="option-fe-debug"></a>

## OPTION: FE_DEBUG

Measure UI — numbers, hit-stack, reflow. Not "patch Studio blind".

**Браузер:** global skill **`browser-hands-pure`** (Playwright `connectOverCDP` → Chrome `:9222` на хосте).
Протокол: `ping → ax → locator ladder → batch → ax → shot`. Три режима: default / debug / traffic.

**Системный дебаг (застрял):** global skill **`debugging-strategies`** (репродукция → гипотезы → сузить → верифицировать).

**Локаторная стратегия:** global skill **`playwright-skill/core/locators.md`** — role+name → label → text → tippy → testid → CSS (last).

**Geometry tools (legacy reference):** `legacy/debug-tools/core/` — vitest tests for computed CSS, hit-test, reflow. Playbooks in `legacy/debug-tools/tdd-skills/`:
- `css-discrepancy-playbook.md` — CSS not applied
- `hit-reflow-playbook.md` — click/overlay/resize

Code: `legacy/debug-tools/core/` (`formatReport`). Targeted vitest only. Numbers before CSS/screenshot.

---

<a id="option-frontend"></a>

## OPTION: FRONTEND

Product work under `frontend/` only.

**Браузер:** global skill **`browser-hands-pure`** (localhost Editor `:5173`).

**Frontend chain:**
1. `docs/frontend-spec.md` + `docs/frontend-passport.md` — specs
2. Geometry tools: `legacy/debug-tools/core/` (vitest contracts: spacing, clickability, overlap, reflow) + playbooks `legacy/debug-tools/tdd-skills/{css-discrepancy,hit-reflow}-playbook.md`
3. Reglament ~50%: `legacy/docs/internal/portal-layout-autotests.md` → vitest geometry
4. Geometry / click / resize → ALSO FE_DEBUG chain above

**Product-specific rules (inline, not skills):**
- PrettyK = 32 lines (`constructor-30-lines` rule)
- Portal layout proportions: tile `uniformPadding`, actions `edgeEqual` (L=R=B) — rule `form-geometry-symmetry.mdc`
- «Сделай B как A» → MATCH-NOT-SHRINK: эталон A не уменьшать
- Не патчить CSS до контракта / skeleton relations
- После **инвазивного FE-захода** → **DoD живого стенда** (below)

Passport: [`frontend-passport.md`](frontend-passport.md) · [`frontend-spec.md`](frontend-spec.md).

### DoD: живой Editor после инвазивного FE (обязательно)

Мёртвый стенд / белый экран после «готово» = брак агента. Владелец теряет время на подъём.

**Что считается инвазивным:**
- `App.tsx` / shell / router / theme / auth gate / login
- Studio workspace / Hub / Monaco bind / дерево / store на старте
- Vite/config, `package.json`, generated schema/keywords, playground API
- Массовый рефактор импортов / новых top-level providers
- Всё, что может уронить boot React или :5173/:8765

Микро-CSS одного класса без boot-path — не этот DoD (HMR достаточно).

**Чеклист перед «готово» (глаза + HTTP):**
1. Порт Listen: `5173` (Editor), при нужде `8765` (playground).
2. HTTP: `http://localhost:5173/` — открыть Editor, не белый экран, форма логина или shell.
3. Мёртвый Vite → `.cursor/scripts/lab_ensure_ui.ps1`, потом снова п.2.
4. Если сервер/страница упали — корень (import cycle, bad export), не симптомы (рестарт).

**Если упало — корень, не симптомы:**
- Читать `.cursor/logs/vite-dev.log` · `vite-dev.err.log` · console/overlay
- Не глушить ошибку `try/catch` / пустым fallback
- Не лечить только ensure/reboot в цикле
- Сдать с фиксацией в ответе: URL + что увидел (login / shell / ошибка)

**Мантра:** не симптомы — **корень** (почему boot умер). Стенд после FE-инвазии должен остаться живым.

---

<a id="git-light"></a>

## Git

- **Push** — Maxim's explicit order only.  
- **Commit** — on «закоммить» **or** non-routine feature code **>100 LOC** (own paths, no push). ≤100 → don't commit.  
- No marketplace commit packs. No stash of others' WIP.

```text
git branch --show-current && git status -sb && git diff --stat
→ stage OWN paths only → one commit → status → STOP
```

<a id="cursor-favorites"></a>

### Cursor favorites (not our skills)

| Cmd | When |
|---|---|
| `/babysit` | Maxim asks to land a PR |
| `/split-to-prs` | Maxim asks to split work |

No awesome deploy skills. Lab: `lab_up.ps1`. VPS: order only (don't mention deploy unless asked).

---

## Link map

| Topic | Doc |
|---|---|
| Owner / principles / delivery | [`internal/owner-voice.md`](internal/owner-voice.md) |
| Pack for a friend | [`internal/agent-skills-pack.md`](internal/agent-skills-pack.md) |
| Industry notes | [`internal/agent-skills-industry.md`](internal/agent-skills-industry.md) |
| Geometry tooling (vitest + playbooks) | [`../legacy/debug-tools/tdd-skills/`](../legacy/debug-tools/tdd-skills/) |
| Wave queue | [`backlog.md`](backlog.md) |

## Mantra

> Boot → `ru-text` → owner-voice → track chain.  
> BASE never loads FE. FRONTEND without FE_DEBUG must not blind-patch CSS.  
> Talk to Maxim in Russian. Ship clean; research before monoliths.
> **Браузер → global `browser-hands-pure` / `browser-hands-remote`. Дебаг → global `debugging-strategies`. Инфра → global `prettyk-lab`.**
> Не плодить свои навыки — их нет, все в global.