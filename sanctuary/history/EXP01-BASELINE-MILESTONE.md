# EXP-01 BASELINE MILESTONE · 20.08.2026

> **Статус:** заморожен. Ждёт формальной канонизации владельцем.

## Что за milestone

Первый **чистый E2E-прогон** на новом стеке OpenCode (DeepSeek V4 Pro) без ручной сборки манифеста.

## Составляющие

| Компонент | Статус |
|---|---|
| Стек | OpenCode + DeepSeek V4 Pro (не Cursor) |
| Feature toggle `KDT_AI_ASSISTANT_ENABLED` | Вкручен, default OFF |
| Toggle gate в `live_server.py` + `adminApi.ts` + `DojoFindingsTable.tsx` | Работает |
| Qwen3-1.7B (Boss) | Затогглен, UI скрыт при OFF |
| Penguin diagnostics gate (`penguinDiagnosticsGate.ts`) | Чинит кнопку «Проверить» — Monaco ошибки блокируют валидацию |
| 230 EN-алиасов prettyK DSL (Flash) | `method_ids.json`, 50/50 тестов |
| Manifest `juice_shop_test_1` из чека `39f0eaa3` | Извлечён, `debug_mode=true`, заморожен в fixtures |

## Итог эталонного прогона

```
Манифест:   orchestrator/tests/fixtures/exp01_reference/manifest.json
Проект:     exp01-baseline
Exit:       0 (gate=void, debug_mode)
Spider:     982 URL
ActiveScan: 4941 raw alerts → 28 unique (XML)
Collapse:   20 кластеров (13 systemic, 7 location)
Severity:   H=1 M=6 L=14 I=7
Dojo:       product id=1, engagement id=1, 28 findings
Allure:     http://127.0.0.1:5050/
```

## Артефакты (заморожены)

```
orchestrator/tests/fixtures/exp01_reference/
  manifest.json
  spider_urls.json
  zap_raw_report.xml
  zap_raw_alerts_from_xml.json
  dojo_baseline_findings.json
  run_summary.json
```

## Dojo reference

```
http://127.0.0.1:8081/product/1
http://127.0.0.1:8081/product/1/findings
http://127.0.0.1:8081/engagement/1
```

## Примечание

Первый полный цикл «Editor → CLI run → ZAP → Allure → Dojo» без ручной правки манифеста. Локаторы checkout-а отвалились в новой версии Juice Shop, но `continue_on_failure: true` спасает — пайплайн доходит до ZAP scan и XML-отчёта в любом случае. Локаторы — отдельный эпик, не блокер baseline.