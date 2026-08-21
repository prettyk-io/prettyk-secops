/**
 * Контракт Results вокруг lab stub: clear → lock; URLs → ready/unlock.
 */
import { describe, expect, it } from 'vitest';
import {
  areReportHooksReady,
  isActDownloadEnabled,
  isResultsLaunchLocked,
  isResultsStopVisible,
} from './launchUi';
import { hookReportUrl, isHttpReportUrl } from './resultsLiveMeta';
import type { ResultsHooksSnapshot } from './types';

describe('lab stub Results contract', () => {
  it('stale clear → downloads locked; fresh URLs unlock', () => {
    const stale: ResultsHooksSnapshot = {
      allure: { report_url: 'http://127.0.0.1:5050/?stale=1' },
      dojo: { report_url: 'http://127.0.0.1:8081/engagement/999' },
    };
    expect(
      areReportHooksReady(
        hookReportUrl(stale, 'allure'),
        hookReportUrl(stale, 'dojo'),
      ),
    ).toBe(true);

    const cleared: ResultsHooksSnapshot = { allure: null, dojo: null };
    expect(hookReportUrl(cleared, 'allure')).toBeUndefined();
    expect(hookReportUrl(cleared, 'dojo')).toBeUndefined();
    expect(areReportHooksReady(undefined, undefined)).toBe(false);
    expect(
      isActDownloadEnabled({
        onDownloadAct: () => undefined,
        allureReportUrl: undefined,
        dojoReportUrl: undefined,
        generateAct: true,
        admissionAxisReady: true,
      }),
    ).toBe(false);

    const fresh: ResultsHooksSnapshot = {
      allure: { report_url: 'http://127.0.0.1:5050/' },
      dojo: { report_url: 'http://127.0.0.1:8081/engagement/1' },
    };
    const a = hookReportUrl(fresh, 'allure');
    const d = hookReportUrl(fresh, 'dojo');
    expect(a).toBe('http://127.0.0.1:5050/');
    expect(d).toBe('http://127.0.0.1:8081/engagement/1');
    expect(isHttpReportUrl(a)).toBe(true);
    expect(areReportHooksReady(a, d)).toBe(true);
    expect(
      isActDownloadEnabled({
        onDownloadAct: () => undefined,
        allureReportUrl: a,
        dojoReportUrl: d,
        generateAct: true,
        admissionAxisReady: true,
      }),
    ).toBe(true);
  });

  it('launch locked / stop visible while CI or lab running', () => {
    expect(
      isResultsLaunchLocked({
        launchStarting: false,
        awaitingStart: false,
        verdict: 'running',
      }),
    ).toBe(true);
    expect(
      isResultsStopVisible({
        launchStarting: false,
        awaitingStart: false,
        verdict: 'running',
      }),
    ).toBe(true);
    expect(
      isResultsLaunchLocked({
        launchStarting: false,
        awaitingStart: false,
        verdict: 'pass',
        labRunPhase: 'finished',
      }),
    ).toBe(false);
  });
});
