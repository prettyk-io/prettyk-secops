# COSMO-STRATEGY: интеграция пилота в портал Cosmo

> **Sanctuary** — cosmo-канон (не pure). Slice: **16 августа 2026** (2FA: зачисление по явной просьбе владельца).
> Уровень интеграции пилота: коробка PrettyK SecOps Lab встраивается в портал **Cosmo** (кейс ЦБ).
> Смежное: [`CANON-PURE.md`](CANON-PURE.md) (коробка), [`TZ-INTEGRATION.md`](TZ-INTEGRATION.md) (ТЗ на интеграцию),
> [`canon/split-canon.md`](canon/split-canon.md) (BASE vs INTEGRATION), [`canon/brand-strategy.md`](canon/brand-strategy.md).
> Патчи через 2FA. Не pure: имя портала и кейс ЦБ живут **только** здесь и на ветке `cosmo`.

## 1. Что это

**Cosmo** — чужой корпоративный портал разработки (app → builds[] → deploys[] → URL).
Мы **не** делаем второй продукт и **не** брендируем Cosmo под себя. Мы **встраиваем** коробку
`prettyk-pure` в этот портал как integration pack.

```text
PrettyK SecOps Lab (коробка, pure)
        │  встраивается в
        ▼
Cosmo (портал ЦБ)
└── app-code → builds[] → deploys[] → URL
       ↑ потребляет коробка (custom-стык)
    meta.project_id · infrastructure.base_url_override
```

## 2. Модель (пак поверх коробки)

| Слой | ID | Смысл |
|---|---|---|
| Коробка | `prettyk-pure` | Что продаём и гоняем **до** внедрения. Default. |
| Пак пилота | `cosmo-custom` | Как коробка **сидит внутри** портала Cosmo (кейс ЦБ). |

- К другому банку (Сбер и т.д.) — **та же коробка**, другой `*-custom` пак позже.
- Ядро (ZAP-адаптер, gate, hooks, fuzz) живёт в **коробке**; custom — только стык с portal.
- CANON-код **никогда** не импортирует из INTEGRATION. INTEGRATION может импортировать из CANON.

## 3. Цели пилота

1. Доказать, что коробка встраивается в ЖЦ портала ЦБ без форка и без «второго продукта».
2. Закрыть лесенку ЖЦ: app → build → deploy → URL → прогон коробки по тому же `project_id`.
3. Отработать ролевую модель банка (admin_ib / nshr / expert_ib) поверх RBAC коробки.
4. Выдать ТЗ на интеграцию (ГОСТ 34.602) и акт допуска — как продуктовый контракт.
5. Собрать доказательную базу для пресейла следующему банку (тот же пак, другой portal).

## 4. Границы пилота (что НЕ делаем)

- **Не** брендируем Cosmo; это чужой портал, не наш SKU.
- **Не** делаем mock прод-API Cosmo нормой — mock = заглушка до реального API.
- **Не** тащим CBR-пакет (`sanctuary/canon/custom/cosmo/cbr-specific/`) в git — только локально (rule `cbr-cosmo-only.mdc`).
- **Не** делаем второй `docs/manifest.json` — SoT один.
- **Не** создаём git worktree / `fork/*` / `pack/*` без явного приказа.

## 5. Контур пилота (что уже есть / что дозревает)

| Компонент | Статус | Где |
|---|---|---|
| Ролевая модель банка (admin_ib / nshr / expert_ib) | landed | [`canon/auth-roles.md`](canon/auth-roles.md), `frontend/src/form/applyRoleFormCaps.ts` |
| Лесенка ЖЦ (CosmoLadderFields) | mock | `frontend/src/form/CosmoLadderFields*` |
| Admin Deploy registry | mock | `frontend/src/admin/deployStore.ts` |
| CI пака | GitLab CI (DjiGit — РФ-approved форк) | [`canon/split-canon.md`](canon/split-canon.md) §2.5 |
| ТЗ на интеграцию | skeleton | [`TZ-INTEGRATION.md`](TZ-INTEGRATION.md) |
| Документация ЦБ | `sanctuary/canon/custom/cosmo/cbr-specific/**` | только локально, не в git |

## 6. Следующие шаги пилота

1. Реальный API портала (app/build/deploy) вместо mock — когда портал даст.
2. Стык live-монитора с прогоном по `project_id` из портала.
3. Акт допуска по итогам пилота (admission gate коробки).
4. Фиксация, что из пилота возвращается в коробку (общее) vs остаётся в паке (custom).

## 7. Правило утечки

Банкинг как домен ИБ — ок. Утечка **этого** пака/кейса в общий контур (dev/main/docs) — нет.
CBR-пакет (`sanctuary/canon/custom/cosmo/cbr-specific/`) — только локально, не в git. См. rule `cbr-cosmo-only.mdc`.