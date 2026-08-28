/**
 * Lab opt-in: дополнить цели ФаззингВолны параметрами из журнала трафика scanner.
 * Зеркало env KDT_TRAFFIC_INSERTION_FEED (не поле манифеста).
 */

export const TRAFFIC_INSERTION_FEED_ENV = 'KDT_TRAFFIC_INSERTION_FEED';
export const TRAFFIC_INSERTION_FEED_STORAGE_KEY = 'pk.lab.trafficInsertionFeed';

export function readTrafficInsertionFeedOptIn(
  storage: Pick<Storage, 'getItem'> | null | undefined = globalThis.localStorage,
): boolean {
  try {
    return storage?.getItem(TRAFFIC_INSERTION_FEED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeTrafficInsertionFeedOptIn(
  on: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined = globalThis.localStorage,
): void {
  try {
    if (!storage) return;
    if (on) {
      storage.setItem(TRAFFIC_INSERTION_FEED_STORAGE_KEY, '1');
    } else {
      storage.removeItem(TRAFFIC_INSERTION_FEED_STORAGE_KEY);
    }
  } catch {
    /* private mode / blocked storage */
  }
}

/** Allowlisted env patch for playground /api/run/start (no SoT fields). */
export function trafficInsertionFeedEnvPatch(
  on: boolean = readTrafficInsertionFeedOptIn(),
): Record<string, string> | undefined {
  if (!on) return undefined;
  return { [TRAFFIC_INSERTION_FEED_ENV]: '1' };
}
