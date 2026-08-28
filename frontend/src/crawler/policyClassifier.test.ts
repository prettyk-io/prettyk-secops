// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  classifyElement,
  classifyAll,
  activeRules,
  type CrawlableElement,
  type PolicyGateConfig,
} from './policyClassifier';

const BTN: (overrides?: Partial<CrawlableElement>) => CrawlableElement = (o) => ({
  tag: 'button', role: 'button', accessibleName: '', text: '', ...o,
});

const LINK: (overrides?: Partial<CrawlableElement>) => CrawlableElement = (o) => ({
  tag: 'a', role: 'link', accessibleName: '', text: '', href: '', ...o,
});

describe('CRAWL-3: Policy gate classifier', () => {
  // ── DANGEROUS ──
  it('«Удалить аккаунт» → blocked, reason=dangerous_action', () => {
    const r = classifyElement(BTN({ accessibleName: 'Удалить аккаунт' }), activeRules({ allowedOrigins: [], extraRules: [] }), []);
    expect(r.verdict).toBe('dangerous');
    expect(r.reason).toBe('dangerous_action');
  });

  it('«Выйти» → blocked', () => {
    const r = classifyElement(BTN({ text: 'Выйти' }), activeRules({ allowedOrigins: [], extraRules: [] }), []);
    expect(r.verdict).toBe('dangerous');
  });

  it('«Logout» → blocked', () => {
    const r = classifyElement(BTN({ accessibleName: 'Logout' }), activeRules({ allowedOrigins: [], extraRules: [] }), []);
    expect(r.verdict).toBe('dangerous');
  });

  it('«Delete item» → blocked', () => {
    const r = classifyElement(BTN({ accessibleName: 'Delete item' }), activeRules({ allowedOrigins: [], extraRules: [] }), []);
    expect(r.verdict).toBe('dangerous');
  });

  it('«Сменить пароль» → blocked', () => {
    const r = classifyElement(BTN({ accessibleName: 'Сменить пароль' }), activeRules({ allowedOrigins: [], extraRules: [] }), []);
    expect(r.verdict).toBe('dangerous');
  });

  // ── OUT-OF-SCOPE ──
  it('mailto: ссылка → out_of_scope', () => {
    const r = classifyElement(LINK({ href: 'mailto:admin@example.com', role: 'link' }), activeRules({ allowedOrigins: [], extraRules: [] }), []);
    expect(r.verdict).toBe('out_of_scope');
    expect(r.reason).toBe('unsafe_protocol');
  });

  it('javascript:void(0) → out_of_scope', () => {
    const r = classifyElement(LINK({ href: 'javascript:void(0)', role: 'link' }), activeRules({ allowedOrigins: [], extraRules: [] }), []);
    expect(r.verdict).toBe('out_of_scope');
  });

  it('тел: ссылка → out_of_scope', () => {
    const r = classifyElement(LINK({ href: 'tel:+79990001122', role: 'link' }), activeRules({ allowedOrigins: [], extraRules: [] }), []);
    expect(r.verdict).toBe('out_of_scope');
  });

  it('cross-origin → out_of_scope с allowedOrigins', () => {
    const config: PolicyGateConfig = { allowedOrigins: ['https://myapp.local'], extraRules: [] };
    const r = classifyElement(LINK({ href: 'https://external.com/page', role: 'link' }), activeRules(config), config.allowedOrigins);
    expect(r.verdict).toBe('out_of_scope');
    expect(r.reason).toBe('cross_origin');
  });

  it('same-origin с allowedOrigins → safe (не out_of_scope)', () => {
    const config: PolicyGateConfig = { allowedOrigins: ['https://myapp.local'] };
    const r = classifyElement(LINK({ href: 'https://myapp.local/dashboard', role: 'link' }), activeRules(config), config.allowedOrigins);
    expect(r.verdict).toBe('safe');
  });

  // ── SAFE ──
  it('«Поиск» → safe', () => {
    const r = classifyElement(BTN({ accessibleName: 'Поиск', role: 'button' }), activeRules({ allowedOrigins: [], extraRules: [] }), []);
    expect(r.verdict).toBe('safe');
    expect(r.reason).toBeNull();
  });

  it('обычная кнопка навигации → safe', () => {
    const r = classifyElement(BTN({ accessibleName: 'Профиль', role: 'button' }), activeRules({ allowedOrigins: [], extraRules: [] }), []);
    expect(r.verdict).toBe('safe');
  });

  it('кнопка «Настройки» → safe', () => {
    const r = classifyElement(BTN({ accessibleName: 'Настройки', role: 'button' }), activeRules({ allowedOrigins: [], extraRules: [] }), []);
    expect(r.verdict).toBe('safe');
  });

  // ── Классификация всех элементов ──
  it('classifyAll возвращает все элементы с вердиктами', () => {
    const elements: CrawlableElement[] = [
      BTN({ accessibleName: 'Поиск', role: 'button' }),
      BTN({ text: 'Выйти', role: 'button' }),
      LINK({ href: 'mailto:x@y.z', role: 'link' }),
    ];
    const result = classifyAll(elements, { allowedOrigins: [], extraRules: [] });
    expect(result).toHaveLength(3);
    expect(result[0]!.result.verdict).toBe('safe');
    expect(result[1]!.result.verdict).toBe('dangerous');
    expect(result[2]!.result.verdict).toBe('out_of_scope');
  });

  // ── EXTRA RULES ──
  it('extraRules добавляются к дефолтному списку', () => {
    const config: PolicyGateConfig = {
      allowedOrigins: [],
      extraRules: [{ verdict: 'dangerous', field: 'accessibleName', values: ['admin panel'], reason: 'restricted_area' }],
    };
    const r = classifyElement(BTN({ accessibleName: 'Admin Panel', role: 'button' }), activeRules(config), []);
    expect(r.verdict).toBe('dangerous');
    expect(r.reason).toBe('restricted_area');
  });
});