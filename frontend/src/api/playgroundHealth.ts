/**
 * Health playground (:8765 через Vite /api) — индикатор в шапке, без рестарта стенда.
 */

export type PlaygroundHealth = 'up' | 'down' | 'unknown';

export async function fetchPlaygroundHealth(
  fetchImpl: typeof fetch = fetch,
): Promise<PlaygroundHealth> {
  try {
    const response = await fetchImpl('/api/health', { method: 'GET' });
    if (!response.ok) {
      return 'down';
    }
    const payload = (await response.json()) as { ok?: boolean };
    return payload.ok === true ? 'up' : 'down';
  } catch {
    return 'down';
  }
}
