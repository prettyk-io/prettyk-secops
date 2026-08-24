/**
 * SPIKE-B-2: Better Auth Client — фронтовый клиент для Vite.
 *
 * Соединяется с auth-сервером на localhost:3001 (проксируется Vite).
 * Замена прямого localStorage auth.ts на серверную сессию.
 *
 *   import { authClient, getSession, signIn, signOut } from '@/auth/clientAuth';
 */
import { createAuthClient } from 'better-auth/client';
import { apiKeyClient } from '@better-auth/api-key/client';

export const authClient = createAuthClient({
  baseURL: 'http://localhost:5173', // Vite dev server — проксирует /api/auth → :3001
  plugins: [apiKeyClient()],
});

// ═══════════════════════════════════════════════════════════════════════════
// Convenience wrappers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Получить текущую сессию (user + session из кук).
 * Возвращает null если нет активной сессии.
 */
export async function getSession() {
  const { data, error } = await authClient.getSession();
  if (error || !data) return null;
  return data;
}

/**
 * Войти по email + паролю.
 */
export async function signIn(email: string, password: string) {
  const { data, error } = await authClient.signIn.email({
    email,
    password,
  });
  if (error) throw new Error(error.message ?? 'Sign-in failed');
  return data;
}

/**
 * Выйти (инвалидирует серверную сессию).
 */
export async function signOut() {
  await authClient.signOut();
}

/**
 * Зарегистрировать нового пользователя.
 */
export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await authClient.signUp.email({
    email,
    password,
    name,
  });
  if (error) throw new Error(error.message ?? 'Sign-up failed');
  return data;
}