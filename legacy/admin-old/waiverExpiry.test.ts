// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { classifyWaiverExpiry, summarizeWaiversExpiry } from './waiverExpiry';

describe('waiverExpiry', () => {
  const now = Date.parse('2026-08-12T12:00:00Z');

  it('classifies expired / soon / ok / none', () => {
    expect(
      classifyWaiverExpiry({ title: 'a', expires_at: '2026-08-01T00:00:00Z' }, now).kind,
    ).toBe('expired');
    expect(
      classifyWaiverExpiry({ title: 'b', expires_at: '2026-08-20T00:00:00Z' }, now).kind,
    ).toBe('soon');
    expect(
      classifyWaiverExpiry({ title: 'c', expires_at: '2026-12-01T00:00:00Z' }, now).kind,
    ).toBe('ok');
    expect(classifyWaiverExpiry({ title: 'd' }, now).kind).toBe('none');
  });

  it('summarizes lists', () => {
    const s = summarizeWaiversExpiry(
      [
        { title: 'old', expires_at: '2026-01-01T00:00:00Z' },
        { title: 'near', expires_at: '2026-08-15T00:00:00Z' },
      ],
      now,
    );
    expect(s.expired).toHaveLength(1);
    expect(s.soon).toHaveLength(1);
  });
});
