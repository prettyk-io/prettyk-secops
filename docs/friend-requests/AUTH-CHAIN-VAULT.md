# FRIEND-REQUEST: AUTH-CHAIN-VAULT — Мульти-профильная авторизация и цепочки токенов

**Статус:** `lane: ready`  
**Дата:** 17 августа 2026  
**Авторы:** Максим, Keeper, Boss (Bro + Flash)  
**Область:** `orchestrator/core/auth_vault.py`, `orchestrator/core/auth_bootstrap.py`, `cosmo/src/form/authVault.ts`

---

## 1. Зачем заказчику (Customer Value)

В реальных банковских и корпоративных ИБ-контурах статических Bearer-токенов или постоянных паролей не существует. Приложение требует динамической аутентификации перед стартом проверки:
1. Выполнить pre-flight запрос (`POST /api/v1/auth/login` с логином/паролем или сертификатом).
2. Извлечь динамический `accessToken`, `Set-Cookie` (session_id) или CSRF-токен из ответа.
3. Сохранить извлечённые значения в защищённый контекст сессии (`{{auth.token}}`, `{{auth.cookie}}`, `{{auth.csrf}}`).
4. Автоматически пробросить эти заголовки и куки в ZAP daemon (через Replacer), исключая хардкод секретов в JSON-манифесте проверки.

---

## 2. Реализованный скоуп

### Бэкенд (`orchestrator/core/auth_vault.py`)
- **`AuthProfile` & `AuthExtractRule`**: декларативные структуры для описания эндпоинта логина, метода, тела запроса и правил извлечения токенов из JSON, заголовков или кук.
- **`extract_value_by_path`**: надежное извлечение вложенных полей (`data.token`, `items.0.jwt`).
- **`AuthChainVault`**:
  - `execute_preflight(profile, base_url)`: выполняет pre-flight вызов и наполняет контекст токенов.
  - `inject_into_zap(zap_adapter, context_name, token_var, auth_type)`: добавляет правила ZAP Replacer для автоматической подстановки динамических Bearer и Cookie во все сетевые вызовы сканера.

### Фронтенд (`cosmo/src/form/authVault.ts`)
- Декларативные типы `AuthProfileUI` и `AuthExtractRuleUI`.
- Утилиты `extractValueByJsonPath` и `extractAuthTokens` для предпросмотра и маппинга токенов в UI редактора.

---

## 3. Верификация и тесты

- `orchestrator/tests/test_auth_vault.py` — 3/3 тестов успешно (извлечение путей, mock-preflight, инъекция в ZAP Replacer).
- `cosmo/src/form/authVault.test.ts` — 2/2 тестов успешно.
- `npx tsc --noEmit` — 0 ошибок.

---

## 4. Границы (Out of Scope)

- Манифест `docs/manifest.json` не модифицируется без явного решения 2FA.
- Секреты маскируются и не попадают в открытый лог и историю прогона.
