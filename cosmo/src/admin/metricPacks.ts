/**
 * Prometheus metric packs — SoT для Admin → Интеграции.
 * Studio только копирует CSV при активации слота; вызов/PromQL — PrettyK (PoC позже).
 */

export const METRIC_PACKS = [
  { id: 'http_red', label: 'HTTP RED (RPS / 5xx / latency)' },
  { id: 'auth_fail', label: 'Auth fail (401/403)' },
  { id: 'rate_limit', label: 'Rate limit (429)' },
  { id: 'network_io', label: 'Network I/O (bytes / drops)' },
  { id: 'conn_sat', label: 'Conn saturation (sockets / resets)' },
  { id: 'runtime', label: 'Runtime (CPU / RAM / restarts)' },
  { id: 'db_pool', label: 'DB pool waits' },
  { id: 'queue_lag', label: 'Queue lag' },
  { id: 'resp_size', label: 'Response size' },
] as const;

export type MetricPackId = (typeof METRIC_PACKS)[number]['id'];

export const DEFAULT_METRIC_PACKS: readonly MetricPackId[] = [
  'http_red',
  'auth_fail',
  'rate_limit',
  'runtime',
];

const PACK_SET = new Set<string>(METRIC_PACKS.map((p) => p.id));

export function parseMetricPacks(raw: string): MetricPackId[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is MetricPackId => PACK_SET.has(s));
}

export function serializeMetricPacks(packs: readonly string[]): string {
  return packs.filter((p) => PACK_SET.has(p)).join(',');
}

export function defaultMetricPacksCsv(): string {
  return serializeMetricPacks(DEFAULT_METRIC_PACKS);
}
