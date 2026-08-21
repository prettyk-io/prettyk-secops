/**
 * SoT chain_fields for module_type=Цепь (IMP-CHAIN + PRE фугас).
 */

export type ChainSlotLocation = 'header' | 'cookie' | 'query' | 'body';

export type ChainStepRole = 'precondition' | 'attack';

export type ChainSlotApply = 'step' | 'all';

export type ChainSlot = {
  id: string;
  location: ChainSlotLocation;
  key: string;
  recorded_value: string;
  enabled: boolean;
  bind: string;
  step_index?: number;
  /** Replace Map: step (default) | all matching entries */
  apply: ChainSlotApply;
  /** URL contains, or ``regex:…``; empty = any */
  match: string;
  /** Optional structured extract (alt: bind extract:step:N:…) */
  extract?: {
    from_step: number;
    kind: 'jsonpath' | 'regex' | 'header';
    expr: string;
    source?: string;
  };
};

export type ChainStep = {
  index?: number;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  mime?: string;
  status?: number | null;
  response_body?: string;
  response_headers?: Record<string, string>;
  role?: ChainStepRole;
};

export type ChainFields = {
  har_as: string;
  sequence_name: string;
  source_har: string;
  template_har: string;
  steps: ChainStep[];
  slots: ChainSlot[];
  bindings: Record<string, string>;
  /** Id «Модуль работы с данными» (properties) — primary value pack */
  value_pack_module: string;
  include_sequence_scan: boolean;
  seed_fuzz_targets: boolean;
  last_notes: string[];
};

export function defaultChainFields(overrides?: Partial<ChainFields>): ChainFields {
  return {
    har_as: '',
    sequence_name: '',
    source_har: '',
    template_har: '',
    steps: [],
    slots: [],
    bindings: {},
    value_pack_module: '',
    include_sequence_scan: true,
    seed_fuzz_targets: false,
    last_notes: [],
    ...overrides,
  };
}

