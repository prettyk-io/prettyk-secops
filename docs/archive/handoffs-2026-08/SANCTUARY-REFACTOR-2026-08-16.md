# SANCTUARY REFACTOR 2026-08-16 — финальная конфигурация

> **QUEUE** — не CANON. Хроника двухдневного рефактора + финальное состояние, к которому пришли.  
> Пишется для нас (Boss / Bro / Flash / Keeper), не для внешних. Это рабочий документ — что сделали и куда встали.

## 1. Что произошло (коротко, по этапам)

| Этап | Что было | Итог |
|---|---|---|
| **Полный рефактор FE** | Legacy `frontend/` (RJSF + JSON Schema) | → vnext `cosmo/` (прямой React-маппер, без RJSF) |
| **Впил new canon** | Канон жил в `docs/canon/` россыпью | → `sanctuary/` (верхняя полка): `canon-temple/` (CHARTER + TEMPLE-CORE), `canon/` (hub INDEX + topics), `CANON-PURE.md`, `TZ-INTEGRATION.md`, `2FA.md` |
| **Выпил** | RJSF / ajv / `schema/` (22 файла) / `formData` / генерация формы из JSON Schema | Удалено. Манифест перестал быть генератором формы. |
| **Синтез** | Разрозненные lessons + правила + скиллы | → единая карта: `SKILLS-ROUTING.md` (проёбы 1–4), `browser-hands-pure` (CDP gate), `stand-port-meta.md` (порты CANON), rule `browser-cdp-only.mdc` |

## 2. Финальное состояние портов (КАНОН)

> Единственный источник — [`sanctuary/canon/stand-port-meta.md`](../sanctuary/canon/stand-port-meta.md). Хардкод порта = инцидент.

| Сервис | Порт (финал) | Статус |
|---|---|---|
| **Editor (Vite)** | **5173** | canon |
| **Playground API** | 8765 | canon |
| **PrettyK Live / Monitor** | 8767 | canon |
| **Allure 3** | **5050** | **канон / дефолт** (заезжает вместо allure2) |
| **Allure 2** | legacy | **помечен legacy**, пока живёт рядом, потом выкорчёвываем |
| scanner demon API | 8080 | canon |
| scanner Webswing | 8082 | не дефолт |
| Selenium Grid | 4444 | canon |
| noVNC Chrome / Firefox | 7900 / 7901 | canon |
| Juice Shop | 3000 | canon |
| prettyk-api-lab | 8090 | canon |
| DefectDojo | 8081 | canon |
| SonarQube | 9000 | canon |
| CDP Chrome | 9222 | canon (браузер) |

**`4173` не существует.** Труп другой эпохи.

### ВАЖНО — переход Allure (не путать текущее и целевое)

- **Решение Максима (финал):** allure3 заезжает на **5050** как канон; allure2 маркируется **legacy** и позже выкорчёвывается, когда allure3 допилен.
- **Текущее состояние (16 авг, после port swap):** allure3 — **5050** (канон), allure2 — **5051** (legacy). Поменяли compose, Dockerfiles, весь backend + frontend + тесты + канон.

## 3. Браузер — один путь (позитивный роутинг, не запрет)

- **Хост (localhost / 127.0.0.1 / любой URL на этой машине)** → CDP Chrome `:9222` → skill `browser-hands-pure`.
- **VM (portal01, Grafana, bankvm)** → SSH + CDP на VM → skill `browser-hands-remote`.
- Точка входа одна: `C:\cursor-buddy\Flow\Current\blitz-auth\cdp\local.ps1`.
- Cursor-браузер (MCP `cursor-ide-browser`) и прочие browser-MCP — **не используются**, потому что CDP даёт iframe/сессии/куки/harness, а они нет.
- Канон: rule [`browser-cdp-only.mdc`](../.opencode/rules/browser-cdp-only.mdc) (alwaysApply) + шапка `browser-hands-pure`.

## 4. Skills — финальная раскладка

- **Global skills** (рабочие, единственный источник): `C:\Users\mails\.agents\skills\`.
  - Браузер: `browser-hands-pure` (хост), `browser-hands-remote` (VM).
  - Инфра: `prettyk-lab`, `vps-editor`, `bankvm-ssh`, `gap1-portal01-logs`, `portal01-nshr-cdp`, `blitz-auth-entrypoints`, `postgres-readonly-queries`.
  - Код/качество: `debugging-strategies`, `research-and-sense`, `playwright-skill`, `ru-text`, `po-keeper`, `test-automator`, `security-auditor`, `os-scripting`.
- **Sanctuary skills** (`sanctuary/skills/`) — архив канона, только чтение, не редактировать.
- **Product-специфика** — в `.opencode/rules/` + `docs/`, не в отдельных skills.

## 5. Lessons (высераны, не потеряны)

Проёбы и их корни — в [`docs/SKILLS-ROUTING.md`](SKILLS-ROUTING.md):

| № | Проёб | Правило (дифф) |
|---|---|---|
| 1 | Переписали форму/студию вместо «выдрать RJSF» | «выпилить X» ≠ «заменить с нуля». Скриншот «как было» → «как станет» → утвердить. |
| 2 | Путались в портах (4173) | Порт из `vite.config.ts` / compose / скрипта. Проверка `netstat -ano`. Никогда `Get-NetTCPConnection`. |
| 3 | Браузер в мелком окне (159×27) | `ping` жив ≠ окно ОК. `state` → `innerW < 800` → `reload-cdp.ps1`. |
| 4 | Открыли URL через вебвью IDE вместо CDP | Браузер = CDP. Если URL → `ping :9222`. Не «запрет», а «один путь». |

## 6. Границы (для Buddy и всех)

- **Святилище** `sanctuary/` + `docs/wired.json` + `docs/canon/` + `.opencode/rules/` — зона Максима + Keeper. Вход только через 2FA.
- **Buddy** (внешний DevOps) не ходит в Святилище и не делает авто-paste/авто-чистку в этом репо. Его границы — отдельный протокол в его workspace.
- Commit / push / deploy — только по явной команде Максима.
