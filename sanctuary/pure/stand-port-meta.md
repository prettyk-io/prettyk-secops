# Stand Port META — порты и команды стенда

> **CANON** — hub topic. Slice: **16 августа 2026** (порт-инцидент `4173`).  
> Реестр: [`INDEX.md`](INDEX.md). Lab detail: [`lab-up.md`](lab-up.md) · [`runtime-shell.md`](runtime-shell.md).  
> Skills: global **`prettyk-lab`** · **`browser-hands-pure`**.  
> Порт и команда = из этого документа. Если агент ошибся — он не читал CANON. Хардкод порта = инцидент.

## 1. Карта портов (из кода, не из головы)

| Сервис | Порт | Источник (канон) | Проверка |
|---|---|---|---|
| **Editor (Vite)** | **5173** | `cosmo/vite.config.ts` → `server.port: 5173` | `netstat -ano \| findstr :5173` |
| **Playground API** | 8765 | `lab_ensure_ui.ps1` → `$PlaygroundUrl` | `netstat -ano \| findstr :8765` |
| **PrettyK Live / Monitor** | 8767 | `lab_up.ps1` → `run_live_idle.py` | `netstat -ano \| findstr :8767` |
| **Allure 3** | 5050 | `services/docker-compose.yml` → `allure3-secops` | `curl http://127.0.0.1:5050/health` |
| **Allure 2** (legacy) | 5051 | `services/docker-compose.yml` → `allure-light-secops` | `curl http://127.0.0.1:5051/health` |
| **ZAP demon API** | 8080 | `services/docker-compose.zap.yml` | `curl http://127.0.0.1:8080/JSON/core/view/version/` |
| **ZAP** | 8080 | default | `netstat -ano \| findstr :8080` |
| **Selenium Grid** | 4444 | `services/docker-compose.yml` | `curl http://127.0.0.1:4444/status` |
| **noVNC Chrome** | 7900 | `services/docker-compose.yml` | `netstat -ano \| findstr :7900` |
| **noVNC Firefox** | 7901 | `services/docker-compose.yml` | `netstat -ano \| findstr :7901` |
| **noVNC Authoring (Playwright)** | **7902** | `services/docker-compose.yml` → `playwright-authoring` | `curl http://127.0.0.1:7902/vnc.html` |
| **CDP Authoring (Playwright)** | **9223** | `services/docker-compose.yml` → `playwright-authoring` (маппинг :9223→:9222) | `curl http://127.0.0.1:9223/json/version` |
| **Juice Shop** | 3000 | `services/docker-compose.target.yml` | `curl http://127.0.0.1:3000/` |
| **pk-api-lab** | 8090 | `services/docker-compose.api-lab.yml` | `curl http://127.0.0.1:8090/health` |
| **DefectDojo** | 8081 | `services/docker-compose.defectdojo.yml` | `curl http://127.0.0.1:8081/` |
| **SonarQube** | 9000 | `services/docker-compose.sonarqube.yml` | `curl http://127.0.0.1:9000/api/system/status` |
| **CDP Chrome** | 9222 | `browser-hands-pure` skill | `curl http://127.0.0.1:9222/json/version` |

**Порта `4173` не существует.** Труп другой эпохи. Забудь навсегда.

## 2. Команды — канон

### Старт всего стека (Docker + Editor + Playground + Live)

```powershell
# Из корня репозитория. Делает ВСЁ.
.\orchestrator\tools\lab_up.ps1
.\orchestrator\tools\lab_up.ps1 -IncludeDefectDojo
.\orchestrator\tools\lab_up.ps1 -IncludeSonarQube
```

`lab_up.ps1` внутри: compose (Grid/Chrome/Firefox/Allure 2+3) → ZAP → Juice → api-lab → `lab_ensure_ui.ps1 -StartIfDown` (Editor+Playground) → `run_live_idle.py` (Live) → HTTP-readiness всех.

### Только Editor + Playground (без Docker)

```powershell
.\cursor\scripts\lab_ensure_ui.ps1 -StartIfDown
```

### Чистка перед прогоном

```powershell
.\orchestrator\tools\lab_clean.ps1 -Target allure,live
.\orchestrator\tools\lab_clean.ps1 -Target allure
.\orchestrator\tools\lab_clean.ps1 -Target live
.\orchestrator\tools\lab_clean.ps1 -Target juice   # только по явной просьбе
```

### Проверка портов (железобетон)

```powershell
netstat -ano | findstr ":5173 :8765 :8767 :5050 :5051 :8080 :4444 :3000"
```

## 3. Роутинг агентов

| Агент | Зона | Запрещено |
|---|---|---|
| **Boss** (оператор) | `lab_up` / `lab_clean` / `lab_ensure_ui` / `run_live_idle.py` (через `lab_up`) | `npx vite --port`, `python live_server.py` руками, `Get-NetTCPConnection` |
| **Bro** (фронт) | Editor `:5173` HMR, не перезапускать руками | поднимать `:5173` самому — сказать Boss |
| **Flash** (тесты) | Playwright E2E → `http://localhost:5173/` | хардкодить порт в тестах |

## 4. Категорические запреты

| Запрет | Почему | Вместо |
|---|---|---|
| `npx vite --port XXXX` руками | порт уже в `vite.config.ts` | `npm run dev` или `lab_ensure_ui.ps1` |
| `python tools/data_playground.py` руками | python-путь нестабилен (WindowsApps vs `.venv`) | `lab_ensure_ui.ps1` |
| `python utils/live_server.py` руками | не тот cwd → ModuleNotFoundError | `lab_up.ps1` → `run_live_idle.py` |
| `Get-NetTCPConnection -LocalPort 5173` | не видит IPv6 `[::]` на Win11 | `netstat -ano \| findstr :5173` |
| хардкодить порт из памяти | канон в коде, не в памяти | читать `vite.config.ts` / compose / скрипт |

## 5. Инциденты (бетон)

- **2026-08-16 порт `4173`:** запустил Vite из памяти, хотя `vite.config.ts` → `5173`. «Из памяти» ≠ «из канона». Предотвращено: этот doc — единственный источник портов + шлюз в `browser-hands-pure` § ПОРТЫ + `SKILLS-ROUTING.md` § Проёб 2.
- **2026-08-16 python не найден:** `python` → WindowsApps-заглушка, не `.venv`. Правило: только через скрипты (`$VenvPython`).

## 6. Пульты (живой стенд)

```
allure-light-secops (legacy)  http://127.0.0.1:5051/
allure3-secops (канон)      http://127.0.0.1:5050/
DefectDojo            http://127.0.0.1:8081/ admin/admin
PrettyK Live              http://127.0.0.1:8767/
Editor                http://localhost:5173/
ZAP demon API         http://127.0.0.1:8080/
Selenium Grid         http://127.0.0.1:4444/ui/
Authoring Browser      http://127.0.0.1:7902/vnc.html?autoconnect=1&resize=scale
Juice Shop            http://127.0.0.1:3000/
pk-api-lab           http://127.0.0.1:8090/
SonarQube             http://127.0.0.1:9000/
```
