/**
 * Мутации test_suites.fuzzers — сущность Fuzzer (вкладка-форма → Campaign).
 * Канон v2: алгоритм + политика + таблица троек (url | method | corpus).
 */
import fuzzPack from '../generated/fuzz_pack.json';
import { displayNameError } from './pythonIds';
import { fuzzerFromLegacyModule } from './studioFuzzerMigrate';
import { normalizeFuzzerRecord } from './studioFuzzerNormalize';
import { applyFuzzerPatch } from './studioFuzzerUpdate';
import { listResourceAsNames } from './studioResources';

export type FuzzerMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface FuzzTargetFields {
  url: string;
  method: FuzzerMethod;
  corpus: string;
  body?: string;
}

export type FuzzerMessageSource = 'template' | 'history';

export interface FuzzerMessageFields {
  source: FuzzerMessageSource;
  method: 'GET';
  url: string;
  history_url_contains: string;
  history_method: string;
  session_replay: boolean;
  headers: Record<string, string>;
  follow_redirects: boolean;
}

export interface FuzzerLocationFields {
  kind: 'query_param';
  name: string;
}

export interface FuzzerPolicyFields {
  max_requests: number;
  requests_per_second: number;
  alert_on_server_error: boolean;
  latency_multiplier: number;
  size_ratio: number;
  size_abs_delta: number;
}

export interface FuzzerFields {
  id: string;
  label: string;
  algorithm: string;
  targets: FuzzTargetFields[];
  policy: FuzzerPolicyFields;
  session_replay: boolean;
  headers: Record<string, string>;
  follow_redirects: boolean;
  // Legacy fields
  message: FuzzerMessageFields;
  location: FuzzerLocationFields;
  corpus: string;
}

/** Runtime/Studio: пусто или `auto` → matrix location→corpus на бэке. */
export const CORPUS_AUTO = 'auto';

/** Intent presets from PrettyK pack mirror (+ lab). */
export const INTENT_CORPUS_PRESETS = (
  Array.isArray(fuzzPack.corpora)
    ? fuzzPack.corpora
        .map((row) => (row && typeof row.name === 'string' ? row.name.trim() : ''))
        .filter(Boolean)
    : [
        'intent_boundary',
        'intent_sqli_smoke',
        'intent_xss_smoke',
        'intent_path_smoke',
        'intent_ssti_smoke',
        'intent_lab_a',
        'intent_lab_b',
        'intent_pairs_lab',
        'juice_search_lab',
      ]
) as readonly string[];

/** DF-12 wave modes (runtime resolve_wave_mode). Legacy `triples` → sniper. */
export const FUZZ_WAVE_MODES = ['sniper', 'pitchfork', 'cluster_bomb'] as const;
export type FuzzWaveMode = (typeof FUZZ_WAVE_MODES)[number];

export const FUZZ_WAVE_MODE_OPTIONS: { value: FuzzWaveMode; label: string }[] = [
  { value: 'sniper', label: 'sniper — цели по очереди' },
  { value: 'pitchfork', label: 'pitchfork — zip между целями' },
  { value: 'cluster_bomb', label: 'cluster_bomb — декартово (cap)' },
];

/** UI/runtime: triples и мусор → sniper. */
export function normalizeWaveAlgorithm(raw: string | undefined): FuzzWaveMode {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
  if (key === 'pitchfork') {
    return 'pitchfork';
  }
  if (key === 'cluster_bomb' || key === 'clusterbomb') {
    return 'cluster_bomb';
  }
  return 'sniper';
}

