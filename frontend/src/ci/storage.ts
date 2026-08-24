/**
 * PRETTYK-CI — Durable storage abstraction.
 *
 * Хранилище переживает рестарт стенда. Реализации:
 *   — localStorageStorage (браузер)
 *   — memoryStorage (тесты / node / SSR)
 *
 *   import { createStorage } from '@/ci/storage';
 */
export interface KVStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export function memoryStorage(): KVStorage {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => { map.set(key, value); },
    remove: (key) => { map.delete(key); },
    keys: () => [...map.keys()],
  };
}

export function localStorageStorage(): KVStorage {
  return {
    get: (key) => {
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    set: (key, value) => {
      try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
    },
    remove: (key) => {
      try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    },
    keys: () => {
      try {
        const out: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k) out.push(k);
        }
        return out;
      } catch { return []; }
    },
  };
}

/**
 * Авто-выбор: браузер → localStorage, иначе memory.
 * Позволяет явно инжектить storage для тестов.
 */
export function createStorage(explicit?: KVStorage): KVStorage {
  if (explicit) return explicit;
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorageStorage();
  }
  return memoryStorage();
}
