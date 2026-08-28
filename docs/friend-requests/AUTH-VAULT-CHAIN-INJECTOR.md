# Friend-Request: Pre-flight аутентификация и динамическая инъекция токенов (Auth Vault & Chain)

> **ID:** `AUTH-VAULT-CHAIN-INJECTOR`  
> **Статус:** `ready`  
> **Роль / Исполнитель:** Boss / Flash  
> **Слой:** Backend (`orchestrator/services/auth_vault.py`) ↔ scanner Replacer ↔ Frontend (`cosmo/src/admin/`)

---

## 1. Продуктовая суть и замысел

Для боевых проверок в банках и enterprise-системах требуется надежный механизм **автоматического прохождения аутентификации до старта атак (Pre-flight Auth)** и **поддержания сессии**:
1. **Типы профилей авторизации (Auth Profiles):**
   - **OAuth2 / OIDC** (Authorization Code + PKCE, Client Credentials, Password Grant, Device Flow).
   - **Custom HTTP Login Sequence** (мультишаговая цепочка запросов с передачей CSRF-токенов/кук из шага N в шаг N+1).
   - **Browser Headless Auth (Playwright/CDP)** — для сложных форм с капчей/JS-челленджами, где токен извлекается из `localStorage` / `cookies` браузера.
   - **mTLS / Client Certificates** — загрузка PEM/PFX сертификатов для взаимной аутентификации.
2. **Динамическая инъекция токенов (Dynamic Token Injection):**
   - Инъекция свежего токена/куки во все исходящие запросы сканеров и сценариев через **scanner Replacer / Proxies** на лету.
   - Автоматический перехват `401 Unauthorized` / `403 Forbidden` с триггером повторного цикла аутентификации без прерывания общего прогона.
3. **Безопасное хранилище секретов (Vault):**
   - Шифрование секретов (AES-256-GCM) в локальной БД/манифесте.
   - Маскирование секретов в логах Allure3 и KDT Live (`Bearer eyJ...***`).

---

## 2. Архитектура и API-контракт

1. **Модуль аутентификации (`orchestrator/services/auth_vault.py`):**
   - `execute_auth_flow(profile_id)` — выполнение последовательности запросов / браузерного сценария.
   - `extract_session_tokens(response_or_page)` — парсинг JWT, Bearer-токенов, JSESSIONID по JSONPath/XPath/Regex.
   - `apply_to_scanner_replacer(tokens)` — автоматическая конфигурация правил scanner Replacer API для подстановки заголовков `Authorization: Bearer <token>`.
2. **Admin & Studio UI:**
   - Форма настройки шагов аутентификации с живым тестированием кнопки «Check Auth Flow».
   - Индикатор валидности текущей сессии (зеленый / красный статус + время жизни TTL токена).

---

## 3. Критерии приёмки (DoD)

- [ ] Тестовый прогон OAuth2 Client Credentials успешно получает токен и передает его в scanner.
- [ ] При истечении токена воркер автоматически перезапрашивает его и продолжает сканирование.
- [ ] Чувствительные данные (пароли, client_secrets) не утекают в сырой JSON-отчет и маскируются в логах.
- [ ] Покрыто Unit-тестами на сценарии успешного входа, невалидного пароля и таймаута IdP.

---

## 4. Delivery Log (Flash)

> Статус документа: `ready`. Сервисный слой, шифрование, OAuth2, auto-refresh, Playwright, mTLS, Admin-панель и Live-эндпоинты закрыты. Интеграция в прогон (Controller → auth flow до старта сканера) и настоящая Browser headless в прогоне (Playwright на хосте/VM) — отдельный скоуп.

### Сделано

- **`orchestrator/services/auth_vault.py`** — сервисный модуль (~670 строк):
  - **EncryptedVault** — AES-256-GCM шифрование at-rest. Ключ из `KDT_VAULT_KEY` → hex/base64/raw, fallback SHA-256 от `KDT_MANIFEST_KEY`, dev-ключ. Формат `kdt:vault:v1:<nonce_b64>:<ct_b64>`.
  - **mask_secret** — маскирование JWT (`<head>.***.<sig***>`), Bearer (`Bearer ***`), длинных hex/base64, + `mask_headers`, `mask_json` (глубоко в словари по чувствительным ключам `password/secret/token/api_key/...`).
  - **OAuth2 / OIDC** — `execute_oauth2` (grant types: `client_credentials`, `password`, `authorization_code` + PKCE S256), `build_authorization_url`, auth styles `body` | `basic`.
  - **extract_session_tokens** — JWT/Bearer из JSON, `Authorization` header, `JSESSIONID`/Set-Cookie, raw body fallback.
  - **apply_to_scanner_replacer** — инъекция `Authorization: Bearer <tok>` + Cookie через duck-typed scanner `add_replacer_rule`.
  - **AutoRefreshSession** — TTL-aware авто-продление (token → `expires_in` → запас 5с). `send()` ловит 401/403 → `refresh_fn()` → retry.
  - **browser_headless_auth** — Playwright headless (Chromium) → `localStorage` + `cookies` → маска. Без `playwright` в окружении — честный degrade.
  - **mTLS** — `load_mtls_context`: PEM (cert+key) и PFX/P12 через `cryptography.hazmat`.
  - **State ledger** — `save_vault_state`/`load_vault_state` из `LIVE_DIR/auth_vault_state.json`.
  - **Profile registry** — `register_oauth2_profile` + `check_auth_flow` (живой pre-flight + обновление ledger + маскированные токены для Admin UI).

- **`cosmo/src/admin/sections/AuthVaultPanel.tsx`** — Admin-панель:
  - Сводка: активные сессии / всего профилей.
  - Таблица профилей: ID, kind/auth_type, сессия (валидна + TTL), маскированный токен, ошибка.
  - Кнопка **Check Auth Flow** на каждом профиле → POST `/api/auth/vault/check` → результат.
  - Карточка «Хранилище секретов»: шифрование AES-256-GCM, маскирование в логах.

- **`cosmo/src/admin/AdminLayout.tsx`** — секция `auth-vault` в меню (`SafetyCertificateOutlined`).

- **`cosmo/src/admin/adminApi.ts`** — `fetchAuthVaultStatus` / `postAuthVaultCheck`.

- **`orchestrator/utils/live_server.py`** — эндпоинты:
  - `GET /api/auth/vault/status` → `_serve_auth_vault_status` (профили с маскированными токенами из ledger).
  - `POST /api/auth/vault/check` → `_accept_auth_vault_check` (живой прогон `check_auth_flow`).

### Тесты

`pytest orchestrator/tests/test_auth_vault_service.py` — **28 passed**: encrypt/decrypt roundtrip, is_encrypted, mask (JWT/Bearer/short/headers/JSON recursive), extract_session_tokens (JSON/header/cookie/raw JWT), OAuth2 client_credentials success/invalid/non-json/missing-url, PKCE URL, scanner Replacer bearer+cookie+no-adapter, AutoRefreshSession (401 retry, TTL expiry, validity), mTLS empty/not-found, check_auth_flow (registered → masked + state; unknown profile).

### Не сделано (вне этого скоупа)

- Интеграция в живой прогон (Controller вызывает auth flow до старта сканера и пробрасывает токен в HttpAdapter/scanner).
- Настоящий Playwright browser headless в прогоне (окружение, установка playwright, VM/no-VM).
- Браузерные профили формы/MFA в Admin UI (сейчас только OAuth2).
- GUI-форма настройки OAuth2-профиля в Studio (профили заводятся кодом/манифестом).
