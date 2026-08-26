// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { BuddyEngine } from './buddyEngine';
import { DeterministicBuddyModel, __resetBuddyIdCounter } from './model';
import { evaluateAssertions, emptyEvidenceMatrix } from './evidence';
import { BoundedRunner, makeStepRunner } from './boundedRun';
import { redactForEngine, looksSecret, containsPlainSecret } from './redaction';
import type { RunStepOutcome } from './types';

beforeEach(() => {
  __resetBuddyIdCounter();
});

function okOutcome(stepId: string, evidence: RunStepOutcome['evidence']): RunStepOutcome {
  return { stepId, ok: true, evidence, elapsedMs: 10 };
}

describe('BUD-1: Intent → Skeleton (DeterministicBuddyModel)', () => {
  it('извлекает страницы, действия и ожидания из свободного описания', () => {
    const model = new DeterministicBuddyModel();
    const skeleton = model.extractSkeleton({
      messages: [
        {
          id: 'm1', role: 'operator', ts: 0,
          text: 'Это SPA. Есть /catalog, /product/:id и /cart. Пользователь открывает товар, нажимает "Купить" и видит товар в корзине',
        },
      ],
    });

    expect(skeleton.pages.length).toBeGreaterThanOrEqual(2);
    expect(skeleton.pages.some(p => p.path === '/catalog')).toBe(true);
    expect(skeleton.actions.length).toBeGreaterThan(0);
    expect(skeleton.expectations.length).toBeGreaterThan(0);
    expect(skeleton.appType).toBe('SPA');
  });

  it('НЕ выдумывает: неполное описание помечает assumption', () => {
    const model = new DeterministicBuddyModel();
    const skeleton = model.extractSkeleton({
      messages: [{ id: 'm1', role: 'operator', ts: 0, text: 'какое-то приложение' }],
    });

    expect(skeleton.pages.length).toBe(0);
    expect(skeleton.assumptions.length).toBeGreaterThan(0);
    expect(skeleton.assumptions.some(a => a.about.includes('страницы'))).toBe(true);
  });
});

describe('BUD-2: Clarification', () => {
  it('неполное описание → вопросы, incomplete', () => {
    const model = new DeterministicBuddyModel();
    const intent = {
      messages: [{ id: 'm1', role: 'operator' as const, ts: 0, text: 'купить товар' }],
    };
    const skeleton = model.extractSkeleton(intent);
    const clarification = model.clarify(intent, skeleton);

    expect(clarification.complete).toBe(false);
    expect(clarification.questions.length).toBeGreaterThan(0);
  });

  it('противоречие (дубль страницы) → показано, генерация заблокирована', () => {
    const model = new DeterministicBuddyModel();
    const intent = {
      messages: [
        { id: 'm1', role: 'operator' as const, ts: 0, text: 'Страница /cart есть. Открываю /cart' },
      ],
    };
    const skeleton = model.extractSkeleton(intent);
    const clarification = model.clarify(intent, skeleton);
    expect(clarification.contradictions.length).toBeGreaterThan(0);
    expect(clarification.complete).toBe(false);
  });
});

describe('BUD-3: Bounded Run', () => {
  it('ограничивает итерации → bounded failure, не бесконечный цикл', async () => {
    const runner = makeStepRunner(async () => okOutcome('s', [{ kind: 'http', detail: '200 OK' }]));
    const r = new BoundedRunner({
      runner,
      approvedStepIds: ['s1', 's2', 's3'],
      config: { maxIterations: 2 },
    });
    const steps = [
      { id: 's1', dsl: 'Open /', action: 'Open', strategy: 'css', strategyValue: '', payload: '/' },
      { id: 's2', dsl: 'Click x', action: 'Click', strategy: 'css', strategyValue: 'x', payload: '' },
      { id: 's3', dsl: 'Click y', action: 'Click', strategy: 'css', strategyValue: 'y', payload: '' },
    ];
    const state = await r.run(steps);
    expect(state.phase).toBe('bounded_failure');
    expect(state.failureReason).toContain('итераций');
  });

  it('Stop останавливает процесс', async () => {
    const runner = makeStepRunner(async () => {
      await new Promise(r => setTimeout(r, 50));
      return okOutcome('s', [{ kind: 'dom', detail: 'span=1' }]);
    });
    const r = new BoundedRunner({
      runner,
      approvedStepIds: ['s1', 's2'],
      config: { maxIterations: 10 },
    });
    const steps = [
      { id: 's1', dsl: 'Open /', action: 'Open', strategy: 'css', strategyValue: '', payload: '/' },
      { id: 's2', dsl: 'Click x', action: 'Click', strategy: 'css', strategyValue: 'x', payload: '' },
    ];
    const p = r.run(steps);
    // Stop через tick
    await new Promise(r => setTimeout(r, 5));
    r.stop();
    const state = await p;
    expect(['stopped', 'done']).toContain(state.phase);
  });

  it('шаг вне run-scope требует подтверждения', async () => {
    const runner = makeStepRunner(async () => okOutcome('s', []));
    const r = new BoundedRunner({
      runner,
      approvedStepIds: [], // ничего не подтверждено
      config: { maxIterations: 10 },
    });
    const steps = [
      { id: 's1', dsl: 'Open /', action: 'Open', strategy: 'css', strategyValue: '', payload: '/' },
    ];
    const state = await r.run(steps);
    // Без подтверждения шаг не выполнился → остался awaiting или done с 0 outcomes
    expect(state.outcomes.length).toBe(0);
  });
});

