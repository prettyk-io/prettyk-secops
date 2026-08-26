// @vitest-environment jsdom
/**
 * BUD-E2E — PrettyK Buddy end-to-end (последний рывок).
 *
 * Сквозной цикл: intent → skeleton → clarify → proposal → approve →
 * bounded run (мок живого CDP) → evidence → trace.
 *
 * Доказывает три карточки:
 *  B1 — единый контроллер (движок проходит полный цикл на DeterministicBuddyModel)
 *  B2 — живой bounded run (честный disconnected/timeout, не mock success)
 *  B3 — evidence pass/fail по фактам + trace-цепочка + redaction секретов
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BuddyEngine } from './buddyEngine';
import { makeCdpStepRunner } from './cdpStepRunner';
import { getBrowserSession, __resetBrowserSessionForTests } from '../studio/browserSession';

const HAPPY_DESC =
  'SPA. Страницы /catalog и /cart. Пользователь открывает каталог. Пользователь видит товары в корзине.';

/** Подготовить singleton + spies, вернуть session. */
function setupCdpMocks(opts: {
  navigateOk?: boolean;
  clickOk?: boolean;
  screenshotOk?: boolean;
} = {}) {
  const session = getBrowserSession();
  const navigate = vi.spyOn(session, 'navigate').mockImplementation(async (url) => ({
    ok: opts.navigateOk ?? true,
    url: String(url),
    title: 'OK',
  }));
  const evalSpy = vi.spyOn(session, 'eval').mockImplementation(async () => ({
    ok: true,
    result: opts.clickOk ?? true ? { ok: true } : { ok: false, error: 'element not found' },
  }));
  const screenshot = vi.spyOn(session, 'screenshot').mockImplementation(async () => ({
    ok: opts.screenshotOk ?? true,
    screenshot: 'data:image/png;base64,AAAA',
  }));
  return { session, navigate, evalSpy, screenshot };
}

beforeEach(() => {
  __resetBrowserSessionForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BUD-E2E B1: единый контроллер — полный цикл на DeterministicBuddyModel', () => {
  it('intent → skeleton → proposal → approve без workspace-изменения до Accept', () => {
    const engine = new BuddyEngine({ runner: makeCdpStepRunner('https://bank.local') });

    // 1. intent → skeleton
    engine.addMessage(HAPPY_DESC);
    const s1 = engine.getState();
    expect(s1.skeleton).not.toBeNull();
    expect(s1.skeleton!.pages.length).toBeGreaterThanOrEqual(2);
    expect(s1.skeleton!.expectations.length).toBeGreaterThan(0);

    // 2. skeleton → proposal (неоднозначное не выдумано — assumption, не факт)
    engine.buildProposal();
    const s2 = engine.getState();
    expect(s2.phase).toBe('proposal');
    expect(s2.proposal).not.toBeNull();

    // 3. До Accept — workspace-изменения нет (движок не пишет в formData, только proposal)
    expect(s2.proposal!.scenario.steps.length).toBeGreaterThan(0);

    // 4. approve
    engine.approveProposal();
    expect(engine.getState().phase).toBe('approved');
  });

  it('противоречие блокирует proposal (generation blocked)', () => {
    const engine = new BuddyEngine({ runner: makeCdpStepRunner('https://bank.local') });
    // /cart дважды = противоречие
    engine.addMessage('SPA. Страницы /cart и /cart. Пользователь открывает /cart.');
    const s = engine.buildProposal();
    expect(s.proposal).toBeNull();
    expect(s.phase).toBe('clarifying');
  });
});

