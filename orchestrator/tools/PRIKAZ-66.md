# Приказ 66 — старт стенда после перезагрузки

> Канон-репо: `D:\prettyk-dev`. Старый `C:\Users\mails\Documents\zap-kdt` — справочно, не стартовать оттуда.

## 1. Docker (основной стек)

```powershell
cd D:\prettyk-dev\services
docker network create prettyk-net 2>$null

# Основной стек
docker compose -f docker-compose.yml -f docker-compose.zap.yml -f docker-compose.target.yml up -d

# Дождаться Grid (обычно 30-90 сек)
docker ps --filter "name=selenium-hub" --format "{{.Status}}"
```

## 2. Dojo

```powershell
# Файлы скопированы из старого репо единожды:
#   D:\prettyk-dev\services\docker-compose.defectdojo.yml
#   D:\prettyk-dev\services\defectdojo\.env.example

docker compose -f docker-compose.defectdojo.yml up -d

# Проверка (302 redirect = OK)
curl.exe -sS --max-time 5 http://127.0.0.1:8081/ -o NUL -w "%{http_code}"
```

## 3. Playground + Live

```powershell
# Канон-способ (без окон):
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\prettyk-dev\orchestrator\tools\lab_ensure_ui.ps1"

# Если нужен QWEN AI assistant:
$env:PK_AI_ASSISTANT_ENABLED = "1"
# Затем lab_ensure_ui.ps1
```

## 4. Проверка всего

```powershell
# Docker — все ли живы
docker ps --format "table {{.Names}}\t{{.Status}}"

# Должны быть: selenium-hub, chrome, firefox, chrome-video (Grid)
#   zap, juice-shop, kdt-api-lab (сканер/цель)
#   allure3-secops, allure-light-secops (отчёты)
#   defectdojo-* (6 штук)
#   llm-server, llama-server, llama-server-reasoning (QWEN)
#   sonarqube, sonarqube-db (SAST — если надо)

curl.exe -sS --max-time 5 http://127.0.0.1:8765/api/run/status  # → idle
curl.exe -sS --max-time 5 http://127.0.0.1:8767/api/meta         # → idle, ai_assistant_enabled
curl.exe -sS --max-time 3 http://localhost:5173/ -o NUL -w "%{http_code}"  # → 200
```

## 5. Порты — канон

| Порт | Сервис | Проверка |
|---|---|---|
| 5173 | Editor (Vite) | `netstat -ano \| findstr :5173` |
| 8765 | Playground | `curl :8765/api/run/status` |
| 8767 | Live | `curl :8767/api/meta` |
| 8080 | ZAP API | `curl :8080` |
| 8081 | Dojo | `curl :8081` |
| 5050 | Allure3 | `curl :5050/health` |
| 4444 | Selenium Grid | `curl :4444/status` |
| 3000 | Juice Shop | `curl :3000` |
| 8766 | LLM (QWEN) | Docker health |

## 6. Перед запуском run — три курла

```powershell
curl.exe -sS --max-time 5 http://127.0.0.1:8081/ -o NUL -w "%{http_code}"  # → 302 — Dojo жив
curl.exe -sS --max-time 5 http://127.0.0.1:8765/api/run/status             # → idle — single-flight пуст
curl.exe -sS --max-time 5 http://127.0.0.1:8767/api/meta                   # → waiting — Live готов
```

## 7. Возможные косяки

| Симптом | Причина | Фикс |
|---|---|---|
| Dojo Exited (255) | compose не поднят после перезагрузки | §2 |
| Dojo up но run падает `нужен KDT_DEFECTDOJO_ENGAGEMENT` | Нет `.env.example` в `services/defectdojo/` | Скопировать из старого репо |
| `exit_code=1, gate=void` | Dojo import failed | Проверить curl :8081 + engagement ID |
| QWEN `ai_assistant_enabled: false` | `PK_AI_ASSISTANT_ENABLED` не в окружении | `$env:PK_AI_ASSISTANT_ENABLED = "1"` перед Live |
| Дубликаты python на портах | Старый процесс жив | `taskkill /IM python.exe /F`, затем `lab_ensure_ui.ps1` |
| `kdt / juice_shop_test_1` в мониторе | Старый код до фикса | Перезапустить Live — код исправлен |
| SonarQube Exited | compose отдельный | `docker compose -f docker-compose.sonarqube.yml up -d` |