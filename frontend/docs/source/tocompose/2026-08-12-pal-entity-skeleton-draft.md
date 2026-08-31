# PAL — черновик скелета сущностей (из UI + пайпов)
<!-- compose-request_46 -->


> **Не CANON.** `lane: evolve` материал к **приятелю PAL** (не друг / не hub FRIEND).  
> Источники: [wave1 UI](2026-08-12-cosmo-portal-settings-wave1.md) · Stage 2 · PI salvage · ladder FR.

## Сущности (черновик)

```text
Space (группа / «экспедиция» / AD-видимость)
  └── Project (карточка)  routes: info|builds|releases|members|quota|settings
        code, name, type (Крейсер|Линкор|…), capsule, group, url?, priority?
        TeamMember[]  /members: user, fio, role, registeredAt, lastLogin
        LcConfig      /settings: custom build/deploy paths + steps[]
        Build[]       /builds: purpose, commit, status, domain, storage, lastRun
        Release[]     /releases: name, status, releasedAt, type
        QuotaBucket[] /quota: VM/storage/autotest reports/build artifact retention/…
        NotificationRule[]  /settings/notifications (global): audience all|personal|team
```

Маршруты: [`2026-08-12-pal-card-routes-wave.md`](2026-08-12-pal-card-routes-wave.md).

### LcStep имена (с UI settings, блок «Статический анализ и сборка» + соседи)

Сборка · Юнит-тестирование · Генерация документации · SonarQube · PTAI · Solar Appscreener · Trivy · CodeScoring · Sandbox · Kaspersky Container Security · Развёртывание ПО · Выполнение автотестов · (Smoke / интеграции — в headings, уточнить привязку).

Маппинг на `STAGE*` / `WHEN_*` в BRPO include — **open** (нужна таблица 1:1).

### DAST as-is (не сущность портала)

`scannerRun` / `BlackBoxRun` живут в CI: variables + autorun file + optional auth script + SARIF → findings intake.  
В портале — модалка параметров и галочка ЖЦ, не объект «проверка».

## Связь с коробкой (пак, не SoT)

| Portal | Коробка (потребление) |
|---|---|
| Project.code | `meta.project_id` |
| Deploy.url | `infrastructure.base_url_override` |
| Build/Release labels | ladder mock → later live |
| Team / notify | later Admin replication (PAL-7), не копипаст UI |
| NotificationRule (факт UI) | type crit\|info; audience all\|admins\|ops\|**team**\|personal; delivery gui\|email\|both; if team → ProjectRef (name—code) + TeamScope (role: IT-лидер… \| Эксперт ИБ \| все участники) |

## Уточнения владельца (2026-08-12)

- **НШР** не в `/members`: внештатный эксплуатационный режим, все права, в карточку не сажают.  
- **Custom pipelines** — прежде всего **Линкор**; 1 lvl в жизни ≈ Линкоры; прочие типы ~10% юзабельности.  
- Include + custom: `generate_pipeline` патчит/везёт вместе.  
- См. [`2026-08-12-pal-owner-answers-nshr-lincor.md`](2026-08-12-pal-owner-answers-nshr-lincor.md).

## Дыры

- Create notification UI (фулскрин).  
- STAGE↔UI таблица 1:1.  
- Кто commit’ит `scanner/` (job vs руками).
