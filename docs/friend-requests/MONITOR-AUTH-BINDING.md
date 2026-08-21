# MONITOR-AUTH-BINDING: доступ к Monitor извне без авторизации (bind vs чужой)

`lane: ready` → **принят 15 авг 2026 (2FA одобрен).** Зачислен в hub как часть `CANON` `monitor-hub.md` (раздел II. ACL).

## As-built (что реально сделано)

- **Split admin** — `live_pers_acl.ADMIN_USERS = frozenset({"admin", "admin_appsec", "admin_abnormal"})`; admin_appsec/admin_abnormal видят любой инстанс, оператор — только свой.
- **Bind-токен (HMAC-SHA256)** — `issue_monitor_token(run_id, owner, ttl=…)` → `<payload_b64>.<signature_b64>`, payload `{run_id, owner, exp}`. TTL default 7 дней (`KDT_MONITOR_TOKEN_TTL`, env `KDT_MONITOR_TOKEN_SECRET`).
- **Проверка** — `verify_monitor_token(token, run_id)` + `may_view_run(caller, run_id, token)` (приоритет token → ACL).
- **Mint-эндпоинт** — playground `POST /api/monitor/token` (`data_playground.py`) + авто-mint в `lab_run.start_run()` (`monitor_token = issue_monitor_token(run_id, owner)`).
- **Live server** — `live_server.py` читает `?token=` из query в `_serve_*` (приоритет bind-токен → `X-KDT-User`/cookie).
- Тесты: `orchestrator/tests/test_live_pers_acl.py` (issue/verify/may_view_run + ACL) — 18 passed (вместе с retention).

## Тезис

Ссылка на конкретный instance мониторинга должна **открываться снаружи без авторизации, если она забиндена** к проверке (свой инстанс). Если инстанс **чужой** — оператор не может его открыть, а **admin ИБ и abnormal — могут любой**.

Это ролевая модель доступа к монитору поверх существующего ACL `live_pers_acl`.

## Ролевая модель (пожелание владельца)

| Роль | Свой инстанс | Чужой инстанс |
|---|---|---|
| `operator` (appsec-expert) | ✅ по bind-ссылке без логина | ❌ запрещено |
| `admin_appsec` (appsec-admin) | ✅ | ✅ любой |
| `admin_abnormal` (admin-abnormal) | ✅ | ✅ любой |

## As-built якорь

### Бэкенд (уже есть)
- `orchestrator/utils/live_pers_acl.py`:
  - `ADMIN_USERS = {"admin"}` — **плоский** admin-флаг, без split `admin_appsec` / `admin_abnormal`.
  - `may_view_owner(caller, owner)` — admin видит всё; оператор только своё; `legacy`/пустой owner — всем.
  - `parse_caller_user(headers)` — читает `X-KDT-User` или cookie `kdt_user=`.
  - `redact_meta_for_caller` / `filter_evidence_list`.

### Фронт (Editor, роли)
- `cosmo/src/shell/auth.ts` — `AuthRole = 'operator' | 'admin_appsec' | 'admin_abnormal'`, `CREDENTIALS` (3 учётки).
- `cosmo/src/roles/RoleContext.tsx` — `capsForRole`, `OPERATOR_CAPS` / `ADMIN_CAPS` / `ABNORMAL_CAPS`.
- `App.tsx` — `handleOpenMonitor` открывает `LIVE_HOME?run_id=…` без передачи caller.

## Что сделать (набросок, не финал)

1. **Split admin на бэке**: `ADMIN_USERS` → мапа `{admin_appsec, admin_abnormal}` как «видят всё»; оператор — только своё.
2. **Bind-токен**: ссылка `:8767/?run_id=…&check_id=…` должна нести proof привязки (подписанный/разовый токен или `X-KDT-User`+owner-совпадение), чтобы **свой** инстанс открывался без логина.
3. **Чужой инстанс**:
   - оператор → 403/заглушка «нет доступа»;
   - admin_appsec / admin_abnormal → любой инстанс.
4. `App.tsx` `handleOpenMonitor` — прокидывает caller/токен в URL при открытии.

## К какому FRIEND дозреет

К FRIEND «Runtime-shell / Live» (ACL Monitor) — тот же столп, что и `MONITOR-INSTANCE-BINDING`.

## Честная «не обещаем»

- Механика bind-токена (HMAC / разовый nonce / короткоживущий JWT) — архитектурный выбор, не «сделать как сказано».
- Синхронизация ролей FE (`auth.ts`) ↔ BE (`live_pers_acl`) — нужно единое перечисление ролей, иначе split разъедется.
- «Без авторизации снаружи» для bind-ссылки — компромисс между удобством и безопасностью; требует решения владельца по формату токена.
