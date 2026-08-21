import { describe, expect, it } from 'vitest';
import { editorViewHeaderTitle, validationButtonHint } from './appValidationChrome';

describe('appValidationChrome', () => {
  it('hints and titles', () => {
    expect(validationButtonHint('pass')).toContain('пройдена');
    expect(validationButtonHint('fail')).toContain('ошибки');
    expect(editorViewHeaderTitle('form')).toBe('Конфигурации и регламент проверки');
    expect(editorViewHeaderTitle('studio')).toBeNull();
    expect(editorViewHeaderTitle('results')).toBe('Результаты проверки');
  });
});
