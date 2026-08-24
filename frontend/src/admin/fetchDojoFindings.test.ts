// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildDojoFindingsUrl,
  fetchDojoFindings,
  normalizeDojoFindingsPayload,
} from './fetchDojoFindings';

describe('fetchDojoFindings', () => {
  it('normalizes envelope with findings, verified, false_p', () => {
    const env = normalizeDojoFindingsPayload({
      ok: true,
      status: 'ok',
      project_id: 'IB_WEB',
      findings: [
        { id: 1, title: 'RCE', severity: 'critical', verified: true },
        { id: 2, title: 'XSS', severity: 'high', false_p: true },
        { title: '', severity: 'info' },
      ],
      verified: { critical: 1, high: 0 },
      false_p: { high: 1 },
      findings_n: 2,
      engagement_url: 'http://dojo/product/7',
    });
    expect(env.ok).toBe(true);
    expect(env.findings).toHaveLength(2);
    expect(env.findings?.[0]?.title).toBe('RCE');
    expect(env.verified?.critical).toBe(1);
    expect(env.findings_n).toBe(2);
  });

  it('project_id_required lowers to bad_request', async () => {
    const env = await fetchDojoFindings('  ', () =>
      Promise.reject(new Error('should not call fetch')),
    );
    expect(env.ok).toBe(false);
    expect(env.status).toBe('bad_request');
    expect(env.findings).toBeNull();
  });

  it('non-ok HTTP -> down with error', async () => {
    const env = await fetchDojoFindings('IB_WEB', () =>
      Promise.resolve(new Response(null, { status: 500 })),
    );
    expect(env.ok).toBe(false);
    expect(env.status).toBe('down');
    expect(env.error).toContain('500');
  });

  it('builds url with project_id', () => {
    const url = buildDojoFindingsUrl('IB_WEB');
    expect(url).toContain('/api/dojo/findings?');
    expect(url).toContain('project_id=IB_WEB');
  });
});
