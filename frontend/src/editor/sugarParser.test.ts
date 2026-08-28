/**
 * DSL-L2: тесты Sugar парсера.
 *
 * 10+ тестов: каждый глагол, каждый модификатор, round-trip, edge cases.
 */
import { describe, it, expect } from 'vitest';
import { parseSugarLine, formatSugarLine } from './sugarParser';

// ── Базовый парсинг ──

describe('parseSugarLine — базовые глаголы', () => {
  it('Клик Войти → role=text, без аргументов', () => {
    const r = parseSugarLine('Клик Войти');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Клик');
    expect(r!.locator.strategy).toBe('text');
    expect(r!.locator.value).toBe('Войти');
    expect(r!.args).toEqual([]);
    expect(r!.modifiers).toEqual([]);
    expect(r!.raw).toBe('Клик Войти');
  });

  it('Вставить Пароль $secret! → verb+locator+arg', () => {
    const r = parseSugarLine('Вставить Пароль $secret!');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Вставить');
    expect(r!.locator.strategy).toBe('text');
    expect(r!.locator.value).toBe('Пароль');
    expect(r!.args).toEqual(['$secret!']);
  });

  it('Ждать 5 → verb без локатора', () => {
    const r = parseSugarLine('Ждать 5');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Ждать');
    expect(r!.locator.value).toBe(''); // без локатора
    expect(r!.args).toEqual(['5']);
  });

  it('Скрин → verb без локатора и аргументов', () => {
    const r = parseSugarLine('Скрин');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Скрин');
    expect(r!.locator.value).toBe('');
    expect(r!.args).toEqual([]);
  });

  it('Текст Заголовок "О нас" → locator+args', () => {
    const r = parseSugarLine('Текст Заголовок "О нас"');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Текст');
    expect(r!.locator.value).toBe('Заголовок');
    expect(r!.args).toEqual(['О нас']);
  });

  it('Значение Поле → locator, без args', () => {
    const r = parseSugarLine('Значение Поле');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Значение');
    expect(r!.locator.value).toBe('Поле');
  });

  it('Атрибут Элемент href → locator+arg', () => {
    const r = parseSugarLine('Атрибут Элемент href');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Атрибут');
    expect(r!.locator.value).toBe('Элемент');
    expect(r!.args).toEqual(['href']);
  });

  it('Дописать Поле " extra" → locator+arg', () => {
    const r = parseSugarLine('Дописать Поле " extra"');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Дописать');
    expect(r!.locator.value).toBe('Поле');
    expect(r!.args).toEqual([' extra']);
  });

  it('Очистить Поле → locator', () => {
    const r = parseSugarLine('Очистить Поле');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Очистить');
    expect(r!.locator.value).toBe('Поле');
  });

  it('Выбрать Список "Значение" → locator+arg', () => {
    const r = parseSugarLine('Выбрать Список "Значение"');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Выбрать');
    expect(r!.locator.value).toBe('Список');
    expect(r!.args).toEqual(['Значение']);
  });
});

// ── Модификаторы ──

describe('parseSugarLine — модификаторы', () => {
  it('>? делает шаг опциональным', () => {
    const r = parseSugarLine('Клик Войти >?');
    expect(r).not.toBeNull();
    expect(r!.modifiers).toEqual([{ kind: '>?' }]);
  });

  it('-> $var сохраняет результат', () => {
    const r = parseSugarLine('Клик Войти -> $result');
    expect(r).not.toBeNull();
    expect(r!.modifiers).toEqual([{ kind: '->', value: '$result' }]);
  });

  it('># подсказка оператору', () => {
    const r = parseSugarLine('Клик Войти ># кнопка логина');
    expect(r).not.toBeNull();
    expect(r!.modifiers).toEqual([{ kind: '>#', value: 'кнопка логина' }]);
  });

  it('комбинация всех трёх модификаторов', () => {
    const r = parseSugarLine('Вставить Пароль $secret! >? -> $pw ># поле пароля');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Вставить');
    expect(r!.locator.value).toBe('Пароль');
    expect(r!.args).toEqual(['$secret!']);
    expect(r!.modifiers).toEqual([
      { kind: '>?' },
      { kind: '->', value: '$pw' },
      { kind: '>#', value: 'поле пароля' }]);
  });

  it('># подсказка с пробелами', () => {
    const r = parseSugarLine('Клик Войти ># основная кнопка входа в систему');
    expect(r).not.toBeNull();
    expect(r!.modifiers).toEqual([{ kind: '>#', value: 'основная кнопка входа в систему' }]);
  });
});

