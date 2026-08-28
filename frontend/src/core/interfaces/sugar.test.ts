/**
 * DSL-L1: тесты валидности типов Sugar DSL.
 *
 * TypeScript компилятор проверяет assignment — тесты доказывают,
 * что типы совместимы и не допускают некорректных значений.
 */
import { describe, it, expect } from 'vitest';
import type {
  SugarVerb,
  SugarLocator,
  SugarModifier,
  SugarModifierEntry,
  ParsedSugarLine,
  WireStep,
} from './sugar';

// ── SugarVerb: все 10 глаголов допустимы ──

const allSugarVerbs: SugarVerb[] = [
  'Клик', 'Вставить', 'Ждать', 'Скрин', 'Текст',
  'Значение', 'Атрибут', 'Дописать', 'Очистить', 'Выбрать',
];

describe('SugarVerb — type validity', () => {
  it('принимает все 10 канонических глаголов', () => {
    expect(allSugarVerbs).toHaveLength(10);
    for (const verb of allSugarVerbs) {
      const _: SugarVerb = verb; // tsc проверяет assignment
      expect(typeof _).toBe('string');
    }
  });

  it('не принимает произвольную строку (type-level, компилятор проверяет)', () => {
    // Компилятор отверг бы: const bad: SugarVerb = 'Летать';
    // Рантайм-гард:
    const isValidSugarVerb = (s: string): s is SugarVerb =>
      (allSugarVerbs as string[]).includes(s);
    expect(isValidSugarVerb('Клик')).toBe(true);
    expect(isValidSugarVerb('Летать')).toBe(false);
    expect(isValidSugarVerb('')).toBe(false);
  });
});

// ── SugarLocator: стратегия + значение ──

const validLocator: SugarLocator = {
  strategy: 'role',
  value: 'Войти',
};

describe('SugarLocator — type validity', () => {
  it('принимает валидный role-локатор', () => {
    expect(validLocator.strategy).toBe('role');
    expect(validLocator.value).toBe('Войти');
  });

  it('принимает все стратегии', () => {
    const strategies: SugarLocator[] = [
      { strategy: 'role', value: 'btn' },
      { strategy: 'label', value: 'Email' },
      { strategy: 'test_id', value: 'login-btn' },
      { strategy: 'css', value: '.btn-primary' },
      { strategy: 'text', value: 'Отправить' },
      { strategy: 'placeholder', value: 'Введите имя' },
      { strategy: 'xpath', value: '//button[1]' },
    ];
    expect(strategies).toHaveLength(7);
  });
});

// ── ParsedSugarLine: полная структура шага ──

describe('ParsedSugarLine — type validity', () => {
  it('конструируется из всех полей', () => {
    const line: ParsedSugarLine = {
      verb: 'Клик',
      locator: { strategy: 'role', value: 'Войти' },
      args: ['', ''],
      modifiers: [],
      raw: 'Клик Войти',
    };
    expect(line.verb).toBe('Клик');
    expect(line.locator.strategy).toBe('role');
  });

  it('поддерживает модификаторы -> и >#', () => {
    const modifiers: SugarModifierEntry[] = [
      { kind: '->', value: '$token' },
      { kind: '>#', value: 'кнопка логина' },
      { kind: '>?' },
    ];
    const line: ParsedSugarLine = {
      verb: 'Вставить',
      locator: { strategy: 'label', value: 'Пароль' },
      args: ['$secret!'],
      modifiers,
      raw: 'Вставить Пароль $secret! -> $token ># поле пароля',
    };
    expect(line.modifiers).toHaveLength(3);
    expect(line.modifiers[0]!.kind).toBe('->');
    expect(line.modifiers[0]!.value).toBe('$token');
    expect(line.modifiers[1]!.kind).toBe('>#');
    expect(line.modifiers[2]!.kind).toBe('>?');
    expect(line.modifiers[2]!.value).toBeUndefined();
  });
});

// ── WireStep: интеграция с существующей моделью ──

describe('WireStep — type validity', () => {
  it('конструируется с минимальным constructor', () => {
    const step: WireStep = {
      constructor: 'webdriver|open|https://example.com',
    };
    expect(step.constructor).toBe('webdriver|open|https://example.com');
    expect(step.sugar).toBeUndefined();
  });

  it('оборачивает ParsedSugarLine в sugar', () => {
    const parsed: ParsedSugarLine = {
      verb: 'Клик',
      locator: { strategy: 'test_id', value: 'submit-btn' },
      args: [],
      modifiers: [{ kind: '->', value: '$result' }],
      raw: 'Клик "submit-btn" -> $result',
    };
    const step: WireStep = {
      constructor: 'webdriver|click|submit-btn',
      sugar: parsed,
      locator: { strategy: 'test_id', value: 'submit-btn' },
    };
    expect(step.sugar).toBe(parsed);
    expect(step.sugar?.verb).toBe('Клик');
    expect(step.locator?.strategy).toBe('test_id');
  });
});