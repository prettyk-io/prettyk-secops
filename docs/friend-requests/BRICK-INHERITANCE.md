# BRICK-INHERITANCE: Каталог Pipeline Bricks с наследованием и переопределением

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

Pipeline Bricks — переиспользуемые определения шагов безопасности (build, sast, sca, deploy, dast, autotest, gate). Единый каталог коробки (`prettyk-pure`) поставляет базовые кирпичи. Каждый Domain может переопределить любой кирпич своим (`cosmo-custom`). Разрешение: сначала ищем в домене, потом в коробке.

## Ключевые свойства

- **Единый каталог коробки:** `brick-build-docker`, `brick-sast-sonarqube`, `brick-sca-trivy`, `brick-deploy-stage`, `brick-dast-zap`, `brick-autotest-playwright`, `brick-gate-severity-threshold`.
- **Переопределение на домен.** Domain «Цифровой рубль» может заменить `brick-deploy-stage` на свой (специфичный раннер или политика ЦБ).
- **Разрешение:** `domain:{id}/brick-xxx` → если нет → `core/brick-xxx`.
- **Зависимости.** Кирпич может `depends_on` другие кирпичи — формирует DAG при компиляции.
- **Brick не содержит секретов.** Credentials, токены, URL'ы — через Vault / переменные окружения, не в определении кирпича.

## Что уже есть

- Ничего. Кирпичи как сущность отсутствуют полностью.

## Что нужно построить

- Модель: `PipelineBrick { id, name, type, source, definition, gates, depends_on }`.
- Каталог коробки: минимум 8 базовых кирпичей (build, sast, sca ×2, deploy, dast, autotest, gate).
- API: `GET /bricks?domain_id=X` — список кирпичей с учётом переопределений.
- Механизм переопределения: `POST /domains/:id/bricks` — создать domain-specific кирпич.
- Валидация: depends_on ссылается на существующие кирпичи.

## Честная «не обещаем»

- Визуальный редактор кирпичей — out of scope. Кирпичи задаются через API/конфиг.
- Версионирование кирпичей — out of scope v1.
- Динамическое разрешение depends_on в runtime — будет в Plan Compiler.

## DoD

- Модель `PipelineBrick`.
- Каталог из 8 базовых кирпичей в коробке.
- API списка кирпичей с domain-override.
- Создание domain-specific кирпича.
- Тесты: разрешение (domain → core), переопределение, валидация depends_on.