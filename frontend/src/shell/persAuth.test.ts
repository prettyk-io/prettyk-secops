// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { writeSession, clearSession } from './auth';
import {
  canViewCheckInHistory,
  currentUserId,
  isSecOpsAdmin,
} from './persAuth';

describe('persAuth', () => {
  afterEach(() => {
    clearSession();
  });

  it('admin_ib / nshr — SecOps admin; expert — нет', () => {
    writeSession('expert-sec@spaceport.cbr.ru');
    expect(currentUserId()).toBe('expert-sec@spaceport.cbr.ru');
    expect(isSecOpsAdmin('expert-sec@spaceport.cbr.ru')).toBe(false);
    expect(isSecOpsAdmin('admin-sec@spaceport.cbr.ru')).toBe(true);
    expect(isSecOpsAdmin('admin-nshr@spaceport.cbr.ru')).toBe(true);
    expect(isSecOpsAdmin('admin')).toBe(true);
    expect(isSecOpsAdmin('debug')).toBe(true);
  });

  it('history: все проверки видны всем (open history)', () => {
    expect(
      canViewCheckInHistory(
        'expert-sec@spaceport.cbr.ru',
        'expert-sec@spaceport.cbr.ru',
      ),
    ).toBe(true);
    expect(
      canViewCheckInHistory('admin-sec@spaceport.cbr.ru', 'expert-sec@spaceport.cbr.ru'),
    ).toBe(true);
    expect(
      canViewCheckInHistory('expert-sec@spaceport.cbr.ru', 'admin-sec@spaceport.cbr.ru'),
    ).toBe(true);
    expect(canViewCheckInHistory(undefined, 'expert-sec@spaceport.cbr.ru')).toBe(true);
  });
});
