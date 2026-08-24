import { describe, it, expect } from 'vitest';
import {
  extractAuthTokens,
  extractValueByJsonPath,
  type AuthExtractRuleUI,
} from './authVault';

describe('authVault frontend utilities', () => {
  it('extractValueByJsonPath gets nested values safely', () => {
    const data = {
      status: 'ok',
      auth: {
        accessToken: 'jwt_abc_999',
        user: { id: 101 },
      },
    };
    expect(extractValueByJsonPath(data, 'auth.accessToken')).toBe('jwt_abc_999');
    expect(extractValueByJsonPath(data, 'auth.user.id')).toBe(101);
    expect(extractValueByJsonPath(data, 'auth.nonExistent')).toBeUndefined();
  });

  it('extractAuthTokens extracts tokens from body, header, and cookie', () => {
    const body = JSON.stringify({
      data: {
        token: 'token_secops_12345',
      },
    });
    const headers = {
      'x-csrf-token': 'csrf_777',
      'set-cookie': 'session_id=sess_cookie_888; Path=/',
    };

    const rules: AuthExtractRuleUI[] = [
      { targetVar: 'auth.token', source: 'body_json', path: 'data.token' },
      { targetVar: 'auth.csrf', source: 'header', path: 'x-csrf-token' },
      { targetVar: 'auth.session', source: 'cookie', path: 'session_id' },
    ];

    const tokens = extractAuthTokens(body, headers, rules);
    expect(tokens['auth.token']).toBe('token_secops_12345');
    expect(tokens['auth.csrf']).toBe('csrf_777');
    expect(tokens['auth.session']).toBe('sess_cookie_888');
  });
});
