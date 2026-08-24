// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  filterCheckIdsByQuery,
  formatBulkLinkPreview,
  planBulkLink,
} from './bulkLinkChecks';

describe('bulkLinkChecks', () => {
  it('cartesian pairs deduped ids', () => {
    const plan = planBulkLink(['d1', 'd1', ''], ['c1', 'c2']);
    expect(plan.deployIds).toEqual(['d1']);
    expect(plan.checkIds).toEqual(['c1', 'c2']);
    expect(plan.pairs).toHaveLength(2);
    expect(formatBulkLinkPreview(plan)).toBe('2 пар (1×2)');
  });

  it('filters checks by query', () => {
    const ids = filterCheckIdsByQuery(
      [
        { check_id: 'aaa', title: 'Juice login' },
        { check_id: 'bbb', title: 'Other' },
      ],
      'juice',
    );
    expect(ids).toEqual(['aaa']);
  });
});
