/**
 * Legacy module_type=Фаззер → fuzzers[] row (S3776).
 */
import type { FuzzerMethod } from './studioFuzzers';

type AsRecord = (value: unknown) => Record<string, unknown> | undefined | null;

function str(rec: Record<string, unknown>, key: string): string {
  const value = rec[key];
  return typeof value === 'string' ? value : '';
}

function bool(rec: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = rec[key];
  return typeof value === 'boolean' ? value : fallback;
}

function num(rec: Record<string, unknown>, key: string, fallback: number): number {
  const value = rec[key];
  return typeof value === 'number' ? value : fallback;
}

type LegacyBits = {
  url: string;
  q: string;
  corpus: string;
  method: FuzzerMethod;
  headers: Record<string, unknown>;
  followRedirects: boolean;
  maxRequests: number;
  rps: number;
  alertOnServerError: boolean;
  latencyMultiplier: number;
};

function readLegacyBits(mod: Record<string, unknown>, asRecord: AsRecord): LegacyBits | undefined {
  const fields = asRecord(mod.fuzzing_fields) ?? {};
  const request = asRecord(fields.request) ?? {};
  const injection = asRecord(fields.injection) ?? {};
  const limits = asRecord(fields.limits) ?? {};
  const observation = asRecord(fields.observation) ?? {};
  const url = str(request, 'url');
  const q = str(injection, 'query_param');
  const corpus = str(injection, 'corpus');
  if (!url || !q || !corpus) {
    return undefined;
  }
  return {
    url,
    q,
    corpus,
    method: (str(request, 'method') || 'GET') as FuzzerMethod,
    headers: asRecord(request.headers) ?? {},
    followRedirects: bool(request, 'follow_redirects', true),
    maxRequests: num(limits, 'max_requests', 25),
    rps: num(limits, 'requests_per_second', 1),
    alertOnServerError: bool(observation, 'alert_on_server_error', true),
    latencyMultiplier: num(observation, 'latency_multiplier', 3),
  };
}

function buildLegacyFuzzerRow(
  base: Record<string, unknown>,
  bits: LegacyBits,
  asRecord: AsRecord,
): Record<string, unknown> {
  const message = asRecord(base.message) ?? {};
  const policy = asRecord(base.policy) ?? {};
  return {
    ...base,
    message: {
      ...message,
      url: bits.url,
      headers: bits.headers,
      follow_redirects: bits.followRedirects,
    },
    location: { kind: 'query_param', name: bits.q },
    corpus: bits.corpus,
    targets: [{ url: bits.url, method: bits.method, corpus: bits.corpus }],
    policy: {
      ...policy,
      max_requests: bits.maxRequests,
      requests_per_second: bits.rps,
      alert_on_server_error: bits.alertOnServerError,
      latency_multiplier: bits.latencyMultiplier,
    },
  };
}

export function fuzzerFromLegacyModule(
  mod: Record<string, unknown>,
  mid: string,
  emptyFuzzer: (id: string, label: string) => Record<string, unknown>,
  asRecord: AsRecord,
): Record<string, unknown> | undefined {
  const bits = readLegacyBits(mod, asRecord);
  if (!bits) {
    return undefined;
  }
  const base = emptyFuzzer(mid, typeof mod.label === 'string' ? mod.label : mid);
  return buildLegacyFuzzerRow(base, bits, asRecord);
}