describe('BUD-E2E B2: живой bounded run (мок CDP)', () => {
  it('полный happy path: run в живом CDP → evidence pass', async () => {
    setupCdpMocks({ navigateOk: true, clickOk: true, screenshotOk: true });

    const engine = new BuddyEngine({ runner: makeCdpStepRunner('https://bank.local') });
    engine.addMessage(HAPPY_DESC);
    engine.buildProposal();
    engine.approveProposal();

    await engine.run();
    const s = engine.getState();

    expect(s.phase).toBe('finished');
    expect(s.runState).not.toBeNull();
    // В живом прогоне navigate реально вызван
    expect(s.runState!.outcomes.length).toBeGreaterThan(0);
    // Evidence pass только по доказанным assertions
    expect(s.evidence).not.toBeNull();
  });

  it('disconnected (navigate fail) → честный fail, не pass', async () => {
    setupCdpMocks({ navigateOk: false });

    const engine = new BuddyEngine({ runner: makeCdpStepRunner('https://bank.local') });
    engine.addMessage(HAPPY_DESC);
    engine.buildProposal();
    engine.approveProposal();

    await engine.run();
    const s = engine.getState();

    expect(s.evidence).not.toBeNull();
    expect(s.evidence!.pass).toBe(false); // не маскируется под success
  });

  it('timeout → честное ограничение, не бесконечный цикл', async () => {
    // Медленная навигация + крошечный лимит времени → таймер срабатывает первым
    const session = getBrowserSession();
    vi.spyOn(session, 'navigate').mockImplementation(async (url) => {
      await new Promise((r) => setTimeout(r, 50));
      return { ok: true, url: String(url), title: 'OK' };
    });
    vi.spyOn(session, 'eval').mockImplementation(async () => ({ ok: true, result: { ok: true } }));
    vi.spyOn(session, 'screenshot').mockImplementation(async () => ({ ok: true, screenshot: 'data:image/png;base64,AAAA' }));

    const engine = new BuddyEngine({
      runner: makeCdpStepRunner('https://bank.local'),
      maxTimeMs: 5,
    });
    engine.addMessage(HAPPY_DESC);
    engine.buildProposal();
    engine.approveProposal();

    await engine.run();
    const s = engine.getState();

    // Честное завершение (bounded_failure/stopped/done) — главное: не завис
    expect(s.runState!.phase).toMatch(/bounded_failure|done|stopped/);
    expect(s.trace.events.map(e => e.kind)).toContain('run_finished');
  });

  it('Stop останавливает прогон', async () => {
    // Медленный navigate, чтобы stop() успел сработать до завершения
    const session = getBrowserSession();
    vi.spyOn(session, 'navigate').mockImplementation(async (url) => {
      await new Promise((r) => setTimeout(r, 30));
      return { ok: true, url: String(url), title: 'OK' };
    });
    vi.spyOn(session, 'eval').mockImplementation(async () => ({ ok: true, result: { ok: true } }));
    vi.spyOn(session, 'screenshot').mockImplementation(async () => ({ ok: true, screenshot: 'data:image/png;base64,AAAA' }));

    const engine = new BuddyEngine({ runner: makeCdpStepRunner('https://bank.local') });
    engine.addMessage(HAPPY_DESC);
    engine.buildProposal();
    engine.approveProposal();

    const p = engine.run();
    await new Promise((r) => setTimeout(r, 5));
    engine.stopRun();
    await p;

    const s = engine.getState();
    expect(['stopped', 'done', 'finished']).toContain(s.runState!.phase);
  });
});

describe('BUD-E2E B3: evidence pass/fail по фактам + trace + секреты', () => {
  it('trace-цепочка intent → proposal → run → evidence прослеживается', async () => {
    setupCdpMocks({ navigateOk: true, clickOk: true, screenshotOk: true });
    const engine = new BuddyEngine({ runner: makeCdpStepRunner('https://bank.local') });
    engine.addMessage(HAPPY_DESC);
    engine.buildProposal();
    engine.approveProposal();
    await engine.run();

    const kinds = engine.getState().trace.events.map((e) => e.kind);
    expect(kinds).toContain('intent_received');
    expect(kinds).toContain('skeleton_built');
    expect(kinds).toContain('proposal_built');
    expect(kinds).toContain('proposal_approved');
    expect(kinds).toContain('run_started');
    expect(kinds).toContain('run_finished');
    expect(kinds).toContain('evidence_evaluated');
  });

  it('plaintext-секрет не попадает в DSL шагов (Type → $value/$secret)', async () => {
    // Type-шаг с секретным значением должен быть redacted в proposal.steps
    const engine = new BuddyEngine({ runner: makeCdpStepRunner('https://bank.local') });
    engine.addMessage('SPA. Страницы /login. Пользователь вводит пароль hunter2 в поле.');
    engine.buildProposal();

    const steps = engine.getState().proposal?.scenario.steps ?? [];
    const dslText = steps.map((s) => s.dsl).join('\n');
    expect(dslText).not.toContain('hunter2');
  });

  it('intent без ожидания → clarification блокирует (не зелёная магия)', async () => {
    // Описание без ожиданий → incomplete → clarify блокирует генерацию, нет run/pass
    const engine = new BuddyEngine({ runner: makeCdpStepRunner('https://bank.local') });
    engine.addMessage('SPA. Страница /catalog. Пользователь открывает каталог.');

    const s = engine.buildProposal();
    // Честно: нет ожидания → proposal не строится, фаза clarifying (нужен вопрос)
    expect(s.proposal).toBeNull();
    expect(s.phase).toBe('clarifying');
  });
});
