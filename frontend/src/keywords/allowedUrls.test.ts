import { describe, expect, it } from 'vitest';
import {
  ALLOWED_URL_DENY_MSG,
  parseAllowedUrlTokens,
  urlAllowed,
} from './allowedUrls';

describe('allowedUrls', () => {
  it('режет | и ,', () => {
    expect(parseAllowedUrlTokens('https://a.test|*.lab.local,auth.x')).toEqual([
      'https://a.test',
      '*.lab.local',
      'auth.x',
    ]);
  });

  it('prefix / host / wildcard', () => {
    expect(urlAllowed('https://rkn.gov.ru/x', 'https://rkn.gov.ru')).toBe(true);
    expect(urlAllowed('http://juice-shop:3000/#/a', 'juice-shop:3000')).toBe(true);
    expect(urlAllowed('https://a.internal.bank/x', '*.internal.bank')).toBe(true);
    expect(urlAllowed('https://evil.test/', 'auth.x')).toBe(false);
  });

  it('deny message', () => {
    expect(ALLOWED_URL_DENY_MSG).toContain('разрешенных');
  });
});
