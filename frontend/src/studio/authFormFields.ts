/**
 * AUTH-14C: Studio form UI — тип+значение локатора → dialect string (без SoT rewrite).
 */
import { padConstructorCanvas } from './defaultConstructor';

export const AUTH_LOCATOR_TYPES = ['css', 'id', 'xpath', 'name'] as const;
export type AuthLocatorType = (typeof AUTH_LOCATOR_TYPES)[number];

export type AuthFormFields = {
  login_url: string;
  login: string;
  password: string;
  user_type: AuthLocatorType;
  user_value: string;
  pass_type: AuthLocatorType;
  pass_value: string;
  submit_type: AuthLocatorType;
  submit_value: string;
  form_type: AuthLocatorType;
  form_value: string;
  success_url: string;
  success_string: string;
};

export function defaultAuthFormFields(
  overrides?: Partial<AuthFormFields>,
): AuthFormFields {
  return {
    login_url: '',
    login: '',
    password: '',
    user_type: 'css',
    user_value: '',
    pass_type: 'id',
    pass_value: '',
    submit_type: 'css',
    submit_value: '',
    form_type: 'css',
    form_value: '',
    success_url: '',
    success_string: '',
    ...overrides,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function authConstructorKind(text: string): 'form' | 'action' | null {
  for (const raw of (text || '').split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith('#')) {
      continue;
    }
    const eq = t.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    if (t.slice(0, eq).trim().toLowerCase() !== 'auth') {
      continue;
    }
    const kind = t.slice(eq + 1).trim().toLowerCase();
    if (kind === 'form' || kind === 'action') {
      return kind;
    }
  }
  return null;
}

/** Строка `auth=form` (игнор комментариев). */
export function isAuthFormConstructor(text: string): boolean {
  return authConstructorKind(text) === 'form';
}

/** Строка `auth=action` (MFA). */
export function isAuthActionConstructor(text: string): boolean {
  return authConstructorKind(text) === 'action';
}

export type AuthMfaMode = 'totp' | 'sms';

export type AuthActionFields = AuthFormFields & {
  mfa: AuthMfaMode;
  totp_secret: string;
  otp_code: string;
  otp_type: AuthLocatorType;
  otp_value: string;
  otp_submit_type: AuthLocatorType;
  otp_submit_value: string;
};

export function defaultAuthActionFields(
  overrides?: Partial<AuthActionFields>,
): AuthActionFields {
  return {
    ...defaultAuthFormFields(),
    mfa: 'totp',
    totp_secret: '',
    otp_code: '',
    otp_type: 'css',
    otp_value: '',
    otp_submit_type: 'css',
    otp_submit_value: '',
    form_type: 'css',
    form_value: '',
    ...overrides,
  };
}

function parseLocatorLine(raw: string): { type: AuthLocatorType; value: string } {
  const s = (raw || '').trim();
  const sp = s.search(/\s/);
  if (sp > 0) {
    const kind = s.slice(0, sp).toLowerCase();
    if (kind === 'css' || kind === 'id' || kind === 'xpath' || kind === 'name') {
      return { type: kind, value: s.slice(sp + 1).trim() };
    }
  }
  return { type: 'id', value: s };
}

function kvMap(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (text || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t) {
      continue;
    }
    // Dialect secrets: `#password=` / `#totp_secret=` (не комментарий `# css…`).
    if (t.startsWith('#')) {
      const body = t.slice(1);
      const eq = body.indexOf('=');
      if (eq > 0) {
        const key = body.slice(0, eq).trim().toLowerCase();
        if (key === 'password' || key === 'totp_secret') {
          out[key] = body.slice(eq + 1).replace(/^\s+/, '');
        }
      }
      continue;
    }
    const eq = t.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = t.slice(0, eq).trim().toLowerCase();
    const val = t.slice(eq + 1).trim();
    out[key] = val;
  }
  return out;
}

export function parseAuthFormConstructor(text: string): AuthFormFields {
  const map = kvMap(text);
  const user = parseLocatorLine(map.user_locator || map.login_locator || '');
  const pass = parseLocatorLine(map.pass_locator || map.password_locator || '');
  const submit = parseLocatorLine(map.submit_locator || map.submit || '');
  const form = parseLocatorLine(map.form_locator || map.form || '');
  return defaultAuthFormFields({
    login_url: map.login_url || map.url || '',
    login: map.login || map.username || '',
    password: map.password || map['#password'] || '',
    user_type: user.type,
    user_value: user.value,
    pass_type: pass.type,
    pass_value: pass.value,
    submit_type: submit.type,
    submit_value: submit.value,
    form_type: form.type,
    form_value: form.value,
    success_url: map.success_url || '',
    success_string: map.success_string || '',
  });
}

function locLine(type: string, value: string): string {
  const v = (value || '').trim();
  if (!v) {
    return '';
  }
  return `${type} ${v}`;
}

