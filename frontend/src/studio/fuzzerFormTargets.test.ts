import { describe, expect, it } from 'vitest';
import {
  addFuzzerTargetRow,
  applyPasteTargetsText,
  removeFuzzerTargetRow,
  updateFuzzerTargetRow,
} from './fuzzerFormTargets';
import { emptyFuzzTarget } from './studioFuzzers';

describe('fuzzerFormTargets', () => {
  it('updates / adds / removes target rows', () => {
    const base = [emptyFuzzTarget()];
    const updated = updateFuzzerTargetRow(base, 0, 'url', 'http://x');
    expect(updated[0]?.url).toBe('http://x');
    const added = addFuzzerTargetRow(updated);
    expect(added).toHaveLength(2);
    expect(removeFuzzerTargetRow(added, 0)).toHaveLength(1);
    expect(removeFuzzerTargetRow(base, 0)).toBeUndefined();
  });

  it('applies paste text or returns error', () => {
    const bad = applyPasteTargetsText('');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.length).toBeGreaterThan(0);
    }
  });
});
