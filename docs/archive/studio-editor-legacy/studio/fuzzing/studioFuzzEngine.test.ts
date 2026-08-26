import { describe, it, expect, vi } from 'vitest';
import {
  ATTACK_MODES,
  buildAttackRequests,
  buildFuzzRequests,
  calculateResponseDiff,
  computeTotalRequests,
  evaluateGrepExtracts,
  evaluateGrepMatches,
  executeFuzzRequest,
  PAYLOAD_PRESETS,
  splitReflectionHighlight,
  type FuzzPosition,
  type GrepRule,
} from './studioFuzzEngine';

describe('studioFuzzEngine', () => {
  it('buildFuzzRequests replaces query parameter value', () => {
    const pos: FuzzPosition = { type: 'query', name: 'search', originalValue: 'apple' };
    const requests = buildFuzzRequests('GET', 'http://127.0.0.1:3000/api/items?search=apple', pos, ["' OR 1=1--", '<script>']);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toContain('search=%27+OR+1%3D1--');
    expect(requests[0]?.payload).toBe("' OR 1=1--");
    expect(requests[1]?.url).toContain('search=%3Cscript%3E');
  });

  it('buildFuzzRequests replaces json body field', () => {
    const pos: FuzzPosition = { type: 'body_field', name: 'user', originalValue: 'admin' };
    const baseBody = JSON.stringify({ user: 'admin', pass: 'secret' });
    const requests = buildFuzzRequests('POST', 'http://127.0.0.1:3000/login', pos, ['guest', "' or '1'='1"], {}, baseBody);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.body).toBe(JSON.stringify({ user: 'guest', pass: 'secret' }));
    expect(requests[1]?.body).toBe(JSON.stringify({ user: "' or '1'='1", pass: 'secret' }));
  });

  it('calculateResponseDiff computes length difference correctly', () => {
    expect(calculateResponseDiff('hello', 'hello')).toBe(0);
    expect(calculateResponseDiff('hello', 'hello world')).toBe(6);
  });

  it('executeFuzzRequest handles successful response and measures diff', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => 'error: SQL syntax',
    });

    const item = {
      id: 1,
      url: 'http://127.0.0.1:3000/api',
      method: 'GET',
      payload: "'",
      paramName: 'id',
      headers: {},
    };

    const res = await executeFuzzRequest(item, 'ok', mockFetch as any);
    expect(res.status).toBe(200);
    expect(res.responseBody).toBe('error: SQL syntax');
    expect(res.diffCount).toBe('error: SQL syntax'.length - 'ok'.length);
    expect(res.error).toBeUndefined();
  });

  it('executeFuzzRequest handles fetch failure gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const item = {
      id: 1,
      url: 'http://127.0.0.1:3000/api',
      method: 'GET',
      payload: "'",
      paramName: 'id',
      headers: {},
    };

    const res = await executeFuzzRequest(item, 'ok', mockFetch as any);
    expect(res.status).toBe(0);
    expect(res.error).toBe('Connection refused');
  });
});

