/**
 * Локальный FE-login для E2E Shell (без бэка).
 * Канон: sanctuary/canon/auth-roles.md — 5 ролей (AUTH-ROLES-5).
 * Старые id (admin_ib / nshr / expert_ib) — deprecated alias на новые.
 */

export const AUTH_STORAGE_KEY = 'pk.auth.user';
export const AUTH_LEGACY_STORAGE_KEY = 'kdt.auth.user';

export type LabRole =
  | 'admin_sec'
  | 'admin_abnormal'
  | 'admin_service'
  | 'sec_expert'
  | 'user'
  /** @deprecated use admin_sec */
  | 'admin_ib'
  /** @deprecated use admin_abnormal */
  | 'nshr'
  /** @deprecated use sec_expert */
  | 'expert_ib';

export type AuthUser =
  | 'admin-nshr@spaceport.cbr.ru'
  | 'admin-sec@spaceport.cbr.ru'
  | 'admin-service@spaceport.cbr.ru'
  | 'expert-sec@spaceport.cbr.ru'
  | 'user@spaceport.cbr.ru'
  | 'admin'
  | 'debug';

export type RoleCaps = {
  role: LabRole;
  displayName: string;
  canAccessAdmin: boolean;
  canSelectEmergency: boolean;
  canSelectPreRelease: boolean;
  canGenerateAct: boolean;
  /** Ручная подмена infrastructure.base_url_override (не из карточки/лесенки). */
  canOverrideScanUrl: boolean;
  /** infrastructure.debug_mode (операторский VOID). */
  canUseDebugMode: boolean;
  /** infrastructure.zap_mode = webswing (expert — только demon). */
  canSelectWebswing: boolean;
  /**
   * Home: загрузка JSON-манифеста как болванки.
   * Только admin_ib / nshr — не expert daily path (ADM-IMPORT-WALL).
   */
  canimportWired: boolean;
};

type UserRow = {
  password: string;
  role: LabRole;
  displayName: string;
};

const USERS: Record<AuthUser, UserRow> = {
  'admin-nshr@spaceport.cbr.ru': {
    password: 'verysecure',
    role: 'admin_abnormal',
    displayName: 'Администратор НШР',
  },
  'admin-sec@spaceport.cbr.ru': {
    password: 'verysecure',
    role: 'admin_sec',
    displayName: 'Администратор ИБ',
  },
  'admin-service@spaceport.cbr.ru': {
    password: 'verysecure',
    role: 'admin_service',
    displayName: 'Администратор',
  },
  'expert-sec@spaceport.cbr.ru': {
    password: 'verysecure',
    role: 'sec_expert',
    displayName: 'Эксперт ИБ',
  },
  'user@spaceport.cbr.ru': {
    password: 'verysecure',
    role: 'user',
    displayName: 'Пользователь',
  },
  admin: {
    password: 'verysecure',
    role: 'admin_service',
    displayName: 'Администратор',
  },
  debug: {
    password: 'verysecure',
    role: 'admin_sec',
    displayName: 'Администратор ИБ',
  },
};

const AUTH_USER_SET = new Set<string>(Object.keys(USERS));

export function isAuthUser(value: string): value is AuthUser {
  return AUTH_USER_SET.has(value.trim());
}

export function roleOf(user: AuthUser | null | undefined): LabRole | null {
  if (!user || !isAuthUser(user)) {
    return null;
  }
  return USERS[user].role;
}

export function displayNameOf(user: AuthUser | null | undefined): string {
  if (!user || !isAuthUser(user)) {
    return '';
  }
  return USERS[user].displayName;
}

/** Deprecated legacy role ids → canonical (AUTH-ROLES-5). */
const ROLE_ALIASES: Partial<Record<LabRole, LabRole>> = {
  admin_ib: 'admin_sec',
  nshr: 'admin_abnormal',
  expert_ib: 'sec_expert',
};

function canonicalRole(role: LabRole | null | undefined): LabRole {
  if (!role) return 'admin_sec';
  return ROLE_ALIASES[role] ?? role;
}

const ROLE_DISPLAY: Record<LabRole, string> = {
  admin_sec: 'Администратор ИБ',
  admin_abnormal: 'Администратор НШР',
  admin_service: 'Администратор',
  sec_expert: 'Эксперт ИБ',
  user: 'Пользователь',
  admin_ib: 'Администратор ИБ',
  nshr: 'Администратор НШР',
  expert_ib: 'Эксперт ИБ',
};