/** Dialect text for auth=form (padded canvas). */
export function serializeAuthFormConstructor(fields: AuthFormFields): string {
  const f = defaultAuthFormFields(fields);
  const lines = [
    'auth=form',
    f.login_url.trim() ? `login_url=${f.login_url.trim()}` : '',
    f.login.trim() ? `login=${f.login.trim()}` : '',
    f.password ? `#password=${f.password}` : '',
    locLine(f.user_type, f.user_value)
      ? `user_locator=${locLine(f.user_type, f.user_value)}`
      : '',
    locLine(f.pass_type, f.pass_value)
      ? `pass_locator=${locLine(f.pass_type, f.pass_value)}`
      : '',
    locLine(f.submit_type, f.submit_value)
      ? `submit_locator=${locLine(f.submit_type, f.submit_value)}`
      : '',
    locLine(f.form_type, f.form_value)
      ? `form_locator=${locLine(f.form_type, f.form_value)}`
      : '',
    f.success_url.trim() ? `success_url=${f.success_url.trim()}` : '',
    f.success_string.trim() ? `success_string=${f.success_string.trim()}` : '',
    '',
    '# css / xpath / id / name — полный WebDriver (не id-only)',
  ].filter((line, i, arr) => {
    if (line === '' && i > 0 && arr[i - 1] === '') {
      return false;
    }
    return true;
  });
  return padConstructorCanvas(lines.join('\n'));
}

export function parseAuthActionConstructor(text: string): AuthActionFields {
  const map = kvMap(text);
  const base = parseAuthFormConstructor(text);
  const otp = parseLocatorLine(map.otp_locator || '');
  const otpSubmit = parseLocatorLine(map.otp_submit_locator || '');
  const mfaRaw = (map.mfa || 'totp').toLowerCase();
  const mfa: AuthMfaMode = mfaRaw === 'sms' ? 'sms' : 'totp';
  return defaultAuthActionFields({
    ...base,
    mfa,
    totp_secret: map.totp_secret || '',
    otp_code: map.otp_code || '',
    otp_type: otp.type,
    otp_value: otp.value,
    otp_submit_type: otpSubmit.type,
    otp_submit_value: otpSubmit.value,
  });
}

function optionalKv(key: string, value: string): string {
  const v = value.trim();
  return v ? `${key}=${v}` : '';
}

function optionalLocator(key: string, type: string, value: string): string {
  const line = locLine(type, value);
  return line ? `${key}=${line}` : '';
}

function compactAuthLines(lines: string[]): string[] {
  return lines.filter((line, i, arr) => {
    if (line === '' && i > 0 && arr[i - 1] === '') {
      return false;
    }
    return true;
  });
}

export function serializeAuthActionConstructor(fields: AuthActionFields): string {
  const f = defaultAuthActionFields(fields);
  const lines = compactAuthLines([
    'auth=action',
    optionalKv('login_url', f.login_url),
    optionalKv('login', f.login),
    f.password ? `#password=${f.password}` : '',
    optionalLocator('user_locator', f.user_type, f.user_value),
    optionalLocator('pass_locator', f.pass_type, f.pass_value),
    optionalLocator('submit_locator', f.submit_type, f.submit_value),
    `mfa=${f.mfa}`,
    f.mfa === 'totp' && f.totp_secret ? `#totp_secret=${f.totp_secret}` : '',
    f.mfa === 'sms' ? optionalKv('otp_code', f.otp_code) : '',
    optionalLocator('otp_locator', f.otp_type, f.otp_value),
    optionalLocator('otp_submit_locator', f.otp_submit_type, f.otp_submit_value),
    optionalKv('success_url', f.success_url),
    optionalKv('success_string', f.success_string),
    '',
    '# MFA: totp (RFC6238) | sms + otp_code; locators = тип+значение',
  ]);
  return padConstructorCanvas(lines.join('\n'));
}

export function authModuleConstructorText(
  formData: unknown,
  moduleIndex: number,
): string {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const modules = suites?.test_data_constructor;
  if (!Array.isArray(modules) || moduleIndex < 0 || moduleIndex >= modules.length) {
    return '';
  }
  const mod = asRecord(modules[moduleIndex]);
  const fields = asRecord(mod?.auth_fields);
  return String(fields?.constructor || '');
}

export function updateAuthModuleConstructor(
  formData: unknown,
  moduleIndex: number,
  constructorText: string,
): unknown {
  const root = { ...(asRecord(formData) ?? {}) };
  const suites = { ...(asRecord(root.test_suites) ?? {}) };
  const modules = Array.isArray(suites.test_data_constructor)
    ? (suites.test_data_constructor as unknown[]).slice()
    : [];
  if (moduleIndex < 0 || moduleIndex >= modules.length) {
    return formData;
  }
  const mod = { ...(asRecord(modules[moduleIndex]) ?? {}) } as Record<string, unknown>;
  const authFields = { ...(asRecord(mod.auth_fields) ?? {}) } as Record<string, unknown>;
  authFields['constructor'] = constructorText;
  mod.auth_fields = authFields;
  modules[moduleIndex] = mod;
  return {
    ...root,
    test_suites: {
      ...suites,
      test_data_constructor: modules,
    },
  };
}
