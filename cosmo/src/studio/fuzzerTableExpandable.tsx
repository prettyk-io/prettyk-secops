/**
 * Fuzzer targets table expandable config (S6478 — outside FuzzerForm).
 */
import type { FuzzTargetFields } from './studioFuzzers';
import { FuzzerTargetBodyExpand } from './fuzzerTargetBodyExpand';

export function fuzzerTargetsExpandable(onBody: (idx: number, next: string) => void) {
  return {
    expandedRowRender: (record: FuzzTargetFields, idx: number) => (
      <FuzzerTargetBodyExpand record={record} idx={idx} onBody={onBody} />
    ),
    rowExpandable: (record: FuzzTargetFields) => record.method !== 'GET',
  };
}
