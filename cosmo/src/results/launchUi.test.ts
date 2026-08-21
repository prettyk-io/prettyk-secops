import { describe, expect, it } from 'vitest';
import {
  areReportHooksReady,
  isActDisplayed,
  isActDownloadEnabled,
  isAdmissionAxisReady,
  isResultsLaunchLocked,
  isResultsStopVisible,
  shouldShowRestart,
} from './launchUi';

describe('areReportHooksReady', () => {
  it('needs both Allure and Dojo URLs', () => {
    expect(areReportHooksReady(undefined, 'http://d')).toBe(false);
    expect(areReportHooksReady('http://a', undefined)).toBe(false);
    expect(areReportHooksReady('http://a', 'http://d')).toBe(true);
  });
});

describe('isActDisplayed', () => {
  it('only when generate_act is true', () => {
    expect(isActDisplayed(true)).toBe(true);
    expect(isActDisplayed(false)).toBe(false);
    expect(isActDisplayed(undefined)).toBe(false);
    expect(isActDisplayed(null)).toBe(false);
  });
});

describe('isAdmissionAxisReady', () => {
  it('false for idle / running / fail_run / exit 1 / void / launch faults', () => {
    expect(isAdmissionAxisReady({ verdict: 'idle' })).toBe(false);
    expect(isAdmissionAxisReady({ verdict: 'running' })).toBe(false);
    expect(isAdmissionAxisReady({ verdict: 'fail_run' })).toBe(false);
    expect(isAdmissionAxisReady({ verdict: 'pass', exitCode: 1 })).toBe(false);
    expect(isAdmissionAxisReady({ verdict: 'pass', admissionVoid: true })).toBe(false);
    expect(isAdmissionAxisReady({ verdict: 'pass', launchFault: 'start_failed' })).toBe(
      false,
    );
    expect(isAdmissionAxisReady({ verdict: 'pass', launchFault: 'timeout' })).toBe(false);
  });

  it('true for pass / pass_watch / pass_edge / fail_gate', () => {
    expect(isAdmissionAxisReady({ verdict: 'pass', exitCode: 0 })).toBe(true);
    expect(isAdmissionAxisReady({ verdict: 'pass_watch' })).toBe(true);
    expect(isAdmissionAxisReady({ verdict: 'pass_edge' })).toBe(true);
    expect(isAdmissionAxisReady({ verdict: 'fail_gate', exitCode: 2 })).toBe(true);
  });
});

describe('isActDownloadEnabled', () => {
  const noop = () => undefined;
  const ready = {
    onDownloadAct: noop,
    allureReportUrl: 'http://allure/r',
    dojoReportUrl: 'http://dojo/e',
    generateAct: true as boolean | null | undefined,
    admissionAxisReady: true,
  };

  it('locked without handler, hooks, generate_act or IB axis', () => {
    expect(
      isActDownloadEnabled({
        ...ready,
        onDownloadAct: undefined,
      }),
    ).toBe(false);
    expect(
      isActDownloadEnabled({
        ...ready,
        allureReportUrl: undefined,
      }),
    ).toBe(false);
    expect(
      isActDownloadEnabled({
        ...ready,
        generateAct: false,
      }),
    ).toBe(false);
    expect(
      isActDownloadEnabled({
        ...ready,
        admissionAxisReady: false,
      }),
    ).toBe(false);
  });

  it('enabled when displayed + IB ready + handler + both hook URLs', () => {
    expect(isActDownloadEnabled(ready)).toBe(true);
  });
});

describe('shouldShowRestart', () => {
  it('hidden while idle/running without fault', () => {
    expect(shouldShowRestart('idle', null)).toBe(false);
    expect(shouldShowRestart('running', null)).toBe(false);
  });

  it('shown after any terminal verdict', () => {
    expect(shouldShowRestart('pass', null)).toBe(true);
    expect(shouldShowRestart('pass_watch', null)).toBe(true);
    expect(shouldShowRestart('fail_gate', null)).toBe(true);
    expect(shouldShowRestart('fail_run', null)).toBe(true);
  });

  it('shown on start_failed / timeout', () => {
    expect(shouldShowRestart('idle', 'start_failed')).toBe(true);
    expect(shouldShowRestart('running', 'timeout')).toBe(true);
  });
});

describe('isResultsLaunchLocked / isResultsStopVisible', () => {
  it('locks launch while starting or CI/lab running', () => {
    expect(
      isResultsLaunchLocked({
        launchStarting: true,
        awaitingStart: false,
        verdict: 'idle',
      }),
    ).toBe(true);
    expect(
      isResultsLaunchLocked({
        launchStarting: false,
        awaitingStart: true,
        verdict: 'idle',
      }),
    ).toBe(true);
    expect(
      isResultsLaunchLocked({
        launchStarting: false,
        awaitingStart: false,
        verdict: 'running',
      }),
    ).toBe(true);
    expect(
      isResultsLaunchLocked({
        launchStarting: false,
        awaitingStart: false,
        verdict: 'idle',
        labRunPhase: 'running',
      }),
    ).toBe(true);
    expect(
      isResultsLaunchLocked({
        launchStarting: false,
        awaitingStart: false,
        verdict: 'fail_run',
        labRunPhase: 'finished',
      }),
    ).toBe(false);
  });

  it('shows stop only while in-flight', () => {
    expect(
      isResultsStopVisible({
        launchStarting: false,
        awaitingStart: false,
        verdict: 'idle',
      }),
    ).toBe(false);
    expect(
      isResultsStopVisible({
        launchStarting: false,
        awaitingStart: false,
        verdict: 'pass',
      }),
    ).toBe(false);
    expect(
      isResultsStopVisible({
        launchStarting: true,
        awaitingStart: false,
        verdict: 'idle',
      }),
    ).toBe(true);
    expect(
      isResultsStopVisible({
        launchStarting: false,
        awaitingStart: false,
        verdict: 'running',
      }),
    ).toBe(true);
  });
});
