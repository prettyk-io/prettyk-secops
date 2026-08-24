import { describe, expect, it } from 'vitest';
import { normalizeLiveEvidenceItem } from './syncEvidenceFromLive';

describe('syncEvidenceFromLive', () => {
  it('normalizes Live evidence row', () => {
    const refs = normalizeLiveEvidenceItem({
      check_id: 'run_demo',
      source: 'finalize',
      allure: { allure_project_id: 'default', report_url: 'http://127.0.0.1:5050/' },
    });
    expect(refs?.check_id).toBe('run_demo');
    expect(refs?.source).toBe('finalize');
    expect(refs?.allure?.allure_project_id).toBe('default');
  });

  it('rejects rows without check_id', () => {
    expect(normalizeLiveEvidenceItem({ source: 'manual' })).toBeNull();
  });
});
