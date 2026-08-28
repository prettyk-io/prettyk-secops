# AUTH-ROLES: сплит учёток и ролей коробки

`lane: ready`

## Тезис

Заменяем единого `operator/operator` на три учётки с разными ролями и кэпами: оператор AppSec (без админки), администратор AppSec (полный доступ), abnormal-админ (только внештатная + ручная).

## As-built якорь

- `cosmo/src/shell/auth.ts` — три учётки:
  - `appsec-expert@dev.spaceport.ru` / `operator` → роль `appsec-operator`
  - `appsec-admin@dev.spaceport.ru` / `admin_appsec` → роль `appsec-admin`
  - `admin-abnormal@dev.spaceport.ru` / `admin_abnormal` → роль `admin-abnormal`
- `cosmo/src/roles/RoleContext.tsx` — три профиля `RoleCaps` (поля `canSelectScheduled/PreRelease/Emergency/Manual`):
  - `OPERATOR_CAPS`: `isAdmin: false`, `scheduled+manual`, без pre_release/emergency
  - `ADMIN_CAPS`: `isAdmin: true`, `scheduled+pre_release+manual`, без emergency
  - `ABNORMAL_CAPS`: `isAdmin: true`, `emergency+manual`, без scheduled/pre_release
- `cosmo/src/wired/WiredSection.tsx` — фильтрация опций `meta.assessment_purpose` по капсам (`PURPOSE_CAP`).
- `cosmo/src/wired/WiredField.tsx` — селект сбрасывает значение, если оно вне дозволенных опций.
- `RoleGuard` обёрнут вокруг Admin-карточки HomePage (`requires="isAdmin"`) и на route `/admin` в App.tsx.
- `auth.test.ts` обновлён под три учётки.

## Видимость опций «Назначение проверки»

| Опция | operator | admin | abnormal |
|---|---|---|---|
| Плановая (scheduled) | ✓ | ✓ | ✗ |
| Контроль релиза (pre_release) | ✗ | ✓ | ✗ |
| Внештатная (emergency) | ✗ | ✗ | ✓ |
| Ручная (manual) | ✓ | ✓ | ✓ |

## К какому FRIEND дозреет

К FRIEND «Ролевая модель» (роль оператора, админа, abnormal — это скелет контракта `RoleCaps`). Возможно, отдельный тонкий FRIEND `ABNORMAL-ROLE` когда пропишем abnormal.

## Честная «не обещаем»

- Abnormal — кэпы формы `generateAct/overrideScanUrl/debug/webswing` выключены; полный разбор abnormal — отдельным шагом.
- FE-only: бэк не знает про роли, все три учётки проходят одинаково через API.
- `RoleCaps` остаётся контрактом полей формы; банковские роли — INTEGRATION.