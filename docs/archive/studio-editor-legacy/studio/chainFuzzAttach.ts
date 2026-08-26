/**
 * IMP-CHAIN-6: кладка fuzz targets из Цепи в entity Fuzzer.
 */
import {
  addFuzzer,
  emptyFuzzTarget,
  listFuzzerIds,
  normalizeFuzzer,
  updateFuzzer,
  type FuzzTargetFields,
  type FuzzerMethod,
} from './studioFuzzers';

const METHODS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export type ChainFuzzSeed = {
  method?: string;
  url?: string;
  body?: string;
};

function asMethod(raw: string | undefined): FuzzerMethod {
  const m = String(raw || 'GET').toUpperCase();
  if (METHODS.has(m)) {
    return m as FuzzerMethod;
  }
  return 'GET';
}

function safeFuzzerId(harAs: string): string {
  const raw = (harAs || 'flow').trim() || 'flow';
  const safe = raw.replace(/[^A-Za-z0-9_]/gu, '_').replace(/^(\d)/u, '_$1');
  return `chain_${safe}`.slice(0, 64);
}

function fuzzerAt(formData: unknown, index: number): unknown {
  const root = formData as { test_suites?: { fuzzers?: unknown[] } } | null;
  const fuzzers = root?.test_suites?.fuzzers;
  if (!Array.isArray(fuzzers)) {
    return undefined;
  }
  return fuzzers[index];
}

export function chainSeedsToTargets(seeds: ChainFuzzSeed[]): FuzzTargetFields[] {
  const out: FuzzTargetFields[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    const url = String(seed.url || '').trim();
    if (!url) {
      continue;
    }
    const method = asMethod(seed.method);
    const key = `${method} ${url}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      url,
      method,
      corpus: 'auto',
      body: seed.body ? String(seed.body) : '',
    });
  }
  return out;
}

function isPlaceholderTarget(t: FuzzTargetFields): boolean {
  const empty = emptyFuzzTarget();
  return t.url === empty.url && t.method === empty.method;
}

/**
 * Merge seeds into fuzzer `chain_<harAs>` (create if missing).
 * If none match name but fuzzers exist — merge into first.
 * Replaces sole Juice placeholder; otherwise appends unique rows.
 */
export function attachChainFuzzTargets(
  formData: unknown,
  harAs: string,
  seeds: ChainFuzzSeed[],
): { data: unknown; fuzzerId: string; added: number } | undefined {
  const targets = chainSeedsToTargets(seeds);
  if (targets.length === 0) {
    return undefined;
  }
  const hint = safeFuzzerId(harAs);
  let data = formData;
  let fuzzerId = hint;
  const ids = listFuzzerIds(data);
  let index = ids.indexOf(hint);
  if (index < 0 && ids.length > 0) {
    fuzzerId = ids[0]!;
    index = 0;
  }
  if (index < 0) {
    const created = addFuzzer(data, hint);
    if (!created) {
      return undefined;
    }
    data = created.data;
    index = created.index;
    fuzzerId = hint;
  }
  const current = normalizeFuzzer(fuzzerAt(data, index), index);
  let nextTargets = [...current.targets];
  let added = 0;
  if (nextTargets.length === 1 && isPlaceholderTarget(nextTargets[0]!)) {
    nextTargets = [...targets];
    added = targets.length;
  } else {
    const seen = new Set(nextTargets.map((t) => `${t.method} ${t.url}`));
    for (const row of targets) {
      const key = `${row.method} ${row.url}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      nextTargets.push(row);
      added += 1;
    }
  }
  const patched = updateFuzzer(data, index, { targets: nextTargets });
  if (!patched) {
    return undefined;
  }
  return { data: patched, fuzzerId, added };
}