describe('buildAttackRequests (Intruder modes)', () => {
  const baseUrl = 'http://127.0.0.1:3000/api/items?a=1';
  const positions: FuzzPosition[] = [
    { type: 'query', name: 'a', originalValue: '1' },
    { type: 'query', name: 'b', originalValue: '2' },
  ];

  it('sniper: one set, round-robin across each position (positions × payloads)', () => {
    const reqs = buildAttackRequests('GET', baseUrl, positions, [['x', 'y']], 'sniper');
    expect(reqs).toHaveLength(4);
    expect(reqs[0]?.paramName).toBe('a');
    expect(reqs[2]?.paramName).toBe('b');
    expect(reqs[0]?.url).toContain('a=x');
    expect(reqs[2]?.url).toContain('b=x');
  });

  it('battering_ram: one payload applied to all positions simultaneously', () => {
    const reqs = buildAttackRequests('GET', baseUrl, positions, [['x', 'y']], 'battering_ram');
    expect(reqs).toHaveLength(2);
    expect(reqs[0]?.url).toContain('a=x');
    expect(reqs[0]?.url).toContain('b=x');
    expect(reqs[1]?.url).toContain('a=y');
    expect(reqs[1]?.url).toContain('b=y');
  });

  it('pitchfork: parallel iteration across per-position sets', () => {
    const reqs = buildAttackRequests('GET', baseUrl, positions, [['x', 'y'], ['m']], 'pitchfork');
    expect(reqs).toHaveLength(2);
    expect(reqs[0]?.url).toContain('a=x');
    expect(reqs[0]?.url).toContain('b=m');
    expect(reqs[1]?.url).toContain('a=y');
    // второй набор короче — зацикливается на оригинале
    expect(reqs[1]?.url).toContain('b=2');
  });

  it('cluster_bomb: cartesian product across per-position sets', () => {
    const reqs = buildAttackRequests('GET', baseUrl, positions, [['x', 'y'], ['m', 'n']], 'cluster_bomb');
    expect(reqs).toHaveLength(4);
    expect(reqs[0]?.url).toContain('a=x');
    expect(reqs[0]?.url).toContain('b=m');
    expect(reqs[3]?.url).toContain('a=y');
    expect(reqs[3]?.url).toContain('b=n');
  });

  it('returns empty for empty positions', () => {
    expect(buildAttackRequests('GET', baseUrl, [], [['x']], 'sniper')).toHaveLength(0);
  });

  it('computeTotalRequests reflects mode counts', () => {
    expect(computeTotalRequests('sniper', positions, [['x', 'y']])).toBe(4);
    expect(computeTotalRequests('battering_ram', positions, [['x', 'y']])).toBe(2);
    expect(computeTotalRequests('pitchfork', positions, [['x', 'y'], ['m']])).toBe(2);
    expect(computeTotalRequests('cluster_bomb', positions, [['x', 'y'], ['m', 'n']])).toBe(4);
  });
});

describe('splitReflectionHighlight', () => {
  it('marks all occurrences of the payload', () => {
    const parts = splitReflectionHighlight('aa <script> bb <script> cc', '<script>');
    expect(parts).toEqual([
      { text: 'aa ', match: false },
      { text: '<script>', match: true },
      { text: ' bb ', match: false },
      { text: '<script>', match: true },
      { text: ' cc', match: false },
    ]);
  });

  it('returns single non-match when payload absent', () => {
    expect(splitReflectionHighlight('hello', '<script>')).toEqual([
      { text: 'hello', match: false },
    ]);
  });

  it('returns single non-match for empty payload', () => {
    expect(splitReflectionHighlight('hello', '')).toEqual([{ text: 'hello', match: false }]);
  });
});

describe('PAYLOAD_PRESETS', () => {
  it('exposes all expected presets with non-empty payloads', () => {
    const keys = PAYLOAD_PRESETS.map((p) => p.key);
    expect(keys).toEqual(['sqli', 'xss_ssti', 'path_traversal', 'admin_logins', 'boundary']);
    for (const preset of PAYLOAD_PRESETS) {
      expect(preset.label).toBeTruthy();
      expect(preset.payloads.length).toBeGreaterThan(0);
    }
  });
});

describe('ATTACK_MODES', () => {
  it('lists four Burp Intruder modes', () => {
    expect(ATTACK_MODES.map((m) => m.value)).toEqual([
      'sniper',
      'battering_ram',
      'pitchfork',
      'cluster_bomb',
    ]);
    for (const m of ATTACK_MODES) {
      expect(m.emoji).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.hint).toBeTruthy();
    }
  });
});

describe('evaluateGrepMatches & evaluateGrepExtracts', () => {
  const text = 'HTTP/1.1 200 OK\nSet-Cookie: token=secret_jwt_xyz123; Path=/\nError: User root not found';

  it('matches substrings and regex patterns', () => {
    const rules: GrepRule[] = [
      { key: 'has_error', pattern: 'error:' },
      { key: 'is_root', pattern: 'root' },
      { key: 'has_sql', pattern: 'syntax error' },
    ];
    const res = evaluateGrepMatches(text, rules);
    expect(res['has_error']).toBe(true);
    expect(res['is_root']).toBe(true);
    expect(res['has_sql']).toBe(false);
  });

  it('extracts values using capture groups', () => {
    const rules: GrepRule[] = [
      { key: 'token', pattern: 'token=([a-z0-9_]+)', isRegex: true },
      { key: 'user', pattern: 'User ([a-z]+)', isRegex: true },
    ];
    const res = evaluateGrepExtracts(text, rules);
    expect(res['token']).toEqual(['secret_jwt_xyz123']);
    expect(res['user']).toEqual(['root']);
  });
});
