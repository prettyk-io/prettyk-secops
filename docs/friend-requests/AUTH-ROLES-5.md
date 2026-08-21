# AUTH-ROLES-5: внедрение 5 ролей

> `lane: ready` · 19 авг 2026. Канон: [`sanctuary/canon/auth-roles.md`](../../sanctuary/canon/auth-roles.md).

## Что есть сейчас
3 учётки в `auth.ts` (appsec-operator, appsec-admin, admin-abnormal). `RoleCaps` поддерживает 3 профиля.

## Что должно быть
5 ролей. Старые переименованы, две новые — заглушки с `to evolve`.

| ID | Название | Что делать |
|---|---|---|
| `admin_sec` | Администратор ИБ | Переименовать из `appsec-admin`. Кэпы: `isAdmin=true`, все режимы кроме emergency. |
| `admin_abnormal` | Администратор НШР | Оставить как есть. Кэпы: `isAdmin=true`, emergency+manual. |
| `admin_service` | Администратор Сервиса | **Заглушка.** Кэпы: `isAdmin=true`, no assessment modes. Роль задекларирована в `RoleContext`, учётка в `auth.ts`, UI-элементы скрыты. To evolve. |
| `sec_expert` | Эксперт ИБ | Переименовать из `appsec-operator`. Кэпы: `isAdmin=false`, scheduled+manual. |
| `user` | Пользователь | **Заглушка.** Кэпы: `isAdmin=false`, no assessment modes. Read-only. To evolve. |

## DoD
- `auth.ts` — 5 учёток. Старые имена — deprecated alias.
- `RoleContext.tsx` — 5 профилей `RoleCaps`. Два новых — заглушки.
- `RoleGuard` — `isAdmin` по-прежнему гейтит Admin-роут.
- Существующие тесты не сломаны.
- `tsc --noEmit` зелёный.

## Out of scope
- Бэкенд-различия ролей (FE-only, как сейчас)
- Реализация `admin_service` и `user` (только заглушки)
- Банковские роли (Cosmo, INTEGRATION)