# Agents — железобетон (prettyk-dev)

> **Canon repo:** https://github.com/prettyk-io/prettyk-dev  
> **Org:** https://github.com/prettyk-io/  
> **Old:** `failed1/prettyk-dev` — no longer canon. 2026-08-21.

Владелец: **Максим**. Тупая автоматика, которая жрёт время на stash/merge/«очистку дерева», здесь **запрещена**.  
Если не настроено — настраиваем. Если агент стешит чужое — это баг агента, не «так надо».

**2026-08-05:** два часа боли с гитом. Агент **сам** держит себя в тисках — см. [`.opencode/rules/agent-git-vise.mdc`](.opencode/rules/agent-git-vise.mdc). Мантра: рука к stash / «почистить дерево» = снова тот же пёс; спроси или оставь WIP.

## Обязательные правила (always)

Читай и соблюдай `.opencode/rules/` — особенно:

| Rule | Суть |
|---|---|
| **🔴 [`gemini-read-chunks.mdc`](.opencode/rules/gemini-read-chunks.mdc)** | **Чанки `Read`: строго 500 / 1000 / 2000 строк (`limit`/`offset`). Без параметров не читать!** |
| **🔴 [`browser-cdp-only.mdc`](.opencode/rules/browser-cdp-only.mdc)** | **Браузер — основной путь CDP Chrome `:9222`.** Хост → `browser-hands-pure`, VM → `browser-hands-remote`. Точка входа `local.ps1`. Cursor-браузер — fallback для простых задач, не запрещён. |
| [`vps-git-tests-policy.mdc`](.opencode/rules/vps-git-tests-policy.mdc) | VPS, Git (commit/push только по команде) и Политика тестов |
| [`agent-git-vise.mdc`](.opencode/rules/agent-git-vise.mdc) | Тиски: status→мозг; без stash/worktree/approval-спама |
| [`no-stash-wip.mdc`](.opencode/rules/no-stash-wip.mdc) | Не стешить параллельный WIP |
| [`alpha-stable-sync.mdc`](.opencode/rules/alpha-stable-sync.mdc) | Home `alpha-stable`; без авто-коммитов; не тащить код с docs |
| [`operator-no-subagents-no-worktree.mdc`](.opencode/rules/operator-no-subagents-no-worktree.mdc) | Без Task/worktree |
| [`operator-no-frontend-push.mdc`](.opencode/rules/operator-no-frontend-push.mdc) | Без push `frontend` без приказа |
| [`schema-sot.mdc`](.opencode/rules/schema-sot.mdc) | SoT = `docs/manifest.json` |
| [`docs-canon.mdc`](.opencode/rules/docs-canon.mdc) | Hub = монолит + SOLID; 2FA; friend/canon-requests `ready`\|`evolve`; backlog шапка «Сырое / evolve»; void не воскрешать |
| [`product-forks.mdc`](.opencode/rules/product-forks.mdc) | Коробка `secops-lab-pure` (default) ‖ pack `cosmo-custom` (портал Cosmo/ЦБ); [`docs/profiles/`](docs/profiles/) |
| [`stand-shell-abort.mdc`](.opencode/rules/stand-shell-abort.mdc) | abort шелла ≠ мёртвый Vite |
| [`stand-lab-ops.mdc`](.opencode/rules/stand-lab-ops.mdc) | Стартуй/чисти; allure3-secops; пульты; Webswing не дефолт |
| [`cbr-cosmo-only.mdc`](.opencode/rules/cbr-cosmo-only.mdc) | `sanctuary/custom/cosmo/cbr-specific/` только локально, в git не коммитить |

