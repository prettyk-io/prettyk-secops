import { describe, expect, it } from 'vitest';
import { hookReportUrl, hookTone, isHttpReportUrl } from './resultsLiveMeta';
import type { ResultsHooksSnapshot } from './types';

describe('isHttpReportUrl', () => {
  it('accepts absolute http(s)', () => {
    expect(isHttpReportUrl('http://127.0.0.1:5050/r')).toBe(true);
    expect(isHttpReportUrl(' https://dojo.example/e/1 ')).toBe(true);
  });

  it('rejects empty, relative, javascript', () => {
    expect(isHttpReportUrl('')).toBe(false);
    expect(isHttpReportUrl('   ')).toBe(false);
    expect(isHttpReportUrl('/engagement/1')).toBe(false);
    expect(isHttpReportUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpReportUrl(undefined)).toBe(false);
  });
});

describe('hookReportUrl / hookTone', () => {
  const hooks = (overrides: Partial<ResultsHooksSnapshot>): ResultsHooksSnapshot => ({
    allure: null,
    dojo: null,
    ...overrides,
  });

  it('returns http URL and ready tone for Allure', () => {
    const url = hookReportUrl(
      hooks({ allure: { report_url: 'http://127.0.0.1:5050/a' } }),
      'allure',
    );
    expect(url).toBe('http://127.0.0.1:5050/a');
    expect(hookTone(url)).toBe('ready');
  });

  it('returns http URL and ready tone for Dojo', () => {
    const url = hookReportUrl(
      hooks({ dojo: { report_url: 'http://127.0.0.1:8081/engagement/1' } }),
      'dojo',
    );
    expect(url).toBe('http://127.0.0.1:8081/engagement/1');
    expect(hookTone(url)).toBe('ready');
  });

  it('garbage URL stays pending (no glow)', () => {
    const allure = hookReportUrl(
      hooks({ allure: { report_url: 'javascript:void(0)' } }),
      'allure',
    );
    const dojo = hookReportUrl(
      hooks({ dojo: { report_url: 'ftp://evil/x' } }),
      'dojo',
    );
    expect(allure).toBeUndefined();
    expect(dojo).toBeUndefined();
    expect(hookTone(allure)).toBe('pending');
    expect(hookTone(dojo)).toBe('pending');
  });

});
