# Research & Architecture: User Profiles, Granular RBAC & Identity System (2026)

> **Статус:** Research & Product Specification · **Профиль:** `secops-lab-pure` + `cosmo-custom`  
> **Автор:** Keeper (PO / CTO) · **Дата:** 24 августа 2026 г.

---

## 1. Диагностика: Откуда тянется сейчас и в чём «залёт»

### Текущий факт
В текущей кодовой базе (`cosmo/src/shell/auth.ts`) полноценной сущности **«Профиль пользователя»** нет.
Есть статический словарь-заглушка `USERS: Record<AuthUser, UserRow>` с 7 захардкоженными логинами и ролями:
- `admin` → `'Администратор'`
- `admin-sec@...` → `'Администратор ИБ'`
- `expert-sec@...` → `'Эксперт ИБ'`
- `user@...` → `'Пользователь'`

**Почему это ограничение давит сейчас:**
1. **Нет редактируемого имени/email:** Если логинишься под новым аккаунтом или через SSO — отображаемое имя падает в fallback или пустоту.
2. **Рассинхрон настроек:** Тема (`pk.theme`), шрифт (`pk.design.font`), язык (`pk.locale`) живут в разрозненных ключах `localStorage`, не привязаны к пользователю.
3. **Нет API-токенов (PAT):** Чтобы встроить PrettyK в CI/CD или скрипты, сейчас нет возможности выпустить персональный токен доступа (Personal Access Token) из профиля.
4. **Роли как строки, а не разрешения (Caps):** Проверки прав размазаны по коду («если `admin_sec` — показать кнопку»), вместо декларативной матрицы прав (`capabilities`).

---

## 2. Как это устроено в индустрии (Enterprise Security Benchmarks)

Анализ лидеров рынка DevSecOps и B2B платформ (**Snyk, Datadog, Grafana, PortSwigger Burp Enterprise, GitLab, Linear**):

| Измерение | Как делают лидеры (Best Practice 2026) | Как должно быть в PrettyK |
|---|---|---|
| **Identity (Идентичность)** | Имя, Фамилия, Email, Аватар (или инициалы в неоновом круге), Организация/Отдел. | Имя, Email, Отдел/Роль, Авто-генерация инициалов с градиентом. |
| **RBAC / Capabilities** | Роль (напр. *Security Admin*) раскрывается в массив гранулярных прав (`audit:write`, `fuzz:execute`, `policies:manage`). | `RoleCaps` — строгая типизированная матрица разрешений без хардкода ролевых строк в UI. |
| **API & Automation (PAT)** | Выпуск Personal Access Tokens со сроком жизни (TTL), скоупами и мгновенным отзывом. | Вкладка «API Токены» в профиле: генерация `pk_live_...` токена для CLI/CI-пайплайнов. |
| **Preferences (Персонализация)** | Шрифт интерфейса, цветовая тема, плотность (density), язык, дефолтный target. | Единый объект `preferences`: Theme (`meta-dark`/`meta-light`), Font (`Golos`/`Astra`/`Inter`), Locale (`ru`/`en`). |
| **Security & Sessions** | Активные сессии, IP входа, 2FA/TOTP статус, кнопка «Завершить все сессии». | Инвентаризация текущей сессии, 2FA-индикатор, логаут со всех устройств. |

---

## 3. Архитектура: На чём и как драйвить

Чтобы система работала **и в легковесной коробке (Pure Box)**, **и в Enterprise-контурах (Банки / Cosmo / Госсектор)**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        ЕДИНЫЙ ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ                     │
│                        (UserProfile Context / Store)                   │
├────────────────────────────────────────────────────────────────────────┤
│  1. Identity Layer:    ID, Email, Display Name, Initials, Space/Org    │
│  2. Security Layer:    Role, Granular Capabilities, Active Sessions    │
│  3. API Tokens (PAT):  pk_live_*, Scopes, Expiration, Revocation      │
│  4. UI Preferences:    Theme (Dark/Light), Font (Golos/Astra), Locale  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
│       PURE BOX (STANDALONE)          │    │       ENTERPRISE / COSMO CUSTOM      │
├──────────────────────────────────────┤    ├──────────────────────────────────────┤
│ • Локальный JSON Ledger                │    │ • OIDC / SAML 2.0 Federation (SSO)   │
│ • Автономный выпуск JWT + PAT        │    │ • Keycloak / Active Directory / LDAP │
│ • Хранение preferences в профиле     │    │ • Синхронизация ролей из IdP claims  │
└──────────────────────────────────────┘    └──────────────────────────────────────┘
```

### Принцип единого окна профиля (Cross-Surface UI)
Профиль не должен быть разным в Admin (MUI) и Studio (shadcn).  
В верхнем правом углу хедера **всех поверхностей** клик по имени профиля открывает единый **User Profile Drawer / Dialog**:
- **Вкладка 1: Общие данные (General)** — Имя, Email, Роль, Отдел.
- **Вкладка 2: Внешний вид (Appearance)** — Тема, Шрифт (Golos / Astra / Inter), Язык.
- **Вкладка 3: API Токены (Access Tokens)** — Генерация токенов для автоматизации и CI/CD.
- **Вкладка 4: Безопасность (Security)** — Сессия, права, выход.

---

## 4. Канонический контракт данных (TypeScript)

```typescript
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: LabRole;
  department?: string;
  avatarUrl?: string | null;
  capabilities: UserCapability[];
  preferences: UserPreferences;
  createdAt: string;
  lastLoginAt: string;
}

export type UserCapability =
  | 'admin:access'
  | 'control:access'
  | 'checks:create'
  | 'checks:import'
  | 'checks:delete'
  | 'fuzzer:execute'
  | 'policies:manage'
  | 'retention:clean'
  | 'tokens:manage';

export interface UserPreferences {
  theme: 'dark' | 'light' | 'system';
  font: 'golos' | 'astra' | 'inter';
  locale: 'ru' | 'en';
  density: 'compact' | 'standard';
}

export interface PersonalAccessToken {
  id: string;
  name: string;
  tokenMasked: string; // pk_live_****3a8f
  scopes: UserCapability[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}
```

---

## 5. Выводы и дорожная карта реализации

1. **Не плодить зоопарк:** Профиль строится на чистом едином сторе, разделяемом между MUI и Tailwind.
2. **Никаких тяжелых внешних SaaS:** Для Pure Box всё работает локально (zero cloud lock-in).
3. **Enterprise Ready:** Архитектура имеет готовые слоты для OIDC/SAML без переписывания фронтенда.