Skills (все — global `C:\Users\mails\.agents\skills\`): `secops-lab` (lab start/clean / allure3-secops / Docker stack) · `vps-editor` (VPS `/editor` check/deploy — без temp-скриптов) · `ru-text` · `browser-hands-pure` / `browser-hands-remote` (UI dig) · `bankvm-ssh` (gap2/VM). Продукт-специфика (hub 2FA, git-vise, Fuzzer FE↔BE, иконки) — в rules и `docs/agent-entrypoint.md`, **не** в отдельных skills.

**Памятка роутинга по скиллам + порты-канон + ваши проёбы:** [`docs/SKILLS-ROUTING.md`](docs/SKILLS-ROUTING.md). Читать работягам перед кодом.

Explorer icons: rule [`.opencode/rules/explorer-theme-icons.mdc`](.opencode/rules/explorer-theme-icons.mdc) (`alwaysApply`) — **dark + light канон** (hashes `pk-assets` §1b/§1c); пакеты не шарить; откат без приказа = инцидент. Удаление FE-фичи: сначала вычистить все refs (`rg`), потом delete файлов.

## Enforcement (не ломать Run Everything)

1. Stash — **rule** + skill. `block-destructive-git.ps1` **не** в `beforeShellExecution`.
2. `permissions.json` (user/repo) = `{}`. Не плодить allowlist-файлы.
3. CLI: `approvalMode: unrestricted` — не откатывать «для безопасности агента».
4. Graveyard stash уничтожен — не восстанавливать.

## prettyK: 32 строки дефолта

Канон: [`constructor-30-lines.mdc`](.opencode/rules/constructor-30-lines.mdc) · `CONSTRUCTOR_VISIBLE_LINES = 32`. Не ужимать. Pad при load/flush.

## Стенд: «стартуй всё» / «почисти и стартуй»

Канон: global skill `secops-lab` · rule [`.opencode/rules/stand-lab-ops.mdc`](.opencode/rules/stand-lab-ops.mdc) · [`docs/stand.md`](docs/stand.md).

- **Стартуй всё** → обязательный compose (Grid/allure3-secops/scanner **demon**/Juice) + ensure UI + Live idle. **Webswing не дефолт** — только `zap_mode=webswing` или явная просьба.
- **Почисти и стартуй** → allure3-secops + Live (+ Dojo hint) → старт. Не prod.
- **После правок FE:** playground restart если Python API; фронт — ensure с телом формы.
- В ответе после «подними» — пульты **автоматом** (в т.ч. Webswing URL):

```text
allure3-secops (канон)
http://127.0.0.1:5050/
DefectDojo
http://127.0.0.1:8081/  admin/admin
PrettyK Live
http://127.0.0.1:8767/
Editor
http://localhost:5173/
Scanner Webswing
http://127.0.0.1:8082/zap
scanner API
http://127.0.0.1:8080/
```

## Стенд: проверка портов (Железобетон)

**Никогда `Get-NetTCPConnection -LocalPort 5173`** для проверки, жив ли Vite.
На Windows 11 `Get-NetTCPConnection` без `-LocalAddress` не видит IPv6-слушателей (`[::]:5173`), а Vite слушает именно `[::]` по умолчанию. Ложное «порт свободен» → агент поднимает второй Vite → `EADDRINUSE`.

**Всегда: `netstat -ano | findstr :5173`** (или любой целевой порт).

**Порты — CANON: [`sanctuary/pure/stand-port-meta.md`](sanctuary/pure/stand-port-meta.md).** Не из памяти.

CDP-логин: `type` не работает для Ant Design `<Input>` (React onChange через event-систему).
Правильный путь — native setter + dispatchEvent, см. **`C:\cursor-buddy\Flow\Current\blitz-auth\cdp\LESSONS.md`** § «local: type в `<Input>` Ant Design».

## VPS Bundle & Deploy (Железобетон)

1. **Bundle (`package_vps.py`):** собирать только при явной необходимости деплоя на VPS.
2. **Deploy на VPS:** делать **ТОЛЬКО** по явной команде Максима ("когда скажу я"). Если команды не было — **даже не упоминать** деплой в ответах.

## Политика коммитов, пушей и веток (Железобетон)

1. **Коммиты и пуши — строго по команде:** `git commit` и `git push` выполняются **ТОЛЬКО** по явной просьбе Максима ("когда скажу я"). Никаких авто-коммитов и авто-пушей для доков или кода.
2. **Без гитового театра на каждый чих:** Точечные правки CSS, верстки и микробаги делаются локально в рабочей ветке.
3. **Пуш и мультиветочное слияние:** Делается исключительно по явному приказу («запушь», «раскидай»).
4. **Здравый смысл превыше тупой автоматики:** Разовая команда не превращается в вечный авторитуал.

## Политика тестов (Testing Policy)

1. **Большая фича:** покрывать тестами обширно (разные сценарии, edge cases).
2. **Маленькая фича/правка:** добавлять умеренные тесты для смоука.
3. **При изменениях и дебаге:** запускать тесты **строго ограниченно/точечно** (конкретный изменяемый файл). **ЗАПРЕЩЕНО гонять весь тестовый suite целиком** во время отладки.

## Политика моделей и ролей (Model Routing & Execution Split)

### Разделение труда (Железный закон)
1. **Gemini 3.7 Flash (`gemini-3.7-flash`):**
   - **Сфера:** Discovery, Creative, Image Processing, генерация ассетов/промптов, исследование архитектуры, нарезка эпиков и требований (PO/Keeper).
   - **Плюсы:** Мультимодальность (видит скриншоты и изображения), высочайшая скорость, креатив, exploratory-режим.
   - **Ограничения:** На больших полотнах кода и сквозном рефакторинге буксует при единовременной правке многих модулей.
2. **DeepSeek V4 Pro (`deepseek-v4-pro`):**
   - **Сфера:** Heavy Execution — плотная кодовая реализация, сквозной рефакторинг по нескольким модулям, архитектурное исполнение нарезанных эпиков.
   - **Плюсы:** Работает медленно и вдумчиво, но поднимает и за один проход выдает огромные, мощные и монолитные куски качественного кода без потери контекста.
   - **Ограничения:** Не имеет vision (не умеет читать картинки напрямую).

### Ролевая матрица (Boss / Flash / Keeper)
| Роль / Агент | Пропорция (Gemini : DeepSeek) | Назначение |
|---|---|---|
| **Boss (Архитектор / Heavy Executor)** | **10% : 90%** (в основном DeepSeek V4 Pro) | Тяжёлая кодовая реализация, сложные бэкенд/фронтенд фичи, интеграции |
| **Flash (Быстрый исполнитель / Code)** | **20% : 80%** (в основном DeepSeek V4 Pro) | Точечная кодовая разработка, сервисы, реализация нарезанных задач |
| **Keeper (PO / Discovery / Backlog)** | **70% : 30%** (в основном Gemini 3.7 Flash) | Discovery, декомпозиция эпиков, валидация по скриншотам/UI, UX-дизайн |
| **Skip** | — | `DeepSeek V4 Flash` в разработке и агентах **не используется**. |

Spendings не лимитируют выбор — приоритет отдаётся качеству и архитектурной чистоте решения.

## Перед сменой ветки (чеклист)

```text
git status -sb
git diff --stat
```

Чужой/параллельный WIP → **не stash**. Своё забрал → ушёл куда сказали.  
Не знаешь чьё → спроси Максима. Не прячь в stash «чтобы удобнее».

## Коммиты

Только по просьбе Максима (без исключений для доков).  
Не коммитить чужой WIP «чтобы дерево стало чистым».
