import { describe, it, expect } from 'vitest';
import { findSecretLines } from './secretBadgeDecorations';

describe('PK-EC-10: secretBadgeDecorations', () => {
  it('finds secret lines with valid variable names', () => {
    const text = [
      '// Normal comment',
      'Секрет $token = "secret123";',
      'Задержка 500;',
      '  Секрет $apiKey = "pk_live_12345";',
      'Текст $foo = "bar";',
    ].join('\n');

    const result = findSecretLines(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ line: 2, name: 'token' });
    expect(result[1]).toEqual({ line: 4, name: 'apiKey' });
  });

  it('returns empty array when no secrets are present', () => {
    const text = 'Компонент Login\nДействие Click\nЗадержка 100';
    expect(findSecretLines(text)).toEqual([]);
  });

  it('handles inline semicolon separation and brackets', () => {
    const text = '{ Секрет $dbPass = "pass"; }';
    const result = findSecretLines(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ line: 1, name: 'dbPass' });
  });
});