// ── Locator-стратегии ──

describe('parseSugarLine — стратегии локаторов', () => {
  it('#id → test_id', () => {
    const r = parseSugarLine('Клик #submit-btn');
    expect(r).not.toBeNull();
    expect(r!.locator.strategy).toBe('test_id');
    expect(r!.locator.value).toBe('submit-btn');
  });

  it('.class → css', () => {
    const r = parseSugarLine('Клик .btn-primary');
    expect(r).not.toBeNull();
    expect(r!.locator.strategy).toBe('css');
    expect(r!.locator.value).toBe('.btn-primary');
  });

  it('role:кнопка → явный role', () => {
    const r = parseSugarLine('Клик role:button');
    expect(r).not.toBeNull();
    expect(r!.locator.strategy).toBe('role');
    expect(r!.locator.value).toBe('button');
  });

  it('//xpath → xpath', () => {
    const r = parseSugarLine('Клик //button[@id="submit"]');
    expect(r).not.toBeNull();
    expect(r!.locator.strategy).toBe('xpath');
    expect(r!.locator.value).toBe('//button[@id="submit"]');
  });

  it('по умолчанию → text', () => {
    const r = parseSugarLine('Клик Войти');
    expect(r).not.toBeNull();
    expect(r!.locator.strategy).toBe('text');
  });
});

// ── Round-trip ──

describe('formatSugarLine — round-trip', () => {
  it('простой случай: Клик Войти', () => {
    const r = parseSugarLine('Клик Войти');
    expect(formatSugarLine(r!)).toBe('Клик Войти');
  });

  it('с модификатором: Клик Войти >?', () => {
    const r = parseSugarLine('Клик Войти >?');
    expect(formatSugarLine(r!)).toBe('Клик Войти >?');
  });

  it('Ждать 5 — без локатора', () => {
    const r = parseSugarLine('Ждать 5');
    expect(formatSugarLine(r!)).toBe('Ждать 5');
  });

  it('Скрин — один глагол', () => {
    const r = parseSugarLine('Скрин');
    expect(formatSugarLine(r!)).toBe('Скрин');
  });

  it('с -> модификатором', () => {
    const r = parseSugarLine('Клик Войти -> $token');
    expect(formatSugarLine(r!)).toBe('Клик Войти -> $token');
  });

  it('с ># подсказкой', () => {
    const r = parseSugarLine('Клик Войти ># главная кнопка');
    expect(formatSugarLine(r!)).toBe('Клик Войти ># главная кнопка');
  });

  it('с комбинацией: все три модификатора', () => {
    const r = parseSugarLine('Вставить Имя qwerty >? -> $user ># поле ввода');
    expect(formatSugarLine(r!)).toBe('Вставить Имя qwerty >? -> $user ># поле ввода');
  });
});

// ── Edge casses ──

describe('parseSugarLine — edge casses', () => {
  it('пустая строка → ull', () => {
    expect(parseSugarLine('')).toBeNull();
    expect(parseSugarLine('   ')).toBeNull();
  });

  it('неизвестный глагол → null', () => {
    expect(parseSugarLine('Летать высоко')).toBeNull();
  });

  it('глагол без обязательного локатора → null', () => {
    // Клик требует локатор, но здесь его нет
    expect(parseSugarLine('Клик')).toBeNull();
  });

  it('игнорирует лишние пробелы', () => {
    const r = parseSugarLine('  Клик   Войти  >?  ');
    expect(r).not.toBeNull();
    expect(r!.verb).toBe('Клик');
    expect(r!.locator.value).toBe('Войти');
    expect(r!.modifiers).toEqual([{ kind: '>?' }]);
  });
});