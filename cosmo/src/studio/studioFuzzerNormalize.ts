/**
 * normalizeFuzzer parse helpers (S3776).
 */
import type {
  FuzzerFields,
  FuzzerMessageFields,
  FuzzerMethod,
  FuzzerPolicyFields,
  FuzzTargetFields,
} from './studioFuzzers';

type AsRecord = (value: unknown) => Record<string, unknown> | undefined;

function pickBool(...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return true;
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function parseFuzzerHeaders(
  record: Record<string, unknown>,
  messageRaw: Record<string, unknown>,
  asRecord: AsRecord,
): Record<string, string> {
  const headersRaw = asRecord(record.headers) ?? asRecord(messageRaw.headers);
  const headers: Record<string, string> = {};
  if (!headersRaw) {
    return headers;
  }
  for (const [key, value] of Object.entries(headersRaw)) {
    if (typeof value === 'string') {
      headers[key] = value;
    }
  }
  return headers;
}

function parseFuzzerTargets(
  record: Record<string, unknown>,
  messageRaw: Record<string, unknown>,
  defaults: FuzzerMessageFields,
  asRecord: AsRecord,
): FuzzTargetFields[] {
  const targets: FuzzTargetFields[] = [];
  const rawTargets = Array.isArray(record.targets) ? record.targets : [];
  for (const t of rawTargets) {
    const tr = asRecord(t);
    if (!tr || typeof tr.url !== 'string' || !tr.url.trim()) {
      continue;
    }
    const mRaw = typeof tr.method === 'string' ? tr.method.toUpperCase() : 'GET';
    const method: FuzzerMethod = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(mRaw)
      ? (mRaw as FuzzerMethod)
      : 'GET';
    const corpus = typeof tr.corpus === 'string' ? tr.corpus.trim() : 'auto';
    const body = typeof tr.body === 'string' ? tr.body : '';
    targets.push({ url: tr.url.trim(), method, corpus: corpus || 'auto', body });
  }
  if (targets.length === 0) {
    targets.push({
      url: pickString(messageRaw.url, defaults.url),
      method: 'GET',
      corpus: pickString(record.corpus, 'auto'),
    });
  }
  return targets;
}

function parseFuzzerPolicy(
  policyRaw: Record<string, unknown>,
  policyDefaults: FuzzerPolicyFields,
): FuzzerFields['policy'] {
  return {
    max_requests: pickNumber(policyRaw.max_requests, policyDefaults.max_requests),
    requests_per_second: pickNumber(
      policyRaw.requests_per_second,
      policyDefaults.requests_per_second,
    ),
    alert_on_server_error: pickBool(policyRaw.alert_on_server_error),
    latency_multiplier: pickNumber(
      policyRaw.latency_multiplier,
      policyDefaults.latency_multiplier,
    ),
    size_ratio: pickNumber(policyRaw.size_ratio, policyDefaults.size_ratio),
    size_abs_delta: pickNumber(policyRaw.size_abs_delta, policyDefaults.size_abs_delta),
  };
}

export function normalizeFuzzerRecord(
  item: unknown,
  index: number,
  asRecord: AsRecord,
  defaults: FuzzerMessageFields,
  policyDefaults: FuzzerPolicyFields,
  emptyTarget: FuzzTargetFields,
): FuzzerFields {
  const record = asRecord(item) ?? {};
  const id = typeof record.id === 'string' ? record.id : '';
  const label =
    typeof record.label === 'string' && record.label.trim()
      ? record.label.trim()
      : id || `fuzzer_${String(index + 1)}`;
  const algorithm =
    typeof record.algorithm === 'string' && record.algorithm.trim()
      ? record.algorithm.trim()
      : 'sniper';

  const messageRaw = asRecord(record.message) ?? {};
  const locationRaw = asRecord(record.location) ?? {};
  const policyRaw = asRecord(record.policy) ?? {};
  const source =
    messageRaw.source === 'history' || messageRaw.source === 'template'
      ? messageRaw.source
      : 'template';
  const headers = parseFuzzerHeaders(record, messageRaw, asRecord);
  const targets = parseFuzzerTargets(record, messageRaw, defaults, asRecord);
  const primaryTarget = targets[0] ?? emptyTarget;

  return {
    id,
    label,
    algorithm,
    targets,
    policy: parseFuzzerPolicy(policyRaw, policyDefaults),
    session_replay: pickBool(record.session_replay, messageRaw.session_replay),
    headers,
    follow_redirects: pickBool(record.follow_redirects, messageRaw.follow_redirects),
    message: {
      source,
      method: 'GET',
      url: primaryTarget.url,
      history_url_contains: pickString(messageRaw.history_url_contains, ''),
      history_method: pickString(messageRaw.history_method, 'GET'),
      session_replay: pickBool(messageRaw.session_replay),
      headers,
      follow_redirects: pickBool(messageRaw.follow_redirects),
    },
    location: {
      kind: 'query_param',
      name: pickString(locationRaw.name, 'q'),
    },
    corpus: primaryTarget.corpus,
  };
}
