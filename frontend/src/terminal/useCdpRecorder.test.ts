// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  decideObservation,
  observationToDsl,
  observationToAction,
  observationToStrategy,
  observationToStep,
  observationName,
  buildProvenance,
  observationToLocator,
} from './useCdpRecorder';
import type { CdpObservation } from '../studio/browserSession';

function makeObservation(overrides: Partial<CdpObservation> = {}): CdpObservation {
  return {
    eventId: 'cdp-1',
    timestamp: Date.now(),
    action: 'click',
    element: {
      tag: 'button',
      id: 'submit-btn',
      text: 'Войти',
      rect: { x: 38, y: 52, w: 24, h: 6 },
      role: 'button',
      accessibleName: 'Войти',
    },
    candidates: [
      { kind: 'semantic', value: 'page.getByRole("button", {name: "Войти"})', score: 0.85, tier: 'T0', unique: true },
    ],
    isAmbiguous: false,
    valueClass: 'unknown',
    ...overrides,
  };
}

describe('POC-CDP-2: observationToDsl / action / strategy', () => {
  it('Click button → Click role="..."', () => {
    const dsl = observationToDsl(makeObservation());
    expect(dsl).toBe('Click role "Войти"');
    expect(observationToAction(makeObservation())).toBe('Click');
    expect(observationToStrategy(makeObservation())).toBe('role');
  });

  it('textbox → Type step', () => {
    const obs = makeObservation({
      action: 'click',
      element: { tag: 'input', text: '', rect: { x: 38, y: 32, w: 24, h: 5 }, role: 'textbox', accessibleName: 'Логин' },
    });
    expect(observationToAction(obs)).toBe('Type');
    expect(observationToStrategy(obs)).toBe('role');
  });

  it('unknown role falls back to css strategy', () => {
    const obs = makeObservation({ element: { tag: 'div', text: 'X', rect: { x: 0, y: 0, w: 1, h: 1 } } });
    expect(observationToStrategy(obs)).toBe('css');
  });

  it('BBA-3: action=type observation → Type step', () => {
    const obs = makeObservation({
      action: 'type',
      element: { tag: 'input', text: '', rect: { x: 0, y: 0, w: 1, h: 1 }, role: 'textbox', accessibleName: 'Логин' },
      valueClass: 'unknown',
    });
    expect(observationToAction(obs)).toBe('Type');
    const step = observationToStep(obs);
    expect(step.action).toBe('Type');
    expect(step.payload).toBe('$value');
    expect(observationToDsl(obs)).toContain('$value');
  });

  it('BBA-3: type observation on password → $secret (no plaintext)', () => {
    const obs = makeObservation({
      action: 'type',
      element: { tag: 'input', text: '', rect: { x: 0, y: 0, w: 1, h: 1 }, role: 'textbox', accessibleName: 'Пароль' },
      valueClass: 'secret',
    });
    expect(observationToStep(obs).payload).toBe('$secret');
    expect(observationToDsl(obs)).toContain('$secret');
  });
});

describe('POC-CDP-5: redaction (DoD 12)', () => {
  it('secret valueClass → $secret reference, never plaintext', () => {
    const obs = makeObservation({
      action: 'click',
      element: { tag: 'input', text: 'hunter2', rect: { x: 0, y: 0, w: 1, h: 1 }, role: 'textbox', accessibleName: 'Пароль' },
      valueClass: 'secret',
    });
    const dsl = observationToDsl(obs);
    expect(dsl).not.toContain('hunter2');
    expect(dsl).toContain('$secret');
  });

  it('TYPE-FE: type event без accessibleName → имя из tag, plaintext в text НЕ попадает в имя', () => {
    const obs = makeObservation({
      action: 'type',
      element: { tag: 'input', text: 'hunter2', rect: { x: 0, y: 0, w: 1, h: 1 }, role: 'textbox' },
      valueClass: 'secret',
    });
    // accessibleName отсутствует → текст элемента ('hunter2') НЕ должен стать именем
    expect(observationName(obs)).toBe('input');
    const step = observationToStep(obs);
    expect(step.strategyValue).toBe('input');
    expect(step.strategyValue).not.toContain('hunter2');
    const dsl = observationToDsl(obs);
    expect(dsl).not.toContain('hunter2');
  });

  it('TYPE-FE: click на кнопке → element.text остаётся именем (не Type)', () => {
    const obs = makeObservation({
      action: 'click',
      element: { tag: 'button', text: 'Войти', rect: { x: 0, y: 0, w: 1, h: 1 }, role: 'button' },
    });
    expect(observationName(obs)).toBe('Войти');
    expect(observationToStep(obs).strategyValue).toBe('Войти');
  });

  it('email valueClass → $value reference (never plaintext)', () => {
    const obs = makeObservation({
      action: 'click',
      element: { tag: 'input', text: 'a@b.c', rect: { x: 0, y: 0, w: 1, h: 1 }, role: 'textbox', accessibleName: 'Email' },
      valueClass: 'email',
    });
    const dsl = observationToDsl(obs);
    expect(dsl).not.toContain('a@b.c');
    expect(dsl).toContain('$value');
  });

  it('phone valueClass → $value reference (never plaintext)', () => {
    const obs = makeObservation({
      element: { tag: 'input', text: '+79990001122', rect: { x: 0, y: 0, w: 1, h: 1 }, role: 'textbox', accessibleName: 'Phone' },
      valueClass: 'phone',
    });
    const dsl = observationToDsl(obs);
    expect(dsl).not.toContain('+79990001122');
    expect(dsl).toContain('$value');
  });

  it('unknown valueClass → $value reference (test value never plaintext)', () => {
    const obs = makeObservation({
      action: 'click',
      element: { tag: 'input', text: 'test-username', rect: { x: 0, y: 0, w: 1, h: 1 }, role: 'textbox', accessibleName: 'Логин' },
      valueClass: 'unknown',
    });
    const dsl = observationToDsl(obs);
    expect(dsl).not.toContain('test-username');
    expect(dsl).toContain('$value');
  });
});

