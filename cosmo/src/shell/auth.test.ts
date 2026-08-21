// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTH_STORAGE_KEY,
  capsForUser,
  clearSession,
  displayNameOf,
  login,
  logout,
  readSession,
  roleOf,
} from './auth';

describe('shell auth', () => {
  afterEach(() => {
    clearSession();
  });

  it('логинит Cosmo emails и aliases с verysecure', () => {
    expect(login('admin-sec@spaceport.cbr.ru', 'verysecure')).toEqual({
      ok: true,
      user: 'admin-sec@spaceport.cbr.ru',
    });
    expect(readSession()).toBe('admin-sec@spaceport.cbr.ru');
    expect(roleOf(readSession())).toBe('admin_sec');
    expect(displayNameOf(readSession())).toBe('Администратор ИБ');

    logout();
    expect(login('admin-nshr@spaceport.cbr.ru', 'verysecure').ok).toBe(true);
    expect(roleOf(readSession())).toBe('admin_abnormal');

    logout();
    expect(login('admin-service@spaceport.cbr.ru', 'verysecure').ok).toBe(true);
    expect(roleOf(readSession())).toBe('admin_service');

    logout();
    expect(login('expert-sec@spaceport.cbr.ru', 'verysecure').ok).toBe(true);
    expect(roleOf(readSession())).toBe('sec_expert');

    logout();
    expect(login('user@spaceport.cbr.ru', 'verysecure').ok).toBe(true);
    expect(roleOf(readSession())).toBe('user');

    logout();
    expect(login('admin', 'verysecure')).toEqual({ ok: true, user: 'admin' });
    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).toBe('admin');
    expect(roleOf('admin')).toBe('admin_sec');

    logout();
    expect(login('debug', 'verysecure').ok).toBe(true);
    expect(roleOf('debug')).toBe('admin_sec');
  });

  it('отклоняет неверный пароль и неизвестный логин', () => {
    expect(login('admin', 'wrong')).toEqual({
      ok: false,
      error: 'Неверный логин или пароль',
    });
    expect(login('nobody', 'verysecure')).toEqual({
      ok: false,
      error: 'Неверный логин или пароль',
    });
    expect(readSession()).toBeNull();
  });

  it('caps: 5 ролей (AUTH-ROLES-5)', () => {
    const expert = capsForUser('expert-sec@spaceport.cbr.ru');
    expect(expert.role).toBe('sec_expert');
    expect(expert.canAccessAdmin).toBe(false);
    expect(expert.canimportWired).toBe(true);  // PURE: все могут
    expect(expert.canSelectEmergency).toBe(false);
    expect(expert.canSelectPreRelease).toBe(false);
    expect(expert.canGenerateAct).toBe(true);    // PURE: все могут
    expect(expert.canOverrideScanUrl).toBe(true);  // PURE: все могут
    expect(expert.canUseDebugMode).toBe(false);
    expect(expert.canSelectWebswing).toBe(false);

    const sec = capsForUser('admin-sec@spaceport.cbr.ru');
    expect(sec.role).toBe('admin_sec');
    expect(sec.canAccessAdmin).toBe(true);
    expect(sec.canSelectEmergency).toBe(false);
    expect(sec.canSelectPreRelease).toBe(true);
    expect(sec.canGenerateAct).toBe(true);

    const nshr = capsForUser('admin-nshr@spaceport.cbr.ru');
    expect(nshr.role).toBe('admin_abnormal');
    expect(nshr.canAccessAdmin).toBe(true);
    expect(nshr.canSelectEmergency).toBe(true);
    expect(nshr.canSelectPreRelease).toBe(false);

    const service = capsForUser('admin-service@spaceport.cbr.ru');
    expect(service.role).toBe('admin_service');
    expect(service.canAccessAdmin).toBe(true);
    expect(service.canSelectEmergency).toBe(false);
    expect(service.canSelectPreRelease).toBe(false);
    expect(service.canGenerateAct).toBe(true);    // PURE: все могут
    expect(service.canimportWired).toBe(true);  // PURE: все могут

    const user = capsForUser('user@spaceport.cbr.ru');
    expect(user.role).toBe('user');
    expect(user.canAccessAdmin).toBe(false);
    expect(user.canSelectEmergency).toBe(false);
    expect(user.canSelectPreRelease).toBe(false);
    expect(user.canimportWired).toBe(true);  // PURE: все могут
  });
});
