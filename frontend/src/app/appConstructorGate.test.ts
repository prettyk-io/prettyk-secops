import { describe, expect, it } from 'vitest';
import { mergeConstructorFails } from './appConstructorGate';
import type { ConstructorBatchFail } from '../api/editorValidate';

const fail = (id: string): ConstructorBatchFail => ({
  id,
  path: id,
  objectId: id,
  message: 'x',
});

describe('appConstructorGate', () => {
  it('mergeConstructorFails prefers backend and appends unique client', () => {
    expect(mergeConstructorFails(null, [fail('a')])).toEqual([fail('a')]);
    expect(mergeConstructorFails([fail('a')], [fail('a'), fail('b')])).toEqual([
      fail('a'),
      fail('b'),
    ]);
  });
});
