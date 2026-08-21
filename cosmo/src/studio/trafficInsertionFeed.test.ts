import { describe, expect, it } from 'vitest';
import {
  TRAFFIC_INSERTION_FEED_ENV,
  TRAFFIC_INSERTION_FEED_STORAGE_KEY,
  readTrafficInsertionFeedOptIn,
  trafficInsertionFeedEnvPatch,
  writeTrafficInsertionFeedOptIn,
} from './trafficInsertionFeed';

function memStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe('trafficInsertionFeed', () => {
  it('defaults off and builds env only when opted in', () => {
    const s = memStorage();
    expect(readTrafficInsertionFeedOptIn(s)).toBe(false);
    expect(trafficInsertionFeedEnvPatch(false)).toBeUndefined();
    writeTrafficInsertionFeedOptIn(true, s);
    expect(s.getItem(TRAFFIC_INSERTION_FEED_STORAGE_KEY)).toBe('1');
    expect(readTrafficInsertionFeedOptIn(s)).toBe(true);
    expect(trafficInsertionFeedEnvPatch(true)).toEqual({
      [TRAFFIC_INSERTION_FEED_ENV]: '1',
    });
    writeTrafficInsertionFeedOptIn(false, s);
    expect(readTrafficInsertionFeedOptIn(s)).toBe(false);
  });
});
