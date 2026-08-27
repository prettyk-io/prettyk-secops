# CAPABILITY-BROKER: Security Capability Broker для ZAP, Playwright и Fuzzer

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

Security-раннеры (ZAP demon, Playwright CDP, Fuzzer) не запускаются через generic ExecutionAdapter. Они требуют изоляции, привязки к run_id, специфичного управления (CDP, прокси, словари) и контролируемого teardown. SecurityCapabilityBroker — прослойка, которая запускает security-раннеры с гарантией изоляции и чистоты evidence chain.

## Ключевые свойства

- **Не часть ExecutionAdapter.** Security-раннеры — отдельный контракт.
- **Изоляция.** Каждый run получает свой sandbox: выделенный ZAP demon, выделенный браузерный контекст, изолированный Fuzzer threadpool.
- **Привязка к run_id.** Все сессии (ZAP, CDP, Fuzzer) имеют `run_id` в метаданных — для evidence provenance.
- **Контролируемый teardown.** При завершении Run (или abort) Broker гарантированно убивает все сессии. Никаких висячих контейнеров/прокси.
- **Три capability:**
  - `startZAPDemon()` → ZAP proxy session
  - `startPlaywrightCDP()` → браузерный контекст (connectOverCDP или launch)
  - `startFuzzer()` → Fuzzer с dictionary set

## Что уже есть

- ZAP demon (поднимается в Docker, API на `:8080`).
- Playwright Browser Core (PW-BROWSER-CORE friend request — режимы launch/connectOverCDP/BrowserContext).
- Fuzzer (threadpool, словари SQLi/XSS/command injection/path traversal).

## Что нужно построить

- Интерфейс `SecurityCapabilityBroker`.
- API: `POST /runs/:id/capabilities/zap`, `POST /runs/:id/capabilities/browser`, `POST /runs/:id/capabilities/fuzzer`.
- Sandbox manager: создание/уничтожение изолированных сессий.
- Привязка сессий к `run_id` в метаданных.
- Гарантированный teardown (graceful → force kill).

## Честная «не обещаем»

- Полная контейнеризация каждого run (отдельный Docker container на run) — out of scope v1. Изоляция через сессии/контексты.
- Масштабирование security-раннеров на несколько машин — out of scope v1.

## DoD

- Контракт `SecurityCapabilityBroker`.
- ZAP demon: start → proxy active → teardown.
- Playwright CDP: start → browser context → teardown.
- Fuzzer: start → dictionary load → teardown.
- Привязка к `run_id`.
- Тесты: изоляция сессий, teardown при abort, evidence provenance.