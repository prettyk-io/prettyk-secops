/**
 * FE → playground lab run stop (kill main.py). RES-L.
 */

import { RUN_STOP_URL } from '../api/apiBase';

export type StopRunResult =
  | { ok: true; run_id: string }
  | { ok: false; error: string; idle?: boolean; unreachable?: boolean };

export async function postRunStop(): Promise<StopRunResult> {
  try {
    const res = await fetch(RUN_STOP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      run_id?: string;
    };
    if (res.status === 409) {
      return {
        ok: false,
        error: payload.error || 'Запуск не идёт',
        idle: true,
      };
    }
    if (!res.ok || payload.ok === false) {
      return { ok: false, error: payload.error || `HTTP ${String(res.status)}` };
    }
    return { ok: true, run_id: String(payload.run_id || '') };
  } catch {
    return {
      ok: false,
      error: 'Playground :8765 недоступен',
      unreachable: true,
    };
  }
}
