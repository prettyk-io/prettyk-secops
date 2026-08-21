import { describe, expect, it } from 'vitest';
import { countsSourceLabel, dualAxisChrome } from './dualAxisChrome';

describe('dualAxisChrome', () => {
  it('labels fail_gate with dojo findings source', () => {
    const chrome = dualAxisChrome({
      verdict: 'fail_gate',
      exitCode: 2,
      gate: 'fail',
      countsSource: 'dojo_findings',
    });
    expect(chrome.execution).toContain('завершено');
    expect(chrome.admission).toContain('не пройден');
    expect(chrome.countsSource).toBe('Dojo ACTIVE (findings)');
  });

  it('marks fail_run as execution fault without admission claim', () => {
    const chrome = dualAxisChrome({
      verdict: 'fail_run',
      exitCode: 1,
      countsSource: 'zap',
    });
    expect(chrome.execution).toContain('сбой');
    expect(chrome.admission).toContain('недействителен');
    expect(countsSourceLabel('dojo_stats')).toBe('Dojo ACTIVE (stats)');
  });

  it('debug_mode voids admission with explicit label', () => {
    const chrome = dualAxisChrome({
      verdict: 'pass',
      exitCode: 0,
      gate: 'void',
      admissionVoid: true,
      debugMode: true,
    });
    expect(chrome.admission).toBe('Допуск: недействителен (режим отладки)');
    expect(chrome.execution).toBe('Исполнение: завершено');
  });

  it('fail_run + gate=fail still voids admission (partial High must not claim)', () => {
    const chrome = dualAxisChrome({
      verdict: 'fail_run',
      exitCode: 1,
      gate: 'fail',
      countsSource: 'dojo_stats',
    });
    expect(chrome.admission).toContain('недействителен');
    expect(chrome.admission).not.toContain('не пройден');
  });

  it('webdriver kind labels Selenium on execution axis', () => {
    const chrome = dualAxisChrome({
      verdict: 'fail_run',
      exitCode: 1,
      gate: 'void',
      executionFaultKind: 'webdriver',
    });
    expect(chrome.execution).toContain('WebDriver/Selenium');
    expect(chrome.admission).toContain('недействителен');
  });
});
