/**
 * PK-WB-S1 — Draft Persistence Service.
 *
 * Серверное сохранение черновика с дебаунсом, защитой от дублирования
 * по contentHash и восстановлением при перезагрузке страницы.
 *
 * Не заменяет checksStore (тот остаётся SoT для реестра и runs).
 * Работает как кеш-слой между компонентами и сервером для быстрых сохранений,
 * не генерируя лишних updated_at-биений в реестре каждые 400ms.
 */

import { API_BASE } from '../api/apiBase';
import type { ResourceContentsMap } from '../studio/resourceContents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftMetadata {
  checkId: string;
  contentHash: string;
  savedAt: number; // Date.now()
  surface?: 'studio' | 'editor' | 'form';
  /** Server-assigned revision number (set after successful PUT). */
  revision?: number;
}

export interface DraftPayload {
  wired: unknown;
  resource_contents: Record<string, string>;
  meta: DraftMetadata;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Максимальный интервал между сохранениями (даже если продолжаются правки). */
export const DRAFT_FLUSH_MAX_MS = 30_000;

/** Стандартный дебаунс автосохранения. */
export const DRAFT_SAVE_DEBOUNCE_MS = 500;

/** Idle-дебаунс после последнего изменения перед сохранением. */
export const DRAFT_IDLE_DEBOUNCE_MS = 1500;

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

export function computeDraftHash(
  wired: unknown,
  resources: Record<string, string>,
): string {
  const payload = JSON.stringify({ wired, resources });
  // Simple djb2 hash for dedup — not a security hash
  let hash = 5381;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) + hash + payload.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

function draftUrl(checkId: string): string {
  return `${API_BASE}/api/checks/${encodeURIComponent(checkId)}/draft`;
}

// ---------------------------------------------------------------------------
// Service state
// ---------------------------------------------------------------------------

const lastSavedHash = new Map<string, string>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

let draftEnabled = true;

export function disableDraftPersistenceForTests(): void {
  draftEnabled = false;
  lastSavedHash.clear();
  for (const t of pendingTimers.values()) clearTimeout(t);
  for (const t of flushTimers.values()) clearTimeout(t);
  pendingTimers.clear();
  flushTimers.clear();
}

export function enableDraftPersistenceForTests(): void {
  draftEnabled = true;
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * PUT draft to server.
 * Не кидает — все ошибки проглатывает (сервер может быть офлайн).
 */
export async function pushDraft(checkId: string, payload: DraftPayload): Promise<boolean> {
  if (!draftEnabled) return false;
  try {
    const res = await fetch(draftUrl(checkId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // keepalive чтобы доходило при закрытии вкладки (где поддерживается)
      keepalive: true,
    });
    if (res.ok) {
      lastSavedHash.set(checkId, payload.meta.contentHash);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * GET draft from server.
 * Возвращает null если черновика нет или сервер недоступен.
 */
export async function fetchDraft(checkId: string): Promise<DraftPayload | null> {
  try {
    const res = await fetch(`${draftUrl(checkId)}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const payload = (await res.json().catch(() => null)) as DraftPayload | null;
    if (!payload || !payload.meta?.checkId) return null;
    if (payload.meta.checkId !== checkId) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * DELETE draft on server.
 */
export async function clearDraft(checkId: string): Promise<boolean> {
  try {
    lastSavedHash.delete(checkId);
    const res = await fetch(draftUrl(checkId), { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Debounced save
// ---------------------------------------------------------------------------

/**
 * Запланировать сохранение черновика с дебаунсом.
 * Вызывается при каждом изменении formData.
 * Не делает save если хеш не изменился с последнего сохранения.
 */
export function scheduleDraftSave(
  checkId: string,
  wired: unknown,
  resources: Record<string, string>,
  surface?: 'studio' | 'editor' | 'form',
): void {
  if (!draftEnabled || !checkId) return;

  const currentHash = computeDraftHash(wired, resources);
  const previousHash = lastSavedHash.get(checkId);

  if (currentHash === previousHash) return;

  // Clear existing debounce timer
  const existing = pendingTimers.get(checkId);
  if (existing) clearTimeout(existing);

  // Schedule new debounce
  const payload: DraftPayload = {
    wired,
    resource_contents: resources,
    meta: {
      checkId,
      contentHash: currentHash,
      savedAt: Date.now(),
      surface: surface ?? 'editor',
    },
  };

  pendingTimers.set(
    checkId,
    setTimeout(() => {
      pendingTimers.delete(checkId);
      void pushDraft(checkId, payload);
    }, DRAFT_SAVE_DEBOUNCE_MS),
  );

  // Ensure flush within max interval even with constant edits
  const existingFlush = flushTimers.get(checkId);
  if (existingFlush) clearTimeout(existingFlush);
  flushTimers.set(
    checkId,
    setTimeout(() => {
      flushTimers.delete(checkId);
      // Force flush regardless of debounce
      const pending = pendingTimers.get(checkId);
      if (pending) {
        clearTimeout(pending);
        pendingTimers.delete(checkId);
      }
      void pushDraft(checkId, payload);
    }, DRAFT_FLUSH_MAX_MS),
  );
}

/**
 * Немедленно сбросить все pending таймеры и сохранить текущее состояние.
 * Используется при Ctrl+S и закрытии чека.
 */
export async function flushDraft(
  checkId: string,
  wired: unknown,
  resources: Record<string, string>,
  surface?: 'studio' | 'editor' | 'form',
): Promise<boolean> {
  const pending = pendingTimers.get(checkId);
  if (pending) {
    clearTimeout(pending);
    pendingTimers.delete(checkId);
  }
  const flush = flushTimers.get(checkId);
  if (flush) {
    clearTimeout(flush);
    flushTimers.delete(checkId);
  }

  const payload: DraftPayload = {
    wired,
    resource_contents: resources,
    meta: {
      checkId,
      contentHash: computeDraftHash(wired, resources),
      savedAt: Date.now(),
      surface,
    },
  };
  return pushDraft(checkId, payload);
}

// ---------------------------------------------------------------------------
// Dirty guard
// ---------------------------------------------------------------------------

/**
 * Проверить, есть ли несохранённые изменения с последнего flush/save.
 */
export function isDraftDirty(
  checkId: string,
  wired: unknown,
  resources: Record<string, string>,
): boolean {
  const currentHash = computeDraftHash(wired, resources);
  const savedHash = lastSavedHash.get(checkId);
  return currentHash !== savedHash;
}

/**
 * Сбросить трекинг dirty (например, после сохранения через checksStore).
 */
export function markDraftClean(checkId: string, wired: unknown, resources: Record<string, string>): void {
  lastSavedHash.set(checkId, computeDraftHash(wired, resources));
}

// ---------------------------------------------------------------------------
// Reload restore
// ---------------------------------------------------------------------------

export interface RestoreDraftOutcome {
  /** Черновик для восстановления (новее локального состояния), иначе null. */
  draft: DraftPayload | null;
  /**
   * DRAFT-CONFLICT-TRUTH: серверный revision черновика (meta.revision) —
   * нужен для optimistic concurrency даже когда черновик не новее локального
   * (иначе свежая сессия стартует с expected=0 и вечно ловит 409).
   */
  revision: number | null;
}

/**
 * При загрузке страницы: попытаться восстановить черновик с сервера.
 * Если черновик новее локального состояния — вернуть его.
 * Revision отдаётся всегда, когда черновик существует.
 */
export async function restoreDraftIfNewer(
  checkId: string,
  localUpdatedAt: string,
): Promise<RestoreDraftOutcome> {
  const draft = await fetchDraft(checkId);
  if (!draft) return { draft: null, revision: null };

  const revision =
    typeof draft.meta?.revision === 'number' ? draft.meta.revision : null;

  // Если черновик сохранён после последнего обновления чека — восстанавливаем
  const draftTs = new Date(draft.meta.savedAt).getTime();
  const localTs = new Date(localUpdatedAt).getTime();

  if (draftTs > localTs) {
    lastSavedHash.set(checkId, draft.meta.contentHash);
    return { draft, revision };
  }

  // Черновик не новее — игнорируем, но хеш запоминаем для dirty-guard
  lastSavedHash.set(checkId, draft.meta.contentHash);
  return { draft: null, revision };
}