/**
 * MethodId (RU → wirek) + ворота ZAP/HTTP/Сессия/Драйвер.
 * Генерируется: npm run generate:method-ids
 */
import methodIdsJson from '../generated/method_ids.json';

export type MethodTier = 'ui' | 'assert' | 'util';

export interface MethodIdEntry {
  id: string;
  component: string;
  action: string;
  wirek: string;
  tier?: MethodTier;
}

export interface FacadeMethodEntry {
  id: string;
  component: string;
  action: string;
  wirek: string;
}

export interface FacadeEntry {
  label: string;
  methods: FacadeMethodEntry[];
}

type MethodIdsFile = {
  methods: MethodIdEntry[];
  aliases: Record<string, string>;
  facadeAliases?: Record<string, string>;
  facadeMethodAliases?: Record<string, string>;
  facades?: Record<string, FacadeEntry>;
};

const data = methodIdsJson as MethodIdsFile;

export const methodIdEntries: readonly MethodIdEntry[] = data.methods;
export const methodIdAliases: Readonly<Record<string, string>> = data.aliases;
export const methodIdFacadeAliases: Readonly<Record<string, string>> =
  data.facadeAliases ?? {};
export const methodIdFacadeMethodAliases: Readonly<Record<string, string>> =
  data.facadeMethodAliases ?? {};
export const methodIdFacades: Readonly<Record<string, FacadeEntry>> = data.facades ?? {};

export function facadeNames(): string[] {
  return Object.keys(methodIdFacades).sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Каноническое имя ворот (CDP→Сессия, WD/Браузер→Драйвер) или undefined. */
export function resolveFacadeName(name: string): string | undefined {
  const raw = name.trim();
  if (methodIdFacades[raw]) {
    return raw;
  }
  const viaAlias = methodIdFacadeAliases[raw] ?? methodIdFacadeAliases[raw.toUpperCase()];
  if (viaAlias && methodIdFacades[viaAlias]) {
    return viaAlias;
  }
  const upper = raw.toUpperCase();
  if (methodIdFacades[upper]) {
    return upper;
  }
  return undefined;
}

export function facadeMethods(facade: string): readonly FacadeMethodEntry[] {
  const canonical = resolveFacadeName(facade) ?? facade;
  return methodIdFacades[canonical]?.methods ?? [];
}

/** Метод ворот по id или алиасу (`HttpЧерезZAP` → `ЗапросЧерезZAP`). */
export function lookupFacadeMethod(
  facade: string,
  methodName: string,
): FacadeMethodEntry | undefined {
  const methods = facadeMethods(facade);
  const raw = methodName.trim();
  const canonical = methodIdFacadeMethodAliases[raw] ?? raw;
  return methods.find((item) => item.id === canonical || item.id === raw);
}

/** Канонические id + алиасы (корень). */
export function allMethodIdLabels(): string[] {
  const labels = new Set<string>(methodIdEntries.map((m) => m.id));
  for (const alias of Object.keys(methodIdAliases)) {
    labels.add(alias);
  }
  return [...labels].sort((a, b) => a.localeCompare(b, 'ru'));
}

export function resolveMethodIdLabel(label: string): MethodIdEntry | undefined {
  const canonical = methodIdAliases[label] ?? label;
  return methodIdEntries.find((m) => m.id === canonical);
}

export function methodTierOf(label: string): MethodTier {
  const entry = resolveMethodIdLabel(label);
  if (entry?.tier === 'assert' || entry?.tier === 'util' || entry?.tier === 'ui') {
    return entry.tier;
  }
  if ((methodIdAliases[label] ?? label).startsWith('Проверить')) {
    return 'assert';
  }
  return 'util';
}

/** Первая стрелка AC: tier=ui (+ алиасы на ui). */
export function rootUiLabels(): string[] {
  const uiIds = new Set(
    methodIdEntries.filter((m) => (m.tier ?? 'util') === 'ui').map((m) => m.id),
  );
  const labels = new Set<string>(uiIds);
  for (const [alias, canonical] of Object.entries(methodIdAliases)) {
    if (uiIds.has(canonical)) {
      labels.add(alias);
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b, 'ru'));
}

export function rootLabelsByTier(tier: MethodTier): string[] {
  const ids = new Set(
    methodIdEntries.filter((m) => (m.tier ?? 'util') === tier).map((m) => m.id),
  );
  return [...ids].sort((a, b) => a.localeCompare(b, 'ru'));
}
