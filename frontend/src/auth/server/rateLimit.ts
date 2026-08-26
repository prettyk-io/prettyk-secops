/**
 * AUTH-PROD-4: Rate limiting middleware для auth-сервера.
 *
 * Простейший in-memory лимитер (sliding window).
 * Без внешних зависимостей (нет Redis/express-rate-limit).
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const state = new Map<string, RateLimitEntry>();

const DEFAULTS = {
  windowMs: 60_000,   // 1 минута
  max: 20,             // макс запросов за окно
};

/** Очистка протухших записей каждые 5 минут */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of state) {
    if (entry.resetAt <= now) state.delete(key);
  }
}, 5 * 60_000).unref();

/**
 * Проверить лимит для ключа. Возвращает true если запрос разрешён.
 * Ключ — обычно IP или `IP:endpoint`.
 */
export function checkRateLimit(
  key: string,
  opts?: { windowMs?: number; max?: number },
): { allowed: boolean; remaining: number; resetAt: number } {
  const windowMs = opts?.windowMs ?? DEFAULTS.windowMs;
  const max = opts?.max ?? DEFAULTS.max;
  const now = Date.now();

  let entry = state.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + windowMs };
    state.set(key, entry);
    return { allowed: true, remaining: max - 1, resetAt: entry.resetAt };
  }

  entry.count++;
  const remaining = Math.max(0, max - entry.count);
  return { allowed: entry.count <= max, remaining, resetAt: entry.resetAt };
}

/** Получить чистый IP из запроса (учитывает X-Forwarded-For). */
export function clientIp(req: { headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const raw = Array.isArray(forwarded) ? String(forwarded[0]) : String(forwarded);
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}