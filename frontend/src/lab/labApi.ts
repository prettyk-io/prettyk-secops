/**
 * API-клиент для станции атак и фаззинга #/lab (Burp Killer).
 */
import { LIVE_BASE } from '../api/apiBase';

export interface LabGrepRule {
  key: string;
  pattern: string;
  is_regex?: boolean;
  case_sensitive?: boolean;
  group?: number;
}

export interface LabIntruderStartPayload {
  attack_id?: string;
  raw_http: string;
  attack_mode: 'sniper' | 'battering_ram' | 'pitchfork' | 'cluster_bomb';
  payload_sets: string[][];
  grep_match_rules?: LabGrepRule[];
  grep_extract_rules?: LabGrepRule[];
  encoders?: string[];
  prefix?: string;
  suffix?: string;
  auto_url_override?: string;
}

export interface LabResultItem {
  id: number;
  payloads: string[];
  position_names: string[];
  url: string;
  method: string;
  status: number;
  length: number;
  elapsed_ms: number;
  grep_matches: Record<string, boolean>;
  grep_extracts: Record<string, string[]>;
  error?: string | null;
}

export interface LabDetailItem extends LabResultItem {
  request_raw: string;
  response_raw: string;
  response_headers: Record<string, string>;
}

export async function startLabIntruder(
  payload: LabIntruderStartPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; attack_id: string; status: string; error?: string }> {
  try {
    const res = await fetchImpl(`${LIVE_BASE}/api/lab/intruder/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, attack_id: payload.attack_id || '', status: 'error', error: `HTTP ${res.status}` };
    }
    return (await res.json()) as { ok: boolean; attack_id: string; status: string };
  } catch (err) {
    return { ok: false, attack_id: payload.attack_id || '', status: 'error', error: String(err) };
  }
}

export async function stopLabIntruder(
  attackId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; attack_id: string; status: string }> {
  try {
    const res = await fetchImpl(`${LIVE_BASE}/api/lab/intruder/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attack_id: attackId }),
    });
    return (await res.json()) as { ok: boolean; attack_id: string; status: string };
  } catch {
    return { ok: false, attack_id: attackId, status: 'error' };
  }
}

export async function fetchLabResults(
  attackId: string,
  offset = 0,
  limit = 200,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  ok: boolean;
  attack_id: string;
  results: LabResultItem[];
  total: number;
  completed: number;
  is_running: boolean;
}> {
  try {
    const res = await fetchImpl(
      `${LIVE_BASE}/api/lab/intruder/results?attack_id=${encodeURIComponent(attackId)}&offset=${offset}&limit=${limit}`,
    );
    if (!res.ok) {
      return { ok: false, attack_id: attackId, results: [], total: 0, completed: 0, is_running: false };
    }
    return (await res.json()) as {
      ok: boolean;
      attack_id: string;
      results: LabResultItem[];
      total: number;
      completed: number;
      is_running: boolean;
    };
  } catch {
    return { ok: false, attack_id: attackId, results: [], total: 0, completed: 0, is_running: false };
  }
}

export async function fetchLabDetail(
  attackId: string,
  id: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; detail?: LabDetailItem; error?: string }> {
  try {
    const res = await fetchImpl(
      `${LIVE_BASE}/api/lab/intruder/detail?attack_id=${encodeURIComponent(attackId)}&id=${id}`,
    );
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return (await res.json()) as { ok: boolean; detail?: LabDetailItem };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