function asRec(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeStepRole(raw: unknown): ChainStepRole {
  const r = str(raw).toLowerCase().replace(/ё/gu, 'е');
  if (
    r === 'pre' ||
    r === 'precondition' ||
    r === 'setup' ||
    r === 'прекондишен' ||
    r === 'прекондишн'
  ) {
    return 'precondition';
  }
  return 'attack';
}

function normalizeStep(raw: unknown, index: number): ChainStep {
  const o = asRec(raw) ?? {};
  return {
    index: typeof o.index === 'number' ? o.index : index,
    method: str(o.method),
    url: str(o.url),
    headers: (asRec(o.headers) as Record<string, string> | undefined) ?? undefined,
    body: str(o.body),
    mime: str(o.mime),
    status: typeof o.status === 'number' ? o.status : null,
    response_body: str(o.response_body) || undefined,
    response_headers:
      (asRec(o.response_headers) as Record<string, string> | undefined) ?? undefined,
    role: normalizeStepRole(o.role),
  };
}

export function normalizeSlotApply(raw: unknown): ChainSlotApply {
  const v = str(raw).toLowerCase().replace(/ё/gu, 'е');
  if (v === 'all' || v === '*' || v === 'any' || v === 'все' || v === 'global') {
    return 'all';
  }
  return 'step';
}

function normalizeSlotExtract(raw: unknown): ChainSlot['extract'] | undefined {
  const extractRec = asRec(raw);
  if (!extractRec || !str(extractRec.kind)) {
    return undefined;
  }
  const kindRaw = str(extractRec.kind).toLowerCase();
  const kind = kindRaw === 'regex' || kindRaw === 'header' ? kindRaw : 'jsonpath';
  return {
    from_step: typeof extractRec.from_step === 'number' ? extractRec.from_step : 0,
    kind,
    expr: str(extractRec.expr),
    source: str(extractRec.source) || 'body',
  };
}

function normalizeSlotLocation(raw: unknown): ChainSlotLocation {
  const loc = str(raw);
  return loc === 'cookie' || loc === 'query' || loc === 'body' ? loc : 'header';
}

function normalizeSlot(raw: unknown): ChainSlot | null {
  const o = asRec(raw);
  if (!o) {
    return null;
  }
  const id = str(o.id).trim();
  if (!id) {
    return null;
  }
  return {
    id,
    location: normalizeSlotLocation(o.location),
    key: str(o.key),
    recorded_value: str(o.recorded_value),
    enabled: o.enabled !== false,
    bind: str(o.bind),
    step_index: typeof o.step_index === 'number' ? o.step_index : undefined,
    apply: normalizeSlotApply(o.apply),
    match: str(o.match),
    extract: normalizeSlotExtract(o.extract),
  };
}

const PROP_LINE = /^(#?)([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u;

/** Properties text (auth_data style) → one bindings row. */
export function parsePropertiesValuePack(raw: string): {
  row: Record<string, string>;
  notes: string[];
  error?: string;
} {
  const text = raw.trim();
  if (!text) {
    return { row: {}, notes: [], error: 'value pack пуст' };
  }
  const row: Record<string, string> = {};
  for (const line of text.split(/\r?\n/u)) {
    const st = line.trim();
    if (!st || /^#(?:\s|$)/u.test(st)) {
      continue;
    }
    const eq = st.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const left = st.slice(0, eq).trimEnd();
    const right = st.slice(eq + 1).trimStart();
    const m = PROP_LINE.exec(`${left}=${right}`);
    if (!m) {
      continue;
    }
    const key = m[2];
    const rawVal = m[3];
    if (key === undefined || rawVal === undefined) {
      continue;
    }
    let val = rawVal.trim();
    if (
      val.length >= 2 &&
      ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'")))
    ) {
      val = val.slice(1, -1);
    }
    row[key] = val;
  }
  if (Object.keys(row).length === 0) {
    return { row: {}, notes: [], error: 'value pack: нет key=value (properties)' };
  }
  return {
    row,
    notes: [`value_pack_properties_keys=${Object.keys(row).length}`],
  };
}

function objectToStringRow(data: Record<string, unknown>): Record<string, string> {
  const row: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    row[k] = v == null ? '' : String(v);
  }
  return row;
}

function parseJsonValuePack(text: string): {
  rows: Record<string, string>[];
  notes: string[];
  error?: string;
} {
  try {
    const data: unknown = JSON.parse(text);
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      return {
        rows: [objectToStringRow(data as Record<string, unknown>)],
        notes: ['value_pack_rows=1 json'],
      };
    }
    if (Array.isArray(data)) {
      const rows: Record<string, string>[] = [];
      for (let i = 0; i < data.length; i += 1) {
        const item = data[i];
        if (item === null || typeof item !== 'object' || Array.isArray(item)) {
          return { rows: [], notes: [], error: `value pack[${i}]: нужен object` };
        }
        rows.push(objectToStringRow(item as Record<string, unknown>));
      }
      if (rows.length === 0) {
        return { rows: [], notes: [], error: 'value pack JSON: пустой array' };
      }
      return { rows, notes: [`value_pack_rows=${rows.length} json`] };
    }
    return { rows: [], notes: [], error: 'value pack JSON: object' };
  } catch (error_) {
    return {
      rows: [],
      notes: [],
      error: error_ instanceof Error ? error_.message : String(error_),
    };
  }
}

/** Value pack → binding rows. JSON object or properties (CSV deprecated). */
export function parseValuePack(raw: string): {
  rows: Record<string, string>[];
  notes: string[];
  error?: string;
} {
  const text = raw.trim();
  if (!text) {
    return { rows: [], notes: [], error: 'value pack пуст' };
  }
  if (text.startsWith('{') || text.startsWith('[')) {
    return parseJsonValuePack(text);
  }
  const prop = parsePropertiesValuePack(text);
  if (prop.error) {
    return { rows: [], notes: prop.notes, error: prop.error };
  }
  return { rows: [prop.row], notes: prop.notes };
}

/** Merge value-pack into bindings (authoring). */
export function applyValuePackToBindings(
  current: Record<string, string>,
  pack: string,
): { bindings: Record<string, string>; notes: string[]; error?: string; rowCount: number } {
  const parsed = parseValuePack(pack);
  if (parsed.error || parsed.rows.length === 0) {
    return {
      bindings: current,
      notes: parsed.notes,
      error: parsed.error || 'нет строк',
      rowCount: 0,
    };
  }
  const first = parsed.rows[0];
  return {
    bindings: { ...current, ...first },
    notes: parsed.notes,
    rowCount: parsed.rows.length,
  };
}

const DATA_MODULE_TYPE = 'Модуль работы с данными';