// PURE-URL-FREE (2026-08-21, Максим 2FA):
// canOverrideScanUrl = true для ВСЕХ ролей.
// Банковский ИБшник когда-то потребовал привязку URL сканирования к деплою Космопорт.
// Мы вшили это в архитектуру: applyRoleCaps стрипает base_url_override для не-операторов.
// В PURE / коробке это бессмысленно — оператор сам задаёт URL при создании/импорте JSON.
// При custom/enterprise-деплое при необходимости вернуть: ops = canonical === 'admin_sec' || canonical === 'admin_abnormal';
// canOverrideScanUrl: ops, canGenerateAct: ops, canimportWired: ops.

export function capsForRole(role: LabRole | null | undefined): RoleCaps {
  const canonical = canonicalRole(role);
  const admin =
    canonical === 'admin_sec' ||
    canonical === 'admin_abnormal' ||
    canonical === 'admin_service';
  // const ops = canonical === 'admin_sec' || canonical === 'admin_abnormal';  // custom: вернуть
  return {
    role: canonical,
    displayName: ROLE_DISPLAY[canonical],
    canAccessAdmin: admin,
    canSelectEmergency: canonical === 'admin_abnormal',
    canSelectPreRelease: canonical === 'admin_sec',
    canGenerateAct: true,           // PURE: все могут
    canOverrideScanUrl: true,       // PURE: все могут — URL задаётся при создании, не блокируем
    canUseDebugMode: admin,         // отладка — только администраторы
    canSelectWebswing: admin,       // Webswing — только администраторы
    canimportWired: true,
  };
}

export function capsForUser(user: AuthUser | null | undefined): RoleCaps {
  return capsForRole(roleOf(user));
}

export function canAccessAdmin(user: AuthUser | null | undefined): boolean {
  return capsForUser(user).canAccessAdmin;
}

export function canSelectEmergency(user: AuthUser | null | undefined): boolean {
  return capsForUser(user).canSelectEmergency;
}

export function canSelectPreRelease(user: AuthUser | null | undefined): boolean {
  return capsForUser(user).canSelectPreRelease;
}

export function canGenerateAct(user: AuthUser | null | undefined): boolean {
  return capsForUser(user).canGenerateAct;
}

export function canOverrideScanUrl(user: AuthUser | null | undefined): boolean {
  return capsForUser(user).canOverrideScanUrl;
}

export function canUseDebugMode(user: AuthUser | null | undefined): boolean {
  return capsForUser(user).canUseDebugMode;
}

export function canSelectWebswing(user: AuthUser | null | undefined): boolean {
  return capsForUser(user).canSelectWebswing;
}

export function canimportWired(user: AuthUser | null | undefined): boolean {
  return capsForUser(user).canimportWired;
}

export function canAccessControl(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (user === 'admin' || user === 'debug' || user === 'admin-service@spaceport.cbr.ru') return true;
  const role = roleOf(user);
  return role === 'admin_service' || role === 'admin_sec' || role === 'admin_ib';
}

export function canAccessSecOpsControl(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (user === 'admin' || user === 'debug' || user === 'admin-sec@spaceport.cbr.ru') return true;
  const role = roleOf(user);
  return role === 'admin_sec' || role === 'admin_ib' || role === 'admin_service';
}

export function readSession(): AuthUser | null {
  try {
    const rawSession = window.sessionStorage.getItem(AUTH_STORAGE_KEY)
      ?? window.sessionStorage.getItem(AUTH_LEGACY_STORAGE_KEY);
    if (rawSession && isAuthUser(rawSession)) {
      return rawSession;
    }
    const rawLocal = window.localStorage.getItem(AUTH_STORAGE_KEY)
      ?? window.localStorage.getItem(AUTH_LEGACY_STORAGE_KEY);
    if (rawLocal && isAuthUser(rawLocal)) {
      try {
        window.sessionStorage.setItem(AUTH_STORAGE_KEY, rawLocal);
      } catch {}
      return rawLocal;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSession(user: AuthUser): void {
  try {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, user);
    window.localStorage.setItem(AUTH_STORAGE_KEY, user);
  } catch {
    /* private mode */
  }
}

export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_LEGACY_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export type LoginResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

export function login(username: string, password: string): LoginResult {
  const name = username.trim();
  if (!isAuthUser(name)) {
    return { ok: false, error: 'Неверный логин или пароль' };
  }
  if (USERS[name].password !== password) {
    return { ok: false, error: 'Неверный логин или пароль' };
  }
  writeSession(name);
  return { ok: true, user: name };
}

export function logout(): void {
  clearSession();
}
