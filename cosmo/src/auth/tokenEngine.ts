/**
 * AUTH-PROF B-3: Personal Access Token (PAT) Engine.
 *
 * Выпуск, валидация, отзыв токенов доступа для CI/CD и скриптов.
 * Хранение: localStorage (pk.user.tokens.v1) через профильный стор.
 *
 * Токен-формат: pk_live_<32 hex chars>
 *   Пример: pk_live_9f8a3c4b7d1e2f09a8b7c6d5e4f3a2b1
 *
 * Контракт:
 *   import { createToken, listTokens, revokeToken, validateToken, maskToken } from '@/auth/tokenEngine';
 *   import type { PersonalAccessToken, UserCapability } from '@/auth/profileStore';
 */
import { useUserProfile } from './profileStore';
import type { UserCapability, PersonalAccessToken } from './profileStore';

// ═══════════════════════════════════════════════════════════════════════════
// ID generator
// ═══════════════════════════════════════════════════════════════════════════

let _idCounter = Date.now();

function nextId(): string {
  _idCounter += 1;
  return `pat_${_idCounter.toString(36)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Crypto helpers (zero-dependency hex generation)
// ═══════════════════════════════════════════════════════════════════════════

function randomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i]! % 16];
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Token masking for UI display
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Маскирует токен для безопасного отображения в UI.
 *   pk_live_9f8a3c4b7d1e2f09a8b7c6d5e4f3a2b1 → pk_live_****3a2b1
 */
export function maskToken(raw: string): string {
  if (!raw.startsWith('pk_live_')) return 'pk_live_********';
  const prefix = 'pk_live_';
  const body = raw.slice(prefix.length);
  if (body.length <= 8) return `${prefix}${'*'.repeat(body.length)}`;
  // Show last 5 hex chars, mask the rest
  const suffix = body.slice(-5);
  const masked = '*'.repeat(body.length - 5);
  return `${prefix}${masked}${suffix}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Token creation
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateTokenParams {
  name: string;
  scopes: UserCapability[];
  /**
   * TTL в днях. null = бессрочный токен (не истекает).
   */
  ttlDays: number | null;
}

export interface CreateTokenResult {
  token: string;
  record: PersonalAccessToken;
}

/**
 * Создаёт новый персональный токен доступа.
 *
 * Возвращает raw-токен (показать один раз!) и запись для хранения.
 * Токен автоматически добавляется в локальное хранилище профиля.
 *
 * @example
 *   const { token, record } = createToken('CI Pipeline Token', ['checks:create'], 90);
 *   // token = 'pk_live_9f8a3c4b...' — покажи один раз, больше не покажется
 *   // record → сохранён в localStorage
 */
export function createToken(
  name: string,
  scopes: UserCapability[],
  ttlDays: number | null,
): CreateTokenResult {
  const rawToken = `pk_live_${randomHex(32)}`;
  const now = new Date().toISOString();

  const expiresAt = ttlDays !== null
    ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const record: PersonalAccessToken = {
    id: nextId(),
    name,
    tokenMasked: maskToken(rawToken),
    scopes,
    createdAt: now,
    expiresAt,
    lastUsedAt: null,
  };

  // Persist through profile store
  useUserProfile.getState().addToken(record);

  return { token: rawToken, record };
}

// ═══════════════════════════════════════════════════════════════════════════
// Token listing & management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Возвращает список всех сохранённых токенов.
 */
export function listTokens(): PersonalAccessToken[] {
  return useUserProfile.getState().listTokens();
}

/**
 * Отзывает токен по ID. После отзыва токен перестаёт валидироваться.
 */
export function revokeToken(id: string): void {
  useUserProfile.getState().revokeToken(id);
}

// ═══════════════════════════════════════════════════════════════════════════
// Token validation (for CLI / CI)
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidateResult {
  valid: boolean;
  reason?: string;
  record?: PersonalAccessToken;
}

/**
 * Валидирует raw-токен против локального хранилища.
 *
 * В production-режиме (Enterprise) здесь будет вызов API /api/auth/tokens/validate.
 * В Pure Box — проверка по локальному registry.
 *
 * @returns ValidateResult с причиной ошибки, если токен недействителен.
 */
export function validateToken(rawToken: string): ValidateResult {
  if (!rawToken || typeof rawToken !== 'string') {
    return { valid: false, reason: 'Empty or invalid token format' };
  }

  if (!rawToken.startsWith('pk_live_')) {
    return { valid: false, reason: 'Invalid token prefix — expected pk_live_*' };
  }

  const tokenBody = rawToken.slice('pk_live_'.length);
  if (!/^[0-9a-f]{32}$/.test(tokenBody)) {
    return { valid: false, reason: 'Invalid token body — expected 32 hex characters after pk_live_' };
  }

  // Find matching token in local registry (by masked suffix match)
  const tokens = useUserProfile.getState().listTokens();
  const record = tokens.find((t) => {
    // Compare last 5 chars of raw token with last 5 chars of masked token suffix
    const maskedSuffix = t.tokenMasked.slice(-5);
    return tokenBody.endsWith(maskedSuffix);
  });

  if (!record) {
    return { valid: false, reason: 'Token not found in local registry. It may have been revoked.' };
  }

  // Check expiration
  if (record.expiresAt) {
    const expires = new Date(record.expiresAt);
    if (Date.now() > expires.getTime()) {
      return { valid: false, reason: `Token expired at ${record.expiresAt}` };
    }
  }

  // Mark last used
  const updated: PersonalAccessToken = {
    ...record,
    lastUsedAt: new Date().toISOString(),
  };

  // Update in-place: remove old, add updated
  useUserProfile.getState().revokeToken(record.id);
  useUserProfile.getState().addToken(updated);

  return { valid: true, record: updated };
}