import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LAB_HOOK_URLS,
  clearResultsHooks,
  postLabReportHooksReady,
  postResultsHooks,
} from './postResultsHooks';

describe('postResultsHooks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs JSON body to Live hooks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      postResultsHooks({
        allure_report_url: LAB_HOOK_URLS.allure,
        dojo_report_url: LAB_HOOK_URLS.dojo,
      }),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/results/hooks');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      allure_report_url: LAB_HOOK_URLS.allure,
      dojo_report_url: LAB_HOOK_URLS.dojo,
    });
  });

  it('lab helper publishes both URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await expect(postLabReportHooksReady()).resolves.toBe(true);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.allure_report_url).toMatch(/^https?:\/\//);
    expect(body.dojo_report_url).toMatch(/^https?:\/\//);
  });

  it('returns false when Live is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(postResultsHooks({ clear: true })).resolves.toBe(false);
  });

  it('clearResultsHooks POSTs clear:true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await expect(clearResultsHooks()).resolves.toBe(true);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      clear: true,
    });
  });

  it('lab Allure URL is allure-light-secops root', () => {
    expect(LAB_HOOK_URLS.allure).toBe('http://127.0.0.1:5050/');
  });
});
