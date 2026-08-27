# FINDINGS-CORRELATION: Нормализация и корреляция находок между разными сканерами

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

Разные сканеры (SonarQube, Trivy, KCS, CodeScoring, ZAP, Fuzzer, Playwright-автотесты) производят находки в разных форматах и с разной семантикой. PrettyK нормализует их в единую модель Finding, коррелирует (одна и та же уязвимость найдена разными инструментами = один Finding с multiple evidence sources), и предоставляет единую картину для Security Gates, отчётов и ГОСТ-Акта.

## Ключевые свойства

- **Единая модель Finding:** `{ id, run_id, severity, title, description, cwe_id, owasp_category, scanner, evidence_refs[], correlated_findings[] }`.
- **Нормализация.** Каждый сканер имеет adapter, который преобразует его выход в Finding.
- **Корреляция.** Findings с одинаковым CWE + target + file/endpoint автоматически группируются. Ручное подтверждение/отклонение корреляции оператором.
- **Scanner provenance.** Каждый Finding знает, какой сканер его породил и на каком шаге.
- **Severity mapping.** Разные severity-шкалы сканеров мапятся в единую: `critical → high → medium → low → info`.

## Что уже есть

- ZAP выдает алерты (сейчас пишутся в Monitor).
- SonarQube/Trivy/KCS/CodeScoring — не интегрированы (будущие адаптеры).
- Fuzzer — работает, находки не систематизированы в общую модель.

## Что нужно построить

- Модель `Finding`.
- Scanner adapter interface: `normalize(scanner_output) → Finding[]`.
- Correlation engine: группировка по CWE + target.
- API: `GET /runs/:id/findings`, `POST /runs/:id/findings/correlate`, `POST /findings/:id/confirm-correlation`.
- Интеграция с Gates: Gate policy применяется к Finding[], а не к сырым выходам сканеров.

## Честная «не обещаем»

- AI-powered correlation (ML на похожесть findings) — out of scope v1. Правила: CWE + target.
- Полные адаптеры для всех сканеров в v1 — ZAP + Fuzzer + Playwright autotests. SonarQube/Trivy/KCS/CodeScoring — по мере интеграции.

## DoD

- Модель `Finding`.
- Нормализация ZAP alerts → Finding.
- Нормализация Fuzzer findings → Finding.
- Correlation engine: группировка по CWE + target.
- Тесты: нормализация, корреляция, дедупликация.