/** Ids of data modules (properties / url-list / PrettyK). */
export function listDataModuleIds(formData: unknown): string[] {
  const suites = asRec(asRec(formData)?.test_suites);
  const modules = suites?.test_data_constructor;
  if (!Array.isArray(modules)) {
    return [];
  }
  const out: string[] = [];
  for (const item of modules) {
    const mod = asRec(item);
    if (!mod || mod.module_type !== DATA_MODULE_TYPE) {
      continue;
    }
    const id = str(mod.id).trim();
    if (id) {
      out.push(id);
    }
  }
  return out;
}

export function dataModuleEditorText(formData: unknown, moduleId: string): string {
  const mid = moduleId.trim();
  if (!mid) {
    return '';
  }
  const suites = asRec(asRec(formData)?.test_suites);
  const modules = suites?.test_data_constructor;
  if (!Array.isArray(modules)) {
    return '';
  }
  for (const item of modules) {
    const mod = asRec(item);
    if (!mod || str(mod.id).trim() !== mid) {
      continue;
    }
    if (mod.module_type !== DATA_MODULE_TYPE) {
      return '';
    }
    const storage = asRec(mod.data_storage_fields);
    return str(storage?.editor);
  }
  return '';
}

export function normalizeChainFields(raw: unknown): ChainFields {
  const o = asRec(raw);
  const slots = Array.isArray(o?.slots)
    ? (o!.slots.map(normalizeSlot).filter(Boolean) as ChainSlot[])
    : [];
  const steps = Array.isArray(o?.steps)
    ? o!.steps.map((s, i) => normalizeStep(s, i))
    : [];
  const bindings: Record<string, string> = {};
  const b = asRec(o?.bindings);
  if (b) {
    for (const [k, v] of Object.entries(b)) {
      if (typeof v === 'string') {
        bindings[k] = v;
      }
    }
  }
  return defaultChainFields({
    har_as: str(o?.har_as),
    sequence_name: str(o?.sequence_name),
    source_har: str(o?.source_har),
    template_har: str(o?.template_har),
    steps,
    slots,
    bindings,
    value_pack_module: str(o?.value_pack_module),
    include_sequence_scan: o?.include_sequence_scan !== false,
    seed_fuzz_targets: Boolean(o?.seed_fuzz_targets),
    last_notes: Array.isArray(o?.last_notes) ? o!.last_notes.map(String) : [],
  });
}

export function updateChainModule(
  formData: unknown,
  moduleIndex: number,
  patch: Partial<ChainFields>,
): unknown {
  const root = { ...(asRec(formData) ?? {}) };
  const suites = { ...(asRec(root.test_suites) ?? {}) };
  const modules = Array.isArray(suites.test_data_constructor)
    ? (suites.test_data_constructor as unknown[]).slice()
    : [];
  if (moduleIndex < 0 || moduleIndex >= modules.length) {
    return undefined;
  }
  const mod = { ...(asRec(modules[moduleIndex]) ?? {}) };
  const current = normalizeChainFields(mod.chain_fields);
  mod.chain_fields = { ...current, ...patch };
  modules[moduleIndex] = mod;
  return {
    ...root,
    test_suites: {
      ...suites,
      test_data_constructor: modules,
    },
  };
}

function bindValueFromSlot(slot: ChainSlot): string | undefined {
  if (!slot.enabled || !slot.bind) {
    return undefined;
  }
  if (slot.bind.startsWith('literal:')) {
    return slot.bind.slice('literal:'.length);
  }
  if (
    slot.bind.startsWith('env:') ||
    slot.bind.startsWith('capture:') ||
    slot.bind.startsWith('extract:')
  ) {
    return undefined;
  }
  return slot.bind;
}

function mergeModuleBindings(
  out: Record<string, string>,
  fields: ReturnType<typeof normalizeChainFields>,
): void {
  for (const [k, v] of Object.entries(fields.bindings)) {
    if (v) {
      out[k] = v;
    }
  }
  for (const slot of fields.slots) {
    if (out[slot.id]) {
      continue;
    }
    const bound = bindValueFromSlot(slot);
    if (bound !== undefined) {
      out[slot.id] = bound;
    }
  }
}

/** Collect play bindings from all Цепь modules (Launch). */
export function collectChainBindings(formData: unknown): Record<string, string> {
  const suites = asRec(asRec(formData)?.test_suites);
  const modules = suites?.test_data_constructor;
  if (!Array.isArray(modules)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const item of modules) {
    const mod = asRec(item);
    if (mod?.module_type !== 'Цепь') {
      continue;
    }
    mergeModuleBindings(out, normalizeChainFields(mod.chain_fields));
  }
  return out;
}