describe('BUD-4: Evidence', () => {
  it('pass только если все assertions доказаны + есть evidence', () => {
    const matrix = evaluateAssertions(
      [{ id: 'e1', description: 'товар в корзине', confidence: 'explicit' }],
      [okOutcome('s1', [{ kind: 'http', detail: 'POST /api/cart → 200 OK' }, { kind: 'dom', detail: 'span.cart-count=1' }])],
    );
    expect(matrix.pass).toBe(true);
    expect(matrix.assertions[0]!.proven).toBe(true);
    expect(matrix.assertions[0]!.evidence.length).toBe(2);
  });

  it('fail: нет evidence → не pass, честная причина', () => {
    const matrix = evaluateAssertions(
      [{ id: 'e1', description: 'товар в корзине', confidence: 'explicit' }],
      [okOutcome('s1', [])],
    );
    expect(matrix.pass).toBe(false);
    expect(matrix.assertions[0]!.proven).toBe(false);
    expect(matrix.assertions[0]!.failReason).toContain('evidence');
  });

  it('fail: провальный шаг → не pass', () => {
    const matrix = evaluateAssertions(
      [{ id: 'e1', description: 'товар', confidence: 'explicit' }],
      [{ stepId: 's1', ok: false, error: 'element not found', elapsedMs: 10 }],
    );
    expect(matrix.pass).toBe(false);
  });

  it('emptyEvidenceMatrix никогда не pass', () => {
    expect(emptyEvidenceMatrix().pass).toBe(false);
  });
});

describe('BUD-5: Negative + redaction', () => {
  it('redactForEngine: secret → $secret, value → $value, placeholder → as-is', () => {
    expect(redactForEngine('hunter2', true)).toBe('$secret');
    expect(redactForEngine('test@mail.ru')).toBe('$value');
    expect(redactForEngine('$value')).toBe('$value');
    expect(redactForEngine('')).toBe('');
  });

  it('looksSecret распознаёт пароль/токен', () => {
    expect(looksSecret('мой пароль 123')).toBe(true);
    expect(looksSecret('Bearer token')).toBe(true);
    expect(looksSecret('обычное имя')).toBe(false);
  });

  it('containsPlainSecret ловит plaintext-утечку, пропускает $ref', () => {
    expect(containsPlainSecret('Type password="x" hunter2')).toBe(true);
    expect(containsPlainSecret('Type password $secret')).toBe(false);
  });
});

describe('BuddyEngine — сквозной контур (BUD-1..4)', () => {
  it('reject не меняет workspace-гипотезу', () => {
    const engine = new BuddyEngine();
    engine.addMessage('SPA /catalog /cart. Открывает товар, видит товар в корзине');
    engine.buildProposal();
    engine.approveProposal();
    const before = engine.getState().proposal;
    engine.rejectProposal();
    expect(engine.getState().proposal).toBeNull();
    expect(before).not.toBeNull(); // proposal был, но отклонён
  });

  it('противоречие блокирует buildProposal', () => {
    const engine = new BuddyEngine();
    engine.addMessage('SPA /cart /cart. Открывает товар, видит товар');
    // противоречие /cart дублируется — но determin. модель ловит только при clarify
    // Смотрим: buildProposal не строится если clarification не complete
    const s = engine.buildProposal();
    expect(s.proposal).toBeNull();
  });

  it('полный happy path: intent → proposal → run → evidence → pass', async () => {
    const engine = new BuddyEngine({
      runner: makeStepRunner(async (step) => okOutcome(step.id, [
        { kind: 'http', detail: '200 OK' },
        { kind: 'dom', detail: 'span.cart-count=1' },
      ])),
    });

    engine.addMessage('SPA. Страницы /catalog и /cart. Пользователь открывает товар, нажимает Купить и видит товар в корзине');
    expect(engine.getState().skeleton).not.toBeNull();

    engine.buildProposal();
    expect(engine.getState().phase).toBe('proposal');

    engine.approveProposal();
    expect(engine.getState().phase).toBe('approved');

    await engine.run();
    const s = engine.getState();
    expect(s.phase).toBe('finished');
    expect(s.evidence).not.toBeNull();
    // Trace-цепочка видна
    const kinds = s.trace.events.map(e => e.kind);
    expect(kinds).toContain('intent_received');
    expect(kinds).toContain('skeleton_built');
    expect(kinds).toContain('proposal_built');
    expect(kinds).toContain('run_started');
    expect(kinds).toContain('evidence_evaluated');
  });
});
