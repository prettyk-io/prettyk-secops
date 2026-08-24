import { describe, expect, it } from 'vitest';
import { collectPageIds } from './pages';

describe('collectPageIds', () => {
  it('собирает ключи pages', () => {
    expect(
      collectPageIds({
        test_suites: { pages: { login: {}, home: {} } },
      }),
    ).toEqual(['login', 'home']);
  });

  it('пустой ввод', () => {
    expect(collectPageIds(null)).toEqual([]);
    expect(collectPageIds({})).toEqual([]);
  });
});
