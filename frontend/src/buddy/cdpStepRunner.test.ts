// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  selectorForStep,
  valueForTypeStep,
  resolveOpenUrl,
  makeCdpStepRunner,
} from './cdpStepRunner';
import { getBrowserSession, __resetBrowserSessionForTests } from '../studio/browserSession';
import type { ProposedStep } from './types';

beforeEach(() => {
  __resetBrowserSessionForTests();
});

function step(partial: Partial<ProposedStep>): ProposedStep {
  return {
    id: 's1',
    dsl: '',
    action: 'Click',
    strategy: 'css',
    strategyValue: '.btn',
    payload: '',
    ...partial,
  };
}

describe('cdpStepRunner — чистые helpers', () => {
  it('selectorForStep: css / role / test_id / xpath', () => {
    expect(selectorForStep(step({ strategy: 'css', strategyValue: '.btn' }))).toBe('.btn');
    expect(selectorForStep(step({ strategy: 'role', strategyValue: 'button' }))).toBe('[role="button"]');
    expect(selectorForStep(step({ strategy: 'test_id', strategyValue: 'login' }))).toBe('[data-testid="login"]');
    expect(selectorForStep(step({ strategy: 'xpath', strategyValue: '//div' }))).toBeNull();
    expect(selectorForStep(step({ strategy: 'css', strategyValue: '' }))).toBeNull();
  });

  it('valueForTypeStep: placeholder → безопасное тестовое значение, никогда secret', () => {
    expect(valueForTypeStep(step({ payload: '$secret' }))).toBe('test-secret');
    expect(valueForTypeStep(step({ payload: '$value' }))).toBe('test-value');
    expect(valueForTypeStep(step({ payload: 'plain' }))).toBe('plain');
  });

  it('resolveOpenUrl: абсолютный / относительный / пустой', () => {
    expect(resolveOpenUrl(step({ payload: 'https://x.com/a' }))).toBe('https://x.com/a');
    expect(resolveOpenUrl(step({ payload: '/catalog' }), 'https://bank.local')).toBe('https://bank.local/catalog');
    // Open-шаг имеет пустой strategyValue
    expect(resolveOpenUrl(step({ payload: '', strategyValue: '' }))).toBe('/');
  });
});

describe('cdpStepRunner — live (mock fetch)', () => {
  it('Open step: navigate + evidence http/dom/screenshot', async () => {
    const session = getBrowserSession();
    let calls: string[] = [];
    // Подменяем fetch через spy на session.navigate/screenshot/eval
    const navSpy = vi.spyOn(session, 'navigate').mockResolvedValue({ ok: true, url: 'https://bank.local/catalog', title: 'Catalog' });
    const shotSpy = vi.spyOn(session, 'screenshot').mockResolvedValue({ ok: true, screenshot: 'data:image/png;base64,AAAA' });

    const runner = makeCdpStepRunner('https://bank.local');
    const outcome = await runner.runStep(step({ action: 'Open', payload: '/catalog' }), { stopped: () => false });

    expect(outcome.ok).toBe(true);
    expect(navSpy).toHaveBeenCalledWith('https://bank.local/catalog', 'operator');
    expect(outcome.evidence?.some(e => e.kind === 'http')).toBe(true);
    expect(outcome.evidence?.some(e => e.kind === 'screenshot')).toBe(true);
  });

  it('Click step: элемент не найден → честный fail, не mock success', async () => {
    const session = getBrowserSession();
    vi.spyOn(session, 'eval').mockResolvedValue({ ok: true, result: { ok: false, error: 'element not found' } });

    const runner = makeCdpStepRunner();
    const outcome = await runner.runStep(step({ action: 'Click', strategy: 'css', strategyValue: '.missing' }), { stopped: () => false });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('element not found');
  });

  it('Click step: успешный клик → evidence dom', async () => {
    const session = getBrowserSession();
    vi.spyOn(session, 'eval').mockResolvedValue({ ok: true, result: { ok: true } });
    vi.spyOn(session, 'screenshot').mockResolvedValue({ ok: false });

    const runner = makeCdpStepRunner();
    const outcome = await runner.runStep(step({ action: 'Click', strategy: 'css', strategyValue: '.btn' }), { stopped: () => false });

    expect(outcome.ok).toBe(true);
    expect(outcome.evidence?.some(e => e.kind === 'dom')).toBe(true);
  });

  it('Type step: value redacted (никогда не передаёт plaintext secret в eval)', async () => {
    const session = getBrowserSession();
    const evalSpy = vi.spyOn(session, 'eval').mockResolvedValue({ ok: true, result: { ok: true } });

    const runner = makeCdpStepRunner();
    await runner.runStep(step({ action: 'Type', strategy: 'css', strategyValue: '#pass', payload: '$secret' }), { stopped: () => false });

    // eval-выражение не содержит реального секрета (только test-secret placeholder)
    const expr = evalSpy.mock.calls[0]![0] as string;
    expect(expr).toContain('test-secret');
    expect(expr).not.toContain('$secret');
  });

  it('Stop signal: честный stopped, не выполняется', async () => {
    const runner = makeCdpStepRunner();
    const outcome = await runner.runStep(step({ action: 'Click' }), { stopped: () => true });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('stopped');
  });

  it('unsupported action → честный fail', async () => {
    const runner = makeCdpStepRunner();
    const outcome = await runner.runStep(step({ action: 'Hover' as never }), { stopped: () => false });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('unsupported');
  });
});