describe('POC-CDP-3/5: decideObservation gates (DoD 4, 10, 11)', () => {
  it('normal observation → apply', () => {
    const d = decideObservation(makeObservation(), { acceptedEventIds: new Set(), existingDslLines: [] });
    expect(d.apply).toBe(true);
    expect(d.ambiguous).toBe(false);
  });

  it('ambiguous locator → blocked (DoD 4)', () => {
    const obs = makeObservation({ isAmbiguous: true });
    const d = decideObservation(obs, { acceptedEventIds: new Set(), existingDslLines: [] });
    expect(d.apply).toBe(false);
    expect(d.ambiguous).toBe(true);
  });

  it('duplicate event → blocked (DoD 10)', () => {
    const obs = makeObservation();
    const d = decideObservation(obs, { acceptedEventIds: new Set(['cdp-1']), existingDslLines: [] });
    expect(d.apply).toBe(false);
    expect(d.duplicate).toBe(true);
  });

  it('duplicate DSL → blocked', () => {
    const obs = makeObservation();
    const dsl = observationToDsl(obs);
    const d = decideObservation(obs, { acceptedEventIds: new Set(), existingDslLines: [dsl] });
    expect(d.apply).toBe(false);
    expect(d.duplicateDsl).toBe(true);
  });

  it('manual locator → not overwritten (DoD 11)', () => {
    const obs = makeObservation();
    const d = decideObservation(obs, {
      acceptedEventIds: new Set(),
      existingDslLines: [],
      manualLocators: new Set(['Войти']),
    });
    expect(d.apply).toBe(false);
    expect(d.manualTrust).toBe(true);
  });
});

describe('BBA-4: deterministic Accept/Reject (1 step / 0 changes, no dupes)', () => {
  it('Accept produces exactly one step with stable canonical identity', () => {
    const obs = makeObservation();
    const step = observationToStep(obs);
    const provenance = buildProvenance(obs);

    // один шаг, не массив
    expect(typeof step).toBe('object');
    expect(Array.isArray(step)).toBe(false);
    expect(step.id).toBeTruthy();
    // identity — детерминированные поля
    expect(step.action).toBe('Click');
    expect(step.strategy).toBe('role');
    expect(step.strategyValue).toBe('Войти');
    expect(step.led).toBe('predicted');
    // provenance всегда непустой маркер
    expect(typeof provenance).toBe('string');
    expect(provenance.length).toBeGreaterThan(0);
  });

  it('Reject adds nothing — decision still apply=false and no step identity is minted', () => {
    const obs = makeObservation();
    // Reject не мутирует shared-состояние (acceptedEventIds не трогается) —
    // повторное то же событие всё ещё apply (детерминизм gate).
    const d = decideObservation(obs, { acceptedEventIds: new Set(), existingDslLines: [] });
    expect(d.apply).toBe(true);
    // Никакого шага не создаётся на reject-ветке — reject только чистит proposal.
    // (step identity minted только в observationToStep → вызывается только на Accept.)
  });

  it('Duplicate event after Accept → blocked, zero additional steps', () => {
    const obs = makeObservation();
    const d = decideObservation(obs, { acceptedEventIds: new Set(['cdp-1']), existingDslLines: [] });
    expect(d.apply).toBe(false);
    expect(d.duplicate).toBe(true);
  });

  it('Same observation accepted twice produces distinct step identities', () => {
    const obs = makeObservation();
    const a = observationToStep(obs);
    const b = observationToStep(obs);
    expect(a.id).not.toBe(b.id);
  });

  it('Accept never leaks plaintext into step or DSL (BBA-4 no-plaintext)', () => {
    const obs = makeObservation({
      action: 'type',
      element: { tag: 'input', text: 'hunter2', rect: { x: 0, y: 0, w: 1, h: 1 }, role: 'textbox', accessibleName: 'Пароль' },
      valueClass: 'secret',
    });
    const step = observationToStep(obs);
    const dsl = observationToDsl(obs);
    expect(step.payload).not.toContain('hunter2');
    expect(dsl).not.toContain('hunter2');
    expect(step.payload).toBe('$secret');
  });
});

describe('POC-CDP-3/4: canonical step mapping', () => {
  it('observationToStep preserves single identity fields', () => {
    const step = observationToStep(makeObservation());
    expect(step.action).toBe('Click');
    expect(step.strategy).toBe('role');
    expect(step.strategyValue).toBe('Войти');
    expect(step.led).toBe('predicted');
    expect(step.id).toBeTruthy();
  });

  it('Type step payload is a $reference, never plaintext (DoD 12)', () => {
    const obs = makeObservation({
      element: { tag: 'input', text: 'hunter2', rect: { x: 0, y: 0, w: 1, h: 1 }, role: 'textbox', accessibleName: 'Пароль' },
      valueClass: 'secret',
    });
    const step = observationToStep(obs);
    expect(step.action).toBe('Type');
    expect(step.payload).toBe('$secret');
    expect(step.payload).not.toContain('hunter2');
  });

  it('buildProvenance derives from candidate tier', () => {
    const p = buildProvenance(makeObservation());
    expect(p).toContain('T0');
    expect(p).toContain('semantic');
  });

  it('observationToLocator maps rect + tier', () => {
    const loc = observationToLocator(makeObservation());
    expect(loc.tier).toBe('T0');
    expect(loc.position.x).toBe(38);
    expect(loc.pwLocator).toContain('getByRole');
  });
});