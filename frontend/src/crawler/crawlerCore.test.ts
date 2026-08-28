// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

// ── CRAWL-2 ──
import { buildFingerprint, stateKey, createBudget, tryVisitState, recordAction, budgetStats } from './stateFingerprint';

const MOCK_AX_TREE = {
  role: 'WebArea', name: 'SPA',
  children: [
    { role: 'heading', name: 'Главная' },
    { role: 'button', name: 'Войти' },
    { role: 'button', name: 'Удалить аккаунт' },
    { role: 'link', name: 'Поддержка' },
  ],
};

describe('CRAWL-2: State fingerprinting', () => {
  it('модалка и пустой роут — разные state_key', () => {
    const fp1 = buildFingerprint({
      url: 'https://app.local/#/',
      headings: ['Главная'],
      interactiveElements: [{ accessibleName: 'Войти', role: 'button' }],
      axTree: MOCK_AX_TREE,
    });

    const fp2 = buildFingerprint({
      url: 'https://app.local/#/',
      headings: ['Главная', 'Настройки'],
      interactiveElements: [
        { accessibleName: 'Войти', role: 'button' },
        { accessibleName: 'Никнейм', role: 'textbox' },
        { accessibleName: 'Телефон', role: 'textbox' },
        { accessibleName: 'Сохранить', role: 'button' },
        { accessibleName: 'Сменить пароль', role: 'button' },
      ],
      axTree: {
        ...MOCK_AX_TREE,
        children: [
          ...MOCK_AX_TREE.children,
          { role: 'dialog', name: 'Настройки профиля' },
        ],
      },
    });

    expect(stateKey(fp1)).not.toBe(stateKey(fp2));
  });

  it('повторное посещение → duplicate', () => {
    const fp = buildFingerprint({
      url: 'https://app.local/#/dashboard',
      headings: ['Дашборд'],
      interactiveElements: [{ accessibleName: 'Поиск', role: 'button' }],
      axTree: MOCK_AX_TREE,
    });
    const key = stateKey(fp);
    const budget = createBudget(10, 100);

    expect(tryVisitState(budget, key, 0).allowed).toBe(true);
    expect(tryVisitState(budget, key, 0).allowed).toBe(false);
    expect(tryVisitState(budget, key, 0).stopReason).toBe('duplicate');
  });

  it('превышение max_states → budget_exhausted', () => {
    const budget = createBudget(2, 100);
    expect(tryVisitState(budget, 'k1', 0).allowed).toBe(true);
    expect(tryVisitState(budget, 'k2', 0).allowed).toBe(true);
    const d = tryVisitState(budget, 'k3', 5);
    expect(d.allowed).toBe(false);
    expect(d.stopReason).toBe('budget_exhausted');
    expect(d.queuedCount).toBe(5);
  });

  it('превышение maxActions — не блокирует visit, блокирует recordAction', () => {
    const budget = createBudget(100, 2);
    // Действия записаны, но visit — это не действие, он должен разрешать
    recordAction(budget);
    recordAction(budget);
    // visit нового состояния всё ещё allowed
    const d = tryVisitState(budget, 'k1', 0);
    expect(d.allowed).toBe(true);
    // Но actionsTaken достиг максимума
    expect(budget.actionsTaken).toBe(2);
  });

  it('повтор с одинаковыми дайджестами → дубликат', () => {
    const fp = buildFingerprint({
      url: 'https://app.local/#/login',
      headings: ['Вход'],
      interactiveElements: [{ accessibleName: 'Логин', role: 'textbox' }],
      axTree: { role: 'WebArea', name: 'Login' },
    });
    const key = stateKey(fp);
    const budget = createBudget(5, 100);
    tryVisitState(budget, key, 0);
    const d = tryVisitState(budget, key, 0);
    expect(d.allowed).toBe(false);
    expect(d.stopReason).toBe('duplicate');
  });

  it('бюджет: recordAction увеличивает счётчик', () => {
    const budget = createBudget(10, 100);
    recordAction(budget);
    recordAction(budget);
    expect(budgetStats(budget).actions).toBe(2);
  });

  it('статистика бюджета показывает visited/actions/remaining', () => {
    const budget = createBudget(20, 500);
    tryVisitState(budget, 's1', 0);
    tryVisitState(budget, 's2', 0);
    recordAction(budget);
    const stats = budgetStats(budget);
    expect(stats.visited).toBe(2);
    expect(stats.actions).toBe(1);
    expect(stats.remaining).toBe(18);
  });
});

