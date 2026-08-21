import { describe, expect, it } from 'vitest';
import { CONSTRUCTOR_VISIBLE_LINES } from '../monaco/constructorLayout';
import { defaultConstructorText, padConstructorCanvas } from './defaultConstructor';
import { emptyStep } from './studioScenarios';
import { emptyPageBody } from './studioPages';

describe('defaultConstructorText', () => {
  it('даёт ровно 32 пустые строки', () => {
    const text = defaultConstructorText();
    const lines = text.split('\n');
    expect(lines).toHaveLength(CONSTRUCTOR_VISIBLE_LINES);
    expect(CONSTRUCTOR_VISIBLE_LINES).toBe(32);
    expect(lines.every((line) => line === '')).toBe(true);
  });

  it('padConstructorCanvas добивает короткие конструкторы до 32', () => {
    const padded = padConstructorCanvas('Лог "x"');
    expect(padded.split('\n')).toHaveLength(32);
    expect(padded.startsWith('Лог "x"')).toBe(true);
  });

  it('padConstructorCanvas срезает пустой хвост сверх 32', () => {
    const long = Array.from({ length: 40 }, (_, i) => (i === 0 ? 'Лог "a"' : '')).join('\n');
    expect(padConstructorCanvas(long).split('\n')).toHaveLength(32);
  });

  it('padConstructorCanvas не режет контент длиннее 32', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Лог "${i}"`).join('\n');
    expect(padConstructorCanvas(long).split('\n')).toHaveLength(40);
  });

  it('padConstructorCanvas после 32 строк контента оставляет одну пустую', () => {
    const filled = Array.from({ length: 32 }, (_, i) => `Лог "${i}"`).join('\n') + '\n\n\n';
    expect(padConstructorCanvas(filled).split('\n')).toHaveLength(33);
  });

  it('шаг и модель получают тот же дефолт', () => {
    expect(String(emptyStep().constructor).split('\n')).toHaveLength(CONSTRUCTOR_VISIBLE_LINES);
    expect(String(emptyPageBody('login', 'login').constructor).split('\n')).toHaveLength(
      CONSTRUCTOR_VISIBLE_LINES,
    );
    expect(String(emptyPageBody('login', 'login').constructor).includes('@')).toBe(false);
  });
});
