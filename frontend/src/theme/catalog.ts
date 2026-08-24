/**
 * Две темы: light / dark. Переключатель в шапке — без каталога шаблонов.
 */
import {
  cssVarsFromPack,
  DARK_CHROME,
  DARK_PACK,
  LIGHT_CHROME,
  LIGHT_PACK,
  THEME_STORAGE_KEY,
  AURORA_CHROME,
  AURORA_PACK,
  DENSE_CHROME,
  DENSE_PACK,
  NEON_CHROME,
  NEON_PACK,
  WARM_CHROME,
  WARM_PACK,
  type PkChromeExtras,
  type PkTokenPack,
  type ThemeMode,
} from './tokens';

export type ThemeId = ThemeMode;

export const THEME_IDS: readonly ThemeId[] = ['light', 'dark'] as const;

/** Временные палитра-пресеты (переключатель в шапке) — все dark. */
export type PaletteId = 'dark' | 'neon' | 'aurora' | 'dense' | 'warm';

export const PALETTE_IDS: readonly PaletteId[] = [
  'dark',
  'neon',
  'aurora',
  'dense',
  'warm',
] as const;

export interface PkThemeDefinition {
  id: string;
  label: string;
  group: ThemeMode;
  pack: PkTokenPack;
  chrome: PkChromeExtras;
}

export const THEME_CATALOG: Record<ThemeId, PkThemeDefinition> = {
  light: {
    id: 'light',
    label: 'Свет',
    group: 'light',
    pack: LIGHT_PACK,
    chrome: LIGHT_CHROME,
  },
  dark: {
    id: 'dark',
    label: 'Тьма',
    group: 'dark',
    pack: DARK_PACK,
    chrome: DARK_CHROME,
  },
};

/** Временная палитра-пресеты — темы dark с разными p акцентами/фонами. */
export const PALETTE_CATALOG: Record<PaletteId, PkThemeDefinition> = {
  dark: THEME_CATALOG.dark,
  neon: {
    id: 'neon',
    label: 'Neon',
    group: 'dark',
    pack: NEON_PACK,
    chrome: NEON_CHROME,
  },
  aurora: {
    id: 'aurora',
    label: 'Aurora',
    group: 'dark',
    pack: AURORA_PACK,
    chrome: AURORA_CHROME,
  },
  dense: {
    id: 'dense',
    label: 'Dense',
    group: 'dark',
    pack: DENSE_PACK,
    chrome: DENSE_CHROME,
  },
  warm: {
    id: 'warm',
    label: 'Warm',
    group: 'dark',
    pack: WARM_PACK,
    chrome: WARM_CHROME,
  },
};

export function isPaletteId(value: string): value is PaletteId {
  return (PALETTE_IDS as readonly string[]).includes(value);
}

export function getPalette(id: PaletteId): PkThemeDefinition {
  return PALETTE_CATALOG[id];
}

export const DEFAULT_THEME_ID: ThemeId = 'dark';

export function isThemeId(value: string): value is ThemeId {
  return value === 'light' || value === 'dark';
}

/** Миграция: kosmo-* / старые A/B id / unknown → light|dark. */
export function normalizeThemeId(raw: string | null | undefined): ThemeId {
  if (raw === 'dark' || raw === 'kosmo-dark') {
    return 'dark';
  }
  if (
    raw === 'graphite-wire' ||
    raw === 'nord-harbor' ||
    raw === 'ink-terminal' ||
    raw === 'night-owl' ||
    raw === 'ocean-glass'
  ) {
    return 'dark';
  }
  if (raw === 'light' || raw === 'kosmo-light') {
    return 'light';
  }
  // Бывшие light-шаблоны остаются светлыми; мусор → default (dark).
  if (
    raw === 'paper-lab' ||
    raw === 'solar-bench' ||
    raw === 'sandstone-ops'
  ) {
    return 'light';
  }
  return DEFAULT_THEME_ID;
}

export function getTheme(id: ThemeId): PkThemeDefinition {
  return THEME_CATALOG[id];
}

export function readStoredThemeId(): ThemeId {
  try {
    return normalizeThemeId(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function writeStoredThemeId(id: ThemeId): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function applyThemeCss(id: ThemeId): void {
  const def = getTheme(id);
  const root = document.documentElement;
  root.dataset.pkTheme = id;
  root.dataset.pkMode = def.group;
  root.dataset.pkTabStyle = 'card';
  root.dataset.pkButtonStyle = 'wireframe';
  const vars = cssVarsFromPack(def.pack, def.chrome);
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}