// ── CRAWL-4 ──
import { captureRequest, captureResponse, captureConsole, capturePageError } from './networkCapture';

describe('CRAWL-4: Network capture', () => {
  it('XHR POST логина → redacted тело', () => {
    const req = captureRequest({
      requestId: 'r1', method: 'POST', url: '/api/login',
      resourceType: 'fetch',
      postData: JSON.stringify({ email: 'test@test.com', password: 'secret123' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(req).not.toBeNull();
    expect(req!.requestBody).toContain('test@test.com');
    expect(req!.requestBody).not.toContain('secret123');
    expect(req!.requestBody).toContain('[REDACTED]');
  });

  it('ответ с токеном → redacted', () => {
    const res = captureResponse({
      requestId: 'r1', status: 200,
      body: JSON.stringify({ token: 'jwt-secret-token', ok: true }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res).not.toBeNull();
    expect(res!.responseBody).toContain('[REDACTED]');
    expect(res!.responseBody).not.toContain('jwt-secret-token');
  });

  it('image resource → null (пропускаем)', () => {
    const req = captureRequest({
      requestId: 'r2', method: 'GET', url: '/logo.png', resourceType: 'image',
    });
    expect(req).toBeNull();
  });

  it('OPTIONS → null (префлайт)', () => {
    const req = captureRequest({
      requestId: 'r3', method: 'OPTIONS', url: '/api/search', resourceType: 'fetch',
    });
    expect(req).toBeNull();
  });

  it('response >64KB → null', () => {
    const big = 'x'.repeat(65000);
    const res = captureResponse({
      requestId: 'r4', status: 200,
      body: big,
      headers: { 'content-type': 'text/html' },
    });
    expect(res).toBeNull();
  });

  it('console capture → нормализация уровня', () => {
    const entry = captureConsole({ type: 'error', text: 'Uncaught TypeError: x is undefined' });
    expect(entry.level).toBe('error');
    expect(entry.text).toContain('TypeError');
  });

  it('page error capture → message + stack', () => {
    const err = capturePageError({ message: 'Oops', stack: 'at line 42' });
    expect(err.message).toBe('Oops');
    expect(err.stack).toContain('line 42');
  });
});

// ── CRAWL-7 ──
import {
  filterTemplatesForHandoff,
  approveTemplate,
  buildHandoff,
  isHandoffReady,
  type RequestTemplate,
} from './fuzzerHandoff';

const TPL = (overrides: Partial<RequestTemplate> = {}): RequestTemplate => ({
  templateId: 'tpl-1', method: 'POST', url: '/api/x',
  headers: {}, params: {}, provenance: 'observed',
  endpointDescription: 'POST /api/x', createdAt: Date.now(),
  ...overrides,
});

describe('CRAWL-7: Fuzzer handoff', () => {
  it('observed + operator_approved → accepted', () => {
    const { accepted, filtered } = filterTemplatesForHandoff([
      TPL({ provenance: 'observed', templateId: 'o1' }),
      TPL({ provenance: 'operator_approved', templateId: 'oa1' }),
      TPL({ provenance: 'synthetic_candidate', templateId: 's1' }),
    ]);
    expect(accepted).toHaveLength(2);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.templateId).toBe('s1');
  });

  it('approveTemplate меняет synthetic → operator_approved', () => {
    const tpl = TPL({ provenance: 'synthetic_candidate', templateId: 's1' });
    const approved = approveTemplate(tpl, 'operator');
    expect(approved.provenance).toBe('operator_approved');
    expect(approved.approvedBy).toBe('operator');
    expect(approved.approvedAt).toBeGreaterThan(0);
  });

  it('повторный approve observed → без изменений', () => {
    const tpl = TPL({ provenance: 'observed' });
    const result = approveTemplate(tpl);
    expect(result.provenance).toBe('observed');
  });

  it('buildHandoff → summary с rejectedReasons', () => {
    const result = buildHandoff(
      [TPL({ templateId: 'o1' }), TPL({ provenance: 'synthetic_candidate', templateId: 's1', endpointDescription: 'POST /api/fake' })],
      { mode: 'sniper', mutationsPerTemplate: 50, autoStart: false },
    );
    expect(result.summary.total).toBe(2);
    expect(result.summary.accepted).toBe(1);
    expect(result.summary.rejectedReason[0]).toContain('synthetic_candidate');
    expect(result.summary.rejectedReason[0]).toContain('POST /api/fake');
  });

  it('isHandoffReady → observed = true, synthetic = false', () => {
    expect(isHandoffReady(TPL({ provenance: 'observed' }))).toBe(true);
    expect(isHandoffReady(TPL({ provenance: 'operator_approved' }))).toBe(true);
    expect(isHandoffReady(TPL({ provenance: 'synthetic_candidate' }))).toBe(false);
  });
});

// ── CRAWL-9 ──
import {
  buildAccessibilityMatrix,
  updateMatrixCell,
  matrixStats,
  personaHash,
  describeAuthChain,
  createMultiPersonaResult,
  type MultiPersonaConfig,
} from './multiPersonaCrawl';

const CONFIG: MultiPersonaConfig = {
  personas: [
    { name: 'anonymous', role: 'anonymous', authChain: [], label: 'Anonymous' },
    { name: 'admin', role: 'admin', authChain: [
      { action: 'navigate', url: '/#/login' },
      { action: 'fill', selector: '#email', value: 'admin@test.local' },
      { action: 'fill', selector: '#password', value: 'test123' },
      { action: 'click', selector: '#submit' },
    ], label: 'Admin' },
  ],
  maxStatesPerPersona: 20,
  maxActionsPerPersona: 200,
};

describe('CRAWL-9: Multi-persona crawl', () => {
  it('personaHash детерминирован', () => {
    const h1 = personaHash('admin', 'admin');
    const h2 = personaHash('admin', 'admin');
    expect(h1).toBe(h2);
    expect(h1.length).toBe(8);
  });

  it('personaHash разный для разных ролей', () => {
    expect(personaHash('user', 'anonymous')).not.toBe(personaHash('user', 'admin'));
  });

  it('describeAuthChain — anonymous → "anonymous"', () => {
    expect(describeAuthChain([])).toBe('anonymous');
    expect(describeAuthChain(CONFIG.personas[1]!.authChain)).toContain('→ /#/login');
    expect(describeAuthChain(CONFIG.personas[1]!.authChain)).toContain('✎ #email=admin');
    expect(describeAuthChain(CONFIG.personas[1]!.authChain)).toContain('◎ #submit');
  });

  it('матрица: build + update + stats', () => {
    const m = buildAccessibilityMatrix(['anonymous', 'admin'], ['s1', 's2', 's3']);
    updateMatrixCell(m, 'anonymous', 's3', 'blocked');
    const stats = matrixStats(m);
    expect(stats.accessible).toBe(5); // s1+s2=2 для anonymous + s1+s2+s3=3 для admin = 5
    expect(stats.blocked).toBe(1);
  });

  it('createMultiPersonaResult → пустой результат', () => {
    const r = createMultiPersonaResult(CONFIG);
    expect(r.states).toEqual([]);
    expect(r.matrix.personas).toHaveLength(2);
    expect(r.startedAt).toBeGreaterThan(0);
  });
});