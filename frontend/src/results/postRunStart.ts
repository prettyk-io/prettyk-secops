/**
 * FE → playground lab run (spawn main.py). RES-L.
 */
import { RUN_START_URL } from '../api/apiBase';
import { liveCallerHeaders } from '../admin/liveFetchHeaders';
import { clampFormDataForRoleCaps } from '../utils/applyRoleCaps';
import { exportWiredPayload } from '../utils/exportWired';
import { capsForUser, readSession } from '../shell/auth';
import { currentUserId } from '../shell/persAuth';
import { trafficInsertionFeedEnvPatch } from '../studio/trafficInsertionFeed';

export type StartRunResult =
  | { ok: true; run_id: string; pid: number; monitor_token?: string }
  | { ok: false; error: string; alreadyRunning?: boolean; unreachable?: boolean };

export async function postRunStart(
  formData: unknown,
  sessionName?: string,
  resourceContents?: Record<string, string>,
  chainBindings?: Record<string, string>,
  checkId?: string,
): Promise<StartRunResult> {
  // Роль: expert не протащит URL/debug/webswing в playground даже через Studio.
  const sealed = clampFormDataForRoleCaps(formData, capsForUser(readSession()));
  const wired = exportWiredPayload(sealed, 'runtime');
  const body: Record<string, unknown> = { wired };
  if (sessionName?.trim()) {
    body.session_name = sessionName.trim();
  }
  if (checkId?.trim()) {
    body.check_id = checkId.trim();
  }
  if (resourceContents && Object.keys(resourceContents).length > 0) {
    body.resource_contents = resourceContents;
  }
  if (chainBindings && Object.keys(chainBindings).length > 0) {
    body.chain_bindings = chainBindings;
  }
  const owner = currentUserId();
  if (owner) {
    body.owner_user_id = owner;
  }
  const envPatch = trafficInsertionFeedEnvPatch();
  if (envPatch) {
    body.env = envPatch;
  }
  try {
    const res = await fetch(RUN_START_URL, {
      method: 'POST',
      headers: liveCallerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      run_id?: string;
      pid?: number;
      monitor_token?: string;
    };
    if (res.status === 409) {
      return {
        ok: false,
        error: payload.error || 'Запуск уже идёт',
        alreadyRunning: true,
      };
    }
    if (!res.ok || payload.ok === false) {
      return { ok: false, error: payload.error || `HTTP ${String(res.status)}` };
    }
    return {
      ok: true,
      run_id: String(payload.run_id || ''),
      pid: Number(payload.pid || 0),
      monitor_token:
        typeof payload.monitor_token === 'string' && payload.monitor_token
          ? payload.monitor_token
          : undefined,
    };
  } catch {
    return {
      ok: false,
      error: 'Playground :8765 недоступен',
      unreachable: true,
    };
  }
}
