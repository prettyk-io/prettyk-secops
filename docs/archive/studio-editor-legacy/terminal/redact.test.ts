import { describe, it, expect } from 'vitest';
import { redactValue, redactTypedValue, isPlaceholder, SECRET_PLACEHOLDER, VALUE_PLACEHOLDER } from './redact';

describe('redact (CDP-WIRE POC-CDP-5)', () => {
  it('маскирует plaintext в $secret', () => {
    expect(redactValue('hunter2')).toBe(SECRET_PLACEHOLDER);
    expect(redactValue('Bearer tok_123')).toBe(SECRET_PLACEHOLDER);
  });

  it('не трогает уже-placeholder (reference)', () => {
    expect(redactValue('$value')).toBe('$value');
    expect(redactValue('$secret')).toBe('$secret');
  });

  it('пустое/null → пустое', () => {
    expect(redactValue(null)).toBe('');
    expect(redactValue(undefined)).toBe('');
    expect(redactValue('   ')).toBe('');
  });

  it('redactTypedValue всегда даёт reference, никогда plaintext', () => {
    expect(redactTypedValue('mypassword')).toBe(VALUE_PLACEHOLDER);
    expect(redactTypedValue('$secret')).toBe('$secret');
    expect(redactTypedValue('')).toBe(VALUE_PLACEHOLDER);
    expect(redactTypedValue(null)).toBe(VALUE_PLACEHOLDER);
  });

  it('isPlaceholder распознаёт $reference', () => {
    expect(isPlaceholder('$value')).toBe(true);
    expect(isPlaceholder('plain')).toBe(false);
  });
});
