/**
 * CO-PILOT META (PoC) — CdpStepRunner.
 *
 * Мост Buddy-движка → живой CDP (BrowserSession / CDP-WIRE Phase 1).
 *
 * Реализует `StepRunner` из boundedRun.ts: выполняет DSL-шаги сценария
 * (Open/Click/Type/Wait) в живом Chrome CDP :9222 через BrowserSession,
 * собирает честное evidence (http/dom/screenshot). Провал — честная причина,
 * не mock success.
 *
 * Plaintext-значения НИКОГДА не попадают в eval: placeholder `$value`/`$secret`
 * заменяется безопасным тестовым значением, а не реальным секретом.
 */

import type { StepRunner } from './boundedRun';
import type { ProposedStep, RunStepOutcome, EvidenceItem } from './types';
import { getBrowserSession } from '../studio/browserSession';

// ---------------------------------------------------------------------------
// Чистые helpers (тестируемые)
// ---------------------------------------------------------------------------

/** Map strategy + value → JS-селектор для document.querySelector. */
export function selectorForStep(step: ProposedStep): string | null {
  const { strategy, strategyValue } = step;
  if (!strategyValue) return null;
  switch (strategy) {
    case 'css':
      return strategyValue;
    case 'role':
      return `[role="${escapeCssString(strategyValue)}"]`;
    case 'test_id':
      return `[data-testid="${escapeCssString(strategyValue)}"]`;
    case 'label':
      return `label:has-text("${escapeCssString(strategyValue)}")`;
    case 'text':
      return `text="${escapeCssString(strategyValue)}"`;
    case 'xpath':
      // document.querySelector не понимает xpath — для PoC возвращаем null (честный провал)
      return null;
    default:
      return strategyValue;
  }
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Подставить безопасное значение вместо placeholder. */
export function valueForTypeStep(step: ProposedStep): string {
  const p = step.payload ?? '';
  if (p.startsWith('$secret')) return 'test-secret';
  if (p.startsWith('$value')) return 'test-value';
  return p;
}

/** Разобрать `Open <url>` → целевой URL. */
export function resolveOpenUrl(step: ProposedStep, targetUrl?: string): string {
  const raw = (step.payload || step.strategyValue || '/').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (targetUrl) {
    try {
      return new URL(raw, targetUrl).href;
    } catch {
      return raw;
    }
  }
  return raw;
}

// ---------------------------------------------------------------------------
// CdpStepRunner
// ---------------------------------------------------------------------------

export function makeCdpStepRunner(targetUrl?: string): StepRunner {
  const session = getBrowserSession();

  return {
    async runStep(step: ProposedStep, signal: { stopped: () => boolean }): Promise<RunStepOutcome> {
      const startedAt = Date.now();
      const evidence: EvidenceItem[] = [];

      try {
        if (signal.stopped()) {
          return { stepId: step.id, ok: false, error: 'stopped by operator', elapsedMs: 0 };
        }

        switch (step.action) {
          case 'Open': {
            const url = resolveOpenUrl(step, targetUrl);
            const nav = await session.navigate(url, 'operator');
            if (!nav.ok) {
              return { stepId: step.id, ok: false, error: `navigate failed: ${JSON.stringify(nav)}`, elapsedMs: Date.now() - startedAt };
            }
            evidence.push({ kind: 'http', detail: `navigate ${nav.url} → ${nav.title ?? 'ok'}`, ref: nav.url });
            break;
          }

          case 'Click': {
            const sel = selectorForStep(step);
            if (!sel) {
              return { stepId: step.id, ok: false, error: `no locator for strategy "${step.strategy}"`, elapsedMs: Date.now() - startedAt };
            }
            const res = await evalClick(session, sel);
            if (!res.ok) {
              return { stepId: step.id, ok: false, error: res.error ?? 'click failed', elapsedMs: Date.now() - startedAt };
            }
            evidence.push({ kind: 'dom', detail: `clicked ${sel}` });
            break;
          }

          case 'Type': {
            const sel = selectorForStep(step);
            if (!sel) {
              return { stepId: step.id, ok: false, error: `no locator for strategy "${step.strategy}"`, elapsedMs: Date.now() - startedAt };
            }
            const value = valueForTypeStep(step);
            const res = await evalType(session, sel, value);
            if (!res.ok) {
              return { stepId: step.id, ok: false, error: res.error ?? 'type failed', elapsedMs: Date.now() - startedAt };
            }
            evidence.push({ kind: 'dom', detail: `typed into ${sel} (redacted)` });
            break;
          }

          case 'Wait': {
            const ms = Number(step.payload || step.strategyValue) || 0;
            await new Promise((r) => setTimeout(r, ms));
            evidence.push({ kind: 'timing', detail: `waited ${ms}ms` });
            break;
          }

          case 'assert': {
            const sel = selectorForStep(step);
            if (!sel) {
              return { stepId: step.id, ok: false, error: 'assert without locator', elapsedMs: Date.now() - startedAt };
            }
            const res = await evalAssert(session, sel);
            if (!res.ok) {
              return { stepId: step.id, ok: false, error: res.error ?? 'assertion failed', elapsedMs: Date.now() - startedAt };
            }
            evidence.push({ kind: 'dom', detail: `assert found ${sel}: ${res.detail ?? ''}`, ref: res.detail });
            break;
          }

          default: {
            return { stepId: step.id, ok: false, error: `unsupported action "${(step as { action?: string }).action}"`, elapsedMs: Date.now() - startedAt };
          }
        }

        // Screenshot evidence после каждого успешного шага
        const shot = await session.screenshot('operator');
        if (shot.ok && shot.screenshot) {
          evidence.push({ kind: 'screenshot', detail: 'viewport screenshot', ref: shot.screenshot.slice(0, 48) + '…' });
        }

        return { stepId: step.id, ok: true, evidence, elapsedMs: Date.now() - startedAt };
      } catch (e) {
        return {
          stepId: step.id,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          evidence,
          elapsedMs: Date.now() - startedAt,
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// eval-обёртки (BrowserSession.eval возвращает { ok, result })
// ---------------------------------------------------------------------------

interface EvalResult {
  ok: boolean;
  error?: string;
  detail?: string;
}

async function evalClick(session: ReturnType<typeof getBrowserSession>, sel: string): Promise<EvalResult> {
  const expr = `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return { ok:false, error:'element not found' }; el.click(); return { ok:true }; })()`;
  return unwrapEval(await session.eval(expr, 'operator'));
}

async function evalType(session: ReturnType<typeof getBrowserSession>, sel: string, value: string): Promise<EvalResult> {
  const expr = `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return { ok:false, error:'element not found' }; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(proto, 'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return { ok:true }; })()`;
  return unwrapEval(await session.eval(expr, 'operator'));
}

async function evalAssert(session: ReturnType<typeof getBrowserSession>, sel: string): Promise<EvalResult> {
  const expr = `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return { ok:false, error:'assertion target not found' }; return { ok:true, detail: (el.textContent||'').trim().slice(0,120) }; })()`;
  return unwrapEval(await session.eval(expr, 'operator'));
}

function unwrapEval(raw: unknown): EvalResult {
  const r = raw as { result?: unknown } | undefined;
  const value = r?.result;
  if (value && typeof value === 'object') {
    const v = value as { ok?: boolean; error?: string; detail?: string };
    return { ok: v.ok === true, error: v.error, detail: v.detail };
  }
  return { ok: false, error: 'eval returned no result' };
}