/** Corpus ref: один intent/resource или pitchfork `a,b` внутри цели. */
export function splitCorpusRefs(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isKnownCorpusRef(name: string, resources: readonly string[]): boolean {
  const key = name.trim();
  if (!key || key.toLowerCase() === CORPUS_AUTO) {
    return true;
  }
  if ((INTENT_CORPUS_PRESETS as readonly string[]).includes(key)) {
    return true;
  }
  return resources.includes(key);
}

export interface PresetAttackTemplate {
  id: string;
  title: string;
  description: string;
  targets: FuzzTargetFields[];
}

/** Галерея индустриальных шаблонов атак (ffuf / Intruder / Arjun / Auth Spraying). */
export const PRESET_ATTACK_TEMPLATES: Record<string, PresetAttackTemplate> = {
  json_sqli_injection: {
    id: 'json_sqli_injection',
    title: 'API / JSON Body SQLi Fuzzing',
    description:
      'Фаззинг JSON-полей запроса (логин, поиск, профиль) на SQL/NoSQL инъекции с помощью нумерованных масок {MASK_1}, {MASK_2}.',
    targets: [
      {
        url: 'http://juice-shop:3000/api/Users/login',
        method: 'POST',
        corpus: 'intent_sqli_smoke',
        body: '{\n  "email": "{MASK_1}",\n  "password": "{MASK_2}"\n}',
      },
    ],
  },
  endpoint_discovery: {
    id: 'endpoint_discovery',
    title: 'Content & Path Discovery (ffuf / DirBuster)',
    description:
      'Обнаружение скрытых путей, непубличных API и архивных файлов через маску {MASK} в URL.',
    targets: [
      {
        url: 'http://juice-shop:3000/api/{MASK}',
        method: 'GET',
        corpus: 'intent_path_smoke',
        body: '',
      },
    ],
  },
  param_discovery: {
    id: 'param_discovery',
    title: 'Parameter Discovery (Arjun style)',
    description:
      'Поиск скрытых query-параметров приложения (?debug=1, ?admin=true) через маску в имени параметра.',
    targets: [
      {
        url: 'http://juice-shop:3000/rest/products/search?{MASK}=1',
        method: 'GET',
        corpus: 'intent_boundary',
        body: '',
      },
    ],
  },
  credential_spray: {
    id: 'credential_spray',
    title: 'Credential Spraying (Auth Audit)',
    description:
      'Аудит стойкости формы аутентификации и лимитеров попыток входа с маской в пароле.',
    targets: [
      {
        url: 'http://juice-shop:3000/api/Users/login',
        method: 'POST',
        corpus: 'intent_boundary',
        body: '{\n  "email": "admin@juice-sh.op",\n  "password": "{MASK_1}"\n}',
      },
    ],
  },
  multi_endpoint_pitchfork: {
    id: 'multi_endpoint_pitchfork',
    title: 'Pitchfork API Audit (Multi-Endpoint)',
    description:
      'Параллельная проверка нескольких ключевых эндпоинтов приложения (GET search, POST auth, POST comment) за одну волну.',
    targets: [
      {
        url: 'http://juice-shop:3000/rest/products/search?q=',
        method: 'GET',
        corpus: 'intent_boundary',
        body: '',
      },
      {
        url: 'http://juice-shop:3000/api/Users/login',
        method: 'POST',
        corpus: 'intent_sqli_smoke',
        body: '{\n  "email": "{MASK_1}",\n  "password": "123"\n}',
      },
      {
        url: 'http://juice-shop:3000/api/Feedbacks',
        method: 'POST',
        corpus: 'intent_xss_smoke',
        body: '{\n  "comment": "{MASK_1}",\n  "rating": 5\n}',
      },
    ],
  },
};

const JUICE_SEARCH_URL = 'http://juice-shop:3000/rest/products/search?q=';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function ensureFuzzersRoot(formData: unknown): {
  root: Record<string, unknown>;
  suites: Record<string, unknown>;
  fuzzers: unknown[];
} {
  const root = { ...(asRecord(formData) ?? {}) };
  const suites = { ...(asRecord(root.test_suites) ?? {}) };
  const fuzzers = Array.isArray(suites.fuzzers)
    ? (suites.fuzzers as unknown[]).slice()
    : [];
  return { root, suites, fuzzers };
}

function commitFuzzers(
  root: Record<string, unknown>,
  suites: Record<string, unknown>,
  fuzzers: unknown[],
): unknown {
  return {
    ...root,
    test_suites: {
      ...suites,
      fuzzers,
    },
  };
}

export function fuzzerIdError(id: string): string | undefined {
  const err = displayNameError(id, 'module');
  if (!err) {
    return undefined;
  }
  return err.replace('модуля', 'fuzzer');
}

export function listFuzzerIds(formData: unknown): string[] {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const fuzzers = suites?.fuzzers;
  if (!Array.isArray(fuzzers)) {
    return [];
  }
  return fuzzers
    .map((item) => {
      const id = asRecord(item)?.id;
      return typeof id === 'string' ? id : '';
    })
    .filter((id) => id.length > 0);
}

export function defaultFuzzerMessage(): FuzzerMessageFields {
  return {
    source: 'template',
    method: 'GET',
    url: JUICE_SEARCH_URL,
    history_url_contains: '',
    history_method: 'GET',
    session_replay: true,
    headers: {},
    follow_redirects: true,
  };
}

export function defaultFuzzerPolicy(): FuzzerPolicyFields {
  return {
    max_requests: 25,
    requests_per_second: 1,
    alert_on_server_error: true,
    latency_multiplier: 3,
    size_ratio: 3,
    size_abs_delta: 2048,
  };
}

export function emptyFuzzTarget(): FuzzTargetFields {
  return {
    url: JUICE_SEARCH_URL,
    method: 'GET',
    corpus: CORPUS_AUTO,
    body: '',
  };
}

export function emptyFuzzer(id: string, label?: string): Record<string, unknown> {
  const name = (label ?? id).trim() || id;
  return {
    id: id.trim(),
    label: name,
    algorithm: 'sniper',
    targets: [emptyFuzzTarget()],
    message: defaultFuzzerMessage(),
    location: { kind: 'query_param', name: 'q' },
    corpus: CORPUS_AUTO,
    policy: defaultFuzzerPolicy(),
    // false: публичный Juice search без History не падает в session_missing.
    // Session-bound: включи галку + login в сценарии до ФаззингВолна.
    session_replay: false,
    headers: {},
    follow_redirects: true,
  };
}

export function normalizeFuzzer(item: unknown, index = 0): FuzzerFields {
  return normalizeFuzzerRecord(
    item,
    index,
    asRecord,
    defaultFuzzerMessage(),
    defaultFuzzerPolicy(),
    emptyFuzzTarget(),
  );
}

export function fuzzerDisplayName(fields: FuzzerFields, index: number): string {
  if (fields.id.trim()) {
    return fields.id.trim();
  }
  return `fuzzer_${String(index + 1)}`;
}

export function addFuzzer(
  formData: unknown,
  id: string,
): { data: unknown; index: number } | undefined {
  const trimmed = id.trim();
  if (fuzzerIdError(trimmed)) {
    return undefined;
  }
  if (listFuzzerIds(formData).includes(trimmed)) {
    return undefined;
  }
  const { root, suites, fuzzers } = ensureFuzzersRoot(formData);
  const index = fuzzers.length;
  fuzzers.push(emptyFuzzer(trimmed));
  return { data: commitFuzzers(root, suites, fuzzers), index };
}

export function renameFuzzer(
  formData: unknown,
  index: number,
  id: string,
): unknown {
  const trimmed = id.trim();
  if (fuzzerIdError(trimmed)) {
    return undefined;
  }
  const { root, suites, fuzzers } = ensureFuzzersRoot(formData);
  if (index < 0 || index >= fuzzers.length) {
    return undefined;
  }
  const prev = normalizeFuzzer(fuzzers[index], index);
  if (trimmed !== prev.id && listFuzzerIds(formData).includes(trimmed)) {
    return undefined;
  }
  fuzzers[index] = {
    ...prev,
    id: trimmed,
    label: trimmed,
  };
  return commitFuzzers(root, suites, fuzzers);
}

export type FuzzerPatch = {
  id?: string;
  label?: string;
  algorithm?: string;
  targets?: FuzzTargetFields[];
  policy?: Partial<FuzzerPolicyFields>;
  session_replay?: boolean;
  headers?: Record<string, string>;
  follow_redirects?: boolean;
  corpus?: string;
  message?: Partial<FuzzerMessageFields>;
  location?: Partial<FuzzerLocationFields>;
};

export function updateFuzzer(
  formData: unknown,
  index: number,
  patch: FuzzerPatch,
): unknown {
  const { root, suites, fuzzers } = ensureFuzzersRoot(formData);
  if (index < 0 || index >= fuzzers.length) {
    return undefined;
  }
  const prev = normalizeFuzzer(fuzzers[index], index);
  const next = applyFuzzerPatch(prev, patch, {
    idError: fuzzerIdError,
    emptyTarget: emptyFuzzTarget(),
    formHasId: (id) => listFuzzerIds(formData).includes(id),
  });
  if (!next) {
    return undefined;
  }
  fuzzers[index] = next;
  return commitFuzzers(root, suites, fuzzers);
}

export function removeFuzzer(formData: unknown, index: number): unknown {
  const { root, suites, fuzzers } = ensureFuzzersRoot(formData);
  if (index < 0 || index >= fuzzers.length) {
    return formData;
  }
  fuzzers.splice(index, 1);
  return commitFuzzers(root, suites, fuzzers);
}

export type { FuzzerFormIssue, ParsePasteResult } from './studioFuzzerValidate';
export { parsePasteTargets, validateFuzzerFields } from './studioFuzzerValidate';

function existingFuzzerIds(fuzzers: unknown[]): Set<string> {
  const existing = new Set<string>();
  for (const item of fuzzers) {
    const id = asRecord(item)?.id;
    if (typeof id === 'string' && id) {
      existing.add(id);
    }
  }
  return existing;
}

/** Soft-migrate: module_type=Фаззер → fuzzers[] (модуль оставляем). */
export function migrateLegacyFuzzerModules(formData: unknown): unknown {
  const { root, suites, fuzzers } = ensureFuzzersRoot(formData);
  const modules = Array.isArray(suites.test_data_constructor)
    ? suites.test_data_constructor
    : [];
  const existing = existingFuzzerIds(fuzzers);
  let changed = false;
  for (const module of modules) {
    const mod = asRecord(module);
    if (!mod || mod.module_type !== 'Фаззер') {
      continue;
    }
    const mid = typeof mod.id === 'string' ? mod.id.trim() : '';
    if (!mid || existing.has(mid)) {
      continue;
    }
    const next = fuzzerFromLegacyModule(mod, mid, emptyFuzzer, asRecord);
    if (!next) {
      continue;
    }
    fuzzers.push(next);
    existing.add(mid);
    changed = true;
  }
  if (!changed) {
    return formData;
  }
  return commitFuzzers(root, suites, fuzzers);
}

export function corpusOptions(formData: unknown): { value: string; label: string }[] {
  const resources = listResourceAsNames(formData).map((as) => ({
    value: as,
    label: `resource: ${as}`,
  }));
  const intents = INTENT_CORPUS_PRESETS.map((name) => ({
    value: name,
    label: `preset: ${name}`,
  }));
  return [
    { value: CORPUS_AUTO, label: 'авто — по дырке (location)' },
    ...intents,
    ...resources,
  ];
}
